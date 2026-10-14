import { expect, test, type Page } from "@playwright/test";

/*
 * Runs against `pnpm dev` (set PLAYWRIGHT_DEV_URL, e.g. http://localhost:5241); skipped otherwise.
 * Evidence type: the prototypes use LOCAL SAMPLE DATA and route-mocked auth. No Learn/Library API exists yet
 * (BE#57), so none of this is integration evidence. Reviews is a real screen now and is tested in admin-scenario-reviews.spec.ts.
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

test("dev shows the prototype banner and the pending blocker together", async ({ page }) => {
  await signIn(page);
  for (const path of ["/admin/learn", "/admin/library"]) {
    await page.goto(path);
    await expect(page.getByTestId("pending-module")).toBeVisible();
    await expect(page.getByTestId("prototype-banner")).toContainText("Dữ liệu mẫu · chỉ môi trường phát triển");
  }
});

test("organization users are blocked in dev as well", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/admin/learn");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
});

test.describe("learn prototype", () => {
  test("list, filters and status meaning", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn");
    await page.getByLabel("Trạng thái bài").selectOption("Hidden");
    await expect(page).toHaveURL(/status=Hidden/);
    await page.getByRole("button", { name: /An toàn khi nấu ăn/ }).click();
    await page.getByRole("tab", { name: "Xuất bản" }).click();
    await expect(page.getByText(/vẫn có thể là nguồn RAG/).first()).toBeVisible();
  });

  test("video block rejects other providers, shows a link card and never an iframe", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?post=new");
    await page.getByRole("tab", { name: "Nội dung" }).click();
    await page.getByLabel("Loại khối").selectOption("video");
    await page.getByRole("button", { name: "Thêm khối" }).click();
    await page.getByLabel("Đường dẫn video").fill("https://vimeo.com/123456");
    await expect(page.getByText("Chỉ chấp nhận video từ YouTube, Facebook hoặc TikTok.")).toBeVisible();
    await page.getByLabel("Đường dẫn video").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Tóm tắt dự phòng").fill("Tóm tắt cách thoát nạn.");
    const preview = page.getByTestId("media-preview");
    await expect(preview).toContainText("YouTube");
    await expect(preview.getByRole("link")).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("create validates the slug, then saves a draft that cannot be published without a situation", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?post=new");
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Bài thử");
    await page.getByLabel(/Slug/).fill("Bài Thử!");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText(/Slug chỉ gồm chữ thường/).first()).toBeVisible();
    await page.getByLabel(/Slug/).fill("bai-thu-moi");
    await page.getByRole("tab", { name: "Nội dung" }).click();
    await page.getByRole("button", { name: "Thêm khối" }).click();
    await page.getByRole("textbox", { name: "Nội dung *" }).fill("Đoạn mở đầu.");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã tạo bản nháp")).toBeVisible();
    await expect(page).toHaveURL(/post=lp-/);
    await page.getByRole("tab", { name: "Xuất bản" }).click();
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Chọn ít nhất một tình huống")).toBeVisible();
  });

  test("412 keeps my edit and offers to compare with the newer version", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?status=Published");
    await page.getByRole("button", { name: /Thoát nạn khi có khói dày/ }).first().click();
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Tiêu đề tôi vừa sửa");
    await page.getByRole("button", { name: "Giả lập: người khác sửa bài này" }).click();
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Bài đã được thay đổi ở nơi khác kể từ lần bạn mở").first()).toBeVisible();
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Tiêu đề tôi vừa sửa");
    await expect(page.getByText("Đối chiếu với bản mới nhất")).toBeVisible();
    await page.getByRole("button", { name: "Giữ nội dung của tôi" }).click();
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
  });

  test("hide, show, delete and restore follow the documented lifecycle", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?status=Published");
    await page.getByRole("button", { name: /Nhớ nhanh quy tắc PASS/ }).click();
    await page.getByRole("tab", { name: "Xuất bản" }).click();
    await page.getByRole("button", { name: "Ẩn bài" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Ẩn bài" }).click();
    await expect(page.getByText("Đã ẩn bài", { exact: true })).toBeVisible();
    await expect(page.getByText("Đã ẩn", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Xóa bài" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xóa bài" }).click();
    await expect(page.getByText("Đã xóa bài", { exact: true })).toBeVisible();
    await expect(page.getByText("Đã xóa", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Khôi phục" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Khôi phục" }).click();
    await expect(page.getByText("Đã khôi phục bài", { exact: true })).toBeVisible();
    await expect(page.getByText("Đã ẩn", { exact: true }).first()).toBeVisible(); // restored to Hidden, not public
  });

  test("showing a hidden post with an unapproved source is refused by the (sample) backend", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?status=Unpublished");
    await page.getByRole("button", { name: /Hỗ trợ người lớn tuổi/ }).click();
    await page.getByRole("tab", { name: "Xuất bản" }).click();
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(/Nguồn chưa được duyệt|nguồn Common chưa được duyệt/)).toBeVisible();
  });
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
      for (const path of ["/admin/learn", "/admin/learn?post=lp-1", "/admin/library"]) {
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
