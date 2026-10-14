/** Learn post slug as the backend stores it: lower-case words joined by single dashes, at most 180 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const POST_SLUG_MAX = 180;
export const isPostSlug = (value: string) => value.length > 0 && value.length <= POST_SLUG_MAX && SLUG_PATTERN.test(value);
