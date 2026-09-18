# Auth Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-safe Auth layer that supports a local mock account now and Fire3D API v1 when a seeded account becomes available.

**Architecture:** Keep existing sample Learn data in `DemoSessionProvider`, but move authentication state and actions into an `AuthSessionProvider` owned by `features/auth`. The provider selects a `mock` adapter or the typed Fire3D auth client, persists only API tokens in `sessionStorage`, and exposes a single auth surface to existing UI.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Fetch API, Playwright.

## Global Constraints

- `NEXT_PUBLIC_AUTH_MODE` accepts only `mock` or `api`; invalid/missing values use `mock`.
- `NEXT_PUBLIC_API_BASE_URL` must be HTTPS when `authMode` is `api`; no credentials or tokens are committed.
- Access and refresh tokens use browser `sessionStorage`; no localStorage or cookies are introduced.
- API paths, bodies, and token headers exactly follow the supplied Fire3D Swagger v1 contract.
- Server authorization is authoritative; frontend does not map numeric `UserRole` values to permissions.
- The existing bookmark/chat prototype data remains browser-only and does not call new backend endpoints.

---

### Task 1: Define Auth configuration, contracts, and secure token storage

**Files:**
- Modify: `src/configs/env.ts`
- Modify: `.env.example`
- Create: `src/features/auth/types.ts`
- Create: `src/features/auth/token-storage.ts`
- Test: `tests/e2e/session.spec.ts`

**Interfaces:**
- Produces `env.authMode: "api" | "mock"` and `AuthUser`, `LoginInput`, `TokenSet` types.
- Produces `readTokenSet(): TokenSet | null`, `writeTokenSet(tokens: TokenSet): boolean`, and `clearTokenSet(): boolean`.

- [ ] **Step 1: Write failing browser assertions for default mock mode and token isolation.**

```ts
await page.goto("/login");
await expect(page.getByText("Tài khoản trải nghiệm")).toBeVisible();
expect(await page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).toBeNull();
```

- [ ] **Step 2: Run the focused test and verify that the new token-storage assertion fails.**

Run: `pnpm test:e2e -- --grep "token isolation"`

Expected: FAIL because the test has not been added and the `fire3d-auth-tokens` key is not defined.

- [ ] **Step 3: Implement the smallest configuration and storage contract.**

```ts
export type AuthMode = "api" | "mock";
const configuredMode = process.env.NEXT_PUBLIC_AUTH_MODE;
export const authMode: AuthMode = configuredMode === "api" ? "api" : "mock";

export type TokenSet = { accessToken: string; refreshToken: string };
const tokenKey = "fire3d-auth-tokens";
```

- [ ] **Step 4: Run the focused test, then typecheck.**

Run: `pnpm test:e2e -- --grep "token isolation"`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the completed slice.**

```bash
git add src/configs/env.ts .env.example src/features/auth/types.ts src/features/auth/token-storage.ts tests/e2e/session.spec.ts
git commit -m "feat: add auth configuration and token storage"
```

### Task 2: Implement the typed Fire3D Auth API client

**Files:**
- Create: `src/features/auth/api.ts`
- Modify: `src/api/client.ts`
- Test: `tests/e2e/auth-api.spec.ts`

**Interfaces:**
- Consumes `apiClient.request<T>()`, `AuthUser`, `LoginInput`, and `TokenSet`.
- Produces `authApi.login(input)`, `authApi.refresh(refreshToken)`, `authApi.logout(accessToken)`, `authApi.me(accessToken)`, `authApi.forgotPassword(email)`, and `authApi.resetPassword(token, newPassword)`.

- [ ] **Step 1: Write failing API-mode browser tests with intercepted requests.**

```ts
await page.route("**/api/auth/login", route => {
  expect(route.request().method()).toBe("POST");
  expect(route.request().postDataJSON()).toEqual({ email: "admin@example.test", password: "secret" });
  return route.fulfill({ json: loginPayload });
});
```

