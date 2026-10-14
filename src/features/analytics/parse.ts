import { OUTCOMES, type AiUsage, type OperationsReport, type Outcome, type QuotaAmount, type RevenueReport, type TrainingReport } from "./types";

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const asList = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
/** Rates and averages without samples arrive as null; keep that distinct from 0. */
const asNullable = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const asText = (value: unknown, fallback = "") => (typeof value === "string" && value ? value : fallback);

function definitions(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function identity(value: unknown) {
  return isRecord(value) && typeof value.id === "string" ? { id: value.id, name: asText(value.name, "Tổ chức"), isActive: value.isActive !== false } : null;
}

function head(payload: Raw) {
  return { asOf: asText(payload.asOf), from: asText(payload.from), to: asText(payload.to), definitions: definitions(payload.definitions) };
}

function expectObject(payload: unknown, name: string): Raw {
  if (!isRecord(payload)) throw new TypeError(`${name} response is not an object.`);
  return payload;
}

const quota = (value: unknown): QuotaAmount[] => asList(value).map((item) => ({ quotaUnit: asText(item.quotaUnit, "đơn vị"), units: asNumber(item.units) }));

function aiUsage(value: unknown): AiUsage | null {
  if (!isRecord(value)) return null;
  const reconcile = isRecord(value.needsReconcile) ? value.needsReconcile : {};
  const requests = isRecord(value.requests) ? Object.fromEntries(Object.entries(value.requests).map(([status, count]) => [status, asNumber(count)])) : {};
  return { settledUnits: quota(value.settledUnits), openReservations: quota(value.openReservations), needsReconcile: { requests: asNumber(reconcile.requests), reservedUnits: asNumber(reconcile.reservedUnits) }, requests };
}

export function parseTraining(payload: unknown): TrainingReport {
  const raw = expectObject(payload, "Training analytics");
  // A body without the headline counters is not a training report (proxy page, wrong route): fail instead of showing zeros.
  if (typeof raw.plays !== "number" || typeof raw.uniqueTrainees !== "number") throw new TypeError("Training analytics response has no plays.");
  const outcomes = isRecord(raw.outcomes) ? raw.outcomes : {};
  const assessment = isRecord(raw.assessment) ? raw.assessment : {};
  const duration = isRecord(raw.duration) ? raw.duration : {};
  return {
    ...head(raw),
    activeWindowSeconds: asNullable(raw.activeWindowSeconds),
    plays: raw.plays,
    uniqueTrainees: raw.uniqueTrainees,
    completed: asNumber(raw.completed),
    completionRate: asNullable(raw.completionRate),
    activeSessions: asNumber(raw.activeSessions),
    outcomes: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, asNumber(outcomes[outcome])])) as Record<Outcome, number>,
    assessment: { assessed: asNumber(assessment.assessed), passed: asNumber(assessment.passed), passRate: asNullable(assessment.passRate) },
    duration: { sessions: asNumber(duration.sessions), averageSeconds: asNullable(duration.averageSeconds), medianSeconds: asNullable(duration.medianSeconds) },
    byMode: asList(raw.byMode).map((item) => ({ mode: asText(item.mode, "Không rõ"), plays: asNumber(item.plays), completed: asNumber(item.completed) })),
    byTraining: asList(raw.byTraining).map((item) => ({ trainingId: asText(item.trainingId, "—"), plays: asNumber(item.plays), completed: asNumber(item.completed), passed: asNumber(item.passed) })),
    byOrganization: Array.isArray(raw.byOrganization) ? asList(raw.byOrganization).map((item) => ({ organizationId: asText(item.organizationId, "—"), plays: asNumber(item.plays), uniqueTrainees: asNumber(item.uniqueTrainees), completed: asNumber(item.completed) })) : null,
    organization: identity(raw.organization),
    aiUsage: aiUsage(raw.aiUsage),
  };
}

const money = (item: Raw) => ({ currency: asText(item.currency, "—"), amount: asNumber(item.amount), transactions: asNumber(item.transactions) });

export function parseRevenue(payload: unknown): RevenueReport {
  const raw = expectObject(payload, "Revenue analytics");
  if (!Array.isArray(raw.totals)) throw new TypeError("Revenue analytics response has no totals.");
  return {
    ...head(raw),
    totals: asList(raw.totals).map(money),
    byPurpose: asList(raw.byPurpose).map((item) => ({ ...money(item), purpose: asText(item.purpose, "Unknown") })),
    byDay: asList(raw.byDay).map((item) => ({ ...money(item), date: asText(item.date) })).filter((item) => item.date),
    payingOrganizations: asNumber(raw.payingOrganizations),
  };
}

/** `{isActive,count}` is the documented shape; `{key,count}` is the older serialization of buildings (BE#59). */
function lifecycle(value: unknown) {
  return asList(value).flatMap((item) => {
    const active = item.isActive ?? item.key;
    return typeof active === "boolean" ? [{ isActive: active, count: asNumber(item.count) }] : [];
  });
}

export function parseOperations(payload: unknown): OperationsReport {
  const raw = expectObject(payload, "Operations analytics");
  const jobs = Array.isArray(raw.processingJobs) ? raw.processingJobs : raw.ifcJobs; // `ifcJobs` is the pre-rename field.
  const created = isRecord(raw.created) ? Object.fromEntries(Object.entries(raw.created).map(([key, count]) => [key, asNumber(count)])) : {};
  return {
    ...head(raw),
    organization: identity(raw.organization),
    accounts: Array.isArray(raw.accounts) ? asList(raw.accounts).map((item) => ({ role: asText(item.role, "Không rõ"), isActive: item.isActive !== false, count: asNumber(item.count) })) : null,
    organizations: Array.isArray(raw.organizations) ? lifecycle(raw.organizations) : null,
    buildings: lifecycle(raw.buildings),
    processingJobs: asList(jobs).map((item) => ({ kind: asText(item.kind, "Không rõ"), status: asText(item.status, "Không rõ"), count: asNumber(item.count) })),
    tickets: asList(raw.tickets).map((item) => ({ status: asText(item.status, "Không rõ"), count: asNumber(item.count) })),
    created,
  };
}
