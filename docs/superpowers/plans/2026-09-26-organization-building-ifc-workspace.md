# Organization, Building, and IFC Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated Organization administration, Building management, and a signed IFC revision upload workspace backed by the deployed Fire3D API.

**Architecture:** Reuse `AuthSessionProvider` as the sole source of the short-lived backend access token. Keep each backend resource in a feature-owned typed API module; browser UI calls the API only through `apiClient`, except the presigned object-store `PUT`, which is a narrowly scoped `fetch` with `application/octet-stream` and no authorization header. The UI presents backend-owned revision status and never treats a file as processed/ready itself.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, existing `apiClient`, Firebase-backed Fire3D session, Playwright, Web Crypto API.

## Global Constraints

- Do not add S3 credentials, a bearer token, object keys, or signed URLs to a public environment variable, session log, browser UI, or test fixture.
- `PlatformAdmin` is role `0`, `OrganizationUser` is role `1`, and `Trainee` is role `2`; backend authorization remains authoritative.
- Organization creation accepts a trimmed name up to 200 characters and a lowercase slug matching `^[a-z0-9]+(-[a-z0-9]+)*$` up to 100 characters.
- Building creation/update requires a trimmed name up to 200 characters and integer `totalFloors >= 1`.
- Signed IFC uploads use `PUT` with `Content-Type: application/octet-stream`, then finalize with lowercase SHA-256 hex, file size, filename, and MIME type.
- Do not change the local-only `/demo/ifc` persistence boundary or add worker, database, Unity, game-template, S3 bucket, or PCCC-rule functionality.
- Preserve existing uncommitted IFC scanner work; stage only files belonging to each completed task.

---

## File structure

- `src/features/organizations/types.ts`: Organization contracts matching the Fire3D API.
- `src/features/organizations/api.ts`: authenticated Organization list/create/status requests.
- `src/features/organizations/components/organizations-admin.tsx`: PlatformAdmin Organization management screen.
- `src/features/buildings/types.ts`: Building, revision, preview, and upload contracts.
- `src/features/buildings/api.ts`: authenticated Building/revision/preview requests.
- `src/features/buildings/ifc-upload.ts`: side-effect-limited file validation, SHA-256 calculation, and signed `PUT` helpers.
- `src/features/buildings/components/buildings-workspace.tsx`: Building list and creation UI.
- `src/features/buildings/components/building-workspace.tsx`: one Building's edit/archive/revision/upload UI.
- `src/app/admin/organizations/page.tsx`, `src/app/workspace/buildings/page.tsx`, `src/app/workspace/buildings/[buildingId]/page.tsx`: App Router compositions only.
- `src/configs/routes.ts`, `src/components/site-header.tsx` (or existing header owner): route declarations and role-appropriate workspace navigation.
- `src/assets/styles/globals.css`: focused responsive workspace styles beside the existing admin styles.
- `tests/e2e/workspace-api.spec.ts`: deterministic helper tests with no network or storage account.
- `tests/e2e/workspace-routes.spec.ts`: unauthenticated route guards and visible page composition tests.

## Task 1: Typed resource contracts and safe IFC upload helpers

**Files:**
- Create: `src/features/organizations/types.ts`
- Create: `src/features/organizations/api.ts`
- Create: `src/features/buildings/types.ts`
- Create: `src/features/buildings/api.ts`
- Create: `src/features/buildings/ifc-upload.ts`
- Create: `tests/e2e/workspace-api.spec.ts`

**Interfaces:**
- Consumes: `apiClient.request<T>()`, current access token from `useAuthSession`, and the deployed API contracts.
- Produces: `organizationsApi`, `buildingsApi`, `validateIfcFile(file)`, `sha256Hex(buffer)`, and `putIfcObject(uploadUrl, file, fetchImpl)` for components in Tasks 2–4.

- [ ] **Step 1: Write failing helper tests**

