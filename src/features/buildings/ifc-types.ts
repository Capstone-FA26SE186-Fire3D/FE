import type { PageResponse } from "@/api/types/common";
import type { EditorPreview, EquipmentDecisionKind, ValidationRun, ValidationStatus } from "./types";

/*
 * IFC-only DTOs that complete `./types.ts` against the BE (Fire3D.Application/Ifc/*, contracts/ifc/v1, contracts/style/v1).
 * Kept in a separate file so IFC additions never collide with edits of the general Building types.
 */

/** Known values are typed; anything newer from the BE is still accepted and shown as-is. */
type Tolerant<T extends string> = T | (string & {});

// ───────── processing / QA ─────────

/**
 * `ValidationRunResponse` also carries `outcome` (BE GetValidationRun.cs, optional, `Passed | Failed`); read it before `status`
 * and `summary.outcome`.
 */
export type ValidationRunWithOutcome = ValidationRun & { outcome?: Tolerant<ValidationStatus> | null };

/** Body of `POST /api/processing-jobs/{jobId}/retry` (`RetryProcessingJobRequest`). `requestId` is a UUID; reason 1–1000 chars. */
export type RetryJobInput = { requestId: string; reason: string };

/** Body of `POST /api/revisions/{revisionId}/reviews` (technical rejection of one revision–scenario version pair). */
export type RejectScenarioVersionInput = {
  scenarioVersionId: string;
  validationRunId: string;
  reviewMessage: string;
  annotationSetId?: string | null;
};
/** 201 of `POST /api/revisions/{revisionId}/reviews`. */
export type TechnicalRejectionResult = { id: string };
/** 200 of `POST /api/revisions/{revisionId}/confirm-for-training`. */
export type ConfirmTrainingResult = { reviewId: string };

/** Pipeline steps a worker writes into `processing-logs` (`step`). */
export type ProcessingStep = Tolerant<"Quarantine" | "Parse" | "CleanGeometry" | "Decimate" | "GenNavMesh" | "GenHazardGrid" | "ExportGLB" | "PackageBundle">;

/** Artifact types of a Geometry attempt (`artifacts[].artifactType`). */
export type IfcArtifactType = Tolerant<"preview_glb" | "building_metadata" | "unity_package">;

// ───────── error / QA codes ─────────

/** HTTP error codes of the upload flow (initiate → PUT → upload-complete → process). */
export type IfcUploadErrorCode = Tolerant<
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_CONFLICT"
  | "VALIDATION_ERROR"
  | "IFC_UPLOAD_DISABLED"
  | "IFC_UNSUPPORTED_FORMAT"
  | "IFC_UPLOAD_EXPIRED"
  | "IFC_UPLOAD_ATTEMPT_EXPIRED"
  | "IFC_UPLOAD_ALREADY_COMPLETED"
  | "IFC_UPLOAD_IN_PROGRESS"
  | "IFC_UPLOAD_INTENT_NOT_FOUND"
  | "IFC_UPLOAD_INPUT_CONFLICT"
  | "IFC_SOURCE_MISMATCH"
  | "IFC_SOURCE_CHANGED"
  | "IFC_SOURCE_NOT_VERIFIED"
  | "IFC_STORAGE_UNAVAILABLE"
  | "JOB_NOT_CLAIMABLE"
  | "JOB_CONFLICT"
  | "JOB_BUSY"
  | "JOB_TERMINAL"
>;

/** `issueCode` values documented in BE `docs/ifc-qa-codes.md`; others are shown generically. */
export type IfcQaCode = Tolerant<
  | "IFC_NO_BODY_GEOMETRY"
  | "IFC_BODY_NONSTANDARD_CONTEXT"
  | "IFC_NO_SPACES"
  | "IFC_SPACE_UNNAMED"
  | "IFC_EXIT_UNKNOWN"
  | "IFC_NO_FIRE_EQUIPMENT"
  | "IFC_NO_WATER_SOURCE"
  | "IFC_LOW_CONFIDENCE_DEVICE"
  | "IFC_UNMAPPED_MATERIAL"
  | "IFC_EXCESSIVE_VOIDS"
  | "IFC_NOT_ARCHITECTURAL"
  | "IFC_NO_FLOOR_UNDER_SPACE"
  | "IFC_TRIANGLE_BUDGET_EXCEEDED"
  | "IFC_DEFAULT_MASS_PRESENT"
  | "IFC_UNSUPPORTED_FORMAT"
>;

// ───────── editor preview ─────────

/** `EditorPreviewResponse` adds the `fet3d.editor/1` frame fields (null for legacy artifacts). */
export type EditorPreviewDetails = EditorPreview & {
  schemaVersion?: string | null;
  units?: string | null;
  upAxis?: string | null;
  handedness?: string | null;
};

// ───────── equipment candidates (IFC-04) ─────────

/** `EquipmentDecisionView`: the latest saved decision of a candidate. */
export type EquipmentDecisionView = {
  decision: Tolerant<EquipmentDecisionKind>;
  catalogKey: string | null;
  note: string | null;
  decidedBy: string;
  decidedAt: string;
};

/** `EquipmentSuggestionView`: a decision on the same GlobalId in the newest earlier revision, never applied until saved. */
export type EquipmentSuggestionView = {
  decision: Tolerant<EquipmentDecisionKind>;
  catalogKey: string | null;
  fromRevisionId: string;
};

/** Body of `PATCH /api/revisions/{revisionId}/equipment-decisions` (1–500 items). */
export type EquipmentDecisionsRequest = {
  items: Array<{ candidateId: string; decision: EquipmentDecisionKind; catalogKey?: string; note?: string }>;
};

