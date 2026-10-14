export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  /** Optional public origin written into Building QR codes (e.g. https://fet3d.io.vn); defaults to the current origin. */
  qrLandingOrigin: process.env.NEXT_PUBLIC_QR_LANDING_ORIGIN ?? "",
  ragApiUrl: process.env.NEXT_PUBLIC_RAG_API_URL ?? "http://127.0.0.1:8000",
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  },
};

export const hasFirebaseAuthConfig = Object.values(env.firebase).every(Boolean);
