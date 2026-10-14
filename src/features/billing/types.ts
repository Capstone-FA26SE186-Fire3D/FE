import { normalizePage } from "@/api/pagination";
import type { PageResponse } from "@/api/types/common";

/** Billing paginates as `{ items, total, page, pageSize }`; `toPageResponse` adapts it to the shared shape. */
export type BillingPageResponse<T> = { items: T[]; total: number; page: number; pageSize: number };

export function toPageResponse<T>(page: BillingPageResponse<T>): PageResponse<T> {
  return normalizePage(page);
}

/** Value + the ETag header of the read that produced it (CORS exposes ETag). */
export type WithEtag<T> = { data: T; etag: string | null };

// ---------------------------------------------------------------------------------------------------------------------
// Catalog (OpenAPI: PackageResponse, DiscountResponse, QuotaPolicyResponse)
// ---------------------------------------------------------------------------------------------------------------------

export type ServicePackage = {
  id: string;
  code: string;
  name: string;
  /** Whole VND per Building per month (`pricingBasis: "Monthly"`). */
  unitPrice: number;
  currency: string;
  /** 6 or 12 for v7 packages. */
  durationMonths: number;
  isActive: boolean;
  description: string | null;
  revision: number;
  /** 1 = legacy (no capacity/quota, never purchasable); 7 = v7 snapshot fields below are set. */
  commercialVersion?: number;
  /** Trainees that may take a first online start per Building and service period. */
  learnerLimit?: number | null;
  /** Prepaid organization AI quota granted by this package; the unit comes from the policy. */
  aiQuotaUnits?: number | null;
  aiPolicyVersionId?: string | null;
  pricingBasis?: string;
  /** Server verdict: complete v7 configuration. Legacy or partial packages are not sold. */
  isPurchasable?: boolean;
};

export type PackageInput = {
  code: string;
  name: string;
  unitPrice: number;
  durationMonths: number;
  isActive: boolean;
  description: string | null;
  learnerLimit: number | null;
  aiQuotaUnits: number | null;
  aiPolicyVersionId: string | null;
};

/** Immutable policy version: a change is a new version, never an edit. */
export type QuotaPolicy = {
  id: string;
  audience: string;
  policyKind: string;
  quotaUnit: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  rollover: string;
};

export type QuotaPolicyInput = { quotaUnit: string; effectiveFrom: string; effectiveUntil: string | null };

export type DiscountKind = "Percent" | "Fixed";

export type DiscountRule = {
  id: string;
  code: string;
  discountKind: DiscountKind;
  discountValue: number;
  minimumBuildings: number;
  validFrom: string;
  validUntil: string | null;
  servicePackageId: string | null;
  minimumDurationMonths: number | null;
  isActive: boolean;
  revision: number;
};

export type DiscountInput = {
  code: string;
  discountKind: DiscountKind;
  discountValue: number;
  minimumBuildings: number;
  /** ISO 8601 with a timezone designator (BE rejects timestamps without one). */
  validFrom: string;
  validUntil: string | null;
  servicePackageId: string | null;
  minimumDurationMonths: number | null;
  isActive: boolean;
};

// ---------------------------------------------------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------------------------------------------------

/** `Upgrade` raises the learner limit of the Building's current paid entitlement (same period, seats kept). */
export type PurchaseAction = "New" | "Renewal" | "Upgrade";

export type QuotationPurpose = "BuildingService" | "AIQuotaTopUp";

export type QuotationItemInput = { buildingId: string; servicePackageId: string; purchaseAction: PurchaseAction; upgradeEntitlementId?: string };

/** Draft create/replace body: Building lines, or a top-up request (no lines). */
export type QuotationDraftInput =
  | { items: QuotationItemInput[] }
  | { purpose: "AIQuotaTopUp"; topUp: { requestedQuotaUnits: number | null } };

export type QuotationStatus = "Draft" | "Issued" | "Accepted" | "Expired" | "Cancelled";

export type QuotationLine = {
  id: string;
  buildingId: string;
  servicePackageId: string;
  purchaseAction: PurchaseAction;
  durationMonths: number;
  buildingName: string;
  buildingAddress: string;
  packageName: string;
  unitPrice: number;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  commercialVersion?: number;
  packageRevision?: number | null;
  /** Snapshot: learner capacity per period (for Upgrade, the limit after the upgrade once issued). */
  learnerLimit?: number | null;
  /** Snapshot: AI quota bundled with this line and its unit/policy. */
  aiQuotaUnits?: number | null;
  aiPolicyVersionId?: string | null;
  aiQuotaUnit?: string | null;
  /** Fixed UTC service period (Upgrade: effective time to the entitlement end). */
  startsAt?: string | null;
  endsAt?: string | null;
  /** `Monthly` (New/Renewal: unitPrice x months) or `OneTime` (Upgrade fee fixed at Issue). */
  pricingBasis?: string;
  upgradeEntitlementId?: string | null;
  upgradeBaseCapacityRevision?: number | null;
  upgradePreviousLearnerLimit?: number | null;
};

