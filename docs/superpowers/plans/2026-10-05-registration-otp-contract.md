# Registration OTP Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Fire3D web registration exactly match the current backend OTP proof contract and validation rules.

**Architecture:** `LoginForm` remains the client-side owner of registration state. It obtains a proof only immediately before role-specific registration, while `authApi` continues to own the HTTP endpoint shapes. The form maps field-level `ProblemDetails.errors` to labels without persisting credentials or proofs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Playwright, existing Fire3D API client.

## Global Constraints

- Branch from fetched `origin/develop`; do not edit `main` or backend code.
- Use only the existing API endpoints and backend-owned authorization.
- Keep passwords, OTPs, and registration proofs in component memory only.
- Preserve backend error message text; do not fabricate successful email delivery from HTTP 202.
- Do not implement legacy resend or Google onboarding without a backend contract.

---

### Task 1: Capture registration-contract regressions

**Files:**
- Modify: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `/api/auth/registration/request-otp`, `/api/auth/registration/verify-otp`, `/api/auth/register/trainee`, and `/api/auth/login` route intercepts.
- Produces: regression coverage for the supported registration lifecycle and contract validation.

- [x] **Step 1: Write failing tests**

Add tests that submit a six-character password, reject a 31-character trainee username in the browser, show an existing-email message/link after a 409 `EMAIL_EXISTS`, and assert that clicking the final registration action posts OTP verification, role registration, then login.

- [x] **Step 2: Run the focused test file to verify failure**

Run: `pnpm exec playwright test tests/e2e/auth.spec.ts`

Expected: the new tests fail because the form currently requires twelve password characters, accepts a 31-character username, and exposes the old two-button proof flow.

- [x] **Step 3: Keep existing contract request assertions**

Retain assertions that initial OTP requests contain only `{ email }`, OTP verification contains only `{ email, otp }`, and role-specific registration does not send `role` or `organizationId`.

- [x] **Step 4: Run the focused test file to record the red state**

Run: `pnpm exec playwright test tests/e2e/auth.spec.ts`

Expected: existing tests remain green while the newly added regressions demonstrate the mismatch.

### Task 2: Align registration state and browser validation

**Files:**
- Modify: `src/features/auth/components/login-form.tsx`
- Modify: `src/features/auth/auth-session.tsx`
- Modify: `src/features/auth/types.ts`
- Modify: `src/assets/styles/globals.css`

**Interfaces:**
- Consumes: `authApi.requestRegistrationOtp(email)`, `authApi.verifyRegistrationOtp(email, otp)`, `authApi.register(input)`, and `useAuthSession().login(email, password)`.
- Produces: role-specific `RegisterInput` without empty optional `fullName`; browser validation matching the public backend contract.

- [x] **Step 1: Implement minimal form constraint changes**

Use password `minLength={6}` only in registration mode, `maxLength={128}`, email `maxLength={254}`, trainee username `minLength={3}`, `maxLength={30}`, and `pattern="[a-z0-9._-]{3,30}"`; keep lowercasing before submit. Use organization phone `pattern="\\+?[0-9]{6,15}"`. Make full name optional and omit it from the request when blank.

- [x] **Step 2: Replace the stale legacy resend panel**

Remove the `EMAIL_NOT_VERIFIED` resend button from login. For `EMAIL_EXISTS` after OTP request or resend, retain the backend message and render a login-tab action alongside the email error.

- [x] **Step 3: Submit verification and registration as one final action**

After a six-digit OTP has been entered, the final registration button calls `verifyRegistrationOtp`, saves the returned proof only in local state for the active call, calls `register`, then calls `login`. Clear the proof and OTP on email changes and successful resend.

- [x] **Step 4: Preserve successful registration if login fails**

Set mode to login, keep the email, clear password/proof/OTP, and show a status message explaining that the account exists and the user should sign in if the post-create login call fails.

- [x] **Step 5: Run the focused auth tests to verify green**

Run: `pnpm exec playwright test tests/e2e/auth.spec.ts`

Expected: all auth tests pass, including the added registration lifecycle cases.

### Task 3: Verify the change without unrelated cleanup

**Files:**
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `src/features/auth/components/login-form.tsx`
- Modify: `src/features/auth/auth-session.tsx`
- Modify: `src/features/auth/types.ts`
- Modify: `src/assets/styles/globals.css`

**Interfaces:**
- Consumes: the completed form behavior from Task 2.
- Produces: evidence that the app compiles and does not accidentally include unrelated generated files.

- [x] **Step 1: Run static checks**

Run: `pnpm typecheck`

Expected: exit code 0.

- [x] **Step 2: Run scoped lint**

Run: `pnpm exec eslint src/features/auth/components/login-form.tsx src/features/auth/types.ts tests/e2e/auth.spec.ts`

Expected: exit code 0.

- [x] **Step 3: Run production build**

Run: `pnpm build`

Expected: production build succeeds. If Next.js changes `next-env.d.ts`, restore only that generated drift before reviewing the scoped diff.

- [x] **Step 4: Inspect the final diff**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors and only the three implementation files plus the two planning documents changed.
