# PlatformAdmin Organization console plan

> Tài liệu lịch sử: mô tả kế hoạch/thiết kế tại ngày trong tên file, không phải trạng thái source hiện hành. Trước khi dùng, đối chiếu [context FE](../../../.codex/context.md) và [tracker vận hành](../../fet3d-operations-ui-tracker.md), nhất là auth/session store, Google, AI và các blocker API đã thay đổi. Không chạy lại checklist chỉ vì nó còn trong kế hoạch này.

1. Extend the organization API client with detail retrieval.
2. Replace the minimal organization page with a PlatformAdmin dashboard,
   backed by list filters, detail and status endpoints.
3. Pass `organizationId` from the selected Organization to Accounts via the
   server page `searchParams` prop and preselect OrganizationUser.
4. Add E2E tests for create/status/detail/handoff, then run TypeScript,
   production build and the related Playwright suite.
