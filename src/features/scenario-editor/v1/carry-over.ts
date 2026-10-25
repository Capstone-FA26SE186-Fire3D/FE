import { isObject, type Json, type JsonObject } from "../store/json";
import { SCHEMA_VERSION, SEMVER_PATTERN } from "./contract";
import { shapeIssues } from "./state";

/**
 * Non-spatial fields a legacy draft can lend to a NEW `fet3d.editor/1` draft. Positions are never copied: the legacy
 * coordinates have no declared frame or unit, and no transform is assumed (BE: "legacy drafts are never converted").
 * Each item is offered only when its value already satisfies the v1 schema, so the first PUT cannot be refused for it.
 */
export type CarryKey = "learningObjectives" | "learnerInstructions" | "rubric" | "timeLimitSeconds" | "randomSeed" | "replanIntervalSeconds" | "runtimeVersion";

export type CarryItem = { key: CarryKey; label: string; summary: string; value: Json };

const check = (key: string, value: Json): boolean => shapeIssues({ schemaVersion: SCHEMA_VERSION, [key]: value }).length === 0;

export function carryOverCandidates(legacy: JsonObject): CarryItem[] {
  const items: CarryItem[] = [];
  const add = (key: CarryKey, label: string, summary: string, value: Json | undefined) => {
    if (value !== undefined && check(key, value)) items.push({ key, label, summary, value });
  };
  if (Array.isArray(legacy.learningObjectives) && legacy.learningObjectives.length > 0) add("learningObjectives", "Mục tiêu học tập", `${legacy.learningObjectives.length} mục`, legacy.learningObjectives);
  if (typeof legacy.learnerInstructions === "string") add("learnerInstructions", "Hướng dẫn cho người học", `${legacy.learnerInstructions.length} ký tự`, legacy.learnerInstructions);
  // Only a rubric that already uses the registered schema_version "1" can be copied; an older version must be re-entered.
  if (isObject(legacy.rubric) && legacy.rubric.schema_version === "1") add("rubric", "Rubric chấm điểm", `${Array.isArray(legacy.rubric.criteria) ? legacy.rubric.criteria.length : 0} tiêu chí`, legacy.rubric);
  const seconds = isObject(legacy.scoringConfig) ? legacy.scoringConfig.timeLimitSeconds : undefined;
  if (typeof seconds === "number") add("timeLimitSeconds", "Thời gian tối đa", `${seconds} giây`, seconds);
  if (typeof legacy.randomSeed === "number") add("randomSeed", "Hạt giống ngẫu nhiên", String(legacy.randomSeed), legacy.randomSeed);
  if (typeof legacy.replanIntervalSeconds === "number") add("replanIntervalSeconds", "Chu kỳ lập lại kế hoạch", `${legacy.replanIntervalSeconds} giây`, legacy.replanIntervalSeconds);
  if (typeof legacy.runtimeVersion === "string" && SEMVER_PATTERN.test(legacy.runtimeVersion)) add("runtimeVersion", "Phiên bản ứng dụng", legacy.runtimeVersion, legacy.runtimeVersion);
  return items;
}

export function carryOverExtras(items: CarryItem[], chosen: ReadonlySet<CarryKey>): JsonObject {
  const extras: JsonObject = {};
  for (const item of items) if (chosen.has(item.key)) extras[item.key] = item.value;
  return extras;
}
