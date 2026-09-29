# VPS API integration — Phase 1 plan

1. Extend auth types/API and update the login/register form for the deployed
   password and registration contracts. Add focused tests first.
2. Complete the signed IFC upload helper and Building API adapter, preserving
   the signed-URL security boundary. Add tests for each failure boundary.
3. Add the OrganizationUser Building detail route: revisions, upload,
   processing/QA refresh, facts/issues and backend preview state.
4. Add annotation GET/PUT with `If-Match`; present conflicts without retries
   that could overwrite server data.
5. Run focused tests, TypeScript, build and the relevant route tests. Record
   the exact result in the ignored local handoff; do not push or merge.