- [ ] **Step 2: Run the focused API test with `NEXT_PUBLIC_AUTH_MODE=api` and verify it fails.**

Run: `NEXT_PUBLIC_AUTH_MODE=api pnpm test:e2e -- --grep "API login contract"`

Expected: FAIL because the form still uses the demo login implementation.

- [ ] **Step 3: Add exact Swagger DTOs and API calls.**

```ts
login: (input: LoginInput) => apiClient.request<LoginResponse>("/api/auth/login", { json: input }),
me: (accessToken: string) => apiClient.request<AuthUser>("/api/auth/me", {
  headers: { Authorization: `Bearer ${accessToken}` },
}),
resetPassword: (token: string, newPassword: string) =>
  apiClient.request<void>("/api/auth/reset-password", { json: { token, newPassword } }),
```

The shared client must preserve supplied `Authorization` headers and return `ApiError` for non-2xx responses.

- [ ] **Step 4: Re-run the focused API contract tests and typecheck.**

Run: `NEXT_PUBLIC_AUTH_MODE=api pnpm test:e2e -- --grep "Auth API"`

Expected: PASS with each route asserting method, JSON body, and Bearer header.

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the completed slice.**

```bash
git add src/features/auth/api.ts src/api/client.ts tests/e2e/auth-api.spec.ts
git commit -m "feat: add Fire3D auth API client"
```

### Task 3: Add a mode-aware Auth provider and migrate session consumers

**Files:**
- Create: `src/features/auth/auth-session.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/store/demo-session.tsx`
- Modify: `src/features/auth/demo-auth.ts`
- Modify: `src/features/learn/components/save-article-button.tsx`
- Modify: `src/features/learn/components/article-actions.tsx`
- Modify: `src/features/learning-hub/components/hub-view.tsx`
- Modify: `src/features/landing/components/landing-experience.tsx`
- Test: `tests/e2e/session.spec.ts`, `tests/e2e/auth-api.spec.ts`

**Interfaces:**
- Consumes `authApi`, `token-storage`, `safeNext`, and existing demo bookmark/chat actions.
- Produces `useAuthSession()` with `{ ready, isAuthenticated, user, pending, error, login, logout, requestPasswordReset, resetPassword }`.

- [ ] **Step 1: Write failing tests for API session restoration, one refresh attempt on `401`, and logout clearing tokens.**

```ts
await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(tokens)));
await page.route("**/api/auth/me", route => route.fulfill({ status: 401 }));
await page.route("**/api/auth/refresh", route => route.fulfill({ json: refreshed }));
await expect(page.getByText("Chào An.")).toBeVisible();
expect(refreshCalls).toBe(1);
```

- [ ] **Step 2: Run the focused tests and verify failure from the missing provider.**

Run: `NEXT_PUBLIC_AUTH_MODE=api pnpm test:e2e -- --grep "restores|refreshes|clears tokens"`

Expected: FAIL because there is no API auth session.

- [ ] **Step 3: Implement provider behavior and keep demo content separate.**

```tsx
const login = async (input: LoginInput) => {
  const response = authMode === "mock" ? mockLogin(input) : await authApi.login(input);
  writeTokenSet({ accessToken: response.accessToken, refreshToken: response.refreshToken });
  setUser(response.user);
};
```

`logout` clears local auth state before awaiting server logout. `me` retries exactly once after a successful refresh, then clears local state on failure. Existing bookmark/chat state should read `isAuthenticated` from `useAuthSession()` while retaining its current storage key and validation.

- [ ] **Step 4: Run focused tests, full existing session tests, and typecheck.**

Run: `NEXT_PUBLIC_AUTH_MODE=api pnpm test:e2e -- --grep "restores|refreshes|clears tokens"`

Expected: PASS.

