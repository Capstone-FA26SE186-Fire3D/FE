import { expect, test, type Page } from "@playwright/test";
import { admin as billingAdmin, callsTo, etagOf, ids, mockBilling, newMock, signIn as billingSignIn } from "./billing-mock";
import { tokenSession } from "./regression-helpers";

/*
 * Regression: edit forms that save with If-Match. When somebody else changed the record first (412) the user's typed
 * text stays, the newer server version is loaded for comparison, and saving afterwards never overwrites the other
 * person's changes to fields the user did not touch. The server here is a small stateful route mock (revision = ETag).
 */

type Rec = Record<string, unknown> & { profileRevision: number };

function etagServer(initial: Rec) {
  const state = { record: { ...initial }, patches: [] as Array<{ ifMatch: string | undefined; body: Record<string, unknown> }>, reads: 0 };
  return {
    state,
    /** Another person saves first: the revision moves on. */
    otherEditor(changes: Record<string, unknown>) { state.record = { ...state.record, ...changes, profileRevision: state.record.profileRevision + 1 }; },
    async handle(route: import("@playwright/test").Route) {
      const request = route.request();
      if (request.method() === "GET") { state.reads += 1; return route.fulfill({ json: state.record, headers: { ETag: `"${state.record.profileRevision}"` } }); }
      const body = request.postDataJSON() as Record<string, unknown>;
      const ifMatch = request.headers()["if-match"];
      state.patches.push({ ifMatch, body });
      if (ifMatch !== `"${state.record.profileRevision}"`) return route.fulfill({ status: 412, json: { title: "Precondition failed", code: "PROFILE_REVISION_MISMATCH" } });
      state.record = { ...state.record, ...body, profileRevision: state.record.profileRevision + 1 };
      return route.fulfill({ json: state.record, headers: { ETag: `"${state.record.profileRevision}"` } });
    },
  };
}

