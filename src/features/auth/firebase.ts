import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { env, hasFirebaseAuthConfig } from "@/configs/env";

function firebaseAuth() {
  if (!hasFirebaseAuthConfig) {
    throw new Error("Chưa cấu hình Firebase cho môi trường này.");
  }

  const app = getApps()[0] ?? initializeApp(env.firebase);
  return getAuth(app);
}

export async function signInWithFirebase(email: string, password: string): Promise<string> {
  const credential = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  return credential.user.getIdToken();
}
