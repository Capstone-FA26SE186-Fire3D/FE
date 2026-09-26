# Organization, Building, and IFC Workspace

## Goal

Provide an authenticated web workspace where a PlatformAdmin can manage organizations and organization accounts, and an OrganizationUser can create buildings, upload IFC revisions, and inspect processing readiness. The browser never receives S3 credentials.

## Roles and boundaries

- **PlatformAdmin** can create, list, and activate/deactivate organizations; create organization users using the existing account-admin screen; and access Building workspaces permitted by the API.
- **OrganizationUser** can create, update, archive, list, and open Buildings only in their organization, then initiate an IFC upload for those Buildings.
- **Trainee** has no workspace access.
- A self-registered account is not elevated by the UI. A PlatformAdmin creates Organizations and assigns OrganizationUsers through the existing accounts flow.

## Routes

- `/admin/organizations`: PlatformAdmin-only Organization list and create form. The UI supports only create/list/status changes because the current API has no Organization profile update endpoint.
- `/workspace/buildings`: authenticated Building list plus create form. The API remains responsible for tenant filtering.
- `/workspace/buildings/[buildingId]`: Building detail, update/archive actions, IFC revision list, and IFC upload controls.
- `/demo/ifc`: local inspection remains available as a browser-only preview; it does not persist a file.

## API contract used

All API calls use the existing authenticated `apiClient` with the current session access token.

1. Organization administration
   - `GET /api/organizations`
   - `POST /api/organizations`
   - `PATCH /api/organizations/{id}/status`
2. Building workspace
   - `GET /api/buildings`
   - `POST /api/buildings`
   - `GET|PUT|DELETE /api/buildings/{id}`
3. IFC revisions
   - `GET /api/buildings/{id}/revisions`
   - `POST /api/buildings/{id}/revisions/upload-url`
   - `PUT uploadUrl` with the raw IFC bytes; this request uses no bearer token or storage secret.
   - `POST /api/revisions/{revisionId}/upload-complete` with file metadata and SHA-256.
   - `GET /api/buildings/{id}/editor-preview?revisionId={revisionId}` when a geometry artifact becomes ready.

## Upload flow

1. The user selects a non-empty `.ifc` file and enters a revision label.
2. The page requests an upload URL from the authenticated backend.
3. The browser uploads the original bytes directly to the returned short-lived URL.
4. The browser calculates SHA-256 locally and tells the backend that the upload completed.
5. The page reloads the revision list and presents the backend-owned status. It never calls a processing worker directly or marks a revision ready itself.
6. A ready preview is opened only from the signed URL returned by the API.

## UI and error handling

- Loading, empty, unauthorized, forbidden, API failure, and retryable upload states are explicit.
- An upload failure does not leak the object key, signed URL, access token, S3 credential, or raw backend error payload into the UI.
- Archive is a confirmation-gated action. There is no destructive client-side deletion of a file.
- IFC upload requires an OrganizationUser or PlatformAdmin response from the API; role checks in the UI only improve navigation and do not replace backend authorization.

## Non-goals

- No S3 credential/environment-variable additions to the browser.
- No worker, S3 bucket, database-schema, Unity package, game-template, or PCCC-placement changes.
- No claim that an uploaded IFC has passed geometry validation or is safe for training; only backend revision/preview status communicates readiness.

## Verification

- Unit-style API helper tests cover request shape, SHA-256 calculation, missing-token/file validation, and direct-upload failure handling.
- Playwright verifies route access states, Organization creation form visibility, Building creation, and an intercepted upload workflow without external S3.
- Typecheck, lint, focused workspace tests, and the full existing E2E suite run after implementation.
