export const routes = {
  home: "/",
  learn: "/learn",
  login: "/login",
  learningHub: "/learning-hub",
  organizations: "/organizations",
  about: "/about",
  download: "/download",
  rag: "/demo/rag",
} as const;

export type RouteKey = keyof typeof routes;
