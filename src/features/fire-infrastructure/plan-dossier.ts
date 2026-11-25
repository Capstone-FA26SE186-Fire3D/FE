import { apiClient } from "@/api/client";
import type { EmergencyContact, OnSiteForce } from "@/features/buildings/types";

/**
 * `GET /api/buildings/{id}/plan-dossier` (BE#215, `docs/plan-dossier.md`): the Building's plan in the order of Mẫu PC06, built on
 * its newest Approved fire infrastructure. Read-only; a reference view, never the signed plan.
 */
export type DossierItem = { id?: string; label?: string; placement?: { floorId?: string }; capability?: { id?: string } };
export type DossierScenario = {
  number: number; scenarioId: string; scenarioName: string; scenarioVersionId: string; versionNumber: number;
  audience: string | null; assumption: { time?: string; location?: string; cause?: string; peoplePresent?: number } | null; workingHours: string | null;
  reviewStatus: "NotSubmitted" | "Submitted" | "Approved" | "Rejected" | string; reviewedAt: string | null;
};
export type PlanDossier = {
  buildingId: string;
  generatedAt: string;
  signedPlanDocumentId: string | null;
  header: { name: string; address: string | null; phone: string | null; year: number };
  siteLayout: { revisionId: string; infrastructureId: string; infrastructureVersion: number; exits: DossierItem[]; assemblyPoints: DossierItem[] } | null;
  facility: { name: string; facilityHeadName: string | null; facilityHeadPhone: string | null; onSiteForce: OnSiteForce | null; emergencyContacts: EmergencyContact[]; equipment: Array<{ catalogKey: string; count: number }>; waterSources: DossierItem[] };
  hazard: { buildingType: string | null; riskGroup?: string | null; totalFloors: number; floorAreaSquareMeters: number | null };
  scenarios: DossierScenario[];
  coverage: { inHours: boolean; offHours: boolean; complete?: boolean };
  history: Array<{ id: string; version: number; status: string; submittedAt: string | null; decidedAt: string | null }>;
};

export const planDossierApi = {
  get: (accessToken: string, buildingId: string, signal?: AbortSignal) =>
    apiClient.request<PlanDossier>(`/api/buildings/${encodeURIComponent(buildingId)}/plan-dossier`, { headers: { Authorization: `Bearer ${accessToken}` }, signal }),
};

export const REVIEW_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  NotSubmitted: { label: "Chưa gửi thẩm định", tone: "neutral" },
  Submitted: { label: "Chờ thẩm định", tone: "info" },
  Approved: { label: "Đạt thẩm định", tone: "success" },
  Rejected: { label: "Chưa đạt thẩm định", tone: "danger" },
};

/** What still blocks publishing on this infrastructure (FR-PLAN-07), in plain words; null when both are covered. */
export function coverageGap(coverage: { inHours: boolean; offHours: boolean }): string | null {
  if (coverage.inHours && coverage.offHours) return null;
  if (!coverage.inHours && !coverage.offHours) return "Chưa có tình huống nào đạt thẩm định. Cần ít nhất một tình huống trong giờ và một tình huống ngoài giờ làm việc trước khi phát hành.";
  return `Còn thiếu một tình huống ${coverage.inHours ? "ngoài giờ" : "trong giờ"} làm việc đạt thẩm định trước khi phát hành.`;
}
