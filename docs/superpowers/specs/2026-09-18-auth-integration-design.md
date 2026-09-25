# Auth integration design

## Goal

Replace the login-only demo boundary with an authentication feature that can run in either local mock mode or against Fire3D API v1. The existing Learn bookmarks and sample chat remain browser-only prototype data; this change does not claim to persist them to the backend.

## Configuration and security boundary

`NEXT_PUBLIC_AUTH_MODE` selects `mock` or `api`; absent or invalid values resolve to `mock` so a local checkout remains usable before a backend account is seeded. `NEXT_PUBLIC_API_BASE_URL` supplies the HTTPS API origin in API mode. No credentials, access tokens, or refresh tokens are committed.

In API mode the client holds the access and refresh tokens only in `sessionStorage`, restores the current identity through `GET /api/auth/me`, sends the access token as `Authorization: Bearer <token>`, and clears both tokens if logout, refresh, or identity validation fails. A refresh attempt is made once after an authenticated request receives `401`; it must not retry recursively.

## Auth API contract

The feature owns typed clients for the Swagger contract:

- `POST /api/auth/login` with email and password returns access token, refresh token, and user.
- `POST /api/auth/refresh` exchanges a refresh token for tokens with expiry metadata and a user.
- `POST /api/auth/logout` invalidates the authenticated session server-side.
- `GET /api/auth/me` returns the authenticated user.
- `POST /api/auth/forgot-password` accepts an email.
- `POST /api/auth/reset-password` accepts a reset token and new password.

The documented `UserRole` is an integer without a published value mapping, so UI stores it as a number and does not derive client-side authorization from it.

## User experience

The login screen has no prefilled password in API mode. It shows an explicit development-only mock-account hint only in mock mode, has pending/error states, and keeps the existing safe local `next` redirect behavior. In API mode, successful login resumes the interrupted Learn action exactly as the current prototype does.

Forgot-password and reset-password are available as focused forms/routes with success and error states. They call the documented APIs, without guessing email delivery or reset-token transport that the specification does not provide.

Logout clears the local Auth session immediately and attempts the server logout in API mode. Existing demo bookmark/chat state remains separate from credential state and is cleared only by the existing reset flow.

## Architecture

`features/auth` owns types, API functions, token/session helpers, and auth-specific UI. The shared `apiClient` gains an optional request header hook or equivalent narrow extension needed for authenticated requests; it remains token-agnostic. The app provider exposes one Auth context with `login`, `logout`, `requestPasswordReset`, `resetPassword`, and session state. Existing consumers migrate from `useDemoSession` only for authentication state; demo Learn data stays in its current store.

## Testing

Tests cover the selected mode, successful and failed mock login, API request shapes, Bearer attachment, one-time refresh/retry on `401`, clearing invalid sessions, and safe redirect behavior. Browser coverage verifies login loading/error states, logout, and the password-recovery forms without requiring a remote production account.

## Out of scope

- Registering users or creating the initial PlatformAdmin account.
- Seed data or direct database changes in the remote API.
- Role-based route authorization; server authorization remains authoritative.
- Persisting Learn bookmarks, chat, training, or organization data through the API.
