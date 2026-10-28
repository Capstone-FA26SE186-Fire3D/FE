import type { PageResponse } from "@/features/organizations/types";

export type BuildingLocationInput = {
  address: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  geojson: string | null;
};

export type BuildingContactInput = {
  contactName: string;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
};

export type BuildingInput = {
  name: string;
  buildingType: string | null;
  totalFloors: number;
  location: BuildingLocationInput | null;
  contact: BuildingContactInput | null;
};

export type BuildingSummary = {
  id: string;
  name: string;
  buildingType: string | null;
  totalFloors: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Building = BuildingSummary & {
  organizationId: string;
  location: (BuildingLocationInput & { id: string }) | null;
  contact: (BuildingContactInput & { id: string }) | null;
};

export type BuildingFilters = {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  /** PlatformAdmin only (required for it). OrganizationUser must NOT send it. */
  organizationId?: string;
};

/** Known values are typed; anything newer from the BE is still accepted and shown as-is. */
type Tolerant<T extends string> = T | (string & {});

export type RevisionStatus = "Draft" | "Uploaded" | "Processing" | "NeedsFix" | "ReadyForScenario" | "ConfirmedForTraining" | "Rejected" | "Failed" | "Superseded";
export type QuarantineStatus = "Pending" | "Accepted" | "Rejected";
export type JobStatus = "Queued" | "Running" | "Succeeded" | "Failed" | "Cancelled";
export type AttemptStatus = "Running" | "Succeeded" | "Failed" | "Expired";
export type ValidationStatus = "Passed" | "Failed";

export type SourceDocument = {
  id: string;
  originalFilename: string;
  fileSizeBytes: number;
  quarantineStatus: Tolerant<QuarantineStatus>;
  createdAt: string;
};

export type BuildingRevision = {
  id: string;
  buildingId: string;
  versionLabel: string;
  status: Tolerant<RevisionStatus>;
  createdAt: string;
  sourceDocument: SourceDocument | null;
};

export type InitiateIfcUploadInput = {
  fileSizeBytes: number;
  originalFilename: string;
  versionLabel: string;
  /** Lowercase hex SHA-256 of the file. BE rejects initiate without it (VALIDATION_ERROR sha256Hash). */
  sha256Hash: string;
};

export type InitiatedIfcUpload = {
  revisionId: string;
  uploadUrl: string;
  objectKey: string;
};

export type FinalizeIfcUploadInput = {
  objectKey: string;
  fileSizeBytes: number;
  mimeType: string;
  sha256Hash: string;
  originalFilename: string;
};

/** ReprocessRequired: an artifact exists but predates the editor contract; no URL or coordinates are returned. */
export type EditorPreviewStatus = Tolerant<"Ready" | "NotReady" | "ReprocessRequired">;

export type EditorPreview = {
  buildingId: string;
  revisionId: string;
  revisionStatus: Tolerant<RevisionStatus>;
  status: EditorPreviewStatus;
  artifactId: string | null;
  attemptId: string | null;
  sha256Hash: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
  coordinateTransform: unknown | null;
  floors: unknown | null;
  semanticMapping: unknown | null;
};

export type ProcessingJob = {
  id: string;
  revisionId: string;
  sourceDocumentId: string;
  scenarioVersionId: string | null;
  kind: string;
  /** `Succeeded` is NOT a QA verdict. */
  status: Tolerant<JobStatus>;
  createdAt: string;
};

export type ProcessingAttempt = {
  id: string;
  attemptNumber: number;
  status: Tolerant<AttemptStatus>;
  toolchainVersion: string;
  startedAt: string;
  finishedAt: string | null;
  outputHash: string | null;
};

export type ProcessingJobDetail = {
  job: ProcessingJob;
  inputHash: string;
  currentAttemptId: string | null;
  currentAttempt: ProcessingAttempt | null;
};

export type ValidationRun = {
  id: string;
  revisionId: string;
  processingJobId: string;
  processingAttemptId: string;
  artifactId: string | null;
  scenarioVersionId: string | null;
  scope: string;
  validatorVersion: string;
  /** Worker result. Read together with the current issues. */
  status: Tolerant<ValidationStatus>;
  summary: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type JobQa = {
  jobId: string;
  currentAttemptId: string | null;
  validationRuns: PageResponse<ValidationRun>;
};

export type IssueSeverity = "Info" | "Warning" | "Error" | "Critical";

export type RevisionIssue = {
  id: string;
  revisionId: string;
  validationRunId: string;
  processingAttemptId: string;
  artifactId: string | null;
  issueCode: string;
  severity: IssueSeverity | (string & {});
  status: string;
  message: string;
  evidence: unknown;
  /** IFC elements the worker reported for this issue (`[]` when none); highlighted in the preview. */
  ifcGlobalIds?: string[] | null;
  isCurrentAttempt: boolean;
  createdAt: string;
};

export type EquipmentDecisionKind = "Confirmed" | "Retyped" | "Rejected";

/** Candidate of `GET /api/revisions/{id}/equipment-candidates` (IFC-04, BE `docs/ifc-equipment-candidates.md`). */
export type EquipmentCandidate = {
  id: string;
  ifcGlobalId: string;
  /** Capability the worker detected (for example `extinguisher.portable`, `door.standard`). */
  catalogKey: string;
  source: "ifc" | "inferred" | (string & {});
  ifcClass?: string | null;
  confidence: number;
  floorId?: string | null;
  position: number[];
  rotationY?: number | null;
  bbox?: number[] | null;
  /** Below confidence 0.9: the worker is not sure. */
  needsConfirmation: boolean;
  decision?: { decision: EquipmentDecisionKind | (string & {}); catalogKey?: string | null; note?: string | null; decidedBy?: string; decidedAt?: string } | null;
  /** The decision on the same GlobalId in the newest earlier revision; never applied until saved. */
  suggestedDecision?: { decision: EquipmentDecisionKind | (string & {}); catalogKey?: string | null; fromRevisionId: string } | null;
};

export type EquipmentCandidates = {
  revisionId: string;
  artifactId?: string | null;
  metadataAvailable: boolean;
  /** Overlay version = ETag (`"0"` before the first save). */
  version: number;
  items: EquipmentCandidate[];
  revisionStatus?: Tolerant<RevisionStatus> | null;
  /** IFC_EXIT_UNKNOWN: the revision stays NeedsFix until an IfcDoor candidate is Confirmed/Retyped as `door.exit`. */
  exitConfirmationRequired?: boolean;
};

export type EquipmentDecisionInput = { candidateId: string; decision: EquipmentDecisionKind; catalogKey?: string; note?: string };

export type RevisionArtifact = {
  id: string;
  revisionId: string;
  jobId: string;
  attemptId: string;
  artifactType: string;
  sha256Hash: string;
  metadata: unknown;
  isRuntimeReady: boolean;
  isCurrentAttempt: boolean;
  createdAt: string;
};

export type ProcessingLog = {
  id: string;
  revisionId: string;
  jobId: string;
  step: string;
  status: string;
  message: string | null;
  durationMs: number | null;
  attemptNumber: number;
  loggedAt: string;
};

export type BimFact = {
  id: string;
  revisionId: string;
  ifcGlobalId: string;
  entityType: string;
  propertyPath: string;
  value: unknown;
  sourceHash: string;
  qualityFlags: unknown;
  createdAt: string;
};

export type AnnotationItem = {
  id: string;
  ifcGlobalId: string;
  label: string;
  note: string | null;
};

export type AnnotationSnapshot = {
  revisionId: string;
  id: string | null;
  /** Version 0 = empty overlay. The next PUT sends If-Match `"<version>"`. */
  version: number;
  data: { items: AnnotationItem[] };
  provenance: string | null;
  createdBy: string | null;
  createdAt: string | null;
  eTag?: string | null;
};

export type ProcessRevisionResult = { jobId: string };
export type RetryJobResult = { jobId: string; outcome: string };

export type ConfirmTrainingInput = {
  scenarioVersionId: string;
  validationRunId: string;
  annotationSetId?: string | null;
};

export type BuildingVisibility = "Private" | "Public";

export type BuildingAccess = {
  buildingId: string;
  visibility: BuildingVisibility | (string & {});
  /** Drives the ETag `"access-<n>"` used in If-Match. */
  accessRevision: number;
  hasParticipationCode: boolean;
  /** Present ONLY in the rotate response. Never fetched again; show once. */
  code?: string | null;
};

export type ScenarioVersionSummary = {
  id: string;
  scenarioId: string;
  revisionId: string;
  buildingId: string;
  organizationId: string;
  versionNumber: number;
  name: string;
  schemaVersion: string;
  algorithmVersion: string;
  timeLimitSeconds: number;
  scenarioHash: string;
  createdAt: string;
  /** BE default "NotSubmitted"; missing on deployments older than BE#52. */
  reviewStatus?: "NotSubmitted" | "Submitted" | "Approved" | "Rejected" | (string & {});
  reviewId?: string | null;
  rejectReason?: string | null;
};

export type BuildingPage = PageResponse<BuildingSummary>;
export type RevisionPage = PageResponse<BuildingRevision>;
export type ProcessingJobPage = PageResponse<ProcessingJob>;
export type RevisionIssuePage = PageResponse<RevisionIssue>;
export type BimFactPage = PageResponse<BimFact>;
export type RevisionArtifactPage = PageResponse<RevisionArtifact>;
export type ProcessingLogPage = PageResponse<ProcessingLog>;
export type ScenarioVersionPage = PageResponse<ScenarioVersionSummary>;

/** A Building read or write together with its `ETag` (`"<number>"`); PUT/DELETE must send it back as If-Match. */
export type VersionedBuilding<T = Building> = { data: T; etag: string | null };
