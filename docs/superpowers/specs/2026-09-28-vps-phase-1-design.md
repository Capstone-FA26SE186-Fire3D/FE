# VPS API integration — Phase 1 design

## Goal

Replace the Firebase-only email/password path with the Fire3D VPS session API
and make the OrganizationUser Building/IFC workspace use the deployed API.
The browser keeps only the short-lived session pair in `sessionStorage`; the
backend remains the authority for role, organization scope, upload permissions
and processing state.

## Scope

1. **Authentication**
   - Email/password login calls `POST /api/auth/login`.
   - Google stays optional and exchanges its Firebase ID token through
     `POST /api/auth/login-firebase` when Firebase is configured.
   - Registration uses the current contracts:
     `POST /api/auth/register/trainee` or
     `POST /api/auth/register/organization`.
   - Restore calls `/api/auth/me`, then `/api/auth/refresh` only for a 401.

2. **Building and IFC revision workspace**
   - An authenticated OrganizationUser can open a building detail route,
     view revisions, upload an IFC using the signed-upload sequence and ask
     the backend to process the revision.
   - The sequence is: request upload URL -> PUT raw object without a bearer
     token -> compute SHA-256 -> notify `upload-complete` -> request process.
     A failed PUT stops the flow before finalization.
   - Revision detail shows backend-owned status, latest issues/BIM facts,
     and a preview only when the backend returns an artifact URL.

3. **Annotation overlay**
   - Read and save revision annotations with the server ETag. A stale save is
     shown as a conflict; the client does not overwrite the newer overlay.

## Deliberate boundaries

- This phase does not implement scenario authoring, playtest, release/QR,
  trainee sessions, analytics, billing, or RAG. Their APIs/UI are separate
  phases.
- `/workspace/ifc` remains the local browser scanner for a chosen file. It is
  not represented as a certified server revision and cannot publish or mutate
  a Building.
- The deployed base URL comes from `NEXT_PUBLIC_API_BASE_URL`; it is not
  embedded in source code or a token. Production storage upload URLs are used
  only for the raw IFC PUT and never receive the Fire3D bearer token.

## UI states

- Loading, signed-out and trainee-denied states reuse the existing role gate.
- Upload state exposes the current step and offers a retry only from the
  beginning; no partial client success is inferred.
- Processing is refreshed from revision jobs/issues rather than guessed from
  a timer. `Busy`, `Conflict` and other backend problem responses are shown
  without treating them as a successful revision.
- Preview actions are unavailable until `downloadUrl`, hash and artifact
  provenance are returned by the backend.

## Verification

- Unit-level Playwright tests cover password endpoint selection, registration
  payload shape, signed-upload safety, and the no-finalize-on-PUT-failure
  invariant.
- Route tests mock VPS responses and confirm an OrganizationUser can create a
  Building, upload an IFC, inspect revision state and cannot use trainee-only
  paths.
- Run TypeScript, focused Playwright, then build. The repository's existing
  lint failures outside this phase are tracked separately unless fixed while
  touching the same code.
