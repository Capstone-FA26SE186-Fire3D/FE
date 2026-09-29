# Organization IFC Local Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing browser-only IFC scanner at `/workspace/ifc` for OrganizationUser work while the backend revision API is still being built.

**Architecture:** A small pure access resolver translates the restored `AuthSessionProvider` state into loading, sign-in, denied, or granted UI. A feature-owned client wrapper lazy-loads the existing local `IfcScanWorkspace` only for role `0` or `1`; the scanner remains in-memory and does not call an API. The App Router page only composes the workspace route and shared shell.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, existing Firebase-backed `AuthSessionProvider`, dynamic import, Three.js, `web-ifc`, Playwright.

## Global Constraints

- `PlatformAdmin` is role `0`, `OrganizationUser` is role `1`, and `Trainee` is role `2`; the future backend remains the authorization authority.
- No IFC file may leave the browser, be persisted, uploaded, or associated with a Building/revision in this milestone.
- Reuse `IfcScanWorkspace`, `IfcViewer`, `IfcSceneScan`, and its `expressID` anchors; do not alter `/demo/ifc` behavior.
- Every scenario result is a review-only draft and must not state PCCC compliance or publish a game scenario.
- Do not add a dependency, read `.env`, change session storage, or push.
- Preserve existing uncommitted IFC and Building-workspace changes; stage only files named in each task.

---

## File Structure

- `src/features/ifc-scan/organization-access.ts` — pure role-to-view-state decision for the local IFC workspace.
- `src/features/ifc-scan/components/organization-ifc-client.tsx` — authenticated UI wrapper and lazy client-only scanner loading.
- `src/features/ifc-scan/components/ifc-scan-workspace.tsx` — accepts presentation copy so the existing scanner can serve the local Organization workspace without changing demo behavior.
- `src/app/workspace/ifc/page.tsx` — App Router composition for the new local Organization route.
- `src/configs/routes.ts` — stable `workspaceIfc` route constant.
- `tests/e2e/organization-ifc-access.spec.ts` — deterministic pure resolver tests.
- `tests/e2e/workspace-routes.spec.ts` — browser route guards for signed-out, Trainee, and OrganizationUser states.

### Task 1: Define and test local IFC workspace access

**Files:**

- Create: `src/features/ifc-scan/organization-access.ts`
- Create: `tests/e2e/organization-ifc-access.spec.ts`

**Interfaces:**

- Consumes: `ready: boolean` and `user: Pick<AuthUser, "role"> | null`.
- Produces: `resolveOrganizationIfcAccess(input): "loading" | "sign-in" | "denied" | "granted"` for the Organization IFC client.

- [ ] **Step 1: Write the failing resolver tests**

```ts
import { expect, test } from "@playwright/test";
import { resolveOrganizationIfcAccess } from "../../src/features/ifc-scan/organization-access";

test("waits for session restoration before choosing an IFC workspace state", () => {
  expect(resolveOrganizationIfcAccess({ ready: false, user: null })).toBe("loading");
});

test("requires sign-in and denies Trainee access", () => {
  expect(resolveOrganizationIfcAccess({ ready: true, user: null })).toBe("sign-in");
  expect(resolveOrganizationIfcAccess({ ready: true, user: { role: 2 } })).toBe("denied");
});

test("permits OrganizationUser and PlatformAdmin to use the local workspace", () => {
  expect(resolveOrganizationIfcAccess({ ready: true, user: { role: 1 } })).toBe("granted");
  expect(resolveOrganizationIfcAccess({ ready: true, user: { role: 0 } })).toBe("granted");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec playwright test tests/e2e/organization-ifc-access.spec.ts`

Expected: FAIL because `organization-access` cannot be resolved.

- [ ] **Step 3: Implement the smallest role resolver**

```ts
import type { UserRole } from "@/features/auth/types";

type OrganizationIfcAccessInput = {
  ready: boolean;
  user: { role: UserRole } | null;
};

export function resolveOrganizationIfcAccess({ ready, user }: OrganizationIfcAccessInput) {
  if (!ready) return "loading" as const;
  if (!user) return "sign-in" as const;
  return user.role === 2 ? "denied" as const : "granted" as const;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm exec playwright test tests/e2e/organization-ifc-access.spec.ts`

Expected: PASS with three tests.

- [ ] **Step 5: Commit the isolated access rule**

```bash
git add src/features/ifc-scan/organization-access.ts tests/e2e/organization-ifc-access.spec.ts
git commit -m "feat: gate local IFC workspace by organization role"
```

