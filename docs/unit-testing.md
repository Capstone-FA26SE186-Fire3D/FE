# FE logic and adapter tests

Use Node 24 and the repository's pinned pnpm version. Install with `pnpm install --frozen-lockfile`, then run `pnpm test` (all), `pnpm test:unit`, or `pnpm test:adapter`. The matching `*:coverage` scripts write LCOV, JUnit XML, a loaded-source summary and a whole-source inventory under the ignored `.codex/local/coverage/` directory. `pnpm test:inventory` also records existing Playwright imports without running a browser. Each `.test.mjs` runs in its own Node test process.

The tests import production TypeScript through `tests/support/loader.mjs`. Fixtures replace HTTP and browser storage/coordination boundaries, and restore globals after every test. A React hook shim is used only for the idempotency module's import boundary; it throws if a hook is called. No render, WebGL, Firebase, Next server, or real provider is used in the Node suites. `pnpm test:e2e` remains the browser suite.

| Behavior | Direct Node evidence | Additional existing evidence |
| --- | --- | --- |
| HTTP, ProblemDetails, retry headers and abort | `unit/http-errors`, `adapter/http-client` | `e2e/auth.spec.ts` |
| Session, role, redirect, expiry, Google and registration | `unit/auth-boundaries`, `unit/content-and-shape`, `adapter/session-store`, `adapter/auth-api` | `e2e/auth.spec.ts` |
| Idempotent command identity and retry | `adapter/command-keys`, `adapter/feature-api` | Existing feature specs in inventory |
| IFC header, streamed scan, SHA-256, QA/readiness | `adapter/ifc-precheck`, `unit/content-and-shape`, `unit/readiness-policy` | `e2e/ifc-scan.spec.ts`, `e2e/ifc-pipeline-progress.spec.ts` |
| Editor commands, merge, PC06 shape, equipment import and AI apply | `unit/editor-history`, `unit/content-and-shape`, `unit/equipment-import`, `unit/ai-apply`, `adapter/business-contracts` | `e2e/scenario-editor-store.spec.ts`, v1 editor specs |
| Learn, playtest, QR, AI, Library and expert APIs | `unit/feature-policy`, `adapter/feature-api`, `adapter/content-contracts`, `unit/content-and-shape` | Learn/playtest specs in inventory |
| Billing, training history, analytics and version/package status | `unit/billing-history`, `adapter/billing-session`, `adapter/business-contracts`, `unit/analytics-policy`, `unit/readiness-policy` | Existing analytics/version specs in inventory |

`module-inventory.md` lists every `src/**/*.ts(x)` file, direct Node tests, existing Playwright specs and a reason when no direct test exists. A direct import is evidence of targeting, not proof that every branch was checked. The V8 percentage in `summary.md` applies only to files loaded by Node. Unloaded modules, React hooks/components, browser multitab behavior, WebGL, and real providers remain outside that percentage. The earlier full Playwright result in the 26 November workspace report had failures; these Node tests do not change that result.

When a production defect is found, keep a failing reproduction with expected/actual and the exact command in the local test report. Do not weaken the assertion, skip the case, or silently change production code to make the suite green.
