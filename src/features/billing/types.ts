import type { PageResponse } from "@/api/types/common";

/** Billing paginates as `{ items, total, page, pageSize }`; `toPageResponse` adapts it to the shared shape. */
export type BillingPageResponse<T> = { items: T[]; total: number; page: number; pageSize: number };

export function toPageResponse<T>(page: BillingPageResponse<T>): PageResponse<T> {
  return { items: page.items, totalCount: page.total, page: page.page, pageSize: page.pageSize };
}

/** Value + the ETag header of the read that produced it (CORS exposes ETag). */
export type WithEtag<T> = { data: T; etag: string | null };

export type ServicePackage = {
  id: string;
  code: string;
  name: string;
  /** Whole VND per Building per month. */
  unitPrice: number;
  currency: string;
  durationMonths: number;
  isActive: boolean;
  description: string | null;
  revision: number;
};

export type PackageInput = {
  code: string;
  name: string;
  unitPrice: number;
  durationMonths: number;
  isActive: boolean;
  description: string | null;
};

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

export type PurchaseAction = "New" | "Renewal";

export type QuotationItemInput = { buildingId: string; servicePackageId: string; purchaseAction: PurchaseAction };

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
};

/** Header carries totals only; Building/package/duration live in `items` (v6.7 removed them from the header). */
export type Quotation = {
  id: string;
  organizationId: string;
  quotationNumber: string;
  status: QuotationStatus;
  revision: number;
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  discountRuleId: string | null;
  terms: string | null;
  validUntil: string;
  acceptedAt: string | null;
  items: QuotationLine[];
};

export type IssueQuotationInput = { taxAmount: number; terms: string; validUntil: string };

export type EnterpriseRequestInput = {
  requestedBuildingCount: number;
  requestedDurationMonths: number | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  notes: string | null;
};

export type EnterpriseRequest = EnterpriseRequestInput & {
  id: string;
  organizationId: string;
  status: string;
  createdAt: string;
};

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
export type ProvisioningStatus = "NotStarted" | "Pending" | "NeedsReconcile" | "Succeeded" | (string & {});

export type ProvisioningLine = {
  quotationItemId: string;
  buildingId: string;
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

export type Entitlement = {
  id: string;
  buildingId: string;
  status: string;
  /** Server-evaluated: Active lifecycle, active Building/org and inside the UTC period. */
  isEffective: boolean;
  startsAt: string;
  endsAt: string;
  paymentTransactionId: string | null;
};

export type EntitlementFilters = { buildingId?: string; organizationId?: string; page?: number; pageSize?: number };