### Task 2: Add the role-gated local IFC workspace route

**Files:**

- Create: `src/features/ifc-scan/components/organization-ifc-client.tsx`
- Create: `src/app/workspace/ifc/page.tsx`
- Modify: `src/features/ifc-scan/components/ifc-scan-workspace.tsx`
- Modify: `src/configs/routes.ts`
- Modify: `tests/e2e/workspace-routes.spec.ts`

**Interfaces:**

- Consumes: `useAuthSession()`, `resolveOrganizationIfcAccess()`, `routes.login`, `routes.workspaceIfc`, and the existing `IfcScanWorkspace`.
- Produces: a local-only `/workspace/ifc` page whose signed-out and Trainee states never mount the parser/viewer, and whose permitted state mounts the existing scanner with Organization-specific copy.

- [ ] **Step 1: Add failing browser route tests**

```ts
test("shows a sign-in guard for the local IFC workspace", async ({ page }) => {
  await page.goto("/workspace/ifc");
  await expect(page.getByRole("heading", { name: "Mô hình IFC" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});

test("does not grant a Trainee access to the local IFC workspace", async ({ page }) => {
  const token = "trainee-access-token";
  const trainee = { id: "trainee-1", email: "trainee@fire3d.test", fullName: "Trainee", role: 2, organizationId: null };
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: trainee }));
  await page.goto("/workspace/ifc");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  await expect(page.getByLabel("Chọn tệp IFC")).toHaveCount(0);
});

test("allows an OrganizationUser to open the browser-only IFC scanner", async ({ page }) => {
  const token = "organization-access-token";
  const user = { id: "organization-1", email: "owner@fire3d.test", fullName: "Organization User", role: 1, organizationId: "org-1" };
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  await page.goto("/workspace/ifc");
  await expect(page.getByRole("heading", { name: "Chuẩn bị mô hình IFC" })).toBeVisible();
  await expect(page.getByLabel("Chọn tệp IFC")).toHaveAttribute("accept", ".ifc");
  await expect(page.getByText("File chỉ được xử lý trong trình duyệt này.")).toBeVisible();
});
```

- [ ] **Step 2: Run the focused route tests and verify they fail**

Run: `pnpm exec playwright test tests/e2e/workspace-routes.spec.ts --grep "IFC workspace"`

Expected: FAIL because `/workspace/ifc` is not implemented.

- [ ] **Step 3: Implement the route constant, guard, and reusable scanner copy**

Add the route constant:

```ts
workspaceIfc: "/workspace/ifc",
```

Make `IfcScanWorkspace` accept optional presentation props while retaining its current demo text:

```ts
type IfcScanWorkspaceProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function IfcScanWorkspace({
  eyebrow = "IFC / local prototype",
  title = "Quét mô hình IFC",
  description = "Đọc mô hình thực ngay trên máy của bạn, nhận diện các điểm neo và kiểm tra mức sẵn sàng cho kịch bản thoát nạn mẫu.",
}: IfcScanWorkspaceProps) {
  // Preserve existing local file, viewer, inventory and suggestion behavior.
}
```

Create `OrganizationIfcClient`:

```tsx
"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { resolveOrganizationIfcAccess } from "../organization-access";

const IfcScanWorkspace = dynamic(() => import("./ifc-scan-workspace").then((module) => module.IfcScanWorkspace), { ssr: false, loading: () => <p role="status">Đang chuẩn bị bộ đọc IFC…</p> });

export function OrganizationIfcClient() {
  const { ready, user } = useAuthSession();
  const access = resolveOrganizationIfcAccess({ ready, user });
  if (access === "loading") return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
  if (access === "sign-in") return <Card className="admin-card"><h1>Mô hình IFC</h1><p>Hãy đăng nhập bằng tài khoản tổ chức để chuẩn bị mô hình IFC.</p><Button asChild><Link href={`${routes.login}?next=${routes.workspaceIfc}`}>Đăng nhập</Link></Button></Card>;
  if (access === "denied") return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Tài khoản học viên không có quyền chuẩn bị mô hình IFC.</p></Card>;
  return <IfcScanWorkspace eyebrow="Không gian tổ chức / IFC cục bộ" title="Chuẩn bị mô hình IFC" description="Quét mô hình ngay trong trình duyệt để rà soát cấu trúc, điểm neo và scenario nháp trước khi hệ thống backend lưu revision." />;
}
```

Create the App Router page:

