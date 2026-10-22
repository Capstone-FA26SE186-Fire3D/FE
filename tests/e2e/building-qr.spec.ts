import { expect, test, type Page, type Route } from "@playwright/test";
import { postLoginRoute, safeNext } from "../../src/features/auth/redirect";
import { isQrToken, qrLandingUrl } from "../../src/features/qr-landing/token";

// Everything here is mocked with Playwright routes: evidence for UI behaviour, not for BE integration.
// The mock keeps state like the server does (one Active code per Building, token returned once, SHA-256 only stored),
// so a reload proves what is recovered from the "server" and what is gone.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const trainee = { id: "trainee-1", email: "trainee@fire3d.test", fullName: "Học viên", username: "hoc.vien", role: 2, organizationId: null, profileRevision: 1 };
const building = { id: "building-1", name: "Trường Tiểu học Hòa Bình", buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: { id: "loc-1", address: "1 Test Street", city: "Hà Nội", district: "Cầu Giấy", latitude: null, longitude: null, geojson: null }, contact: null };
const page1 = <T,>(items: T[]) => ({ items, totalCount: items.length, page: 1, pageSize: 20 });

/** 43 characters of base64url, like the 32 random bytes the BE issues. */
const tokenOf = (n: number) => `Tk${String(n).padStart(2, "0")}${"abcdefghijklmnopqrstuvwxyz0123456789-_".repeat(2).slice(0, 39)}`;

type Code = { id: string; buildingId: string; label: string | null; status: "Active" | "Revoked"; createdAt: string; revokedAt: string | null; replacedBy: string | null; replacedId: string | null };
type Logged = { method: string; path: string; headers: Record<string, string>; body: unknown };

async function signIn(page: Page, user: typeof owner | typeof trainee = owner) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
}

async function useTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => localStorage.setItem("fire3d-ops-theme", value), theme);
}

/** Stateful mock of the Building QR endpoints (management and landing). */
class QrWorld {
  codes: Code[] = [];
  tokens = new Map<string, string>(); // token -> code id (the real BE keeps only SHA-256 of the token)
  log: Logged[] = [];
  private seq = 0;
  private clock = Date.parse("2026-10-10T08:00:00Z");

  failNext: Array<{ match: RegExp; status: number; code: string; retryAfter?: string; body?: unknown }> = [];

  private tick() { this.clock += 60_000; return new Date(this.clock).toISOString(); }
  active() { return this.codes.find((code) => code.status === "Active"); }
  /** Seeds an Active code and returns its token (for the landing tests and for the "reload loses the token" proof). */
  seed(label: string | null = "Sảnh chính") {
    const issued = this.issue(label, null);
    return { ...issued, token: issued.token };
  }
  private issue(label: string | null, replaced: Code | null) {
    this.seq += 1;
    const token = tokenOf(this.seq);
    const code: Code = { id: `qr-${this.seq}`, buildingId: "building-1", label: label ?? replaced?.label ?? null, status: "Active", createdAt: this.tick(), revokedAt: null, replacedBy: null, replacedId: replaced?.id ?? null };
    if (replaced) { replaced.replacedBy = code.id; }
    this.codes.unshift(code);
    this.tokens.set(token, code.id);
    return { code, token };
  }
  resolvable(token: string) {
    const id = this.tokens.get(token);
    return Boolean(id && this.codes.find((code) => code.id === id)?.status === "Active");
  }

  private consume(path: string) {
    const index = this.failNext.findIndex((failure) => failure.match.test(path));
    return index >= 0 ? this.failNext.splice(index, 1)[0] : undefined;
  }

  async install(page: Page) {
    const record = (route: Route) => {
      const request = route.request();
      let body: unknown = null;
      try { body = request.postDataJSON(); } catch { body = null; }
      const entry = { method: request.method(), path: new URL(request.url()).pathname, headers: request.headers(), body };
      this.log.push(entry);
      return entry;
    };
    const problem = (route: Route, status: number, code: string, extra: { retryAfter?: string; body?: unknown } = {}) => route.fulfill({ status, headers: extra.retryAfter ? { "Retry-After": extra.retryAfter } : {}, json: extra.body ?? { title: code, code } });

    await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building }));
    await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: page1([]) }));
    await page.route("**/api/buildings/building-1/scenarios?*", (route) => route.fulfill({ json: page1([]) }));

    await page.route("**/api/buildings/building-1/qr-codes?*", (route) => {
      const entry = record(route);
      const failure = this.consume(entry.path);
      if (failure) return problem(route, failure.status, failure.code, failure);
      return route.fulfill({ json: { items: this.codes, total: this.codes.length, page: 1, pageSize: 100 } });
    });
    await page.route("**/api/buildings/building-1/qr-codes", (route) => {
      const entry = record(route);
      const failure = this.consume(entry.path);
      if (failure) return problem(route, failure.status, failure.code, failure);
      if (this.active()) return problem(route, 409, "QR_ALREADY_EXISTS");
      const label = (entry.body as { label: string | null }).label;
      const issued = this.issue(label, null);
      return route.fulfill({ status: 201, json: { code: issued.code, token: issued.token } });
    });
    await page.route("**/api/buildings/building-1/qr-codes/*/rotate", (route) => {
      const entry = record(route);
      const failure = this.consume(entry.path);
      if (failure) return problem(route, failure.status, failure.code, failure);
      const id = entry.path.split("/").at(-2);
      const old = this.codes.find((code) => code.id === id);
      if (!old) return problem(route, 404, "NOT_FOUND");
      if (old.status !== "Active") return problem(route, 409, "QR_ALREADY_REVOKED");
      old.status = "Revoked"; old.revokedAt = this.tick();
      const issued = this.issue((entry.body as { label: string | null }).label, old);
      return route.fulfill({ json: { code: issued.code, token: issued.token } });
    });
    await page.route("**/api/buildings/building-1/qr-codes/*/revoke", (route) => {
      const entry = record(route);
      const failure = this.consume(entry.path);
      if (failure) return problem(route, failure.status, failure.code, failure);
      const id = entry.path.split("/").at(-2);
      const old = this.codes.find((code) => code.id === id);
      if (!old) return problem(route, 404, "NOT_FOUND");
      if (old.status !== "Active") return problem(route, 409, "QR_ALREADY_REVOKED");
      old.status = "Revoked"; old.revokedAt = this.tick();
      return route.fulfill({ json: { ...old } });
    });
  }
}

