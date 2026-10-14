type TestWindow = Window & { googleTestPopups?: number; googleTestIdentity?: string };

export async function signInWithGoogle() {
  const testWindow = window as TestWindow;
  testWindow.googleTestPopups = (testWindow.googleTestPopups ?? 0) + 1;
  const code = new URLSearchParams(window.location.search).get("providerError");
  if (code) throw Object.assign(new Error("Provider error"), { code });
  return testWindow.googleTestIdentity ?? "mock-firebase-identity";
}
