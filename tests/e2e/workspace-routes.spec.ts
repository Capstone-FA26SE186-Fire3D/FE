import { expect, test } from "@playwright/test";

test("shows a sign-in guard for the organization administration route", async ({ page }) => {
  await page.goto("/admin/organizations");

  await expect(page.getByRole("heading", { name: "Quản lý tổ chức" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});