```tsx
import type { Metadata } from "next";
import { OrganizationIfcClient } from "@/features/ifc-scan/components/organization-ifc-client";
import { SiteHeader } from "@/layouts/site-header";

export const metadata: Metadata = { title: "Mô hình IFC" };

export default function WorkspaceIfcPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><OrganizationIfcClient /></main></div>;
}
```

Do not add navigation, upload, persistence, or role-assignment code.

- [ ] **Step 4: Run focused regression checks**

Run: `pnpm exec playwright test tests/e2e/organization-ifc-access.spec.ts tests/e2e/workspace-routes.spec.ts --grep "IFC workspace|OrganizationUser|Trainee|session restoration|requires sign-in|permits"`

Expected: PASS; signed-out and Trainee states have no file input, while the OrganizationUser state shows the local-only scanner.

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts`

Expected: PASS; `/demo/ifc` retains its default heading and behavior.

- [ ] **Step 5: Commit only the local workspace slice**

```bash
git add src/configs/routes.ts src/app/workspace/ifc/page.tsx src/features/ifc-scan/organization-access.ts src/features/ifc-scan/components/organization-ifc-client.tsx src/features/ifc-scan/components/ifc-scan-workspace.tsx tests/e2e/organization-ifc-access.spec.ts tests/e2e/workspace-routes.spec.ts
git commit -m "feat: add local organization IFC workspace"
```

### Task 3: Verify the browser-only boundary

**Files:**

- Modify: `tests/e2e/workspace-routes.spec.ts`

**Interfaces:**

- Consumes: the route from Task 2 and Playwright request interception.
- Produces: a regression test proving that mounting the Organization page or selecting an invalid file does not initiate a Building/revision request.

- [ ] **Step 1: Add the failing no-upload request test**

```ts
test("keeps an OrganizationUser IFC file local before backend revisions exist", async ({ page }) => {
  const token = "organization-access-token";
  const user = { id: "organization-1", email: "owner@fire3d.test", fullName: "Organization User", role: 1, organizationId: "org-1" };
  const apiRequests: string[] = [];
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
  page.on("request", (request) => {
    if (request.url().includes("/api/buildings") || request.url().includes("/revisions")) apiRequests.push(request.url());
  });

  await page.goto("/workspace/ifc");
  await page.getByLabel("Chọn tệp IFC").setInputFiles({ name: "not-a-model.txt", mimeType: "text/plain", buffer: Buffer.from("not an IFC model") });
  await expect(page.getByText("Hãy chọn một tệp IFC (.ifc) không rỗng.")).toBeVisible();
  expect(apiRequests).toEqual([]);
});
```

- [ ] **Step 2: Run it against the route from Task 2**

Run: `pnpm exec playwright test tests/e2e/workspace-routes.spec.ts --grep "keeps an OrganizationUser IFC file local"`

Expected: PASS; the only expected API request is session restoration at
`GET /api/auth/me`, which this test fulfills.

- [ ] **Step 3: Keep implementation unchanged unless the test reveals a request**

The design requires no extra network code. If the test observes a Building or
revision request, remove the code that creates it; authentication's single
`GET /api/auth/me` is expected and is not an IFC upload.

- [ ] **Step 4: Run the full relevant quality gate**

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS.

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts tests/e2e/organization-ifc-access.spec.ts tests/e2e/workspace-routes.spec.ts`

Expected: PASS with no console errors in the tested routes.

- [ ] **Step 5: Inspect the local UI manually and commit the boundary regression**

Run: `pnpm dev`

Manually open `http://localhost:5173/workspace/ifc` with an OrganizationUser,
select a real IFC, orbit/zoom/reset/select inventory items, then refresh and
confirm no model remains. Check the browser network panel: besides session
restoration, there must be no Building/revision/upload request.

Run:

```bash
git diff --check
git status --short
git add tests/e2e/workspace-routes.spec.ts
git commit -m "test: keep local organization IFC scan offline"
```

Expected: only the intended test is staged in this task; do not push.

## Plan Self-Review

- **Spec coverage:** Task 1 defines role handling; Task 2 exposes the local
  Organization route and reuses the scanner; Task 3 proves no IFC upload or
  revision request occurs. The page stays local, review-only, and leaves
  `/demo/ifc` unchanged.
- **Completeness check:** every code and test step names its concrete file,
  interface, command, and expected outcome.
- **Type consistency:** the resolver receives the `ready` and `user` fields
  from `useAuthSession`; roles `0 | 1` are allowed and `2` is denied; both
  wrappers render the exported `IfcScanWorkspace` component.
