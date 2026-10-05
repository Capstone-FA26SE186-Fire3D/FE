# Registration OTP Contract Alignment

## Goal

Align the web registration experience with the current Fire3D backend contract: an account is created only after a verified registration OTP proof is consumed.

## Scope

- Keep registration details only in component state.
- Require a valid form before requesting the initial OTP.
- Use `POST /api/auth/registration/request-otp`, then `POST /api/auth/registration/verify-otp`, then the role-specific register endpoint, followed by local login.
- Make browser validation match the backend's public registration rules: email maximum 254 characters, password 6--128 characters, trainee username `[a-z0-9._-]{3,30}`, and organization phone number `+?` followed by 6--15 digits.
- Preserve backend ProblemDetails text and render field-specific errors next to inputs when `errors` identifies a field.
- Treat `409 EMAIL_EXISTS` during OTP request/resend as an existing account and offer the login route.
- Clear a verified proof when its email changes or an OTP resend succeeds.
- If the role-specific registration succeeds but the follow-up login fails, preserve that fact in the UI and return the user to login rather than implying registration failed.

## Out of scope

- Implementing Google onboarding/account linking. The current backend does not expose a completion or link endpoint.
- Supporting legacy pending accounts from the old email-link registration design. Current `resend-verification` returns `409 EMAIL_EXISTS` for an existing email, so the web must not promise that it can send a usable registration OTP to such an account.
- Backend API, Mailgun delivery, rate-limit policy, or a persisted OTP countdown.

## UX and error handling

The registration form shows one inline alert for unscoped backend errors and individual input errors for `ProblemDetails.errors`. After OTP delivery, the user supplies six digits. The final action verifies that OTP, receives the short-lived registration proof in memory, creates the account, and signs in. Passwords, OTPs, and proofs are never written to URL, local storage, or session storage.

When the backend identifies an existing email, the email field explains that a Fire3D account already exists and exposes a link to the login tab. A legacy `EMAIL_NOT_VERIFIED` login response is displayed as the backend message only; the obsolete resend control is removed because it cannot complete the new OTP contract.

## Verification

Playwright regression coverage will prove the request shapes, six-character password acceptance, validation rules, existing-email route, resend proof clearing, and successful register-to-login sequence. TypeScript, scoped lint, build, and the focused auth suite provide final checks.
