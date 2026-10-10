import { expect, test } from "@playwright/test";

test("shows a sign-in guard for the organization administration route", async ({ page }) => {
  await page.goto("/admin/organizations");

  await expect(page.getByRole("heading", { name: "Quản trị hệ thống" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});

test("shows a sign-in guard for the Building workspace", async ({ page }) => {
  await page.goto("/workspace/buildings");

  await expect(page.getByRole("heading", { name: "Không gian tổ chức" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});

test("shows a sign-in guard for the local IFC workspace", async ({ page }) => {
  await page.goto("/workspace/ifc");

  await expect(page.getByRole("heading", { name: "Không gian tổ chức" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});

test("does not grant a Trainee access to the local IFC workspace", async ({ page }) => {
  const token = "trainee-access-token";
  const trainee = { id: "trainee-1", email: "trainee@fire3d.test", fullName: "Trainee", role: 2, organizationId: null };
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: trainee }));

  await page.goto("/workspace/ifc");

  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  await expect(page.getByLabel("Chọn tệp IFC")).toHaveCount(0);
});

test("allows an OrganizationUser to open the browser-only IFC scanner", async ({ page }) => {
  const token = "organization-access-token";
  const user = { id: "organization-1", email: "owner@fire3d.test", fullName: "Organization User", role: 1, organizationId: "org-1" };
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));

  await page.goto("/workspace/ifc");

  await expect(page.getByRole("heading", { name: "Quét mô hình IFC" })).toBeVisible();
  await expect(page.getByLabel("Chọn tệp IFC")).toHaveAttribute("accept", ".ifc");
  await expect(page.getByText("File chỉ được xử lý trong trình duyệt này.")).toBeVisible();
});

test("keeps an OrganizationUser IFC file local before backend revisions exist", async ({ page }) => {
  const token = "organization-access-token";
  const user = { id: "organization-1", email: "owner@fire3d.test", fullName: "Organization User", role: 1, organizationId: "org-1" };
  const apiRequests: string[] = [];
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  page.on("request", (request) => {
    if (request.url().includes("/api/buildings") || request.url().includes("/revisions")) apiRequests.push(request.url());
  });

  await page.goto("/workspace/ifc");
  await page.getByLabel("Chọn tệp IFC").setInputFiles({ name: "not-a-model.txt", mimeType: "text/plain", buffer: Buffer.from("not an IFC model") });
  await expect(page.getByText("Hãy chọn một tệp IFC (.ifc) không rỗng.")).toBeVisible();
  expect(apiRequests).toEqual([]);
});
