# Firebase Auth and Accounts UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock authentication with Firebase ID-token exchange and add live PlatformAdmin account administration.

**Architecture:** Firebase Web SDK performs email/password sign-in and produces a Firebase ID token. The Fire3D API exchanges it for Fire3D JWT tokens managed by an Auth provider; a feature-owned Accounts client and page consume those tokens without adding client-side authorization as a security boundary.

**Tech Stack:** Next.js 16, React 19, TypeScript, Firebase Web SDK, Fetch API, Playwright.

## Global Constraints

- Call `POST /api/auth/register` and `POST /api/auth/login-firebase` anonymously; login Firebase body is a JSON string.
- Do not call undocumented `/api/auth/login`, `/api/auth/forgot-password`, or `/api/auth/reset-password` paths.
- Do not commit Firebase configuration, passwords, Firebase ID tokens, Fire3D access tokens, refresh tokens, or Admin credentials.
- Fire3D tokens remain in `sessionStorage`; no mock authentication fallback exists.
- Render Accounts UI only for `role === 0`; backend remains authoritative for every operation.
- Keep Learn and RAG prototype content out of scope.

---

### Task 1: Add Firebase configuration and typed live Auth contract

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `.env.example`, `src/configs/env.ts`
- Create: `src/features/auth/firebase.ts`, `src/features/auth/types.ts`, `src/features/auth/api.ts`, `src/features/auth/token-storage.ts`
- Test: `tests/e2e/auth.spec.ts`

- [ ] Write failing test confirming login reports unconfigured Firebase instead of showing demo credentials.
- [ ] Run `pnpm test:e2e -- --grep "Firebase configuration"`; confirm red.
- [ ] Add Firebase SDK and configuration parser; expose `firebaseAuth` only when all required public config exists.
- [ ] Add typed anonymous register and Firebase-token exchange clients, plus typed refresh/me/logout calls.
- [ ] Run the focused test and `pnpm typecheck`; confirm green.
- [ ] Commit as `feat: add Firebase auth client contract`.

### Task 2: Replace mock session and login UI with Firebase sign-in/registration

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/configs/routes.ts`, `src/store/demo-session.tsx`
- Modify: `src/features/auth/components/login-form.tsx`, `src/features/auth/demo-auth.ts`
- Create: `src/features/auth/auth-session.tsx`, `src/features/auth/components/register-form.tsx`, `src/app/register/page.tsx`
- Test: `tests/e2e/auth.spec.ts`, `tests/e2e/session.spec.ts`

- [ ] Write tests intercepting `login-firebase`, asserting a JSON string body and no Authorization header; assert registration sends `email`, `password`, `fullName`.
- [ ] Run focused Auth tests; confirm red against the demo login.
- [ ] Implement Firebase email/password sign-in, ID-token exchange, token restoration/one-refresh retry, and logout.
- [ ] Remove demo email/password, mock account UI, mock auth mode, and authentication mutation from the demo-session store.
- [ ] Implement registration followed by Firebase sign-in and token exchange.
- [ ] Run focused Auth tests, `pnpm typecheck`, and `pnpm lint`; confirm green.
- [ ] Commit as `feat: replace mock login with Firebase exchange`.

### Task 3: Add Accounts API and PlatformAdmin management UI

**Files:**
- Create: `src/features/accounts/api.ts`, `src/features/accounts/types.ts`, `src/features/accounts/components/accounts-page.tsx`
- Create: `src/app/admin/accounts/page.tsx`
- Modify: `src/configs/routes.ts`, `src/layouts/site-header.tsx`, `src/assets/styles/globals.css`
- Test: `tests/e2e/accounts.spec.ts`

- [ ] Write failing intercepted-request tests for account list filters, create payload, and status toggle; include a non-admin route-denial test.
- [ ] Run `pnpm test:e2e -- --grep "Accounts"`; confirm red.
- [ ] Add typed list/detail/create/set-active calls with Bearer headers and a read-only organization-list client for the creation selector.
- [ ] Build accessible list/filter/create/detail/toggle UI. Require active organization for role 1; avoid self-disable.
- [ ] Run focused Accounts tests, typecheck, and lint; confirm green.
- [ ] Commit as `feat: add PlatformAdmin account management`.

### Task 4: Document setup and run regression verification

**Files:**
- Modify: `README.md`, `.env.example`
- Test: `tests/e2e/*.spec.ts`

- [ ] Document Firebase Web configuration, Email/Password provider, authorized-domain requirements, and the distinction from Admin credentials.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test:e2e`.
- [ ] Inspect staged diff for tokens/passwords with `git diff --cached` before commit.
- [ ] Commit as `docs: explain Firebase account setup`.
