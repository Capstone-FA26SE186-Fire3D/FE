# Local IFC Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-local IFC viewer at `/demo/ifc` that renders real IFC geometry, inventories core building elements, and surfaces reviewable evacuation-scenario suggestions.

**Architecture:** A client-only workspace owns the selected file and UI state. A `web-ifc` adapter initializes the browser WebAssembly parser, emits a Three.js group with IFC express-ID metadata, and returns a pure `IfcSceneScan` manifest. A dedicated viewer owns WebGL resources and selection; a pure suggestion module keeps game-anchor decisions testable without browser or IFC runtime dependencies.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Three.js 0.176, `web-ifc@0.0.68`, Playwright, pnpm.

## Global Constraints

- The route is `/demo/ifc` and changes no existing landing or Organization production flow.
- A selected IFC remains only in browser memory; no API, S3, auth, database, or Unity package is added.
- Store source IFC element identity as `expressID`; never bind a scenario to a hard-coded coordinate alone.
- A scenario suggestion is a review aid, never a fire-safety conclusion or automatic publish action.
- Serve the exact `web-ifc.wasm` copied from the installed `web-ifc@0.0.68` package at `/ifc/web-ifc.wasm`.
- Dispose the IFC model, geometry, materials, controls, and renderer when replacing a file or leaving the route.
- Keep the existing dark Fire3D token system and use keyboard-accessible controls.
- Do not commit or push during this local test task.

---

