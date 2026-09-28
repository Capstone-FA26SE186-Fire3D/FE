# Local IFC scan design

## Goal

Provide a local-only Fire3D web prototype that accepts an IFC file chosen from the user's device, renders its real geometry in Three.js, extracts a minimal semantic inventory, and creates reviewable fire-training scenario suggestions. The prototype is reachable at `/demo/ifc` and does not upload, persist, or publish the file.

## Scope

- Parse the selected `.ifc` file in the browser with `web-ifc` WebAssembly.
- Rebuild every loaded placed geometry as a Three.js mesh, preserving its IFC express ID and applying its placement transform.
- Display an orbitable, fit-to-model WebGL view with loading, error, empty, reset-view, and dispose behavior.
- Count IFC storeys, walls, doors, stairs, spaces, and building elements from the IFC API.
- Create only transparent heuristic suggestions: a model needs a candidate exit, a candidate stair, and a candidate room/space before the sample evacuation scenario is ready. Missing requirements are shown as review items, not claimed as a safety judgement.
- Let the user select an inventory/suggestion item and focus/highlight the associated IFC element where a matching geometry exists.
- Keep an in-memory `IfcSceneScan` manifest with IFC express IDs, type, bounds, and candidate scenario anchors. It is preview data only and is not a Unity package or a production API contract.

## Explicit exclusions

- No backend, S3, database, authentication, file upload, or signed URL work.
- No IFC data survives page refresh and no user file leaves the browser.
- No automatic safety certification, pathfinding, collision mesh generation, Unity export, or game runtime is included.
- No changes to the landing scene, public Organization page, or production scenario workflow.

## Architecture

The route is server-composed but lazy-loads a client-only IFC workspace because the parser, WebAssembly, and WebGL require a browser. A focused parser module owns `IfcAPI` initialization, conversion of placed geometry into `THREE.BufferGeometry`, semantic inventory extraction, and cleanup. A viewer module owns renderer, camera, orbit controls, selection, fit, and disposal. A workspace component coordinates file state and presents the inventory and scenario-review panel.

The app bundles `web-ifc` and serves its pinned `web-ifc.wasm` from `public/ifc/`; the parser calls `SetWasmPath('/ifc/')` before `Init()`. The implementation uses the maintained `IfcAPI` primitives `OpenModel`, `LoadAllGeometry`, `GetGeometry`, `GetVertexArray`, `GetIndexArray`, and `GetLineIDsWithType` directly, avoiding an additional viewer framework with an incompatible Three.js abstraction.

## Scan-to-scenario contract

`IfcSceneScan` contains the original file name, IFC schema, an inventory by supported IFC type, and a list of element anchors. Each anchor uses the source `expressID`; it is never a hard-coded world coordinate. The sample evacuation template asks for anchors of kinds `room`, `stair`, and `exit` (door). It reports a human-review warning for every missing kind and becomes `readyForReview` only when all are present.

Production will upload the original IFC and derived artifacts to private S3, retain the building/revision/scenario metadata in the backend database, and create a versioned Unity package in a worker. This local browser manifest deliberately mirrors only the semantic-anchor portion of that eventual boundary.

## Error and performance rules

- Reject non-IFC files before allocating a parser.
- Surface parser errors as a user-safe message and release any partially opened model.
- Release object URLs, renderer resources, controls, model geometry/materials, and the IFC model when replacing a file or unmounting.
- Construct shared materials by source color where possible, disable unnecessary shadows, and show progress while geometry batches are created.
- The viewer is a local review aid. Large production IFC files still require a server worker/optimized derivative and are outside this milestone.

## Verification

- Unit-test the scan suggestion reducer with complete, missing-exit, and missing-stair inventories.
- Unit-test IFC type classification and manifest construction without WebGL.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- Manually load an IFC in local development, orbit/zoom, reset the camera, select an inventory item, replace the file, and confirm that errors are readable for an invalid file.
