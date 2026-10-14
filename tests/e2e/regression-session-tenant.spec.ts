import { expect, test, type Page } from "@playwright/test";
import { installLearnBackend, LearnBackend, signIn as learnSignIn } from "./learn-mock";
import { installTenantServer, orgA, orgB, tokenSession } from "./regression-helpers";

/*
 * Regression: a second account in the same tab (log out, log in as another organization) must not inherit anything from
 * the first one, and nothing business-related may stay in browser storage after logging out. Route-mock evidence only.
 */

const storageDump = (page: Page) => page.evaluate(() => {
  const read = (storage: Storage) => Object.fromEntries(Array.from({ length: storage.length }, (_, index) => storage.key(index) as string).map((key) => [key, storage.getItem(key)]));
  return { session: read(sessionStorage), local: read(localStorage) };
});

async function logOut(page: Page) {
  await page.goto("/workspace/profile");
  await page.locator("#ops-main").getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function logIn(page: Page, tenant: typeof orgA, next = "/workspace/buildings") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(tenant.user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(tenant.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test.describe("account switch in one tab", () => {
  test("organization B sees none of organization A's buildings, tokens or ids after logging in on the same tab", async ({ page }) => {
    await tokenSession(page, orgA.token);
    await installTenantServer(page, [orgA, orgB]);

    await page.goto("/workspace/buildings");
    await expect(page.getByText("Tòa A-Alpha")).toBeVisible();
    await expect(page.getByText("Tòa A-Beta")).toBeVisible();

    await logOut(page);
    const afterLogout = await storageDump(page);
    expect(JSON.stringify(afterLogout)).not.toContain(orgA.token);

    await logIn(page, orgB);
    await expect(page).toHaveURL(/\/workspace\/buildings/);
    await expect(page.getByText("Tòa B-Gamma")).toBeVisible();
    await expect(page.getByText("Tòa A-Alpha")).toHaveCount(0);
    await expect(page.getByText("Tòa A-Beta")).toHaveCount(0);

    const stored = JSON.stringify(await storageDump(page));
    expect(stored).not.toContain(orgA.token);
    expect(stored).not.toContain("bld-a");

    // Back through the history of the previous account must not resurrect its data either.
    await page.goBack();
    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page.getByText("Tòa A-Alpha")).toHaveCount(0);
    await expect(page.getByText("Tòa A-Beta")).toHaveCount(0);
    await page.goForward();
    await page.goForward();
    await page.waitForTimeout(500);
    await expect(page.getByText("Tòa A-Alpha")).toHaveCount(0);
  });

  test("a building of another organization opened by id after switching accounts is 404, not the cached detail", async ({ page }) => {
    await tokenSession(page, orgA.token);
    await installTenantServer(page, [orgA, orgB]);
    await page.goto("/workspace/buildings/bld-a1");
    await expect(page.getByRole("heading", { name: "Tòa A-Alpha", level: 1 })).toBeVisible();

    await logOut(page);
    await logIn(page, orgB, "/workspace/buildings");
    await expect(page.getByText("Tòa B-Gamma")).toBeVisible();

    await page.goto("/workspace/buildings/bld-a1");
    await expect(page.getByText("Công trình không tồn tại")).toBeVisible();
    await expect(page.getByText("Tòa A-Alpha")).toHaveCount(0);
  });

  test("a payment left unfinished by organization A is not resumed for organization B", async ({ page }) => {
    await tokenSession(page, orgA.token);
    await installTenantServer(page, [orgA, orgB]);
    await page.goto("/workspace/buildings");
    await expect(page.getByText("Tòa A-Alpha")).toBeVisible();
    // The user left for PayOS: the app remembers which checkout to poll after the return URL.
    await page.evaluate(() => localStorage.setItem("fet3d:billing:pending-checkout:v1", JSON.stringify({
      checkoutId: "co-a", paymentRequestId: "pay-a", quotationId: "quo-a", returnTo: "/workspace/buildings/bld-a1?tab=services", savedAt: Date.now(),
    })));

    await logOut(page);
    await logIn(page, orgB);
    await expect(page.getByText("Tòa B-Gamma")).toBeVisible();

    await page.goto("/workspace/billing/return");
    await expect(page.getByText("Không tìm thấy giao dịch đang dở")).toBeVisible();
    await expect(page).not.toHaveURL(/bld-a1|quo-a/);
  });
});

test.describe("durable command keys", () => {
  test("the opaque Idempotency-Key map is gone after logging out", async ({ page }) => {
    const backend = new LearnBackend();
    backend.seedPost("giu-key");
    await learnSignIn(page, backend, "admin");
    await installLearnBackend(page, backend);
    await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 204, body: "" }));
    const post = backend.bySlug("giu-key")!;

    await page.goto(`/admin/learn?post=${post.id}&tab=publish`);
    backend.failNext("POST", /\/publish$/, { status: 503, json: { code: "UNAVAILABLE", title: "x" } });
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Máy chủ đang bận")).toBeVisible();
    expect((await storageDump(page)).session["fet3d:learn-command-keys:v1"]).toBeTruthy(); // the retry key is kept for the retry

    await page.goto("/learning-hub");
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/$/);
    const dump = await storageDump(page);
    expect(Object.keys(dump.session).filter((key) => key.startsWith("fet3d:"))).toEqual([]);
  });
});