export type TopUpLine = {
  id: string;
  /** What the organization asked for; Admin fixes the final units/amount/interval at Issue. */
  requestedQuotaUnits: number | null;
  policyVersionId: string | null;
  quotaUnit: string | null;
  quotaUnits: number | null;
  amount: number | null;
  startsAt: string | null;
  endsAt: string | null;
};

/** Estimated = Draft total before tax; Final = tax fixed at Issue; LegacyUnknown = tax never proven. */
export type PricingStatus = "Estimated" | "Final" | "LegacyUnknown" | (string & {});

/** Header carries totals only; Building/package/duration live in `items` (top-up: in `topUp`). */
export type Quotation = {
  id: string;
  organizationId: string;
  quotationNumber: string;
  status: QuotationStatus;
  revision: number;
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  /** Null while the price is an estimate or legacy-unknown: never shown as an approved 0. */
  taxAmount: number | null;
  totalAmount: number;
  discountRuleId: string | null;
  terms: string | null;
  validUntil: string;
  acceptedAt: string | null;
  items: QuotationLine[];
  commercialVersion?: number;
  purpose?: QuotationPurpose | (string & {});
  topUp?: TopUpLine | null;
  pricingStatus?: PricingStatus | null;
  issuedAt?: string | null;
};

/** Admin issue: one entry per Building line (OpenAPI `QuotationPeriodRequest`). */
export type IssuePeriodInput = {
  quotationItemId: string;
  startsAt?: string | null;
  /** Upgrade only. */
  learnerLimit?: number | null;
  additionalQuotaUnits?: number | null;
  aiPolicyVersionId?: string | null;
  /** Upgrade only: whole-VND one-time fee, fixed by Admin (no prorata from the monthly price). */
  oneTimePrice?: number | null;
};

export type IssueTopUpInput = { policyVersionId: string; quotaUnits: number; amount: number; startsAt: string; endsAt: string };

export type IssueQuotationInput = {
  taxAmount: number;
  terms: string;
  validUntil: string;
  items?: IssuePeriodInput[];
  topUp?: IssueTopUpInput;
};

// ---------------------------------------------------------------------------------------------------------------------
// Enterprise requests
// ---------------------------------------------------------------------------------------------------------------------

export type EnterpriseRequestInput = {
  requestedBuildingCount: number;
  requestedDurationMonths: number | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  notes: string | null;
};

/** New -> Contacted -> Quoted, plus Rejected/Cancelled and terminal Closed. `Quoted` only comes from creating a quotation. */
export type EnterpriseStatus = "New" | "Contacted" | "Quoted" | "Rejected" | "Cancelled" | "Closed" | (string & {});

export type EnterpriseRequest = EnterpriseRequestInput & {
  id: string;
  organizationId: string;
  status: EnterpriseStatus;
  createdAt: string;
  revision?: number;
  quotationId?: string | null;
  /** Internal assignee: only PlatformAdmin receives it (null for organizations). */
  assignedTo?: string | null;
  closedAt?: string | null;
  /** Internal: only PlatformAdmin receives it. */
  closeReason?: string | null;
};

export type EnterpriseStatusInput = { status?: "Contacted" | "Rejected" | "Cancelled"; assignedTo?: string; clearAssignment?: boolean };

export type EnterpriseResponse = { id: string; requestId: string; authorId: string; authorName: string | null; message: string; createdAt: string };

// ---------------------------------------------------------------------------------------------------------------------
// Checkout / payment / provisioning (three separate states)
// ---------------------------------------------------------------------------------------------------------------------

/** Checkout operation lifecycle (BE strings). `Completed` means paid; navigation back from PayOS never sets it. */
export type CheckoutStatus = "Creating" | "Ready" | "NeedsReconcile" | "Cancelled" | "Expired" | "Completed" | "Failed" | (string & {});

export type PayosCheckout = {
  checkoutId: string;
  quotationId: string;
  /** Null until the PayOS link is bound; only then are `checkoutUrl`/`qrCode` present. */
  paymentRequestId: string | null;
  orderCode: number;
  amount: number;
  currency: string;
  checkoutStatus: CheckoutStatus;
  checkoutUrl: string | null;
  qrCode: string | null;
  expiresAt: string;
  errorCode: string | null;
};

export type PaymentStatus = "Pending" | "Paid" | "Expired" | "Cancelled" | "Failed" | (string & {});
/** `Partial` = some lines succeeded, others did not yet (still money received). */
export type ProvisioningStatus = "NotStarted" | "Pending" | "Partial" | "NeedsReconcile" | "Succeeded" | (string & {});

