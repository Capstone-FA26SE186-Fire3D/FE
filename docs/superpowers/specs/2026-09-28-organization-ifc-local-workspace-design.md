# Organization IFC Local Workspace Design

## Goal

Provide a browser-only IFC workspace for an authenticated `OrganizationUser`
to inspect a selected IFC model, review its semantic inventory, and create
review-only evacuation-scenario ideas while backend revision APIs are still in
development.

## Scope

- Add `/workspace/ifc` as the local Organization workspace entry point.
- Reuse the existing `ifc-scan` browser parser, Three.js viewer, inventory, IFC
  `expressID` anchors, and scenario-review reducer from `/demo/ifc`.
- Require an authenticated account. A `Trainee` sees an access-denied state;
  an `OrganizationUser` or `PlatformAdmin` can use the workspace.
- Keep each selected IFC only in browser memory. Replacing the file or leaving
  the route disposes the renderer/parser resources; refreshing the page loses
  the scan.
- Present the scan as preparation for PCCC review and game-scenario drafting:
  model preview, inventory, missing-data warnings, and draft anchors for a
  room, stair, and candidate exit.

## Exclusions

- No upload, persistence, S3 URL, database, backend mutation, worker status,
  Unity package, publishing, game start, or safety certification.
- No client-selected organization or authorization decision. The current
  frontend role gates are UX only; the future backend remains authoritative.
- No change to the local-only behavior of `/demo/ifc`.

## Route and data flow

```text
/workspace/ifc
  -> AuthSessionProvider
  -> sign-in / access-denied / workspace state
  -> user selects .ifc
  -> web-ifc WASM parses locally
  -> Three.js preview + inventory + IfcSceneScan anchors
  -> review-only scenario suggestions
```

The App Router page only composes a feature-owned client component. That
component reads the existing session hook, renders the role guard, and mounts
the existing `IfcScanWorkspace` only after access is granted. It must not read
or expose credentials and must not call a backend endpoint.

## UI states

1. **Session loading:** status text while the session is resolved.
2. **Signed out:** short explanation and a sign-in link preserving
   `/workspace/ifc` as the return URL.
3. **No access:** Trainee-facing explanation that model preparation belongs to
   an organization workspace.
4. **Ready:** contextual header and the reusable local scanner/viewer.
5. **Scanning, invalid file, scan result:** existing scanner states; every
   suggestion remains `needs review`, never a compliance decision.

## Future backend seam

When the Building/revision API is available, this route becomes the local
preview step inside `/workspace/buildings/[buildingId]`. The selected file will
be uploaded only through the backend-issued signed-upload contract, and its
revision/processing state will come from the backend. The local parser/viewer
remains useful as a pre-upload review but does not claim that an upload or
revision exists.

## Verification

- Add a route test for signed-out and Trainee/OrganizationUser UI states using
  the existing deterministic session test pattern.
- Retain the existing local scanner tests.
- Run `pnpm typecheck`, `pnpm lint`, and focused Playwright route tests.
- Manually load a real IFC and verify 3D orbit, reset, selection, and visible
  warning states; a model file must not leave the browser.
