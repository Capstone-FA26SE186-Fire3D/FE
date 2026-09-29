# PlatformAdmin Organization console

## Goal

Give `PlatformAdmin` a complete, API-backed console for the documented flow:
create an Organization, inspect or change its status, then provision its first
`OrganizationUser` owner.

## Contract and boundary

- Organization list/create/detail/status use only `/api/organizations` and
  require the existing Bearer session.
- The UI never chooses tenant scope for ordinary users. The admin handoff
  passes `organizationId` in the Accounts URL; Accounts only submits it when
  the selected role is `OrganizationUser`.
- No member/invitation role, self-service PlatformAdmin creation, audit claim,
  or billing behavior is added because the deployed API/Docs do not expose it.

## UI

1. Summary cards show total and active/inactive records on the current page.
2. Creation form derives a safe slug from the name but lets an admin edit it.
3. Search, status filter, refresh and pagination stay server-backed.
4. Selecting a row requests authoritative detail. The panel exposes status,
   timestamps, owner handoff and activation/deactivation.
5. `/admin/accounts?organizationId=<id>` initializes Accounts to role `1`
   and the selected organization. The page reads this query server-side to
   stay compatible with Next.js prerendering.

## Verification

Playwright mocks the deployed contracts and proves creation payload, status
payload, detail/owner link and preselected Accounts scope. Typecheck/build
remain required because the handoff is an App Router server-page prop.
