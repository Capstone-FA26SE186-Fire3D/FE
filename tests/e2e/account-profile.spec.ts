import { expect, test, type Page } from "@playwright/test";

const organizationUser = {
  id: "organization-user",
  email: "owner@fire3d.test",
  fullName: "Nguyen Van A",
  username: "nguyen.van.a",
  dob: "1998-04-12",
  gender: 0,
  phoneNumber: "+84901234567",
  avatarUrl: null,
  profileRevision: 7,
  role: 1,
  organizationId: "organization-1",
};

function restoreSession(page: Page) {
  return page.addInitScript(() => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({
      accessToken: "profile-access-token",
      refreshToken: "profile-refresh-token",
    }));
  });
}

test("account profile uses the latest ETags to update a user and its organization", async ({ page }) => {
  const personalUpdates: { body?: unknown; ifMatch?: string | undefined }[] = [];
  const organizationUpdates: { body?: unknown; ifMatch?: string | undefined }[] = [];

  await restoreSession(page);
  await page.route("**/api/auth/me", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ headers: { etag: '"7"' }, json: organizationUser });
      return;
    }

    personalUpdates.push({
      body: route.request().postDataJSON(),
      ifMatch: await route.request().headerValue("if-match"),
    });
    await route.fulfill({
      headers: { etag: '"8"' },
      json: { ...organizationUser, fullName: "Nguyen Van B", phoneNumber: "+84908889999" },
    });
  });
  await page.route("**/api/organizations/me", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        headers: { etag: '"4"' },
        json: {
          id: "organization-1",
          name: "Fire3D Studio",
          slug: "fire3d-studio",
          address: "Da Nang",
          phoneNumber: "+842361234567",
          isActive: true,
          profileRevision: 4,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      });
      return;
    }

    organizationUpdates.push({
      body: route.request().postDataJSON(),
      ifMatch: await route.request().headerValue("if-match"),
    });
    await route.fulfill({
      headers: { etag: '"5"' },
      json: {
        id: "organization-1",
        name: "Fire3D Safety Studio",
        slug: "fire3d-studio",
        address: "Da Nang",
        phoneNumber: "+842361234567",
        isActive: true,
        profileRevision: 5,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    });
  });

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Tài khoản của bạn" })).toBeVisible();

  await page.getByLabel("Họ và tên").fill("Nguyen Van B");
  await page.getByLabel("Số điện thoại").fill("+84908889999");
  await page.getByRole("button", { name: "Lưu hồ sơ cá nhân" }).click();

  await expect.poll(() => personalUpdates).toEqual([{
    ifMatch: '"7"',
    body: {
      fullName: "Nguyen Van B",
      username: "nguyen.van.a",
      dob: "1998-04-12",
      gender: 0,
      phoneNumber: "+84908889999",
    },
  }]);

  await page.getByLabel("Tên tổ chức").fill("Fire3D Safety Studio");
  await page.getByRole("button", { name: "Lưu hồ sơ tổ chức" }).click();

  await expect.poll(() => organizationUpdates).toEqual([{
    ifMatch: '"4"',
    body: { name: "Fire3D Safety Studio", address: "Da Nang", phoneNumber: "+842361234567" },
  }]);
});

test("changing a password ends the current local session", async ({ page }) => {
  let changePasswordPayload: unknown;

  await restoreSession(page);
  await page.route("**/api/auth/me", (route) => route.fulfill({ headers: { etag: '"2"' }, json: { ...organizationUser, role: 2, organizationId: null } }));
  await page.route("**/api/auth/change-password", async (route) => {
    changePasswordPayload = route.request().postDataJSON();
    await route.fulfill({ status: 204 });
  });

  await page.goto("/account");
  await page.getByLabel("Mật khẩu hiện tại", { exact: true }).fill("old-password");
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("new-password");
  await page.getByLabel("Xác nhận mật khẩu mới", { exact: true }).fill("new-password");
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();

  await expect.poll(() => changePasswordPayload).toEqual({ currentPassword: "old-password", newPassword: "new-password" });
  await expect(page.getByRole("heading", { name: "Đăng nhập Fire3D" })).toBeVisible();
});
