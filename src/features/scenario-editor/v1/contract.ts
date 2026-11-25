/**
 * `fet3d.editor/1` vocabulary shared by the pure modules and the UI. Mirrors BE `contracts/editor/v1/*.schema.json`
 * and `EditorContract.cs` (authoritative). Nothing here is a policy default: limits are the schema's, and values the
 * server does not require are never invented.
 */

export const SCHEMA_VERSION = "fet3d.editor/1";

export const OBJECT_KINDS = ["Spawn", "Hazard", "Goal", "Npc", "BlockedElement", "Equipment"] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** Kinds that must name a runtime capability; a BlockedElement must name an IFC anchor (checked by validate/snapshot). */
export const CAPABILITY_REQUIRED_KINDS: readonly ObjectKind[] = ["Hazard", "Npc", "Equipment"];
export const ANCHOR_REQUIRED_KINDS: readonly ObjectKind[] = ["BlockedElement"];

export const KIND_META: Record<ObjectKind, { label: string; /** Same label inside a sentence ("Thêm nguy cơ"); acronyms keep their case. */ lower: string; plural: string; description: string; idPrefix: string }> = {
  Spawn: { label: "Điểm xuất phát", lower: "điểm xuất phát", plural: "Điểm xuất phát", description: "Nơi người học bắt đầu tình huống.", idPrefix: "spawn" },
  Hazard: { label: "Nguy cơ", lower: "nguy cơ", plural: "Nguy cơ", description: "Nguồn nguy cơ; cách hoạt động do khả năng bạn chọn quyết định.", idPrefix: "hazard" },
  Goal: { label: "Điểm đến", lower: "điểm đến", plural: "Điểm đến", description: "Điểm hoặc cấu kiện người học phải đạt, ví dụ lối ra.", idPrefix: "goal" },
  Npc: { label: "NPC", lower: "NPC", plural: "NPC", description: "Nhân vật mô phỏng; cách hoạt động do khả năng bạn chọn quyết định.", idPrefix: "npc" },
  BlockedElement: { label: "Cấu kiện bị chặn", lower: "cấu kiện bị chặn", plural: "Cấu kiện bị chặn", description: "Cửa hoặc cấu kiện IFC không đi qua được; bắt buộc chọn cấu kiện neo.", idPrefix: "blocked" },
  Equipment: { label: "Thiết bị", lower: "thiết bị", plural: "Thiết bị", description: "Thiết bị hỗ trợ; cách hoạt động do khả năng bạn chọn quyết định.", idPrefix: "equipment" },
};

export const TRAINING_MODES = ["Learn", "Guided", "Assessment"] as const;
export type TrainingMode = (typeof TRAINING_MODES)[number];
export const MODE_LABEL: Record<TrainingMode, string> = { Learn: "Học", Guided: "Có hướng dẫn", Assessment: "Đánh giá" };

/** BE#215 (Mẫu PC06 mục IV.1): who a situation trains, and whether it happens inside working hours. */
export const AUDIENCES = ["Evacuee", "Communications", "EvacuationGuide", "FirstResponse"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = { Evacuee: "Người thoát nạn", Communications: "Thông tin liên lạc", EvacuationGuide: "Hướng dẫn thoát nạn", FirstResponse: "Chữa cháy ban đầu" };
export const WORKING_HOURS = ["InHours", "OffHours"] as const;
export type WorkingHours = (typeof WORKING_HOURS)[number];
export const WORKING_HOURS_LABEL: Record<WorkingHours, string> = { InHours: "Trong giờ làm việc", OffHours: "Ngoài giờ làm việc" };
export const audienceLabel = (value: unknown): string | null => (typeof value === "string" && value in AUDIENCE_LABEL ? AUDIENCE_LABEL[value as Audience] : null);
export const workingHoursLabel = (value: unknown): string | null => (typeof value === "string" && value in WORKING_HOURS_LABEL ? WORKING_HOURS_LABEL[value as WorkingHours] : null);

export const RUBRIC_OPERATORS = ["gte", "lte", "eq"] as const;
export type RubricOperator = (typeof RUBRIC_OPERATORS)[number];

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
export const IFC_GLOBAL_ID_PATTERN = /^[0-9A-Za-z_$]{22}$/;
export const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIMITS = {
  nameMax: 255,
  timeLimit: { min: 1, max: 86_400 },
  replanInterval: { min: 0, max: 3_600 },
  objectivesMax: 50,
  objectiveMax: 1_000,
  instructionsMax: 10_000,
  criteriaMax: 100,
  objectsMax: 2_000,
  labelMax: 255,
  positionAbs: 100_000,
  criterionDescriptionMax: 1_000,
  assumption: { timeMax: 100, locationMax: 500, causeMax: 500, peopleMax: 100_000 },
} as const;

/** What the editor holds as the pinned Geometry artifact of the draft (`geometry` in the state). */
export type GeometryPin = { artifactId: string; sha256Hash: string };