type Landing = { visibility: "Public" | "Private"; granted: boolean; trainings: unknown[]; participationCode: string; verifyFailures: Array<{ status: number; code: string; retryAfter?: string }>; trainingsFailures: Array<{ status: number; code: string }>; resolveStatus?: number };
const training = (id: string, extra: Record<string, unknown> = {}) => ({ id, releaseId: `rel-${id}`, name: `Thoát hiểm ${id}`, description: `Mô tả bài ${id}`, status: "Active", startDate: null, endDate: null, allowedModes: ["Learn", "Guided"], createdAt: "2026-10-08T00:00:00Z", releaseStatus: "Published", scenarioVersionId: `ver-${id}`, reviewStatus: "Approved", ...extra });

/** Landing-side mock: resolve / trainings / verify, driven by the same world so rotate/revoke affect resolve. */
async function installLanding(page: Page, world: QrWorld, init: Partial<Landing> = {}, role: "Trainee" | "OrganizationUser" = "Trainee") {
  const state: Landing & { calls: Logged[] } = { visibility: "Public", granted: false, trainings: [], participationCode: "CODE-OK-1234", verifyFailures: [], trainingsFailures: [], calls: [], ...init };
  const has = () => role !== "Trainee" || state.visibility === "Public" || state.granted;
  const tokenFrom = (route: Route) => decodeURIComponent(new URL(route.request().url()).pathname.split("/")[3]);
  const record = (route: Route) => {
    const request = route.request();
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    state.calls.push({ method: request.method(), path: new URL(request.url()).pathname, headers: request.headers(), body });
  };

  await page.route("**/api/qr/*", (route) => {
    record(route);
    if (state.resolveStatus) return route.fulfill({ status: state.resolveStatus, json: { title: "x", code: state.resolveStatus === 401 ? "UNAUTHORIZED" : "ERR" } });
    if (!world.resolvable(tokenFrom(route))) return route.fulfill({ status: 404, json: { title: "QR code not found.", code: "QR_NOT_FOUND" } });
    return route.fulfill({ json: { buildingId: "building-1", buildingName: building.name, visibility: state.visibility, hasAccess: has() } });
  });
  await page.route("**/api/qr/*/trainings", (route) => {
    record(route);
    const failure = state.trainingsFailures.shift();
    if (failure) return route.fulfill({ status: failure.status, json: { title: "x", code: failure.code } });
    if (!world.resolvable(tokenFrom(route))) return route.fulfill({ status: 404, json: { title: "QR code not found.", code: "QR_NOT_FOUND" } });
    if (!has()) return route.fulfill({ status: 403, json: { title: "Building access required.", code: "BUILDING_ACCESS_REQUIRED" } });
    return route.fulfill({ json: state.trainings });
  });
  await page.route("**/api/buildings/building-1/participation/verify", (route) => {
    record(route);
    const failure = state.verifyFailures.shift();
    if (failure) return route.fulfill({ status: failure.status, headers: failure.retryAfter ? { "Retry-After": failure.retryAfter } : {}, json: { title: "x", code: failure.code } });
    const code = (route.request().postDataJSON() as { code: string }).code;
    if (code !== state.participationCode) return route.fulfill({ status: 400, json: { title: "Use the current participation code.", code: "PARTICIPATION_CODE_INVALID" } });
    state.granted = true;
    return route.fulfill({ json: { buildingId: "building-1", visibility: state.visibility, accessRevision: 4, hasParticipationCode: true } });
  });
  return state;
}

const dialog = (page: Page) => page.getByRole("dialog");
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function storageHolds(page: Page, needle: string) {
  return page.evaluate((value) => [localStorage, sessionStorage].some((store) => Object.keys(store).some((key) => key.includes(value) || (store.getItem(key) ?? "").includes(value))), needle);
}