/**
 * Capability ids of the batch-1 runtime catalog (`contracts/editor/v1/fixtures/runtime-catalog.batch1.json`) that a candidate can
 * carry as `catalogKey`. The authoritative list is `GET /api/scenario-interactions/catalog` (capabilities whose objectKinds include
 * `Equipment`).
 */
export const KNOWN_EQUIPMENT_CATALOG_KEYS = [
  "alarm.call_point",
  "alarm.detector",
  "extinguisher.portable",
  "water.sink",
  "water.bath",
  "water.shower",
  "item.towel",
  "door.standard",
  "door.fire",
  "door.exit",
  "transport.elevator",
  "bait.belongings",
  "suppression.sprinkler",
] as const;
export type EquipmentCatalogKey = Tolerant<(typeof KNOWN_EQUIPMENT_CATALOG_KEYS)[number]>;

// ───────── worker contract: building_metadata (fet3d.building/1) ─────────

/** One `interactables[]` row of `contracts/ifc/v1/building-metadata.schema.json`; served as an equipment candidate. */
export type BuildingInteractable = {
  /** Stable id unique in the artifact, e.g. `ifc:<GlobalId>`. */
  id: string;
  /** 22-character IFC GlobalId. */
  ifcGlobalId: string;
  catalogKey: EquipmentCatalogKey;
  source: "ifc" | "inferred";
  ifcClass?: string;
  /** 0–1; below 0.9 the candidate needs confirmation. */
  confidence: number;
  floorId?: string;
  /** [x, y, z] metres in the floor frame. */
  position: [number, number, number];
  /** Degrees around the up axis. */
  rotationY?: number;
  /** [width, depth, height] metres. */
  bbox?: [number, number, number];
};

export type BuildingSpace = {
  ifcGlobalId?: string;
  name?: string | null;
  longName?: string | null;
  category?: string | null;
  storey?: string | null;
  [key: string]: unknown;
};

/** Geometry worker output `artifactType: "building_metadata"`. Only `interactables` is validated field by field by the BE. */
export type BuildingMetadataV1 = {
  schemaVersion: "fet3d.building/1";
  revisionId?: string;
  sources?: Array<{ role?: string; sha256?: string; schema?: string; app?: string; [key: string]: unknown }>;
  units?: string;
  storeys?: Array<Record<string, unknown>>;
  spaces?: BuildingSpace[];
  portals?: Array<Record<string, unknown>>;
  interactables?: BuildingInteractable[];
  materials?: Record<string, { libraryKey?: string; ifcNames?: string[]; [key: string]: unknown }>;
  qaIssues?: Array<Record<string, unknown>>;
};

// ───────── BIM facts ─────────

/** Optional filters of `GET /api/revisions/{id}/bim-facts` and `/bim-facts/elements`. */
export type BimFactFilters = {
  entityType?: string;
  /** 22 characters. */
  ifcGlobalId?: string;
  /** e.g. `SPACE_UNNAMED`. */
  qualityFlag?: string;
};

/** Row of `GET /api/revisions/{id}/bim-facts/elements` (`BimFactElementResponse`): one IfcSpace with its three facts. */
export type BimFactElement = {
  ifcGlobalId: string;
  entityType: string;
  name: unknown;
  longName: unknown;
  category: unknown;
  /** Union of the flags of its facts. */
  qualityFlags: string[];
  sourceHash: string;
  updatedAt: string;
};
export type BimFactElementPage = PageResponse<BimFactElement>;

// ───────── revision style (STYLE-01) ─────────

export type StyleSurface = "floor" | "wall" | "ceiling";

/** Replaces the material of one surface in one room category; room `default` = every room. */
export type StyleOverride = { room: string; surface: StyleSurface; material: string };

/** Body of `PUT /api/revisions/{revisionId}/style` (If-Match required). At most 200 overrides. */
export type RevisionStyleRequest = {
  presetVersionId: string;
  schemeVersionId?: string | null;
  overrides?: StyleOverride[] | null;
};

/** A published StylePreset/ColorScheme Library version as referenced by a selection. */
export type StyleLibraryRef = {
  versionId: string;
  itemId: string;
  code: string;
  name: string;
  versionNumber: number;
  payload: unknown;
};

export type RevisionStyleSelection = {
  preset: StyleLibraryRef | null;
  scheme: StyleLibraryRef | null;
  overrides: StyleOverride[];
  selectedBy: string;
  selectedAt: string;
};

export type RevisionStylePrevious = {
  fromRevisionId: string;
  presetVersionId: string | null;
  schemeVersionId: string | null;
  overrides: StyleOverride[] | null;
};

/** `GET`/`PUT /api/revisions/{revisionId}/style`. `version` is the ETag (0 and `selection: null` before the first save). */
export type RevisionStyleView = {
  revisionId: string;
  version: number;
  selection: RevisionStyleSelection | null;
  previousSelection: RevisionStylePrevious | null;
};

/** Library payload of kind `StylePreset` (BE StyleRules.ValidatePreset). */
export type StylePresetPayload = {
  description?: string;
  /** 1–10, e.g. school, hospital, office, residential. */
  buildingTypes: string[];
  keywords?: string[];
  /** `default` (floor, wall, ceiling) plus up to 50 room categories mapping some surfaces to material keys. */
  materials: Record<string, Partial<Record<StyleSurface, string>>>;
  /** Code of a ColorScheme item. */
  defaultScheme?: string;
};

/** Library payload of kind `ColorScheme` (BE StyleRules.ValidateScheme), colours `#RRGGBB`. */
export type ColorSchemePayload = {
  description?: string;
  colors: { wall: string; accentWall: string; doorWood: string; skirting: string };
};