```ts
import { expect, test } from "@playwright/test";
import { putIfcObject, sha256Hex, validateIfcFile } from "../../src/features/buildings/ifc-upload";

test("accepts a non-empty IFC file and produces lowercase SHA-256 hex", async () => {
  const file = new File(["IFC"], "school.ifc", { type: "application/octet-stream" });
  expect(validateIfcFile(file)).toBeNull();
  await expect(sha256Hex(await file.arrayBuffer())).resolves.toMatch(/^[0-9a-f]{64}$/);
});

test("rejects a missing or non-IFC file before requesting an upload URL", () => {
  expect(validateIfcFile(null)).toMatch(/IFC/);
  expect(validateIfcFile(new File(["x"], "model.txt"))).toMatch(/IFC/);
});

test("sends only the octet-stream content type to a signed upload URL", async () => {
  const captured: RequestInit[] = [];
  await putIfcObject("https://storage.example/upload", new File(["IFC"], "school.ifc"), async (_url, init) => {
    captured.push(init!);
    return new Response(null, { status: 200 });
  });
  expect(captured[0].method).toBe("PUT");
  expect(new Headers(captured[0].headers).get("Content-Type")).toBe("application/octet-stream");
  expect(new Headers(captured[0].headers).get("Authorization")).toBeNull();
});

test("rejects a failed signed upload", async () => {
  await expect(putIfcObject("https://storage.example/upload", new File(["IFC"], "school.ifc"), async () => new Response(null, { status: 403 })))
    .rejects.toThrow("Không thể tải IFC lên kho lưu trữ.");
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the helper module is absent**

Run: `pnpm exec playwright test tests/e2e/workspace-api.spec.ts`

Expected: failure reporting that `ifc-upload` cannot be resolved.

- [ ] **Step 3: Implement minimal typed contracts and helpers**

```ts
export function validateIfcFile(file: File | null): string | null {
  if (!file || file.size === 0 || !file.name.toLowerCase().endsWith(".ifc")) return "Hãy chọn một tệp IFC (.ifc) không rỗng.";
  return null;
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function putIfcObject(uploadUrl: string, file: File, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file });
  if (!response.ok) throw new Error("Không thể tải IFC lên kho lưu trữ.");
}
```

Implement `organizationsApi` and `buildingsApi` as typed thin wrappers over `apiClient.request`, always passing `Authorization: Bearer ${accessToken}` for Fire3D API endpoints. Include `list`, `create`, `setStatus` for Organizations; `list`, `create`, `get`, `update`, `archive`, `listRevisions`, `initiateUpload`, `finalizeUpload`, and `getPreview` for Buildings.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm exec playwright test tests/e2e/workspace-api.spec.ts`

Expected: all four tests pass.

- [ ] **Step 5: Commit the contract/helper slice**

```bash
git add src/features/organizations src/features/buildings tests/e2e/workspace-api.spec.ts
git commit -m "feat: add organization building workspace API clients"
```

## Task 2: PlatformAdmin Organization administration screen

**Files:**
- Create: `src/features/organizations/components/organizations-admin.tsx`
- Create: `src/app/admin/organizations/page.tsx`
- Modify: `src/configs/routes.ts`
- Modify: `src/assets/styles/globals.css`
- Test: `tests/e2e/workspace-routes.spec.ts`

**Interfaces:**
- Consumes: `organizationsApi`, `Organization`, `useAuthSession()`, and `routes.adminOrganizations`.
- Produces: an authenticated `/admin/organizations` route that later account provisioning can use to select an Organization.

- [ ] **Step 1: Write failing route-guard tests**

```ts
import { expect, test } from "@playwright/test";

test("shows a sign-in guard for the organization administration route", async ({ page }) => {
  await page.goto("/admin/organizations");
  await expect(page.getByRole("heading", { name: "Quản lý tổ chức" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the route is absent**

Run: `pnpm exec playwright test tests/e2e/workspace-routes.spec.ts --grep "organization administration"

Expected: failure because `/admin/organizations` has no Organization administration heading.

- [ ] **Step 3: Implement the route and guarded component**

```tsx
if (!ready) return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
if (!isAuthenticated) return <Card className="admin-card"><h1>Quản lý tổ chức</h1><p>Hãy đăng nhập để truy cập khu vực quản trị.</p><Button asChild><Link href={`${routes.login}?next=${routes.adminOrganizations}`}>Đăng nhập</Link></Button></Card>;
if (user?.role !== 0) return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Chỉ PlatformAdmin có thể quản lý tổ chức.</p></Card>;
```

For a PlatformAdmin, load Organizations after the session is ready; render a create form for `name` and `slug`, a list of current Organizations, and an explicit enable/disable action. Disable submit while pending, show API messages through a generic Vietnamese message, and refresh the list after each successful mutation. Do not implement an unsupported Organization profile edit action.

- [ ] **Step 4: Run the focused route test and verify it passes**

