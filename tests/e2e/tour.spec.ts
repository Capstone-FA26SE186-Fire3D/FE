import { expect, test, type Page } from "@playwright/test";

// All network is mocked with Playwright routes: evidence for UI behaviour, not for BE integration.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const buildings = [{ id: "b-1", name: "Trường Học GOT", buildingType: "Trường học", totalFloors: 3, isActive: true, createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" }];

async function signIn(page: Page, user: typeof owner | typeof admin = owner, tour?: "done" | "skipped") {
  await page.addInitScript(({ tourValue }) => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" }));
    if (tourValue) localStorage.setItem("fire3d-org-tour", tourValue);
  }, { tourValue: tour ?? null });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
  await page.route("**/api/buildings?*", (route) => route.fulfill({ json: { items: buildings, totalCount: 1, page: 1, pageSize: 20 } }));
}

// First visit: no stored tour state (the config seeds "done" for every other spec).
test.use({ storageState: { cookies: [], origins: [] } });

const overlay = (page: Page) => page.getByTestId("tour-overlay");
const tourDialog = (page: Page) => page.getByRole("dialog", { name: /Công trình/ });
const readTour = (page: Page) => page.evaluate(() => localStorage.getItem("fire3d-org-tour"));

test.describe("spotlight tour", () => {
  test("auto-starts once for an OrganizationUser; Bỏ qua stores skipped", async ({ page }) => {
    await signIn(page);
    await page.goto("/workspace/buildings");
    await expect(overlay(page)).toBeVisible();
    await expect(overlay(page).getByText("Bước 1/5")).toBeVisible();
    await expect(tourDialog(page)).toBeFocused();
    // Step 1 spotlights the sidebar "Công trình" link.
    await expect(overlay(page)).toHaveAttribute("data-step", "nav-buildings");
    await expect(page.locator(".ops-tour-ring")).toBeVisible();

    await overlay(page).getByRole("button", { name: "Bỏ qua" }).click();
    await expect(overlay(page)).toHaveCount(0);
    expect(await readTour(page)).toBe("skipped");

    await page.reload();
    await expect(page.getByRole("navigation", { name: "Quản lý tổ chức" })).toBeVisible();
    await expect(overlay(page)).toHaveCount(0);
  });

  test("Tiếp walks the available steps and ends with the open-a-building card when no building is open", async ({ page }) => {
    await signIn(page);
    await page.goto("/workspace/buildings");
    await expect(overlay(page).getByText("Bước 1/5")).toBeVisible();
    await overlay(page).getByRole("button", { name: "Tiếp" }).click();
    // Step 2 shows only when the list carries data-tour="buildings-list"; either way steps 3–5 need an open building.
    if (await overlay(page).getByText("Bước 2/5").isVisible()) {
      await expect(overlay(page)).toHaveAttribute("data-step", "buildings-list");
      await overlay(page).getByRole("button", { name: "Tiếp" }).click();
    }
    await expect(overlay(page).getByText("Mở một công trình để xem các bước tiếp theo")).toBeVisible();
    await overlay(page).getByRole("button", { name: "Xong" }).click();
    await expect(overlay(page)).toHaveCount(0);
    expect(await readTour(page)).toBe("done");
  });

  test("Esc skips, and the ? trigger restarts a finished tour", async ({ page }) => {
    await signIn(page, owner, "done");
    await page.goto("/workspace/buildings");
    await expect(page.getByRole("navigation", { name: "Quản lý tổ chức" })).toBeVisible();
    await expect(overlay(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Xem hướng dẫn" }).click();
    await expect(overlay(page).getByText("Bước 1/5")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overlay(page)).toHaveCount(0);
    expect(await readTour(page)).toBe("skipped");
  });

  test("does not auto-start for a PlatformAdmin", async ({ page }) => {
    await signIn(page, admin);
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 100 } }));
    await page.goto("/workspace/buildings");
    await expect(page.getByRole("navigation", { name: "Quản lý tổ chức" })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(overlay(page)).toHaveCount(0);
  });
});
