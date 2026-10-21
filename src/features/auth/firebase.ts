import { env, hasFirebaseAuthConfig } from "@/configs/env";

/** Firebase is only needed when the user signs in with Google/Firebase: load it on demand, not in every page bundle. */
async function firebaseAuth() {
  if (!hasFirebaseAuthConfig) {
    throw new Error("Chưa cấu hình Firebase cho môi trường này.");
  }

  const [{ getApps, initializeApp }, { getAuth }] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  const app = getApps()[0] ?? initializeApp(env.firebase);
  return getAuth(app);
}

export async function signInWithFirebase(email: string, password: string): Promise<string> {
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const credential = await signInWithEmailAndPassword(await firebaseAuth(), email.trim(), password);
  return credential.user.getIdToken();
}

export async function signInWithGoogle(): Promise<string> {
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const credential = await signInWithPopup(await firebaseAuth(), new GoogleAuthProvider());
  return credential.user.getIdToken();
}
