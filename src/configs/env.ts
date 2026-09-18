export type AuthMode = "api" | "mock";

const configuredAuthMode = process.env.NEXT_PUBLIC_AUTH_MODE;

export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  ragApiUrl: process.env.NEXT_PUBLIC_RAG_API_URL ?? "http://127.0.0.1:8000",
  authMode: configuredAuthMode === "api" ? "api" : "mock" satisfies AuthMode,
};
