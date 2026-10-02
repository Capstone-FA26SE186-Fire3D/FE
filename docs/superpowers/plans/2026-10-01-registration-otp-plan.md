# Registration OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a verified email OTP before Fire3D web self-registration creates a Trainee or Organization account.

**Architecture:** Extend the auth API module with typed OTP and resend calls. Keep proof state in `LoginForm`, which controls the registration step and passes `registrationToken` to the existing session registration method. Inspect `ApiError` code only for the dedicated pending-account path.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Playwright, ASP.NET Core API.

## Global Constraints

- Keep credentials, OTPs, and registration tokens out of browser storage.
- Call only the configured backend base URL through `apiClient`.
- Use backend problem code `EMAIL_NOT_VERIFIED`, not message text, to select the pending-account UI.
- The resend button calls `/api/auth/resend-verification` and uses the agreed OTP label pending backend alignment.
- Do not modify the backend or push this branch.

---

### Task 1: Define the OTP auth contract

**Files:**
- Modify: `src/features/auth/types.ts`
- Modify: `src/features/auth/api.ts`
- Test: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Produces `RegistrationOtpVerification` with `registrationToken` and `expiresAt`.
- Produces `authApi.requestRegistrationOtp(email)`, `authApi.verifyRegistrationOtp(email, otp)`, and `authApi.resendVerification(email)`.
- Extends each `RegisterInput` branch with `registrationToken`.

- [ ] **Step 1: Write failing browser assertions**

Add routes for `/api/auth/registration/request-otp`, `/api/auth/registration/verify-otp`, and `/api/auth/register/trainee`; assert the final register payload has `registrationToken: "registration-proof"`.

- [ ] **Step 2: Run the targeted test and confirm failure**

Run: `pnpm exec playwright test tests/e2e/auth.spec.ts --grep "OTP"`

Expected: FAIL because the UI does not request or submit an OTP proof.

- [ ] **Step 3: Add minimal typed API methods**

```ts
requestRegistrationOtp(email: string) {
  return apiClient.request<void>("/api/auth/registration/request-otp", { json: { email } });
}
```

Add corresponding verify and resend methods, then include `registrationToken` in each endpoint payload.

- [ ] **Step 4: Re-run the targeted test**

Run: `pnpm exec playwright test tests/e2e/auth.spec.ts --grep "OTP"`

Expected: still fails until the form owns and supplies the proof.

### Task 2: Add registration OTP state and pending-account recovery UI

**Files:**
- Modify: `src/features/auth/components/login-form.tsx`
- Modify: `src/assets/styles/globals.css`
- Test: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes `authApi` OTP methods and `ApiError`.
- Produces a three-state registration UI: initial form, OTP verification, ready-to-create account.

- [ ] **Step 1: Add failing UI tests**

Test that clicking “Gửi mã OTP” sends `{ email }`, verifying six digits unlocks “Tạo tài khoản”, and an `EMAIL_NOT_VERIFIED` login response exposes “Gửi lại mã OTP”.

- [ ] **Step 2: Run the targeted tests and confirm failure**

Run: `pnpm exec playwright test tests/e2e/auth.spec.ts --grep "OTP|chưa xác minh"`

Expected: FAIL because these controls do not exist.

- [ ] **Step 3: Implement the smallest state machine**

Use in-memory `otp`, `registrationToken`, and pending resend state. Clear the token when the email changes; keep all form values intact. Catch `ApiError` in login and conditionally reveal the pending card by `payload.code`.

- [ ] **Step 4: Add focused styles**

Style the OTP panel and pending-account panel with the existing dark surface, ember border, responsive spacing, and visible keyboard focus.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm exec playwright test tests/e2e/auth.spec.ts`

Run: `pnpm typecheck`

Expected: auth suite and strict TypeScript pass.

### Task 3: Verify the integration boundary

**Files:**
- Test: `tests/e2e/auth.spec.ts`

- [ ] **Step 1: Test error and resend behavior**

Stub a 403 `application/problem+json` response with `code: "EMAIL_NOT_VERIFIED"`, click “Gửi lại mã OTP”, and assert a `POST /api/auth/resend-verification` payload containing the attempted email.

- [ ] **Step 2: Run final verification**

Run: `pnpm typecheck && pnpm build && pnpm exec playwright test tests/e2e/auth.spec.ts && git diff --check`

Expected: successful build, targeted UI evidence, and no whitespace errors. Record any pre-existing whole-repo lint issue separately.
