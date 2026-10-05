This fixture bundles the real LoginForm, AuthSessionProvider and DemoSessionProvider
for Playwright. Only Next navigation, environment configuration and Firebase popup
identity acquisition are replaced. Fire3D API responses are mocked by page.route.

It exercises onboarding UI and session persistence without production Google
credentials or test hooks in application code. It does not verify the real Firebase
provider or deployed backend. The loader uses the repository's existing TypeScript
and Next webpack compiler; generated bundles are temporary and removed after read.