Run: `pnpm test:e2e -- tests/e2e/session.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the completed slice.**

```bash
git add src/features/auth/auth-session.tsx src/app/layout.tsx src/store/demo-session.tsx src/features/auth/demo-auth.ts src/features/learn/components/save-article-button.tsx src/features/learn/components/article-actions.tsx src/features/learning-hub/components/hub-view.tsx src/features/landing/components/landing-experience.tsx tests/e2e
git commit -m "feat: add mode-aware auth session"
```

### Task 4: Connect login and password-recovery screens

**Files:**
- Modify: `src/features/auth/components/login-form.tsx`
- Modify: `src/app/login/page.tsx`
- Create: `src/features/auth/components/forgot-password-form.tsx`
- Create: `src/features/auth/components/reset-password-form.tsx`
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/reset-password/page.tsx`
- Modify: `src/configs/routes.ts`
- Test: `tests/e2e/session.spec.ts`, `tests/e2e/auth-api.spec.ts`

**Interfaces:**
- Consumes `useAuthSession()`, `safeNext(value)`, and `routes`.
- Produces accessible login, forgot-password, and reset-password forms with pending/success/error states.

- [ ] **Step 1: Write failing UI tests for an API login error and password-recovery request shapes.**

```ts
await page.getByRole("link", { name: "Quên mật khẩu?" }).click();
await page.getByLabel("Email").fill("user@example.test");
await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
await expect(page.getByRole("status")).toContainText("Đã gửi yêu cầu");
```

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `NEXT_PUBLIC_AUTH_MODE=api pnpm test:e2e -- --grep "password recovery|login error"`

Expected: FAIL because the routes and form controls do not exist.

- [ ] **Step 3: Implement forms with built-in label and pending semantics.**

```tsx
<label>Email<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
<Button type="submit" disabled={pending}>{pending ? "Đang gửi…" : "Gửi yêu cầu"}</Button>
{message && <p role={error ? "alert" : "status"}>{message}</p>}
```

The reset page reads only the reset token from its URL query string, never logs it, and calls `resetPassword(token, newPassword)`. The login success path retains existing safe `next` handling and resumes saved/asked Learn actions.

- [ ] **Step 4: Run focused UI tests, lint, and typecheck.**

Run: `NEXT_PUBLIC_AUTH_MODE=api pnpm test:e2e -- --grep "password recovery|login error"`

Expected: PASS.

Run: `pnpm lint`

Expected: exit code 0.

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 5: Commit the completed slice.**

```bash
git add src/features/auth/components src/app/login src/app/forgot-password src/app/reset-password src/configs/routes.ts tests/e2e
git commit -m "feat: add auth forms and password recovery"
```

### Task 5: Run regression checks and document API-mode setup

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Test: `tests/e2e/*.spec.ts`

**Interfaces:**
- Documents `NEXT_PUBLIC_AUTH_MODE=mock` and the API-mode variables without providing or committing credentials.

- [ ] **Step 1: Write a failing README validation checklist entry.**

```md
NEXT_PUBLIC_AUTH_MODE=api
NEXT_PUBLIC_API_BASE_URL=https://<Fire3D API host>
```

- [ ] **Step 2: Verify documentation is missing this API-mode workflow.**

Run: `rg -n "NEXT_PUBLIC_AUTH_MODE|API mode" README.md .env.example`

Expected: no matching `NEXT_PUBLIC_AUTH_MODE` line before the documentation edit.

- [ ] **Step 3: Add the minimal setup and constraints.**

Document that the remote API requires a PlatformAdmin seeded by backend/database owners; frontend has no register endpoint and cannot create an accepted remote mock account.

- [ ] **Step 4: Run full verification.**

Run: `pnpm install --frozen-lockfile`

Expected: exit code 0 with no lockfile changes.

Run: `pnpm typecheck`

Expected: exit code 0.

Run: `pnpm lint`

Expected: exit code 0.

Run: `pnpm build`

Expected: exit code 0.

Run: `pnpm test:e2e`

Expected: PASS.

- [ ] **Step 5: Commit the completed slice.**

```bash
git add README.md .env.example tests/e2e
git commit -m "docs: explain Fire3D auth modes"
```
