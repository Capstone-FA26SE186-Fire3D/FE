import { expect, test, type Page } from "@playwright/test";

// /workspace/profile: the organization's own profile (GET/PATCH /api/organizations/me with ETag + If-Match).
// Playwright route mocks of the BE contract; not integration evidence.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const profile = (revision: number, over: Record<string, unknown> = {}) => ({ id: "org-1", name: "Trường ĐH Bách Khoa", slug: "bach-khoa", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", address: "268 Lý Thường Kiệt", phoneNumber: "028 3864 0000", profileRevision: revision, ...over });

async function signIn(page: Page, user: object = owner) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "org-access", refreshToken: "org-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

test("shows name, read-only slug, address and phone only, and saves with If-Match", async ({ page }) => {
  await signIn(page);
  const puts: Array<{ ifMatch: string | undefined; body: unknown }> = [];
  await page.route("**/api/organizations/me", async (route) => {
    if (route.request().method() === "PATCH") {
      puts.push({ ifMatch: route.request().headers()["if-match"], body: route.request().postDataJSON() });
      return route.fulfill({ json: profile(2, { name: "Trường ĐH Bách Khoa 2" }), headers: { ETag: '"2"' } });
    }
    return route.fulfill({ json: profile(1), headers: { ETag: '"1"' } });
  });
  await page.goto("/workspace/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Hồ sơ tổ chức" })).toBeVisible();
  await expect(page.getByLabel("Tên tổ chức")).toHaveValue("Trường ĐH Bách Khoa");
  await expect(page.getByLabel("Mã định danh (slug)")).toHaveValue("bach-khoa");
  await expect(page.getByLabel("Mã định danh (slug)")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Địa chỉ")).toHaveValue("268 Lý Thường Kiệt");
  await expect(page.getByLabel("Điện thoại")).toHaveValue("028 3864 0000");
  for (const absent of ["Người liên hệ", "Email", "Mã số thuế", "Thành viên"]) await expect(page.getByLabel(absent)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  await page.getByLabel("Tên tổ chức").fill("Trường ĐH Bách Khoa 2");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]).toEqual({ ifMatch: '"1"', body: { name: "Trường ĐH Bách Khoa 2", address: "268 Lý Thường Kiệt", phoneNumber: "028 3864 0000" } });
  await expect(page.getByText("Đã lưu hồ sơ tổ chức")).toBeVisible();
});

test("412 keeps my values and offers overwrite or the latest version", async ({ page }) => {
  await signIn(page);
  let current = 1;
  const patches: Array<string | undefined> = [];
  await page.route("**/api/organizations/me", async (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().headers()["if-match"]);
      if (route.request().headers()["if-match"] !== `"${current}"`) return route.fulfill({ status: 412, contentType: "application/problem+json", body: JSON.stringify({ status: 412, title: "stale", code: "PRECONDITION_FAILED" }) });
      current += 1;
      return route.fulfill({ json: profile(current, { name: "Giá trị của tôi" }), headers: { ETag: `"${current}"` } });
    }
    return route.fulfill({ json: profile(current, current > 1 || patches.length ? { name: "Bản của người khác" } : {}), headers: { ETag: `"${current}"` } });
  });
  await page.goto("/workspace/profile");
  await expect(page.getByLabel("Tên tổ chức")).toHaveValue("Trường ĐH Bách Khoa");
  current = 2; // someone else saved meanwhile
  await page.getByLabel("Tên tổ chức").fill("Giá trị của tôi");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Dữ liệu đã thay đổi trên máy chủ (412)")).toBeVisible();
  await expect(page.getByLabel("Tên tổ chức")).toHaveValue("Giá trị của tôi");
  await page.getByRole("button", { name: "Ghi đè bằng giá trị của tôi" }).click();
  await expect(page.getByText("Đã lưu hồ sơ tổ chức")).toBeVisible();
  expect(patches).toEqual(['"1"', '"2"']);
});

test("a Trainee is turned away", async ({ page }) => {
  await signIn(page, { ...owner, role: 2, organizationId: null });
  await page.goto("/workspace/profile");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
});
