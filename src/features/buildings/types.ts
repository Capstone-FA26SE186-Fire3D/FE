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

export type EditorPreview = {
  buildingId: string;
  revisionId: string;
  revisionStatus: string;
  status: string;
  artifactId: string | null;
  attemptId: string | null;
  sha256Hash: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
  coordinateTransform: unknown | null;
  floors: unknown | null;
  semanticMapping: unknown | null;
};

export type BuildingPage = PageResponse<BuildingSummary>;
export type RevisionPage = PageResponse<BuildingRevision>;
