import { expect, test, type Page } from "@playwright/test";

/*
 * Runs against `pnpm dev` (set PLAYWRIGHT_DEV_URL, e.g. http://localhost:5241); skipped otherwise.
 * Evidence type: the prototype uses LOCAL SAMPLE DATA and route-mocked auth. No Library API exists yet (BE#57), so none of this is
 * integration evidence. (Reviews: tests/e2e/admin-scenario-reviews.spec.ts; Learn CMS: tests/e2e/learn-cms.spec.ts are real screens.)
 */
const devUrl = process.env.PLAYWRIGHT_DEV_URL;
test.skip(!devUrl, "set PLAYWRIGHT_DEV_URL to a running `pnpm dev` server");
test.use({ baseURL: devUrl });

const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };

async function signIn(page: Page, user: typeof admin | typeof owner = admin) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

const apiCalls = (page: Page) => {
  const calls: string[] = [];
  page.on("request", (request) => { const { pathname } = new URL(request.url()); if (/^\/api\/.*(library)/i.test(pathname)) calls.push(`${request.method()} ${pathname}`); });
  return calls;
};

test("dev shows the prototype banner and the pending blocker together", async ({ page }) => {
  await signIn(page);
  for (const path of ["/admin/library"]) {
    await page.goto(path);
    await expect(page.getByTestId("pending-module")).toBeVisible();
    await expect(page.getByTestId("prototype-banner")).toContainText("Dữ liệu mẫu · chỉ môi trường phát triển");
  }
});

test("the library prototype never calls the library API", async ({ page }) => {
  await signIn(page);
  const calls = apiCalls(page);
  await page.goto("/admin/library");
  await expect(page.getByTestId("prototype-banner")).toBeVisible();
  expect(calls).toEqual([]);
});

test("organization users are blocked in dev as well", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/admin/learn");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
});

test.describe("library prototype", () => {
  test("tabs, versions are immutable once published, new draft then publish", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/library");
    await page.getByRole("tab", { name: "Rubric mẫu" }).click();
    await expect(page).toHaveURL(/kind=RubricSample/);
    await page.getByRole("button", { name: /Rubric sơ tán cơ bản/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Đã xuất bản (bất biến)")).toBeVisible();
    await drawer.getByRole("button", { name: "Tạo phiên bản mới" }).click();
    await drawer.getByLabel("Tên phiên bản").fill("Rubric sơ tán cơ bản v2");
    await drawer.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã tạo bản nháp mới")).toBeVisible();
    await drawer.getByRole("button", { name: /Xuất bản v2/ }).click();
    await expect(page.getByText("Đã xuất bản v2")).toBeVisible();
  });

  test("equipment cannot be saved without a runtime capability and shows the no-new-capability notice", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/library?kind=Equipment");
    await expect(page.getByText("Metadata thiết bị không thêm khả năng cho runtime")).toBeVisible();
    await page.getByRole("button", { name: "Thêm mục", exact: true }).first().click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Mã").fill("smoke-hood");
    await drawer.getByLabel("Tên phiên bản").fill("Mặt nạ lọc khói");
    await drawer.getByRole("button", { name: "Tạo mục" }).click();
    await expect(drawer.getByText("Thiết bị phải gắn ít nhất một khả năng runtime đã có.")).toBeVisible();
    await expect(drawer.getByLabel("Tên phiên bản")).toHaveValue("Mặt nạ lọc khói");
    await drawer.getByLabel("cover.nose").check();
    await drawer.getByRole("button", { name: "Tạo mục" }).click();
    await expect(page.getByText("Đã tạo mục thư viện")).toBeVisible();
  });

  test("duplicate code is rejected and deactivate needs confirmation", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/library");
    await page.getByRole("button", { name: "Thêm mục", exact: true }).first().click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Mã").fill("school-evacuation");
    await drawer.getByLabel("Tên phiên bản").fill("Trùng mã");
    await drawer.getByRole("button", { name: "Tạo mục" }).click();
    await expect(drawer.getByText("Mã này đã tồn tại.")).toBeVisible();
    await drawer.getByRole("button", { name: "Hủy" }).click();
    await page.getByRole("button", { name: /Khói tại văn phòng nhiều tầng/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Ngừng dùng" }).click();
    await page.getByRole("dialog").filter({ hasText: "Ngừng dùng mục này?" }).getByRole("button", { name: "Xác nhận" }).click();
    await expect(page.getByText("Đã ngừng dùng mục")).toBeVisible();
  });
});

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"] as const) {
    test(`prototype screens fit ${width}px in the ${theme} theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      await signIn(page);
      for (const path of ["/admin/library"]) {
        await page.goto(path);
        await expect(page.getByTestId("prototype-banner")).toBeVisible();
        await page.waitForTimeout(700);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`${path.replace(/[^a-z0-9]+/gi, "_")}-${width}-${theme}.png`), fullPage: true });
      }
    });
  }
}
