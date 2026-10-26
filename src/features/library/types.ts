import type { JsonObject } from "@/features/scenario-editor/store/json";

/*
 * Organization Library as the backend returns it (BE docs/learn-library.md, ContentController `LibraryController`,
 * `library_item_representation` / `library_version_representation`). The endpoints are documented as raw JSON, so every
 * response is read defensively in api.ts.
 */

export const LIBRARY_KINDS = ["ScenarioTemplate", "RubricSample", "Equipment"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const kindLabel: Record<LibraryKind, string> = {
  ScenarioTemplate: "Kịch bản mẫu",
  RubricSample: "Tiêu chí chấm mẫu",
  Equipment: "Thiết bị",
};

export const kindHint: Record<LibraryKind, string> = {
  ScenarioTemplate: "Phần nội dung của kịch bản: tên, mục tiêu, hướng dẫn, thời gian, chế độ, tiêu chí chấm điểm (không gồm vị trí trên mô hình).",
  RubricSample: "Bộ tiêu chí chấm điểm (rubric) mẫu; chỉ số lấy từ danh mục chỉ số của hệ thống.",
  Equipment: "Mô tả và thuộc tính hiển thị của thiết bị. Không thêm tính năng cho ứng dụng.",
};

export const isKind = (value: unknown): value is LibraryKind => (LIBRARY_KINDS as readonly string[]).includes(value as string);

export type VersionStatus = "Draft" | "Published";

/** Row of `versions` inside an item (admins see every version, organizations only Published ones). */
export type LibraryVersionRef = { id: string; versionNumber: number; name: string; status: VersionStatus; revision: number; publishedAt: string | null };

export type LibraryVersion = {
  id: string;
  itemId: string;
  kind: LibraryKind;
  code: string;
  versionNumber: number;
  name: string;
  payload: JsonObject;
  requiredCapabilities: string[];
  payloadHash: string;
  status: VersionStatus;
  publishedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type LibraryItem = {
  id: string;
  kind: LibraryKind;
  code: string;
  isActive: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  latestPublished: LibraryVersion | null;
  versions: LibraryVersionRef[];
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type WithEtag<T> = { data: T; etag: string };

/** Body of `POST /api/admin/library/items/{id}/versions` and `PUT /api/admin/library/versions/{id}`. */
export type VersionInput = { name: string; payload: JsonObject; requiredCapabilities: string[] };

/** Caps from the BE validator (`LibraryContent.Validate`). */
export const LIBRARY_LIMITS = {
  nameMax: 255,
  descriptionMax: 2000,
  capabilitiesMax: 50,
  propertiesMax: 50,
  payloadBytesMax: 262_144,
  codePattern: /^[A-Z0-9][A-Z0-9_-]{0,79}$/,
  capabilityPattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/,
} as const;
