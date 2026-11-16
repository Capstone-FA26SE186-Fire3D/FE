/**
 * The real API is on another origin when `NEXT_PUBLIC_API_BASE_URL` is set (it is in a local `.env`), and it exposes
 * these headers to the browser (BE Program.cs `WithExposedHeaders("ETag", "Retry-After", …)`). A mocked response must
 * say the same, otherwise the app cannot read ETag/Retry-After cross-origin and the test only passes same-origin (CI).
 */
export const EXPOSED = { "Access-Control-Expose-Headers": "ETag, Retry-After, X-Correlation-ID, Location" } as const;