test.describe("Building QR management tab", () => {
  test("create shows the QR once (link, copy, print); a reload keeps only the history, never the token", async ({ page, baseURL }) => {
    const world = new QrWorld();
    await signIn(page);
    await world.install(page);
    await page.goto("/workspace/buildings/building-1?tab=qr");

    await expect(page.getByRole("tab", { name: "QR", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Công trình chưa có mã QR đang hoạt động")).toBeVisible();
    await expect(page.getByTestId("qr-issued")).toHaveCount(0);

    await page.getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await expect(dialog(page).getByText(/chỉ hiển thị MỘT LẦN/)).toBeVisible();
    await dialog(page).getByLabel("Nhãn (không bắt buộc)").fill("Sảnh chính");
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).click();

    const token = tokenOf(1);
    const link = qrLandingUrl(baseURL!, token);
    await expect(page.getByTestId("qr-link")).toHaveText(link);
    await expect(page.getByTestId("qr-issued").getByText("Mã này chỉ hiển thị một lần")).toBeVisible();
    const code = page.getByTestId("qr-issued").getByTestId("qr-code");
    await expect(code).toBeVisible();
    await expect(code).toHaveAttribute("data-qr-value-length", String(link.length));

    // OpenAPI declares no Idempotency-Key/If-Match for create: none is sent, and the body is just the label.
    const create = world.log.find((entry) => entry.method === "POST" && entry.path.endsWith("/qr-codes"));
    expect(create?.body).toEqual({ label: "Sảnh chính" });
    expect(create?.headers["idempotency-key"]).toBeUndefined();
    expect(create?.headers["if-match"]).toBeUndefined();

    // The token is only in memory: not in storage, not in the page URL.
    expect(await storageHolds(page, token)).toBe(false);
    expect(page.url()).not.toContain(token);

    // Switching tabs keeps it (the tab stays mounted); it is just hidden.
    await page.getByRole("tab", { name: "Hành trình" }).click();
    await expect(page.getByTestId("qr-issued")).toBeHidden();
    await page.getByRole("tab", { name: "QR", exact: true }).click();
    await expect(page.getByTestId("qr-link")).toHaveText(link);

    // History shows the Active code and no token.
    const history = page.getByRole("table", { name: "Lịch sử mã QR của công trình" });
    await expect(history.getByRole("row")).toHaveCount(2);
    await expect(history.getByRole("row").nth(1)).toContainText("Đang hoạt động");
    await expect(history.getByRole("row").nth(1)).toContainText("Sảnh chính");

    // Reload: only the history is recovered from the server.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Mã QR công trình", exact: true })).toBeVisible();
    await expect(page.getByText("Đang hoạt động").first()).toBeVisible();
    await expect(page.getByTestId("qr-issued")).toHaveCount(0);
    await expect(page.getByTestId("qr-link")).toHaveCount(0);
    expect(await page.content()).not.toContain(token);
    await expect(page.getByRole("button", { name: "Tạo mã QR", exact: true })).toHaveCount(0); // one Active code: rotate instead
    await expect(page.getByRole("button", { name: "Tạo mã mới", exact: true })).toBeVisible();
    await expect(page.getByText(/không in lại được mã đang hoạt động/)).toBeVisible();
  });

  test("copy link writes the landing URL; hiding the code removes it from the page", async ({ page, context, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const world = new QrWorld();
    await signIn(page);
    await world.install(page);
    await page.goto("/workspace/buildings/building-1?tab=qr");
    await page.getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await page.getByRole("button", { name: "Sao chép liên kết" }).click();
    await expect(page.getByText("Đã sao chép liên kết QR")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(qrLandingUrl(baseURL!, tokenOf(1)));
    await page.getByRole("button", { name: "Ẩn mã" }).click();
    await expect(page.getByTestId("qr-issued")).toHaveCount(0);
    expect(await page.content()).not.toContain(tokenOf(1));
  });

  test("rotate confirms the impact, shows the new QR once and the old token stops resolving", async ({ page, baseURL }) => {
    const world = new QrWorld();
    const first = world.seed("Sảnh chính");
    await signIn(page);
    await world.install(page);
    await installLanding(page, world, { visibility: "Public", trainings: [training("a")] }, "OrganizationUser");
    await page.goto("/workspace/buildings/building-1?tab=qr");

    await page.getByRole("button", { name: "Tạo mã mới", exact: true }).click();
    await expect(dialog(page).getByRole("heading", { name: "Tạo lại mã QR?" })).toBeVisible();
    await expect(dialog(page)).toContainText("QR hiện tại ngừng hoạt động NGAY");
    await expect(dialog(page)).toContainText("Quyền tham gia đã cấp cho học viên thuộc công trình và mã tham gia vẫn giữ nguyên");
    await dialog(page).getByRole("button", { name: "Tạo mã mới", exact: true }).click();

    const second = tokenOf(2);
    await expect(page.getByTestId("qr-link")).toHaveText(qrLandingUrl(baseURL!, second));
    await expect(page.getByText(/QR cũ đã ngừng hoạt động: hãy thay mọi bản in cũ/)).toBeVisible();
    const rotate = world.log.find((entry) => entry.path.endsWith("/rotate"));
    expect(rotate?.path).toContain(`/qr-codes/${first.code.id}/rotate`);
    expect(rotate?.body).toEqual({ label: null }); // empty label keeps the old one
    expect(rotate?.headers["idempotency-key"]).toBeUndefined();

    const rows = page.getByRole("table", { name: "Lịch sử mã QR của công trình" }).getByRole("row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("Đang hoạt động");
    await expect(rows.nth(2)).toContainText("Đã thu hồi");
    await expect(rows.nth(2)).toContainText("Đã thay bằng mã mới");

    // The old QR is dead on the landing; the new one works.
    await page.goto(`/qr/${first.token}`);
    await expect(page.getByRole("heading", { name: "Không tìm thấy công trình" })).toBeVisible();
    await page.goto(`/qr/${second}`);
    await expect(page.getByRole("heading", { name: building.name, level: 1 })).toBeVisible();
  });

  test("revoke leaves the Building without an active code and the QR cannot be resolved", async ({ page }) => {
    const world = new QrWorld();
    const seeded = world.seed();
    await signIn(page);
    await world.install(page);
    await installLanding(page, world, { visibility: "Public" }, "OrganizationUser");
    await page.goto("/workspace/buildings/building-1?tab=qr");
    await page.getByRole("button", { name: "Thu hồi mã", exact: true }).click();
    await expect(dialog(page)).toContainText("khác với hết hạn dịch vụ");
    await expect(dialog(page)).toContainText("Quyền tham gia đã cấp cho học viên và mã tham gia vẫn giữ nguyên");
    await dialog(page).getByRole("button", { name: "Thu hồi mã", exact: true }).click();

    await expect(page.getByText("Công trình chưa có mã QR đang hoạt động")).toBeVisible();
    await expect(page.getByText("Mã trước đó đã bị thu hồi")).toBeVisible();
    await expect(page.getByTestId("qr-issued")).toHaveCount(0);
    expect(world.log.find((entry) => entry.path.endsWith("/revoke"))?.body).toBeNull();
    await page.getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await expect(page.getByTestId("qr-link")).toHaveText(new RegExp(tokenOf(2)));
    await page.goto(`/qr/${seeded.token}`);
    await expect(page.getByRole("heading", { name: "Không tìm thấy công trình" })).toBeVisible();
  });

  test("409 QR_ALREADY_EXISTS (someone else created it) points to rotate and reloads the list", async ({ page }) => {
    const world = new QrWorld();
    await signIn(page);
    await world.install(page);
    await page.goto("/workspace/buildings/building-1?tab=qr");
    await expect(page.getByText("Công trình chưa có mã QR đang hoạt động")).toBeVisible();
    world.seed("Tạo ở tab khác"); // created elsewhere after this tab loaded
    await page.getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await expect(page.getByText("Công trình đã có mã QR đang hoạt động")).toBeVisible();
    await expect(page.getByText(/hãy dùng “Tạo mã mới” để nhận QR mới/)).toBeVisible();
    await expect(page.getByTestId("qr-link")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tạo mã mới", exact: true })).toBeVisible();
  });

  test("409 QR_ALREADY_REVOKED on a stale rotate keeps the user informed and reloads", async ({ page }) => {
    const world = new QrWorld();
    const seeded = world.seed();
    await signIn(page);
    await world.install(page);
    await page.goto("/workspace/buildings/building-1?tab=qr");
    await expect(page.getByRole("button", { name: "Thu hồi mã", exact: true })).toBeVisible();
    seeded.code.status = "Revoked"; // revoked in another tab
    seeded.code.revokedAt = "2026-10-10T09:00:00Z";
    await page.getByRole("button", { name: "Tạo mã mới", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Tạo mã mới", exact: true }).click();
    await expect(page.getByText("Mã này đã bị thu hồi hoặc thay thế")).toBeVisible();
    await expect(page.getByText("Công trình chưa có mã QR đang hoạt động")).toBeVisible();
  });

  test("a double click sends one request", async ({ page }) => {
    const world = new QrWorld();
    await signIn(page);
    await world.install(page);
    await page.goto("/workspace/buildings/building-1?tab=qr");
    await page.getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).dblclick();
    await expect(page.getByTestId("qr-link")).toBeVisible();
    expect(world.log.filter((entry) => entry.method === "POST" && entry.path.endsWith("/qr-codes"))).toHaveLength(1);
    await expect(page.getByRole("table", { name: "Lịch sử mã QR của công trình" }).getByRole("row")).toHaveCount(2);
  });

  test("a lost response cannot recover the token: warns and reloads the list", async ({ page }) => {
    const world = new QrWorld();
    await signIn(page);
    await world.install(page);
    await page.goto("/workspace/buildings/building-1?tab=qr");
    // The create reaches the server but the response is lost.
    await page.route("**/api/buildings/building-1/qr-codes", async (route) => {
      if (route.request().method() === "POST") {
        world.seed("Đã tạo nhưng mất phản hồi");
        return route.abort("failed");
      }
      return route.fallback();
    });
    await page.getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await expect(page.getByText("Chưa nhận được phản hồi từ máy chủ")).toBeVisible();
    await expect(page.getByText("Đã tạo nhưng mất phản hồi").first()).toBeVisible();
    await expect(page.getByTestId("qr-link")).toHaveCount(0);
  });

  test("error and permission states: cross-tenant 404, 403, 401 and a retry after a server error", async ({ page }) => {
    const world = new QrWorld();
    await signIn(page);
    await world.install(page);
    world.failNext.push({ match: /qr-codes$/, status: 404, code: "NOT_FOUND" });
    await page.goto("/workspace/buildings/building-1?tab=qr");
    await expect(page.getByText("Không tìm thấy công trình", { exact: true })).toBeVisible();
    await expect(page.getByText(/không thuộc tổ chức của bạn/)).toBeVisible();

    world.failNext.push({ match: /qr-codes$/, status: 403, code: "FORBIDDEN" });
    await page.reload();
    await expect(page.getByText("Không tải được mã QR")).toBeVisible();
    await expect(page.getByText("Tài khoản này không có quyền quản lý mã QR.")).toBeVisible();

    world.failNext.push({ match: /qr-codes$/, status: 401, code: "UNAUTHORIZED" });
    await page.reload();
    await expect(page.getByText(/Phiên đăng nhập đã hết hạn/)).toBeVisible();

    world.failNext.push({ match: /qr-codes$/, status: 500, code: "SERVER" });
    await page.reload();
    await expect(page.getByText("Máy chủ gặp lỗi. Hãy thử lại sau.")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Công trình chưa có mã QR đang hoạt động")).toBeVisible();
  });

  test("a failed create keeps the dialog with a message; the 403 on create does not show a token", async ({ page }) => {
    const world = new QrWorld();
    await signIn(page);
    await world.install(page);
    await page.goto("/workspace/buildings/building-1?tab=qr");
    await expect(page.getByText("Công trình chưa có mã QR đang hoạt động")).toBeVisible();
    world.failNext.push({ match: /qr-codes$/, status: 403, code: "FORBIDDEN" });
    await page.getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    // The next call to the qr-codes endpoint is the POST (the list already loaded).
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await expect(dialog(page).getByText("Tài khoản này không có quyền quản lý mã QR.")).toBeVisible();
    await expect(page.getByTestId("qr-link")).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).click(); // retry succeeds
    await expect(page.getByTestId("qr-link")).toBeVisible();
  });

  test("print: only the A4 sheet with the Building name and QR is printed, on one page, without overflow", async ({ page }) => {
    const world = new QrWorld();
    await signIn(page);
    await world.install(page);
    await page.addInitScript(() => { (window as unknown as { __prints: number }).__prints = 0; window.print = () => { (window as unknown as { __prints: number }).__prints += 1; }; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/workspace/buildings/building-1?tab=qr");
    await page.getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await dialog(page).getByLabel("Nhãn (không bắt buộc)").fill("Cổng chính");
    await dialog(page).getByRole("button", { name: "Tạo mã QR", exact: true }).click();
    await expect(page.getByTestId("qr-link")).toBeVisible();

    const sheet = page.getByTestId("qr-print-sheet");
    await expect(sheet).toBeHidden(); // never visible on screen
    expect(await page.evaluate(() => document.documentElement.dataset.printQr)).toBeUndefined();

    await page.getByRole("button", { name: "In mã QR" }).click();
    expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
    await expect(page.locator("html")).toHaveAttribute("data-print-qr", "true");
    await page.emulateMedia({ media: "print" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("h1")).toHaveText(building.name);
    await expect(sheet).toContainText("Cổng chính");
    await expect(sheet).toContainText("Quét mã bằng ứng dụng FET3D");
    await expect(sheet).toContainText("chỉ xác định công trình, không cấp quyền");
    await expect(page.locator(".ops-shell")).toBeHidden();
    await expect(page.locator(".ops-sidebar")).toBeHidden();

    const qr = await sheet.getByTestId("qr-code").boundingBox();
    expect(qr).not.toBeNull();
    expect(qr!.width).toBeGreaterThan(300); // ~90mm
    expect(qr!.width).toBeLessThan(360);
    expect(qr!.x).toBeGreaterThanOrEqual(0);
    expect(await noHorizontalOverflow(page)).toBe(true);

    const pdf = await page.pdf({ format: "A4" });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length;
    expect(pages).toBe(1);

    // After printing the page is back to normal; a plain Ctrl+P elsewhere is never affected by the sheet.
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    expect(await page.evaluate(() => document.documentElement.dataset.printQr)).toBeUndefined();
    await expect(sheet).toBeHidden();
    await expect(page.locator(".ops-shell")).toBeVisible();
  });

  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      test(`layout ${width}px ${theme}: no horizontal overflow with the issued QR, history and the dialog`, async ({ page }) => {
        const world = new QrWorld();
        world.seed("Mã cũ có nhãn rất dài để thử kiểm tra việc cuộn ngang của bảng lịch sử ở màn hình điện thoại");
        await signIn(page);
        await useTheme(page, theme);
        await world.install(page);
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 760 });
        await page.goto("/workspace/buildings/building-1?tab=qr");
        await expect(page.locator(".ops-theme")).toHaveAttribute("data-theme", theme);
        await page.getByRole("button", { name: "Tạo mã mới", exact: true }).click();
        await expect(dialog(page)).toBeVisible();
        expect(await noHorizontalOverflow(page)).toBe(true);
        await dialog(page).getByRole("button", { name: "Tạo mã mới", exact: true }).click();
        await expect(page.getByTestId("qr-link")).toBeVisible();
        expect(await noHorizontalOverflow(page)).toBe(true);
        const box = await page.getByTestId("qr-issued").getByTestId("qr-code").boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        // The QR frame is white in both themes so it stays scannable.
        const frame = await page.locator(".qr-frame").evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(frame).toBe("rgb(255, 255, 255)");
        if (process.env.QR_SHOTS_DIR) await page.screenshot({ path: `${process.env.QR_SHOTS_DIR}/manage-${width}-${theme}.png`, fullPage: true });
      });
    }
  }
});

test.describe("Building QR landing", () => {
  const token = tokenOf(1);

  test("anonymous: shows the state, makes no API call, and sign-in returns to the exact /qr/<token> page", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await world.install(page);
    const landing = await installLanding(page, world, { visibility: "Public", trainings: [training("a")] });
    await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "access", refreshToken: "refresh", user: trainee } }));
    await page.goto(`/qr/${token}`);

    await expect(page.getByRole("heading", { name: "Đăng nhập để xem công trình" })).toBeVisible();
    await expect(page.getByText(/không cấp quyền/).first()).toBeVisible();
    expect(landing.calls).toHaveLength(0);
    const login = page.getByRole("link", { name: "Đăng nhập", exact: true });
    await expect(login).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/qr/${token}`)}`);
    await login.click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel("Email").fill(trainee.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/qr/${token}$`));
    await expect(page.getByRole("heading", { name: building.name, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thoát hiểm a" })).toBeVisible();
    expect(landing.calls.every((call) => call.headers.authorization === "Bearer access")).toBe(true);
  });

  test("public Building with access: lists the published trainings and offers no fake start or store link", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, trainee);
    await world.install(page);
    const landing = await installLanding(page, world, {
      visibility: "Public",
      trainings: [training("a", { startDate: "2026-10-01T00:00:00Z", endDate: "2026-12-31T00:00:00Z", allowedModes: ["Learn", "Guided", "Assessment"] }), training("b", { description: null, allowedModes: [] })],
    });
    await page.goto(`/qr/${token}`);

    await expect(page.getByRole("heading", { name: building.name, level: 1 })).toBeVisible();
    await expect(page.getByText("Công khai", { exact: true })).toBeVisible();
    await expect(page.getByText("Bạn đã có quyền tham gia")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thoát hiểm a" })).toBeVisible();
    await expect(page.getByText("Mô tả bài a")).toBeVisible();
    await expect(page.getByRole("list", { name: "Chế độ cho phép" }).first()).toContainText("Guided Drill");
    await expect(page.getByRole("list", { name: "Chế độ cho phép" }).first()).toContainText("Assessment");
    await expect(page.getByText(/Thời gian mở: .*–/)).toBeVisible();
    await expect(page.getByText("Chưa có mô tả.")).toBeVisible();
    await expect(page.getByText("Chưa có chế độ nào được cho phép.")).toBeVisible();

    // QR grants nothing and the web cannot start a session.
    await expect(page.getByRole("button", { name: /bắt đầu/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /bắt đầu/i })).toHaveCount(0);
    await expect(page.locator('a[href*="play.google"], a[href*="apps.apple"], a[href$=".apk"], a[href^="intent:"], a[href^="fet3d:"]')).toHaveCount(0);
    expect(landing.calls.filter((call) => call.method === "POST")).toHaveLength(0);

    // "Mở trên điện thoại": installation is a one-time step, the QR is scanned again inside the app; no promise of deep links.
    const guide = page.locator("section").filter({ has: page.getByRole("heading", { name: "Mở trên điện thoại" }) });
    await expect(guide).toContainText("Cài ứng dụng FET3D trên Android");
    await expect(guide).toContainText("chỉ cần cài một lần");
    await expect(guide).toContainText("quét lại mã QR của công trình bằng chức năng quét trong ứng dụng");
    await expect(guide).toContainText("không biết ứng dụng đã được cài hay chưa");
    await expect(guide.getByRole("link", { name: "trạng thái tải ứng dụng" })).toHaveAttribute("href", "/download");
    // Service expiry: BE exposes no flag on resolve/trainings, so the copy states the rule instead of guessing a state.
    await expect(page.getByText(/Hết hạn dịch vụ vẫn xem được trang này nhưng không bắt đầu được phiên mới/)).toBeVisible();
    expect(await storageHolds(page, token)).toBe(false);
  });

  test("Organization/Admin see the training and release status of every Training", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, owner);
    await world.install(page);
    await installLanding(page, world, { visibility: "Private", trainings: [training("a", { status: "Draft", releaseStatus: "Built" })] }, "OrganizationUser");
    await page.goto(`/qr/${token}`);
    await expect(page.getByText("Bạn xem với vai trò quản lý")).toBeVisible();
    await expect(page.getByText("Bài: Nháp")).toBeVisible();
    await expect(page.getByText("Bản phát hành: Chưa phát hành")).toBeVisible();
  });

  test("private Building without a grant: wrong code, then the right one; the access is re-read and the code is not kept", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, trainee);
    await world.install(page);
    const landing = await installLanding(page, world, { visibility: "Private", trainings: [training("a")], participationCode: "RightCode-9876" });
    await page.goto(`/qr/${token}`);

    await expect(page.getByText("Cần mã tham gia")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nhập mã tham gia" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thoát hiểm a" })).toHaveCount(0);
    expect(landing.calls.some((call) => call.path.endsWith("/trainings"))).toBe(false); // no list before access

    const input = page.getByLabel("Mã tham gia");
    await expect(page.getByRole("button", { name: "Xác minh mã" })).toBeDisabled(); // empty input
    await input.fill("short");
    await page.getByRole("button", { name: "Xác minh mã" }).click();
    await expect(page.getByText(/gồm 8–128 ký tự và không có khoảng trắng/)).toBeVisible();
    await input.fill("has space 1234");
    await page.getByRole("button", { name: "Xác minh mã" }).click();
    await expect(page.getByText(/không có khoảng trắng/)).toBeVisible();
    expect(landing.calls.some((call) => call.path.endsWith("/verify"))).toBe(false);

    await input.fill("WrongCode-0000");
    await page.getByRole("button", { name: "Xác minh mã" }).click();
    await expect(page.getByText("Mã tham gia không đúng hoặc tổ chức đã đổi mã")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thoát hiểm a" })).toHaveCount(0);

    const resolvesBefore = landing.calls.filter((call) => /\/api\/qr\/[^/]+$/.test(call.path)).length;
    await input.fill("RightCode-9876");
    await page.getByRole("button", { name: "Xác minh mã" }).click();
    await expect(page.getByText("Đã xác minh mã tham gia")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thoát hiểm a" })).toBeVisible();
    await expect(page.getByText("Bạn đã có quyền tham gia")).toBeVisible();
    await expect(page.getByLabel("Mã tham gia")).toHaveCount(0);
    expect(landing.calls.filter((call) => /\/api\/qr\/[^/]+$/.test(call.path)).length).toBe(resolvesBefore + 1); // read again after success

    expect(landing.calls.filter((call) => call.path.endsWith("/verify")).map((call) => call.body)).toEqual([{ code: "WrongCode-0000" }, { code: "RightCode-9876" }]);
    for (const secret of ["RightCode-9876", "WrongCode-0000", token]) {
      expect(await storageHolds(page, secret)).toBe(false);
      if (secret !== token) expect(page.url()).not.toContain(secret); // the QR token is the landing path itself; the participation code must never be in a URL
    }
    expect(await page.content()).not.toContain("RightCode-9876");
  });

  test("verify rate limit: Retry-After disables the button with a countdown, then allows a retry", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, trainee);
    await world.install(page);
    await installLanding(page, world, { visibility: "Private", trainings: [], participationCode: "RightCode-9876", verifyFailures: [{ status: 429, code: "RATE_LIMITED", retryAfter: "2" }] });
    await page.goto(`/qr/${token}`);
    await page.getByLabel("Mã tham gia").fill("RightCode-9876");
    await page.getByRole("button", { name: "Xác minh mã" }).click();
    await expect(page.getByText(/Bạn đã thử quá nhiều lần/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Chờ \d+s/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Xác minh mã" })).toBeEnabled({ timeout: 6000 });
    await page.getByRole("button", { name: "Xác minh mã" }).click();
    await expect(page.getByText("Đã xác minh mã tham gia")).toBeVisible();
    await expect(page.getByText("Chưa có bài tập huấn nào")).toBeVisible();
  });

  test("verify errors: session expired (401) asks to sign in again on the same page; server busy shows a message", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, trainee);
    await world.install(page);
    await installLanding(page, world, { visibility: "Private", verifyFailures: [{ status: 503, code: "BUSY", retryAfter: "1" }, { status: 401, code: "UNAUTHORIZED" }] });
    await page.goto(`/qr/${token}`);
    await page.getByLabel("Mã tham gia").fill("RightCode-9876");
    await page.getByRole("button", { name: "Xác minh mã" }).click();
    await expect(page.getByText(/Hệ thống đang bận/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Chờ \d+s/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Xác minh mã" })).toBeEnabled({ timeout: 8000 });
    await page.getByRole("button", { name: "Xác minh mã" }).click();
    await expect(page.getByRole("heading", { name: "Phiên đăng nhập đã hết hạn" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/qr/${token}`)}`);
  });

  test("revoked, wrong or malformed token: clear state, no list, nothing leaks into the message", async ({ page }) => {
    const world = new QrWorld();
    const seeded = world.seed();
    seeded.code.status = "Revoked";
    await signIn(page, trainee);
    await world.install(page);
    const landing = await installLanding(page, world, { visibility: "Public", trainings: [training("a")] });
    const logs: string[] = [];
    page.on("console", (message) => logs.push(message.text()));
    page.on("pageerror", (error) => logs.push(error.message));

    await page.goto(`/qr/${seeded.token}`);
    await expect(page.getByRole("heading", { name: "Không tìm thấy công trình" })).toBeVisible();
    await expect(page.getByText(/đã bị thu hồi hoặc đã được thay bằng mã mới/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thoát hiểm a" })).toHaveCount(0);
    expect(landing.calls.some((call) => call.path.endsWith("/trainings"))).toBe(false);
    expect(await page.locator("main").innerText()).not.toContain(seeded.token);

    await page.goto(`/qr/${tokenOf(99)}`);
    await expect(page.getByRole("heading", { name: "Không tìm thấy công trình" })).toBeVisible();

    const before = landing.calls.length;
    await page.goto("/qr/not-a-token");
    await expect(page.getByRole("heading", { name: "Liên kết QR không hợp lệ" })).toBeVisible();
    expect(landing.calls.length).toBe(before); // malformed: never reaches the API
    expect(logs.join("\n")).not.toContain(seeded.token);
    expect(isQrToken("not-a-token")).toBe(false);
  });

  test("session expired (401 on resolve) drops the stale session and returns to the same landing after sign-in", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, trainee);
    await world.install(page);
    await installLanding(page, world, { resolveStatus: 401 });
    await page.goto(`/qr/${token}`);
    await expect(page.getByRole("heading", { name: "Phiên đăng nhập đã hết hạn" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).toBeNull();
    await page.getByRole("link", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByLabel("Email")).toBeVisible(); // not bounced back: the session is gone
  });

  test("a Building without trainings shows the empty state with a reload", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, trainee);
    await world.install(page);
    const landing = await installLanding(page, world, { visibility: "Public", trainings: [] });
    await page.goto(`/qr/${token}`);
    await expect(page.getByRole("heading", { name: "Chưa có bài tập huấn nào" })).toBeVisible();
    await expect(page.getByText(/chưa phát hành bài cho công trình này/)).toBeVisible();
    landing.trainings = [training("late")];
    await page.getByRole("button", { name: "Tải lại danh sách" }).click();
    await expect(page.getByRole("heading", { name: "Thoát hiểm late" })).toBeVisible();
  });

  test("the list failing (500) offers a retry; losing access mid-way (403) offers a re-check", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, trainee);
    await world.install(page);
    const landing = await installLanding(page, world, { visibility: "Public", trainings: [training("a")], trainingsFailures: [{ status: 500, code: "SERVER" }, { status: 403, code: "BUILDING_ACCESS_REQUIRED" }] });
    await page.goto(`/qr/${token}`);
    await expect(page.getByText("Không tải được danh sách bài")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Chưa có quyền xem danh sách bài")).toBeVisible();
    // The Building turned Private meanwhile: re-checking reads the access again and asks for the code.
    landing.visibility = "Private";
    await page.getByRole("button", { name: "Kiểm tra lại quyền" }).click();
    await expect(page.getByRole("heading", { name: "Nhập mã tham gia" })).toBeVisible();
  });

  test("service-expired Building: the landing is still readable (BE returns the same resolve/list) and states the app-side rule", async ({ page }) => {
    const world = new QrWorld();
    world.seed();
    await signIn(page, trainee);
    await world.install(page);
    await installLanding(page, world, { visibility: "Public", trainings: [training("a")] });
    await page.goto(`/qr/${token}`);
    await expect(page.getByRole("heading", { name: building.name, level: 1 })).toBeVisible();
    await expect(page.getByText(/hạn dịch vụ của công trình và số suất người học/)).toBeVisible();
    await expect(page.getByRole("button", { name: /bắt đầu/i })).toHaveCount(0);
  });

  test("the landing is not indexed and does not send a Referer: robots meta, referrer meta and response headers", async ({ page }) => {
    const response = await page.goto(`/qr/${token}`);
    expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response!.headers()["x-robots-tag"]).toContain("noindex");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    await expect(page).toHaveTitle(/Công trình từ mã QR/);
    expect(await page.title()).not.toContain(token);
  });

  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      test(`landing layout ${width}px ${theme}: no horizontal overflow (private form, trainings, anonymous)`, async ({ page }) => {
        const world = new QrWorld();
        world.seed();
        await useTheme(page, theme);
        await world.install(page);
        await installLanding(page, world, { visibility: "Private", trainings: [training("a", { name: "Một tên bài tập huấn rất dài để thử việc xuống dòng trên màn hình điện thoại hẹp", description: "x".repeat(200) }), training("b")], participationCode: "RightCode-9876" });
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 760 });

        await page.goto(`/qr/${token}`);
        await expect(page.locator(".ops-theme")).toHaveAttribute("data-theme", theme);
        await expect(page.getByRole("heading", { name: "Đăng nhập để xem công trình" })).toBeVisible();
        expect(await noHorizontalOverflow(page)).toBe(true);

        await signIn(page, trainee);
        await page.reload();
        await expect(page.getByRole("heading", { name: "Nhập mã tham gia" })).toBeVisible();
        expect(await noHorizontalOverflow(page)).toBe(true);
        expect((await page.getByRole("button", { name: "Xác minh mã" }).boundingBox())!.height).toBeGreaterThanOrEqual(44); // touch target
        await page.getByLabel("Mã tham gia").fill("RightCode-9876");
        await page.getByRole("button", { name: "Xác minh mã" }).click();
        await expect(page.getByRole("heading", { name: /Một tên bài/ })).toBeVisible();
        expect(await noHorizontalOverflow(page)).toBe(true);
        const cards = await page.locator(".qrl-training").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
        for (const right of cards) expect(right).toBeLessThanOrEqual(width);
        if (process.env.QR_SHOTS_DIR) await page.screenshot({ path: `${process.env.QR_SHOTS_DIR}/landing-${width}-${theme}.png`, fullPage: true });
      });
    }
  }
});

test.describe("safeNext / postLoginRoute for the QR landing", () => {
  const good = tokenOf(1);

  test("allows exactly /qr/<token> for every role and nothing else under /qr", () => {
    expect(safeNext(`/qr/${good}`)).toBe(`/qr/${good}`);
    for (const role of [0, 1, 2] as const) expect(postLoginRoute({ role }, `/qr/${good}`)).toBe(`/qr/${good}`);
    expect(postLoginRoute({ role: 2 }, `/qr/${good}?utm=1#x`)).toBe(`/qr/${good}`); // query/hash are dropped
    for (const bad of ["/qr", "/qr/", `/qr/${good}/`, `/qr/${good}/extra`, "/qr/short", `/qr/${good}%2e`, `/qr/${good.slice(0, 30)}!!!!!!!!!!!!!`, `//evil.test/qr/${good}`, `https://evil.test/qr/${good}`, `/\\evil.test/qr/${good}`, `/qr/${"a".repeat(200)}`]) {
      expect(safeNext(bad), bad).toBe("/learning-hub");
    }
    expect(postLoginRoute({ role: 1 }, "/qr/short")).toBe("/workspace/buildings");
    expect(postLoginRoute({ role: 0 }, `https://evil.test/qr/${good}`)).toBe("/admin/overview");
    expect(postLoginRoute({ role: 2 }, null)).toBe("/learning-hub");
  });

  test("token format helpers", () => {
    expect(isQrToken(good)).toBe(true);
    expect(good).toHaveLength(43);
    for (const bad of ["", "short", `${good}!`, `${good} `, "a".repeat(129), null, undefined]) expect(isQrToken(bad as string | null | undefined), String(bad)).toBe(false);
    expect(qrLandingUrl("https://fet3d.example/", good)).toBe(`https://fet3d.example/qr/${good}`);
  });
});
