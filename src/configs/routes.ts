export const routes = {
  home: "/",
  learn: "/learn",
  login: "/login",
  account: "/account",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  learningHub: "/learning-hub",
  organizations: "/organizations",
  about: "/about",
  download: "/download",
  rag: "/demo/rag",
  adminAccounts: "/admin/accounts",
} as const;

export type RouteKey = keyof typeof routes;
