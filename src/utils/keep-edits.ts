/**
 * After a 412 the newer record is loaded for comparison. Fields the user changed (current differs from `base`, the values
 * the form was filled from) keep their text; every other field follows `latest`. Keeping the whole form instead would put
 * the user's stale copy of an untouched field back over the other editor's change on the next save, which matters for
 * endpoints whose PATCH replaces every editable field.
 */
export function keepEdits<T extends Record<string, unknown>>(current: T, base: T | null, latest: T): T {
  if (!base) return current;
  const next = { ...latest };
  for (const key of Object.keys(current) as Array<keyof T>) if (current[key] !== base[key]) next[key] = current[key];
  return next;
}
