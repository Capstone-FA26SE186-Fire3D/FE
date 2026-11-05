import { expect, test, type Page } from "@playwright/test";

/*
 * /admin/runtime against a small stateful mock of `/api/admin/runtime-catalog` (GET, POST, PATCH). Mock evidence only:
 * it shows the screen sends the documented requests and says the documented answers in plain words.
 */

const admin = { id: "rt-admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
type Row = { id: string; runtimeVersion: string; protocolVersion: string; manifestSchemaVersion: string; capabilities: string[]; capabilityContracts: Record<string, unknown>; isActive: boolean; createdAt: string };
type Call = { method: string; path: string; body: unknown };

const contracts = {
  "alarm.call_point": { version: "1.0.0", objectKinds: ["Equipment"], events: [{ type: "AlarmRaised", payload: {} }], actions: [{ id: "press", event: "AlarmRaised" }] },
  "player.movement": { version: "1.0.0", objectKinds: ["Spawn"], events: [{ type: "Jumped", metric: "jumped", payload: {} }] },
};

async function setup(page: Page) {
  const rows: Row[] = [
    { id: "00000000-0000-4000-8000-000000000202", runtimeVersion: "2.0.2", protocolVersion: "1", manifestSchemaVersion: "1", capabilities: ["door.exit"], capabilityContracts: {}, isActive: true, createdAt: "2026-10-20T03:00:00Z" },
    { id: "00000000-0000-4000-8000-000000000220", runtimeVersion: "2.2.0", protocolVersion: "1", manifestSchemaVersion: "1", capabilities: ["alarm.call_point", "player.movement"], capabilityContracts: contracts, isActive: false, createdAt: "2026-11-04T03:00:00Z" },
  ];
  const calls: Call[] = [];
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "rt-access", refreshToken: "rt-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: admin, headers: { ETag: '"1"' } }));
  await page.route("**/api/admin/runtime-catalog**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    calls.push({ method: request.method(), path, body });
    if (request.method() === "GET") return route.fulfill({ json: [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    if (request.method() === "POST") {
      const input = body as Row;
      if (rows.some((row) => row.runtimeVersion === input.runtimeVersion)) return route.fulfill({ status: 409, json: { title: "This runtime version is already registered", status: 409, code: "RUNTIME_VERSION_EXISTS" } });
      const row = { ...input, id: "00000000-0000-4000-8000-000000000300", capabilityContracts: input.capabilityContracts ?? {}, createdAt: "2026-11-05T03:00:00Z" };
      rows.push(row);
      return route.fulfill({ status: 201, json: row });
    }
    const row = rows.find((item) => path.endsWith(item.id));
    if (!row) return route.fulfill({ status: 404, json: { code: "NOT_FOUND", status: 404 } });
    row.isActive = (body as { isActive: boolean }).isActive;
    return route.fulfill({ json: row });
  });
  return { rows, calls };
}

const payloadFile = (runtimeVersion: string) => ({ name: `runtime-${runtimeVersion}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ runtimeVersion, protocolVersion: "1", manifestSchemaVersion: "1", capabilities: ["door.exit", "fire.source"], capabilityContracts: {}, isActive: true })) });

test.describe("PlatformAdmin runtime catalog", () => {
  test("lists versions newest first, opens the read-only detail and is in the admin nav", async ({ page }) => {
    await setup(page);
    await page.goto("/admin/runtime");
    await expect(page.getByRole("heading", { level: 1, name: "Phiên bản runtime" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quản trị hệ thống" }).getByRole("link", { name: /Phiên bản runtime/ })).toBeVisible();
    const table = page.getByTestId("runtime-table");
    await expect(table.getByText("Phiên bản 2.2.0").first()).toBeVisible();
    const text = await table.innerText();
    expect(text.indexOf("Phiên bản 2.2.0")).toBeLessThan(text.indexOf("Phiên bản 2.0.2"));
    await table.getByText("Phiên bản 2.2.0").first().click();
    const detail = page.getByTestId("runtime-detail");
    await expect(detail).toContainText("Nút báo cháy");
    await expect(detail).toContainText("Di chuyển của người chơi");
    await expect(detail).toContainText("jumped");
    await expect(detail).toContainText("press");
    await expect(page).toHaveURL(/runtime=00000000-0000-4000-8000-000000000220/);
  });

  test("activating asks first, explains the effect and sends PATCH isActive", async ({ page }) => {
    const { calls } = await setup(page);
    await page.goto("/admin/runtime");
    await page.getByTestId("runtime-toggle-2.2.0").first().click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Bật phiên bản 2.2.0?" });
    await expect(dialog).toContainText("buổi huấn luyện mới");
    await dialog.getByRole("button", { name: "Bật phiên bản" }).click();
    await expect(dialog).toHaveCount(0);
    expect(calls.filter((call) => call.method === "PATCH")).toEqual([{ method: "PATCH", path: "/api/admin/runtime-catalog/00000000-0000-4000-8000-000000000220", body: { isActive: true } }]);
    await page.getByTestId("runtime-toggle-2.0.2").first().click();
    await expect(page.getByRole("dialog").filter({ hasText: "Tắt phiên bản 2.0.2?" })).toContainText("giữ nguyên");
  });

  test("registers from a dropped file with activation OFF by default, and says when the version already exists", async ({ page }) => {
    const { calls } = await setup(page);
    await page.goto("/admin/runtime");
    await page.getByTestId("runtime-register").click();
    const modal = page.getByTestId("runtime-register-modal");
    await modal.getByLabel("Chọn tệp phiên bản").setInputFiles(payloadFile("2.3.0"));
    await expect(modal.getByTestId("runtime-summary")).toContainText("2.3.0");
    await expect(modal.getByTestId("runtime-activate")).not.toBeChecked();
    await modal.getByTestId("runtime-register-submit").click();
    await expect(modal).toHaveCount(0);
    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({ runtimeVersion: "2.3.0", isActive: false, capabilities: ["door.exit", "fire.source"] });
    await expect(page.getByTestId("runtime-table").getByText("Phiên bản 2.3.0").first()).toBeVisible();

    await page.getByTestId("runtime-register").click();
    await page.getByTestId("runtime-register-modal").getByLabel("Chọn tệp phiên bản").setInputFiles(payloadFile("2.0.2"));
    await page.getByTestId("runtime-register-submit").click();
    await expect(page.getByTestId("runtime-register-modal")).toContainText("Phiên bản này đã đăng ký rồi");
  });
});