Run: `pnpm exec playwright test tests/e2e/workspace-routes.spec.ts --grep "organization administration"

Expected: the unauthenticated guard is visible.

- [ ] **Step 5: Commit the Organization administration slice**

```bash
git add src/app/admin/organizations src/configs/routes.ts src/features/organizations src/assets/styles/globals.css tests/e2e/workspace-routes.spec.ts
git commit -m "feat: add organization administration workspace"
```

## Task 3: Building list and create workspace

**Files:**
- Create: `src/features/buildings/components/buildings-workspace.tsx`
- Create: `src/app/workspace/buildings/page.tsx`
- Modify: `src/configs/routes.ts`
- Modify: `src/assets/styles/globals.css`
- Modify: `tests/e2e/workspace-routes.spec.ts`
- Create: `src/features/buildings/workspace-links.ts`

**Interfaces:**
- Consumes: `buildingsApi.list(accessToken, filter)`, `buildingsApi.create(accessToken, input)`, `BuildingSummary`, and `routes.workspaceBuildings`.
- Produces: a route where permitted users can list their backend-filtered Buildings, create a Building, and navigate to its detail route.

- [ ] **Step 1: Add a failing visitor guard test**

```ts
test("shows a sign-in guard for the Building workspace", async ({ page }) => {
  await page.goto("/workspace/buildings");
  await expect(page.getByRole("heading", { name: "Công trình" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec playwright test tests/e2e/workspace-routes.spec.ts --grep "Building workspace"

Expected: failure because `/workspace/buildings` is not implemented.

- [ ] **Step 3: Implement the Building list/create screen**

```tsx
const payload = { name: name.trim(), buildingType: buildingType.trim() || null, totalFloors: Number(totalFloors), location: null, contact: null };
const created = await buildingsApi.create(accessToken, payload);
router.push(`/workspace/buildings/${created.id}`);
```

Guard Trainee users with a clear no-access card. For roles `0` and `1`, load the Building page with `page: 1`, `pageSize: 50`, and optional search; validate name and `Number.isInteger(Number(totalFloors)) && Number(totalFloors) >= 1` before the request. Render building name, type, floor count, active state, and a semantic link to `/workspace/buildings/{id}`. Do not allow the client to select an Organization; API tenant scope controls ownership.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `pnpm exec playwright test tests/e2e/workspace-routes.spec.ts --grep "Building workspace"

Expected: the visitor guard passes and no browser console errors are reported by Playwright.

- [ ] **Step 5: Commit the Building list/create slice**

```bash
git add src/app/workspace/buildings src/configs/routes.ts src/features/buildings src/assets/styles/globals.css tests/e2e/workspace-routes.spec.ts
git commit -m "feat: add building management workspace"
```

## Task 4: Building detail, revision list, and signed IFC upload

**Files:**
- Create: `src/features/buildings/components/building-workspace.tsx`
- Create: `src/app/workspace/buildings/[buildingId]/page.tsx`
- Modify: `src/assets/styles/globals.css`
- Modify: `tests/e2e/workspace-api.spec.ts`
- Modify: `tests/e2e/workspace-routes.spec.ts`

**Interfaces:**
- Consumes: Task 1 `validateIfcFile`, `sha256Hex`, `putIfcObject`, `buildingsApi` methods, access token, and a route `buildingId`.
- Produces: `uploadIfcRevision` for safe IFC revision creation and an API-owned revision status list for one Building.

- [ ] **Step 1: Add a failing signed-upload orchestration test**

```ts
import { uploadIfcRevision } from "../../src/features/buildings/ifc-upload";

test("stops before finalize when the signed object upload fails", async () => {
  const file = new File(["IFC"], "school.ifc", { type: "application/octet-stream" });
  let finalized = false;
  await expect(uploadIfcRevision({
    file,
    versionLabel: "v1",
    initiate: async () => ({ revisionId: "revision-1", uploadUrl: "https://storage.example/upload", objectKey: "private-key" }),
    finalize: async () => { finalized = true; },
    put: async () => { throw new Error("Không thể tải IFC lên kho lưu trữ."); },
  }))
    .rejects.toThrow("Không thể tải IFC lên kho lưu trữ.");
  expect(finalized).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails before the failure branch exists**

Run: `pnpm exec playwright test tests/e2e/workspace-api.spec.ts --grep "stops before finalize"

Expected: failure because `uploadIfcRevision` is not exported yet.

- [ ] **Step 3: Implement Building detail and upload orchestration**

```ts
type UploadIfcRevisionInput = {
  file: File;
  versionLabel: string;
  initiate: (request: { originalFilename: string; fileSizeBytes: number; versionLabel: string }) => Promise<{ revisionId: string; uploadUrl: string; objectKey: string }>;
  finalize: (revisionId: string, request: { objectKey: string; fileSizeBytes: number; mimeType: string; sha256Hash: string; originalFilename: string }) => Promise<void>;
  put: typeof putIfcObject;
};

export async function uploadIfcRevision(input: UploadIfcRevisionInput): Promise<void> {
  const initiated = await input.initiate({ originalFilename: input.file.name, fileSizeBytes: input.file.size, versionLabel: input.versionLabel });
  await input.put(initiated.uploadUrl, input.file);
  await input.finalize(initiated.revisionId, {
    objectKey: initiated.objectKey, fileSizeBytes: input.file.size, mimeType: "application/octet-stream",
    sha256Hash: await sha256Hex(await input.file.arrayBuffer()), originalFilename: input.file.name,
  });
}
```

Load the Building and revision list in parallel after validating `buildingId` is a UUID-shaped route parameter. Render the immutable revision version label, backend status, created time, and source filename when supplied. Refresh revisions after finalize. Implement edit with the full Building request shape, archive behind a `window.confirm` confirmation, and preview action only after `getPreview` returns `status === "Ready"` with a non-null signed `downloadUrl`; open that URL with `target="_blank"` and `rel="noreferrer"`. Never render or persist `objectKey`/`uploadUrl`.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `pnpm exec playwright test tests/e2e/workspace-api.spec.ts tests/e2e/workspace-routes.spec.ts`

Expected: helper tests pass; authenticated UI API calls are covered by manual verification with a real PlatformAdmin or OrganizationUser because local test credentials and S3 must not be committed.

- [ ] **Step 5: Commit the IFC upload slice**

```bash
git add src/app/workspace/buildings/[buildingId] src/features/buildings src/assets/styles/globals.css tests/e2e/workspace-api.spec.ts tests/e2e/workspace-routes.spec.ts
git commit -m "feat: add signed IFC revision upload workspace"
```

## Task 5: Navigation, responsive review, and final verification

**Files:**
- Modify: existing site header component that renders the account menu
- Modify: `src/configs/routes.ts`
- Modify: `src/assets/styles/globals.css`
- Modify: `tests/e2e/workspace-routes.spec.ts`

**Interfaces:**
- Consumes: role-aware routes from Tasks 2–4 and `useAuthSession().user`.
- Produces: an authenticated PlatformAdmin entry to Organization management and a permitted-user entry to Building workspace, without exposing management links to Trainees.

- [ ] **Step 1: Add a failing role-navigation helper test**

```ts
import { workspaceLinksForRole } from "../../src/features/buildings/workspace-links";

test("exposes only the permitted workspace links for each authenticated role", () => {
  expect(workspaceLinksForRole(0)).toEqual(["workspaceBuildings", "adminOrganizations"]);
  expect(workspaceLinksForRole(1)).toEqual(["workspaceBuildings"]);
  expect(workspaceLinksForRole(2)).toEqual([]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec playwright test tests/e2e/workspace-routes.spec.ts --grep "workspace management links"

Expected: failure because `workspace-links` is not implemented yet.

- [ ] **Step 3: Implement role-aware navigation and responsive layout**

Create `src/features/buildings/workspace-links.ts` with `workspaceLinksForRole(role: UserRole): Array<"workspaceBuildings" | "adminOrganizations">`. Add the Building workspace link only for roles `0` and `1`; add Organization administration only for role `0`. Keep both links out of the visitor header. Add responsive single-column behavior for workspace forms/tables at the existing 900px and 640px breakpoints, retaining labelled inputs, visible focus states, and status/error messages.

- [ ] **Step 4: Run all verification after this final code change**

Run: `pnpm typecheck`

Expected: exit code 0.

Run: `pnpm lint`

Expected: exit code 0.

Run: `pnpm exec playwright test tests/e2e/workspace-api.spec.ts tests/e2e/workspace-routes.spec.ts`

Expected: all new focused tests pass.

Run: `pnpm test:e2e`

Expected: existing suite and workspace tests pass.

Run: `pnpm build`

Expected: production build includes the three new workspace routes.

- [ ] **Step 5: Inspect the staged diff, then commit and push the navigation/verification slice**

```bash
git diff --check
git status --short
git add src/components src/configs/routes.ts src/assets/styles/globals.css tests/e2e/workspace-routes.spec.ts
git commit -m "feat: expose organization building workspace navigation"
git push origin feature/ifc-scan-local
```

## Plan self-review

- **Spec coverage:** Tasks 1–4 cover resource API boundaries, role gates, Organization management, Building CRUD, signed IFC upload, revision status, and optional preview. Task 5 covers navigation/responsiveness. The stated non-goals are excluded.
- **Placeholder scan:** No implementation placeholders remain; every task specifies files, inputs/outputs, tests, commands, and commit boundary.
- **Type consistency:** Organization and Building feature API modules always receive the access token; Task 4's uploader uses the `InitiateIfcUploadResponse` fields introduced in Task 1; all routes use the names declared in Task 2/3.
