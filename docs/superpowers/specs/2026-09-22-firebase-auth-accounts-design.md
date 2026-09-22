# Firebase Auth and Accounts design

## Goal

Replace the Fire3D web's mock authentication with the live Firebase-to-Fire3D token exchange and provide a PlatformAdmin account-management screen backed by the deployed Swagger contract.

## Auth flow

The web uses Firebase Web Authentication for email/password sign-in. After Firebase issues an ID token, the client posts that token as a JSON string to `POST /api/auth/login-firebase`, without an `Authorization` header. The Fire3D API returns its own access and refresh token pair, which the web keeps only in `sessionStorage` and uses for `GET /api/auth/me`, `POST /api/auth/refresh`, and `POST /api/auth/logout`.

Registration posts `{ email, password, fullName }` anonymously to `POST /api/auth/register`, then signs in through Firebase and exchanges the Firebase ID token. Passwords must be at least 12 characters because the backend enforces that constraint. The web removes the mock mode, demo email/password, mock user, and authentication state from `DemoSessionProvider`.

The three absent APIs (`/api/auth/login`, `/api/auth/forgot-password`, and `/api/auth/reset-password`) are not called or displayed. Firebase supplies password reset outside this scope until the backend documents an equivalent Fire3D API.

## Firebase configuration

The client requires only the Firebase Web configuration from environment variables: API key, auth domain, project ID, app ID, and optionally messaging sender ID for future device registration. These values are public client identifiers, not Firebase Admin credentials. The backend must use the same Firebase project and its private Admin credentials remain server-only.

When Firebase variables are incomplete, login and registration show a clear setup error and do not send any request. The client has no mock fallback.

## Accounts UI

`/admin/accounts` is a protected client-rendered management page. It may render its UI only after `/api/auth/me` indicates `role === 0` (PlatformAdmin); backend authorization remains the authority and all requests handle 401/403 without exposing data.

The page supports the deployed Accounts contract: paginated list, search, active/inactive filter, role filter, organization filter, account detail, account creation, and active-state changes. It makes a read-only request to `GET /api/organizations` solely to populate the organization selector used for an OrganizationUser. No organization mutation UI is included.

Role values use the backend enum observed in source: PlatformAdmin 0, OrganizationUser 1, Trainee 2. A PlatformAdmin creation omits `organizationId`; an OrganizationUser requires an active organization; a Trainee omits it. The UI does not present a self-disable action.

## Scope and safety

- Remove mock authentication only; existing Learn and RAG prototype content is not changed.
- Never commit Firebase configuration, tokens, passwords, or Firebase Admin service credentials.
- Do not call undocumented email/password login or password-reset API paths.
- Display API errors as user-safe messages; do not log Firebase ID tokens or password values.

## Verification

Tests use Firebase/Auth API interception rather than a real Firebase project. They cover registration payloads, Firebase ID-token exchange without Bearer, token storage/restoration, refresh after one 401, route denial for non-admins, account API payloads, and no mock credentials in the login UI. Typecheck, lint, build, and the relevant Playwright suites run before push.
