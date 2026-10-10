/**
 * Pure JSON helpers for the draft state. The editor keeps the draft as the raw JSON object the API returned and
 * changes it only through copy-on-write updates along a path, so every field the editor does not understand
 * (and every unchanged object) keeps its identity and is written back untouched.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type PathSegment = string | number;
export type Path = readonly PathSegment[];

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getIn(root: unknown, path: Path): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === "number") current = current[segment];
    else if (isObject(current) && typeof segment === "string") current = current[segment];
    else return undefined;
  }
  return current;
}

/** Copy-on-write assignment. `value === undefined` removes the key. Missing parents are created. */
export function setIn<T extends Json>(root: T, path: Path, value: Json | undefined): T {
  if (path.length === 0) return (value === undefined ? root : value) as T;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const source: Json[] = Array.isArray(root) ? root : [];
    const next: Json[] = source.slice();
    const child = rest.length === 0 ? value : setIn((source[head] ?? (typeof rest[0] === "number" ? [] : {})) as Json, rest, value);
    if (child === undefined) next.splice(head, 1);
    else next[head] = child;
    return next as unknown as T;
  }
  const source: JsonObject = isObject(root) ? root : {};
  const next: JsonObject = { ...source };
  const child = rest.length === 0 ? value : setIn((source[head] ?? (typeof rest[0] === "number" ? [] : {})) as Json, rest, value);
  if (child === undefined) delete next[head];
  else next[head] = child;
  return next as T;
}

export function insertAt<T extends Json>(root: T, arrayPath: Path, index: number, value: Json): T {
  const current = getIn(root, arrayPath);
  const list = Array.isArray(current) ? current.slice() : [];
  list.splice(Math.min(Math.max(index, 0), list.length), 0, value);
  return setIn(root, arrayPath, list);
}

export function removeAt<T extends Json>(root: T, arrayPath: Path, index: number): T {
  const current = getIn(root, arrayPath);
  if (!Array.isArray(current)) return root;
  const list = current.slice();
  list.splice(index, 1);
  return setIn(root, arrayPath, list);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => key in b && deepEqual(a[key], b[key]));
  }
  return false;
}

export function pathKey(path: Path): string {
  return path.map((segment) => (typeof segment === "number" ? `[${segment}]` : `.${segment}`)).join("");
}

/** `$.hazards[1].position.x` → `["hazards", 1, "position", "x"]`. Tolerates a missing `$` prefix. */
export function parseJsonPath(value: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const body = value.replace(/^\$\.?/, "");
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  for (let match = pattern.exec(body); match; match = pattern.exec(body)) {
    segments.push(match[2] !== undefined ? Number(match[2]) : match[1]);
  }
  return segments;
}

export function formatJsonPath(path: Path): string {
  return `$${pathKey(path)}`;
}

/** Leaf-level differences between two JSON values (arrays of objects are compared by index). */
export function diffLeaves(a: unknown, b: unknown, path: PathSegment[] = [], limit = 200): Array<{ path: PathSegment[]; left: unknown; right: unknown }> {
  const out: Array<{ path: PathSegment[]; left: unknown; right: unknown }> = [];
  const walk = (x: unknown, y: unknown, at: PathSegment[]) => {
    if (out.length >= limit || deepEqual(x, y)) return;
    if (isObject(x) && isObject(y)) {
      for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[key], y[key], [...at, key]);
      return;
    }
    if (Array.isArray(x) && Array.isArray(y) && x.some(isObject)) {
      for (let index = 0; index < Math.max(x.length, y.length); index++) walk(x[index], y[index], [...at, index]);
      return;
    }
    out.push({ path: at, left: x, right: y });
  };
  walk(a, b, path);
  return out;
}

/** Key-sorted JSON, used to compare payloads and fingerprint idempotency keys. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
