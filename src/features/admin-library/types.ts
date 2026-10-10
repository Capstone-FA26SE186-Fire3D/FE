/*
 * Organization Library model from Docs v7 schema (organization_library_items / organization_library_versions).
 * THERE IS NO LIBRARY API OR ROUTE YET (BE#57; Docs define tables only). This is the target shape.
 */
export type LibraryKind = "ScenarioTemplate" | "RubricSample" | "Equipment";

export const libraryKindLabel: Record<LibraryKind, string> = {
  ScenarioTemplate: "Template kịch bản",
  RubricSample: "Rubric mẫu",
  Equipment: "Thiết bị hỗ trợ",
};

export type LibraryVersion = {
  id: string;
  versionNumber: number;
  name: string;
  /** Free-form object per kind (objectives/instructions, criteria, device metadata). */
  description: string;
  /** Equipment: which runtime capability the device relies on. Must already exist in the runtime catalog. */
  requiredCapabilities: string[];
  publishedAt: string | null;
  createdAt: string;
};

export type LibraryItem = {
  id: string;
  kind: LibraryKind;
  code: string;
  isActive: boolean;
  versions: LibraryVersion[];
};

export type LibraryVersionInput = { name: string; description: string; requiredCapabilities: string[] };
export type NewItemInput = LibraryVersionInput & { kind: LibraryKind; code: string };
