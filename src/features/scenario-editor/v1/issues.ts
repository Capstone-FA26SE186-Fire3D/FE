import { parseJsonPath } from "../store/json";
import type { Issue } from "../store/validation";

/**
 * Maps a BE issue path (JSONPath such as `$.objects[3].parameters.intensity` or `$.rubric.criteria[0]`) to the place in the
 * UI that owns it. The path always refers to the document that was SENT to validate-state (or PUT), so callers only map
 * issues onto the editor while the result is not stale.
 */
export type IssueTarget =
  | { section: "object"; index: number; field: string }
  | { section: "rubric"; criterion: number | null; field: string }
  | { section: "objects" }
  | { section: "geometry" }
  | { section: "scenario"; field: string };

export function targetOf(path: string): IssueTarget {
  const segments = parseJsonPath(path);
  const [head, second] = segments;
  if (head === "objects") {
    if (typeof second === "number") return { section: "object", index: second, field: segments.slice(2).join(".") };
    return { section: "objects" };
  }
  if (head === "rubric") {
    if (second === "criteria" && typeof segments[2] === "number") return { section: "rubric", criterion: segments[2], field: segments.slice(3).join(".") };
    return { section: "rubric", criterion: null, field: segments.slice(1).join(".") };
  }
  if (head === "geometry" || head === "schemaVersion") return { section: "geometry" };
  return { section: "scenario", field: segments.join(".") };
}

/** Issues whose path is exactly `path` or lies under it. */
export function issuesUnder(issues: readonly Issue[], path: string): Issue[] {
  return issues.filter((item) => item.path === path || item.path.startsWith(`${path}.`) || item.path.startsWith(`${path}[`));
}

export function messageAt(issues: readonly Issue[], path: string): string | undefined {
  return issues.find((item) => item.path === path)?.message;
}

export function objectIssues(issues: readonly Issue[], index: number): Issue[] {
  return issuesUnder(issues, `$.objects[${index}]`);
}

/** Server-reported issues are kept apart from advisory client ones; the same code+path is shown once, attributed to the server. */
export function combineIssues(client: readonly Issue[], server: readonly Issue[]): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const item of [...server, ...client]) {
    const key = `${item.code}|${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** BE issues (`{code,path,message}`) in the store's shape; anything else is dropped rather than guessed. */
export function toIssues(raw: unknown): Issue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Issue[] => {
    if (typeof item !== "object" || item === null) return [];
    const { code, path, message } = item as Record<string, unknown>;
    return [{ code: typeof code === "string" ? code : "ISSUE", path: typeof path === "string" ? path : "$", message: typeof message === "string" ? message : "Lỗi do máy chủ báo.", source: "server" }];
  });
}
