import { isObject, parseJsonPath, type JsonObject, type PathSegment } from "./json";
import type { Selection } from "./model";

/**
 * Client-side structural validation that mirrors `ScenarioDraftStructuralValidator` (BE main @ b6a7d74) so authors see
 * problems while typing. It is advisory: the BE `POST /api/scenario-drafts/{id}/validate` is the source of truth and
 * additionally checks anchors/runtime capabilities against the revision (`scenario_reference_issues`), which the
 * client cannot do. Codes and `$.path` notation are the BE's.
 */
export type IssueSource = "client" | "server";
export type Issue = { code: string; path: string; message: string; source: IssueSource };

const issue = (code: string, path: string, message: string): Issue => ({ code, path, message, source: "client" });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function validatePosition(value: unknown, path: string, out: Issue[]) {
  if (!isObject(value)) {
    out.push(issue("POSITION_REQUIRED", path, "Cần có vị trí."));
    return;
  }
  if (!["x", "y", "z", "rotation"].every((key) => finite(value[key]))) {
    out.push(issue("POSITION_INVALID", path, "Tọa độ và hướng phải là số hữu hạn."));
  }
}

function validateRubric(rubric: unknown, out: Issue[]) {
  const required = () => out.push(issue("RUBRIC_REQUIRED", "$.rubric", "Cần schema_version, ngưỡng đạt (số) và ít nhất một tiêu chí."));
  if (!isObject(rubric) || !text(rubric.schema_version) || !finite(rubric.pass_threshold) || !Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
    required();
    return;
  }
  const ids = new Set<string>();
  rubric.criteria.forEach((criterion, index) => {
    const c = isObject(criterion) ? criterion : null;
    const ok = c !== null && text(c.id) && text(c.metric) && typeof c.mandatory === "boolean" && finite(c.weight) && c.weight >= 0
      && finite(c.threshold) && (c.operator === "gte" || c.operator === "lte" || c.operator === "eq") && !ids.has(c.id as string);
    if (c && text(c.id)) ids.add(c.id);
    if (!ok) out.push(issue("RUBRIC_CRITERION_INVALID", `$.rubric.criteria[${index}]`, "Mỗi tiêu chí cần id duy nhất, metric, cờ bắt buộc, trọng số ≥ 0, toán tử gte/lte/eq và ngưỡng số."));
  });
}

