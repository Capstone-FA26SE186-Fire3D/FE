import { expect, test } from "@playwright/test";

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };

test("signed in on /login: the page redirects; when the redirect never completes it offers a plain link", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "a", refreshToken: "r" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
  // The workspace never answers (a stalled client navigation): the router cannot leave the login page.
  await page.route(/\/workspace(\/|$|\?)/, () => new Promise<void>(() => undefined));
  await page.goto("/login");
  await expect(page.getByText("Bạn đã đăng nhập. Đang chuyển hướng…")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở trang làm việc" })).toHaveCount(0);
  const link = page.getByRole("link", { name: "Mở trang làm việc" });
  await expect(link).toBeVisible({ timeout: 10_000 });
  await expect(link).toHaveAttribute("href", /^\/workspace/);
});
