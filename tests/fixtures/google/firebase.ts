export async function signInWithGoogle() {
  const code = new URLSearchParams(window.location.search).get("providerError");
  if (code) throw Object.assign(new Error("Provider error"), { code });
  return "mock-firebase-identity";
}