### Task 1: Add the IFC parser dependency and browser WASM asset

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/copy-ifc-wasm.mjs`
- Create: `public/ifc/.gitkeep`

**Interfaces:**
- Produces: `pnpm ifc:wasm`, a deterministic script that places `web-ifc/web-ifc.wasm` at `public/ifc/web-ifc.wasm`.
- Consumes: package export `web-ifc/web-ifc.wasm` from the same locked dependency version used at runtime.

- [ ] **Step 1: Install the exact parser and add a deterministic copy script.**

```json
{
  "scripts": {
    "ifc:wasm": "node scripts/copy-ifc-wasm.mjs",
    "postinstall": "pnpm ifc:wasm"
  },
  "dependencies": {
    "web-ifc": "0.0.68"
  }
}
```

```js
import { cp, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const destination = new URL("../public/ifc/web-ifc.wasm", import.meta.url);
const source = new URL("../node_modules/web-ifc/web-ifc.wasm", import.meta.url);
await mkdir(fileURLToPath(new URL(".", destination)), { recursive: true });
await stat(fileURLToPath(source));
await cp(fileURLToPath(source), fileURLToPath(destination));
```

- [ ] **Step 2: Reinstall with the lockfile and verify the local WASM file exists.**

Run: `pnpm install --frozen-lockfile`; then `Test-Path public/ifc/web-ifc.wasm`

Expected: install completes and the command prints `True`.

### Task 2: Create pure scan inventory and scenario-suggestion logic

**Files:**
- Create: `src/features/ifc-scan/types.ts`
- Create: `src/features/ifc-scan/scan-suggestions.ts`
- Create: `tests/e2e/ifc-scan.spec.ts`

**Interfaces:**
- Produces: `IfcElementKind`, `IfcScanElement`, `IfcSceneScan`, `ScenarioSuggestion`, `classifyIfcType(typeName)`, and `buildScenarioSuggestion(elements)`.
- Consumes: an element list with `expressID`, `typeName`, `kind`, and optional `bounds`.
- Guarantees: `readyForReview` is true only when one candidate of each `room`, `stair`, and `exit` kind exists.

- [ ] **Step 1: Write failing pure tests for type classification and scenario readiness.**

```ts
test("requires a room, stair and exit before a scenario is ready", () => {
  expect(buildScenarioSuggestion([
    element(1, "room"), element(2, "stair"), element(3, "exit"),
  ])).toMatchObject({ readyForReview: true, missingAnchorKinds: [] });
  expect(buildScenarioSuggestion([element(1, "room"), element(2, "stair")]))
    .toMatchObject({ readyForReview: false, missingAnchorKinds: ["exit"] });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the module is absent.**

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts --grep "scenario"`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the smallest explicit IFC classification map and suggestion builder.**

```ts
const kindsByIfcType = {
  IFCBUILDINGSTOREY: "storey", IFCWALL: "wall", IFCWALLSTANDARDCASE: "wall",
  IFCDOOR: "exit", IFCSTAIR: "stair", IFCSTAIRFLIGHT: "stair", IFCSPACE: "room",
} as const;

export function buildScenarioSuggestion(elements: readonly IfcScanElement[]): ScenarioSuggestion {
  const required = ["room", "stair", "exit"] as const;
  const anchors = required.flatMap(kind => elements.find(element => element.kind === kind) ?? []);
  const missingAnchorKinds = required.filter(kind => !anchors.some(anchor => anchor.kind === kind));
  return { templateId: "evacuation-baseline", anchors, missingAnchorKinds, readyForReview: missingAnchorKinds.length === 0 };
}
```

- [ ] **Step 4: Run the focused test and verify it passes.**

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts --grep "scenario"`

Expected: PASS.

### Task 3: Build the client-only `web-ifc` to Three.js adapter

**Files:**
- Create: `src/features/ifc-scan/ifc-loader.ts`
- Create: `src/features/ifc-scan/dispose.ts`
- Modify: `tests/e2e/ifc-scan.spec.ts`

**Interfaces:**
- Produces: `loadIfcFile(file, onProgress): Promise<LoadedIfcModel>` and `disposeLoadedIfcModel(model)`.
- `LoadedIfcModel` contains `{ group: THREE.Group; scan: IfcSceneScan; dispose(): void }`.
- Consumes: only a browser `File`; it does not perform fetch/upload.

- [ ] **Step 1: Extend the unit test with a manifest-construction assertion that does not require WebGL.**

```ts
expect(buildSceneScan("school.ifc", "IFC4", [element(42, "exit")])).toMatchObject({
  fileName: "school.ifc", schema: "IFC4", elements: [{ expressID: 42, kind: "exit" }],
});
```

- [ ] **Step 2: Run the focused test and verify it fails because `buildSceneScan` is unavailable.**

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts --grep "manifest"`

Expected: FAIL with missing export.

- [ ] **Step 3: Implement adapter conversion and cleanup.**

```ts
const api = new IfcAPI();
api.SetWasmPath("/ifc/");
await api.Init();
const modelID = api.OpenModel(new Uint8Array(await file.arrayBuffer()), { COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true });
const flatMeshes = api.LoadAllGeometry(modelID);

for (const flatMesh of flatMeshes) {
  for (const placed of flatMesh.geometries) {
    const ifcGeometry = api.GetGeometry(modelID, placed.geometryExpressID);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(api.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize()), 3));
    geometry.setIndex(new THREE.BufferAttribute(api.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize()), 1));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materialFor(placed.color));
    mesh.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
    mesh.userData.expressID = flatMesh.expressID;
    group.add(mesh);
  }
}
```

The implementation obtains supported type IDs with `GetLineIDsWithType`, maps those IDs through `GetNameFromTypeCode`, computes each collected mesh bounds in model coordinates, and always calls `api.CloseModel(modelID)` after disposing geometry/materials.

- [ ] **Step 4: Run the focused test and verify pure scan behavior still passes.**

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts --grep "scenario|manifest"`

Expected: PASS.

### Task 4: Build the reusable Three.js viewer and scan workspace

**Files:**
- Create: `src/features/ifc-scan/components/ifc-viewer.tsx`
- Create: `src/features/ifc-scan/components/ifc-scan-workspace.tsx`
- Create: `src/features/ifc-scan/components/ifc-scan.module.css`
- Modify: `tests/e2e/ifc-scan.spec.ts`

**Interfaces:**
- `IfcViewer` consumes `model: LoadedIfcModel | null`, `selectedExpressID: number | null`, and `onReady`.
- `IfcScanWorkspace` owns upload, error, loading/progress, selection, and reset state.
- Viewer exposes `resetView()` through an imperative ref used by the workspace reset button.