const personal = (): Rec => ({ id: "u-1", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", dob: "1998-04-12", gender: 0, phoneNumber: "+84901234567", avatarUrl: null, profileRevision: 7, role: 1, organizationId: "org-1" });
const organization = (): Rec => ({ id: "org-1", name: "Fire3D Studio", slug: "fire3d-studio", address: "Đà Nẵng", phoneNumber: "+842361234567", isActive: true, profileRevision: 4, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });

async function openProfile(page: Page) {
  const me = etagServer(personal());
  const org = etagServer(organization());
  await tokenSession(page, "tok-profile");
  await page.route("**/api/auth/me", (route) => me.handle(route));
  await page.route("**/api/organizations/me", (route) => org.handle(route));
  await page.goto("/workspace/profile");
  await expect(page.getByLabel("Họ và tên")).toHaveValue("Nguyễn Văn A");
  await expect(page.getByLabel("Tên tổ chức")).toHaveValue("Fire3D Studio");
  return { me, org };
}

test.describe("412 on the account profile", () => {
  test("personal profile: typed text stays, newer fields of the other editor are loaded, and saving does not overwrite them", async ({ page }) => {
    const { me } = await openProfile(page);
    await page.getByLabel("Họ và tên").fill("Tên tôi vừa gõ");
    me.otherEditor({ phoneNumber: "+84900000000" }); // somebody else changed the phone number meanwhile

    await page.getByRole("button", { name: "Lưu hồ sơ cá nhân" }).click();
    await expect(page.getByText("Hồ sơ đã thay đổi")).toBeVisible();
    await expect(page.getByLabel("Họ và tên")).toHaveValue("Tên tôi vừa gõ");
    expect(me.state.patches).toHaveLength(1);

    await page.getByRole("button", { name: "Tải bản mới nhất" }).first().click();
    await expect(page.getByLabel("Họ và tên")).toHaveValue("Tên tôi vừa gõ"); // what I typed survives
    await expect(page.getByLabel("Số điện thoại")).toHaveValue("+84900000000"); // what I did not touch follows the server

    await page.getByRole("button", { name: "Lưu hồ sơ cá nhân" }).click();
    await expect(page.getByText("Đã lưu hồ sơ cá nhân")).toBeVisible();
    expect(me.state.patches).toHaveLength(2);
    expect(me.state.patches[1].ifMatch).toBe('"8"');
    expect(me.state.patches[1].body).toMatchObject({ fullName: "Tên tôi vừa gõ", phoneNumber: "+84900000000" });
    expect(me.state.record).toMatchObject({ fullName: "Tên tôi vừa gõ", phoneNumber: "+84900000000" });
  });

  test("organization profile: same guarantees", async ({ page }) => {
    const { org } = await openProfile(page);
    await page.getByLabel("Tên tổ chức").fill("Tên tổ chức tôi gõ");
    org.otherEditor({ address: "Hà Nội, địa chỉ mới" });

    await page.getByRole("button", { name: "Lưu hồ sơ tổ chức" }).click();
    await expect(page.getByText("Hồ sơ đã thay đổi")).toBeVisible();
    await expect(page.getByLabel("Tên tổ chức")).toHaveValue("Tên tổ chức tôi gõ");

    await page.getByRole("button", { name: "Tải bản mới nhất" }).first().click();
    await expect(page.getByLabel("Tên tổ chức")).toHaveValue("Tên tổ chức tôi gõ");
    await expect(page.getByLabel("Địa chỉ tổ chức")).toHaveValue("Hà Nội, địa chỉ mới");

    await page.getByRole("button", { name: "Lưu hồ sơ tổ chức" }).click();
    await expect(page.getByText("Đã lưu hồ sơ tổ chức")).toBeVisible();
    expect(org.state.patches[1].ifMatch).toBe('"5"');
    expect(org.state.record).toMatchObject({ name: "Tên tổ chức tôi gõ", address: "Hà Nội, địa chỉ mới" });
  });

  test("a double click on Save sends one PATCH", async ({ page }) => {
    const { me } = await openProfile(page);
    await page.getByLabel("Họ và tên").fill("Gõ một lần");
    await page.getByRole("button", { name: "Lưu hồ sơ cá nhân" }).dblclick();
    await expect(page.getByText("Đã lưu hồ sơ cá nhân")).toBeVisible();
    expect(me.state.patches).toHaveLength(1);
  });
});

test.describe("412 on commerce catalog edits (PATCH replaces every field)", () => {
  test("package: after 'load the newer version' the fields I did not touch follow the server, the one I typed stays", async ({ page }) => {
    const mock = newMock();
    await billingSignIn(page, billingAdmin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce");
    await page.getByRole("button", { name: "Sửa gói BLD-12", exact: true }).click();
    await page.getByLabel("Tên gói").fill("Tên gói tôi gõ");
    // Somebody else raises the price and saves first.
    mock.packages[0].revision = 4;
    mock.packages[0].unitPrice = 777000;
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByText(/vừa được thay đổi ở nơi khác/)).toBeVisible();
    await page.getByRole("button", { name: "Tải bản mới để đối chiếu" }).click();
    await expect(page.getByLabel("Tên gói")).toHaveValue("Tên gói tôi gõ");
    await expect(page.getByLabel(/Đơn giá/)).toHaveValue("777000");
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByRole("row", { name: /Tên gói tôi gõ/ })).toBeVisible();
    const sent = callsTo(mock, "PATCH", `/api/admin/service-packages/${ids.pkg}`);
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toMatchObject({ name: "Tên gói tôi gõ", unitPrice: 777000 });
  });

  test("discount rule: same guarantee", async ({ page }) => {
    const mock = newMock();
    await billingSignIn(page, billingAdmin);
    await mockBilling(page, mock);
    const rule = mock.discounts[0] as Record<string, unknown> & { revision: number };
    const patches: Array<{ ifMatch: string | undefined; body: Record<string, unknown> }> = [];
    // The shared mock has no single-rule route: a minimal one with the same If-Match rule as the server.
    await page.route("**/api/admin/discount-rules/*", async (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.fulfill({ json: rule, headers: { ETag: etagOf(ids.discount, rule.revision) } });
      const body = request.postDataJSON() as Record<string, unknown>;
      patches.push({ ifMatch: request.headers()["if-match"], body });
      if (request.headers()["if-match"] !== etagOf(ids.discount, rule.revision)) return route.fulfill({ status: 412, json: { code: "BILLING_PRECONDITION_FAILED", title: "stale" } });
      Object.assign(rule, body, { revision: rule.revision + 1 });
      return route.fulfill({ json: rule, headers: { ETag: etagOf(ids.discount, rule.revision) } });
    });
    await page.goto("/admin/commerce?tab=discounts");
    await page.getByRole("button", { name: /^Sửa quy tắc/ }).first().click();
    await page.getByLabel("Mã quy tắc").fill("MA-TOI-GO");
    rule.revision = 3; // somebody else changed the minimum number of buildings first
    rule.minimumBuildings = 9;
    await page.getByRole("button", { name: "Lưu quy tắc" }).click();
    await expect(page.getByText(/vừa được thay đổi ở nơi khác/)).toBeVisible();
    await page.getByRole("button", { name: "Tải bản mới để đối chiếu" }).click();
    await expect(page.getByLabel("Mã quy tắc")).toHaveValue("MA-TOI-GO");
    await expect(page.getByLabel("Số công trình tối thiểu")).toHaveValue("9");
    await page.getByRole("button", { name: "Lưu quy tắc" }).click();
    await expect.poll(() => patches.length).toBe(2);
    expect(patches[1].body).toMatchObject({ code: "MA-TOI-GO", minimumBuildings: 9 });
  });
});

test.describe("other write failures on the account profile keep the typed text and speak Vietnamese", () => {
  const cases = [
    { name: "401", respond: (route: import("@playwright/test").Route) => route.fulfill({ status: 401, json: { title: "Unauthorized" } }), text: /Phiên đăng nhập đã hết hạn/ },
    { name: "403", respond: (route: import("@playwright/test").Route) => route.fulfill({ status: 403, json: { title: "Forbidden" } }), text: /Bạn không có quyền/ },
    { name: "500", respond: (route: import("@playwright/test").Route) => route.fulfill({ status: 500, body: "Internal Server Error" }), text: /Máy chủ gặp lỗi/ },
    { name: "network", respond: (route: import("@playwright/test").Route) => route.abort("connectionreset"), text: /Mất kết nối/ },
  ];
  for (const item of cases) {
    test(item.name, async ({ page }) => {
      await openProfile(page);
      await page.route("**/api/auth/me", (route) => (route.request().method() === "PATCH" ? item.respond(route) : route.fallback()));
      await page.getByLabel("Họ và tên").fill("Nội dung đang gõ");
      await page.getByRole("button", { name: "Lưu hồ sơ cá nhân" }).click();
      await expect(page.getByRole("alert").filter({ hasText: item.text })).toBeVisible();
      await expect(page.getByLabel("Họ và tên")).toHaveValue("Nội dung đang gõ");
      await expect(page.getByRole("button", { name: "Lưu hồ sơ cá nhân" })).toBeEnabled(); // the user can retry
    });
  }
});

test.describe("412 on the PlatformAdmin organization editor", () => {
  test("typed value stays, the newer version is offered, and only the changed fields are sent", async ({ page }) => {
    const server = etagServer({ ...organization(), accountCount: 2, buildingCount: 1 });
    await tokenSession(page, "tok-admin");
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "adm", email: "adm@fire3d.test", fullName: "Quản trị", role: 0, organizationId: null, profileRevision: 1 }, headers: { ETag: '"1"' } }));
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [server.state.record], totalCount: 1, page: 1, pageSize: 20 } }));
    await page.route("**/api/organizations/org-1", (route) => server.handle(route));
    await page.goto("/admin/organizations?organization=org-1");
    const drawer = page.getByRole("dialog", { name: "Thông tin tổ chức" });
    await drawer.getByRole("button", { name: "Sửa hồ sơ" }).click();
    await drawer.getByLabel("Tên tổ chức").fill("Tên do admin gõ");
    server.otherEditor({ phoneNumber: "+842369999999" });

    await drawer.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(drawer.getByText("Hồ sơ vừa được thay đổi ở nơi khác")).toBeVisible();
    await expect(drawer.getByLabel("Tên tổ chức")).toHaveValue("Tên do admin gõ");

    await drawer.getByRole("button", { name: "Tải bản mới để đối chiếu" }).click();
    await expect(drawer.getByText("Đã tải bản mới nhất")).toBeVisible();
    await expect(drawer.getByLabel("Tên tổ chức")).toHaveValue("Tên do admin gõ");
    await expect(drawer.getByLabel("Số điện thoại")).toHaveValue("+842369999999");

    await drawer.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect.poll(() => server.state.patches.length).toBe(2);
    expect(server.state.patches[1].ifMatch).toBe('"5"');
    expect(server.state.patches[1].body).toEqual({ name: "Tên do admin gõ" }); // the phone number of the other editor is not re-sent
    expect(server.state.record).toMatchObject({ name: "Tên do admin gõ", phoneNumber: "+842369999999" });
  });
});