export function validateDraftState(draft: JsonObject): Issue[] {
  const out: Issue[] = [];
  const spawns = draft.spawnPoints;
  if (!Array.isArray(spawns) || spawns.length === 0) out.push(issue("SPAWN_REQUIRED", "$.spawnPoints", "Cần ít nhất một điểm xuất phát."));
  else spawns.forEach((spawn, index) => validatePosition(spawn, `$.spawnPoints[${index}]`, out));

  const hazards = draft.hazards;
  if (!Array.isArray(hazards)) out.push(issue("HAZARDS_REQUIRED", "$.hazards", "Danh sách nguy cơ phải là một mảng."));
  else {
    const ids = new Map<string, number>();
    hazards.forEach((item, index) => {
      const path = `$.hazards[${index}]`;
      if (!isObject(item)) {
        out.push(issue("HAZARD_REQUIRED", path, "Nguy cơ không được rỗng."));
        return;
      }
      if (!text(item.id)) out.push(issue("HAZARD_ID_REQUIRED", `${path}.id`, "Cần mã nguy cơ."));
      else if (ids.has(item.id)) out.push(issue("HAZARD_ID_DUPLICATE", `${path}.id`, `Mã nguy cơ trùng với mục #${(ids.get(item.id) ?? 0) + 1}.`));
      else ids.set(item.id, index);
      if (!text(item.type)) out.push(issue("HAZARD_TYPE_REQUIRED", `${path}.type`, "Cần loại nguy cơ."));
      validatePosition(item.position, `${path}.position`, out);
      if (!finite(item.intensity) || item.intensity < 0) out.push(issue("HAZARD_INTENSITY_INVALID", `${path}.intensity`, "Cường độ phải là số không âm."));
      if (!finite(item.activationTime) || item.activationTime < 0) out.push(issue("HAZARD_ACTIVATION_TIME_INVALID", `${path}.activationTime`, "Thời điểm kích hoạt phải là số không âm."));
    });
  }

  const scoring = draft.scoringConfig;
  if (!isObject(scoring)) out.push(issue("SCORING_REQUIRED", "$.scoringConfig", "Cần cấu hình chấm điểm."));
  else {
    if (!finite(scoring.baseScore) || scoring.baseScore < 0) out.push(issue("BASE_SCORE_INVALID", "$.scoringConfig.baseScore", "Điểm cơ sở không được âm."));
    if (!finite(scoring.timeLimitSeconds) || scoring.timeLimitSeconds <= 0) out.push(issue("TIME_LIMIT_INVALID", "$.scoringConfig.timeLimitSeconds", "Thời gian tối đa phải lớn hơn 0."));
    if (!finite(scoring.penaltyPerMistake) || scoring.penaltyPerMistake < 0) out.push(issue("PENALTY_INVALID", "$.scoringConfig.penaltyPerMistake", "Điểm trừ mỗi lỗi không được âm."));
  }

  const routes = isObject(draft.routingConfig) ? draft.routingConfig.evacuationRoutes : undefined;
  if (!Array.isArray(routes) || routes.length === 0) out.push(issue("ROUTE_REQUIRED", "$.routingConfig.evacuationRoutes", "Cần ít nhất một tuyến thoát hiểm."));
  else if (routes.some((route) => !text(route))) out.push(issue("ROUTE_INVALID", "$.routingConfig.evacuationRoutes", "Tuyến thoát hiểm không được để trống."));

  const objectives = draft.learningObjectives;
  if (!Array.isArray(objectives) || objectives.length === 0 || objectives.some((item) => !text(item) || item.length > 1000)) {
    out.push(issue("LEARNING_OBJECTIVES_REQUIRED", "$.learningObjectives", "Nhập mục tiêu học tập không để trống, mỗi mục tối đa 1000 ký tự."));
  }
  const instructions = draft.learnerInstructions;
  if (!text(instructions) || instructions.length > 10000) out.push(issue("LEARNER_INSTRUCTIONS_REQUIRED", "$.learnerInstructions", "Nhập hướng dẫn cho người học từ 1 đến 10000 ký tự."));

  validateRubric(draft.rubric, out);

  const anchors = draft.objectAnchors;
  if (Array.isArray(anchors) && (anchors.some((item) => !text(item)) || new Set(anchors).size !== anchors.length)) {
    out.push(issue("ANCHORS_INVALID", "$.objectAnchors", "Mã neo đối tượng không được trống hoặc trùng."));
  }
  const capabilities = draft.requiredCapabilities;
  if (Array.isArray(capabilities) && (capabilities.some((item) => !text(item)) || new Set(capabilities).size !== capabilities.length)) {
    out.push(issue("CAPABILITIES_INVALID", "$.requiredCapabilities", "Năng lực runtime không được trống hoặc trùng."));
  }
  return out;
}

/** BE issues (strings from older builds are tolerated) normalized to `{code,path,message}`. */
export function normalizeServerIssues(raw: unknown): Issue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item): Issue => {
    if (isObject(item)) {
      return {
        code: typeof item.code === "string" ? item.code : "ISSUE",
        path: typeof item.path === "string" ? item.path : "$",
        message: typeof item.message === "string" ? item.message : "Lỗi do máy chủ báo.",
        source: "server",
      };
    }
    return { code: "ISSUE", path: "$", message: String(item), source: "server" };
  });
}

/** Client issues are live; server issues stay until the next validate. Same code+path is shown once, attributed to the server. */
export function mergeIssues(client: Issue[], server: Issue[]): Issue[] {
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

export function issueSelection(path: string): Selection {
  const segments: PathSegment[] = parseJsonPath(path);
  if (segments[0] === "spawnPoints" && typeof segments[1] === "number") return { kind: "spawn", index: segments[1] };
  if (segments[0] === "hazards" && typeof segments[1] === "number") return { kind: "hazard", index: segments[1] };
  return null;
}

/** The form section of the right panel an issue belongs to. */
export function issueSection(path: string): "object" | "scenario" {
  return issueSelection(path) ? "object" : "scenario";
}

export function issuesAt(issues: Issue[], prefix: string): Issue[] {
  return issues.filter((item) => item.path === prefix || item.path.startsWith(`${prefix}.`) || item.path.startsWith(`${prefix}[`));
}

export function issueMessage(issues: Issue[], path: string): string | undefined {
  return issues.find((item) => item.path === path)?.message;
}