- [ ] **Step 1: Add a failing route-level UI test.**

```ts
test("shows a local-only IFC workspace", async ({ page }) => {
  await page.goto("/demo/ifc");
  await expect(page.getByRole("heading", { name: "Quét mô hình IFC" })).toBeVisible();
  await expect(page.getByLabel("Chọn tệp IFC")).toHaveAttribute("accept", ".ifc");
  await expect(page.getByText("File chỉ được xử lý trong trình duyệt này.")).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify it fails because the route has not been added.**

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts --grep "local-only"`

Expected: FAIL with navigation or locator failure.

- [ ] **Step 3: Implement the viewer and workspace.**

The viewer creates `WebGLRenderer`, `PerspectiveCamera`, `OrbitControls`, `ResizeObserver`, ambient/directional lighting, and a grid. On a loaded group it fits camera/controls target to `THREE.Box3.setFromObject(group)`. Selection restores the previous material color, assigns ember highlight to meshes whose `userData.expressID` matches, and re-fits to the selected mesh. Cleanup cancels the animation frame, disconnects the observer, disposes controls/renderer, and clears the canvas.

The workspace validates extension and non-empty file, renders upload/loading/error/scan states, lists supported inventory counts, renders the baseline evacuation review with missing-anchor messages, and uses buttons for selectable inventory elements and reset view. CSS uses a two-column desktop layout that collapses to one column below 900px; the canvas has a nonzero bounded height and is labelled for screen readers.

- [ ] **Step 4: Run the route-level test and verify it passes.**

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts --grep "local-only"`

Expected: PASS.

### Task 5: Compose the demo route and run local verification

**Files:**
- Create: `src/app/demo/ifc/page.tsx`
- Create: `src/features/ifc-scan/components/ifc-demo-client.tsx`
- Modify: `tests/e2e/ifc-scan.spec.ts`

**Interfaces:**
- Produces: `/demo/ifc` using the existing `SiteHeader`, `SiteFooter`, and a lazy client-only IFC workspace.

- [ ] **Step 1: Add the final accessibility assertions.**

```ts
await expect(page.getByRole("button", { name: "Đặt lại góc nhìn" })).toBeDisabled();
await expect(page.getByTestId("ifc-wasm-status")).toHaveText("WebAssembly sẵn sàng");
```

- [ ] **Step 2: Run the test and verify it fails until the final route composition is present.**

Run: `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts --project=chromium`

Expected: FAIL with missing final controls before implementation.

- [ ] **Step 3: Add route metadata and a client-only lazy-import boundary.**

```tsx
// src/features/ifc-scan/components/ifc-demo-client.tsx
"use client";
import dynamic from "next/dynamic";
const IfcScanWorkspace = dynamic(() => import("@/features/ifc-scan/components/ifc-scan-workspace").then(module => module.IfcScanWorkspace), { ssr: false });
export function IfcDemoClient() { return <IfcScanWorkspace />; }

// src/app/demo/ifc/page.tsx
export const metadata = { title: "IFC scan demo" };
export default function IfcDemoPage() { return <main><IfcDemoClient /></main>; }
```

- [ ] **Step 4: Verify tooling and manual behavior.**

Run, independently: `pnpm typecheck`; `pnpm lint`; `pnpm build`; `pnpm exec playwright test tests/e2e/ifc-scan.spec.ts --project=chromium`.

Expected: all commands exit 0. Then run `pnpm dev`, open `/demo/ifc`, load a real IFC, orbit/zoom, select an element, reset view, replace it with another IFC, and select an invalid file to inspect the error state. Record only observed results; do not claim semantic/safety correctness from a single model.

- [ ] **Step 5: Review the diff without committing or pushing.**

Run: `git diff --check`; `git status --short --branch`.

Expected: no whitespace errors; local feature branch contains only the IFC-scan files, package lock changes, and generated tracked WASM asset.
