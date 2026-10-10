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
};

export type Building = BuildingSummary & {
  organizationId: string;
  updatedAt: string;
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

export type SourceDocument = {
  id: string;
  originalFilename: string;
  fileSizeBytes: number;
  quarantineStatus: string;
  createdAt: string;
};

export type BuildingRevision = {
  id: string;
  buildingId: string;
  versionLabel: string;
  status: string;
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

export type EditorPreviewStatus = "Ready" | "NotReady" | (string & {});

export type EditorPreview = {
  buildingId: string;
  revisionId: string;
  revisionStatus: string;
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
  /** Queued | Running | Succeeded | Failed | Cancelled. `Succeeded` is NOT a QA verdict. */
  status: string;
  createdAt: string;
};

export type ProcessingAttempt = {
  id: string;
  attemptNumber: number;
  /** Running | Succeeded | Failed | Expired */
  status: string;
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
  /** Worker result (Passed | Failed | …). Read together with the current issues. */
  status: string;
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
  isCurrentAttempt: boolean;
  createdAt: string;
};

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
};

export type BuildingPage = PageResponse<BuildingSummary>;
export type RevisionPage = PageResponse<BuildingRevision>;
export type ProcessingJobPage = PageResponse<ProcessingJob>;
export type RevisionIssuePage = PageResponse<RevisionIssue>;
export type BimFactPage = PageResponse<BimFact>;
export type RevisionArtifactPage = PageResponse<RevisionArtifact>;
export type ProcessingLogPage = PageResponse<ProcessingLog>;
export type ScenarioVersionPage = PageResponse<ScenarioVersionSummary>;
