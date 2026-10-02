import { expect, test } from "@playwright/test";

test("login password can be revealed and hidden again", async ({ page }) => {
  await page.goto("/login");

  const password = page.getByLabel("Mật khẩu", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Hiển thị mật khẩu" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ẩn mật khẩu" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("account password fields can be revealed independently", async ({ page }) => {
  const user = { id: "trainee-1", email: "trainee@fire3d.test", fullName: "Trainee", role: 2, organizationId: null, profileRevision: 1 };
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: "access", refreshToken: "refresh" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: "\"1\"" } }));

  await page.goto("/account");

  const currentPassword = page.getByLabel("Mật khẩu hiện tại", { exact: true });
  const newPassword = page.getByLabel("Mật khẩu mới", { exact: true });
  await expect(currentPassword).toHaveAttribute("type", "password");
  await expect(newPassword).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Hiển thị mật khẩu hiện tại" }).click();
  await expect(currentPassword).toHaveAttribute("type", "text");
  await expect(newPassword).toHaveAttribute("type", "password");
});
