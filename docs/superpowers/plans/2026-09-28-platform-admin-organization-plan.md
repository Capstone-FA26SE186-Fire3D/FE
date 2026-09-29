# PlatformAdmin Organization console plan

1. Extend the organization API client with detail retrieval.
2. Replace the minimal organization page with a PlatformAdmin dashboard,
   backed by list filters, detail and status endpoints.
3. Pass `organizationId` from the selected Organization to Accounts via the
   server page `searchParams` prop and preselect OrganizationUser.
4. Add E2E tests for create/status/detail/handoff, then run TypeScript,
   production build and the related Playwright suite.
