import { expect, test } from "@playwright/test";

test("shows a sign-in guard for the organization administration route", async ({ page }) => {
  await page.goto("/admin/organizations");

  await expect(page.getByRole("heading", { name: "Quản lý tổ chức" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});

test("shows a sign-in guard for the Building workspace", async ({ page }) => {
  await page.goto("/workspace/buildings");

  await expect(page.getByRole("heading", { name: "Công trình" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});