export type ProvisioningLine = {
  quotationItemId: string;
  /** Null for the AI top-up line (it has no Building). */
  buildingId: string | null;
  status: ProvisioningStatus;
  entitlementId: string | null;
  errorCode: string | null;
};

export type PayosPayment = {
  id: string;
  quotationId: string;
  orderCode: number;
  amount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  transactionId: string | null;
  transactionStatus: string | null;
  provisioningStatus: ProvisioningStatus;
  items: ProvisioningLine[];
};

/** One row of the checkout/payment ledger (`/api/admin/payments/payos/{checkouts,requests}`, `/quotations/{id}/checkouts`). */
export type PayosLedgerItem = {
  checkoutId: string | null;
  checkoutStatus: CheckoutStatus | null;
  checkoutError: string | null;
  quotationId: string;
  quotationNumber: string;
  organizationId: string;
  purpose: QuotationPurpose | (string & {});
  paymentRequestId: string | null;
  paymentStatus: PaymentStatus | null;
  transactionId: string | null;
  transactionStatus: string | null;
  amount: number;
  currency: string;
  provisioningStatus: ProvisioningStatus;
  provisioningLines: number;
  provisioningSucceeded: number;
  createdAt: string;
  paidAt: string | null;
};

export type LedgerFilters = {
  organizationId?: string;
  quotationId?: string;
  status?: string;
  /** ISO 8601 with a timezone designator; `[from, to)` on creation time. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

// ---------------------------------------------------------------------------------------------------------------------
// Entitlements, seats, AI quota, notifications
// ---------------------------------------------------------------------------------------------------------------------

export type Entitlement = {
  id: string;
  buildingId: string;
  status: string;
  /** Server-evaluated: Active lifecycle, active Building/org and inside the UTC period. */
  isEffective: boolean;
  startsAt: string;
  endsAt: string;
  paymentTransactionId: string | null;
  commercialVersion?: number;
  /** Base learner limit; the effective limit (with upgrades) comes from `service-entitlement`. */
  learnerLimit?: number | null;
};

export type EntitlementFilters = { buildingId?: string; organizationId?: string; page?: number; pageSize?: number };

export type EntitlementUpgrade = {
  id: string;
  capacityRevision: number;
  previousLearnerLimit: number;
  learnerLimit: number;
  additionalQuotaUnits: number;
  effectiveFrom: string;
  createdAt: string;
};

export type ServiceEntitlementView = {
  entitlementId: string;
  buildingId: string;
  organizationId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  isEffective: boolean;
  commercialVersion: number;
  baseLearnerLimit: number | null;
  /** Limit at `asOf` (or at the start for an upcoming period), including upgrades. */
  effectiveLearnerLimit: number | null;
  capacityRevision: number;
  /** Distinct Trainees with a first online start in this period. */
  seatsUsed: number;
  seatsRemaining: number | null;
  upgrades: EntitlementUpgrade[];
};

export type BuildingServiceEntitlement = {
  buildingId: string;
  asOf: string;
  current: ServiceEntitlementView | null;
  upcoming: ServiceEntitlementView[];
};

/** Quota units never combine: one balance per unit. `available = granted - reserved - consumed`. */
export type AiQuotaUnitBalance = {
  quotaUnit: string;
  granted: number;
  reserved: number;
  consumed: number;
  expired: number;
  available: number;
  scheduled: number;
};

export type AiQuotaBalance = { organizationId: string; asOf: string; units: AiQuotaUnitBalance[] };

export type AiQuotaGrantSource = "BuildingService" | "Upgrade" | "TopUp" | (string & {});

export type AiQuotaGrant = {
  id: string;
  sourceKind: AiQuotaGrantSource;
  quotaUnit: string;
  quotaUnits: number;
  startsAt: string;
  endsAt: string;
  /** Scheduled | Active | Expired. */
  status: string;
  reserved: number;
  consumed: number;
  available: number;
  entitlementId: string | null;
  buildingId: string | null;
  paymentTransactionId: string;
  policyVersionId: string;
  createdAt: string;
};

export type AiUsageEntry = {
  allocationId: string;
  requestId: string;
  grantId: string;
  quotaUnit: string;
  reservedUnits: number;
  consumedUnits: number | null;
  /** Reserved | Settled | Released. */
  status: string;
  createdAt: string;
  settledAt: string | null;
};

export type OrganizationNotification = {
  id: string;
  /** `BuildingServiceExpiring`. */
  type: string;
  title: string;
  body: string;
  buildingId: string;
  buildingName: string | null;
  entitlementId: string;
  referenceEndsAt: string;
  createdAt: string;
  readAt: string | null;
  /** False once the Building was renewed or the period ended; the history stays. */
  stillRelevant: boolean;
};

export type NotificationFilters = { unread?: boolean; type?: string; page?: number; pageSize?: number };
