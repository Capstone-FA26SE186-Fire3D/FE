import { apiClient } from "@/api/client";
import type { PageResponse } from "@/api/types/common";

import { billingEtag } from "./format";
import {
  toPageResponse,
  type AiQuotaBalance,
  type AiQuotaGrant,
  type AiUsageEntry,
  type BillingPageResponse,
  type BuildingServiceEntitlement,
  type DiscountInput,
  type DiscountRule,
  type Entitlement,
  type EntitlementFilters,
  type EnterpriseRequest,
  type EnterpriseRequestInput,
  type EnterpriseResponse,
  type EnterpriseStatusInput,
  type IssueQuotationInput,
  type LedgerFilters,
  type NotificationFilters,
  type OrganizationNotification,
  type PackageInput,
  type PayosCheckout,
  type PayosLedgerItem,
  type PayosPayment,
  type QuotaPolicy,
  type QuotaPolicyInput,
  type Quotation,
  type QuotationDraftInput,
  type QuotationItemInput,
  type ServicePackage,
  type WithEtag,
} from "./types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Header ETag from the read, else the one BE would issue for that revision (same format). */
function etagOf(responseHeaders: Headers, id: string, revision: number) {
  return responseHeaders.get("ETag") ?? billingEtag(id, revision);
}

export type CheckoutResult = { checkout: PayosCheckout; httpStatus: number };
export type QuotationScope = "organization" | "admin";
export type LedgerKind = "checkouts" | "requests";

/**
 * Billing v7 client, one method per OpenAPI operation. `Idempotency-Key` is mandatory for quotation create/cancel,
 * enterprise create/response/close/quotation, PayOS create and cancel; `If-Match` for every PATCH/issue/accept/cancel/close.
 */
export const billingApi = {
  /** OrganizationUser sees active packages; PlatformAdmin also sees inactive ones. */
  listPackages(accessToken: string, signal?: AbortSignal) {
    return apiClient.request<ServicePackage[]>("/api/billing/service-packages", { headers: headers(accessToken), signal });
  },
  async getPackage(accessToken: string, id: string): Promise<WithEtag<ServicePackage>> {
    const response = await apiClient.requestWithMeta<ServicePackage>(`/api/billing/service-packages/${id}`, { headers: headers(accessToken) });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  createPackage(accessToken: string, input: PackageInput) {
    return apiClient.request<ServicePackage>("/api/admin/service-packages", { headers: headers(accessToken), json: input });
  },
  /** PATCH replaces every editable field and needs the current ETag (If-Match). */
  updatePackage(accessToken: string, id: string, input: PackageInput, etag: string) {
    return apiClient.request<ServicePackage>(`/api/admin/service-packages/${id}`, { headers: headers(accessToken), json: input, method: "PATCH", ifMatch: etag });
  },

  /** Quota policy versions are immutable (no PATCH, no ETag): a change is a new version. */
  async listQuotaPolicies(accessToken: string, page: number, pageSize: number, signal?: AbortSignal): Promise<PageResponse<QuotaPolicy>> {
    return toPageResponse(await apiClient.request<BillingPageResponse<QuotaPolicy>>("/api/admin/billing/quota-policies", { headers: headers(accessToken), query: { page, pageSize }, signal }));
  },
  createQuotaPolicy(accessToken: string, input: QuotaPolicyInput) {
    return apiClient.request<QuotaPolicy>("/api/admin/billing/quota-policies", { headers: headers(accessToken), json: input });
  },

  listDiscounts(accessToken: string, signal?: AbortSignal) {
    return apiClient.request<DiscountRule[]>("/api/admin/discount-rules", { headers: headers(accessToken), signal });
  },
  async getDiscount(accessToken: string, id: string): Promise<WithEtag<DiscountRule>> {
    const response = await apiClient.requestWithMeta<DiscountRule>(`/api/admin/discount-rules/${id}`, { headers: headers(accessToken) });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  createDiscount(accessToken: string, input: DiscountInput) {
    return apiClient.request<DiscountRule>("/api/admin/discount-rules", { headers: headers(accessToken), json: input });
  },
  updateDiscount(accessToken: string, id: string, input: DiscountInput, etag: string) {
    return apiClient.request<DiscountRule>(`/api/admin/discount-rules/${id}`, { headers: headers(accessToken), json: input, method: "PATCH", ifMatch: etag });
  },

  /** Creates a Draft; the server prices every line and returns the snapshot. 201, or the original response on replay. */
  async createQuotation(accessToken: string, input: QuotationItemInput[] | QuotationDraftInput, idempotencyKey: string): Promise<WithEtag<Quotation>> {
    const body = Array.isArray(input) ? { items: input } : input;
    const response = await apiClient.requestWithMeta<Quotation>("/api/billing/quotations", { headers: headers(accessToken), json: body, idempotencyKey });
    return { data: response.data, etag: etagOf(response.headers, response.data.id, response.data.revision) };
  },
  async listQuotations(accessToken: string, page: number, pageSize: number, signal?: AbortSignal): Promise<PageResponse<Quotation>> {
    return toPageResponse(await apiClient.request<BillingPageResponse<Quotation>>("/api/billing/quotations", { headers: headers(accessToken), query: { page, pageSize }, signal }));
  },
  async getQuotation(accessToken: string, id: string, signal?: AbortSignal): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>(`/api/billing/quotations/${id}`, { headers: headers(accessToken), signal });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  async updateDraft(accessToken: string, id: string, input: QuotationItemInput[] | QuotationDraftInput, etag: string): Promise<WithEtag<Quotation>> {
    const body = Array.isArray(input) ? { items: input } : input;
    const response = await apiClient.requestWithMeta<Quotation>(`/api/billing/quotations/${id}`, { headers: headers(accessToken), json: body, method: "PATCH", ifMatch: etag });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  /** PlatformAdmin freezes the Draft snapshot: explicit tax, terms, future expiry and (per line / top-up) the fixed periods. */
  async issueQuotation(accessToken: string, id: string, input: IssueQuotationInput, etag: string): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>(`/api/admin/quotations/${id}/issue`, { headers: headers(accessToken), json: input, ifMatch: etag });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  /** 409 once past `validUntil` or no longer Issued. Acceptance does not charge or grant service. */
  async acceptQuotation(accessToken: string, id: string, etag: string): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>(`/api/billing/quotations/${id}/accept`, { headers: headers(accessToken), method: "POST", ifMatch: etag });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  /**
   * Both sides can cancel a Draft/Issued/Accepted quotation with a reason. 409 `QUOTATION_ALREADY_PAID` once paid and
   * `QUOTATION_CHECKOUT_UNRESOLVED` while a checkout may still hold a live provider link. Same key + input replays.
   */
  async cancelQuotation(accessToken: string, scope: QuotationScope, id: string, reason: string, etag: string, idempotencyKey: string): Promise<WithEtag<Quotation>> {
    const path = scope === "admin" ? `/api/admin/quotations/${id}/cancel` : `/api/billing/quotations/${id}/cancel`;
    const response = await apiClient.requestWithMeta<Quotation>(path, { headers: headers(accessToken), json: { reason }, method: "POST", ifMatch: etag, idempotencyKey });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  /** Checkout history of one quotation (newest first): how a reload finds the checkout it left for. */
  async listQuotationCheckouts(accessToken: string, quotationId: string, page = 1, pageSize = 20, signal?: AbortSignal): Promise<PageResponse<PayosLedgerItem>> {
    return toPageResponse(await apiClient.request<BillingPageResponse<PayosLedgerItem>>(`/api/billing/quotations/${quotationId}/checkouts`, { headers: headers(accessToken), query: { page, pageSize }, signal }));
  },

  createEnterpriseRequest(accessToken: string, input: EnterpriseRequestInput, idempotencyKey: string) {
    return apiClient.request<EnterpriseRequest>("/api/billing/enterprise-quote-requests", { headers: headers(accessToken), json: input, idempotencyKey });
  },
  async listEnterpriseRequests(accessToken: string, page: number, pageSize: number, scope: "mine" | "admin", signal?: AbortSignal): Promise<PageResponse<EnterpriseRequest>> {
    const path = scope === "admin" ? "/api/admin/enterprise-quote-requests" : "/api/billing/enterprise-quote-requests";
    return toPageResponse(await apiClient.request<BillingPageResponse<EnterpriseRequest>>(path, { headers: headers(accessToken), query: { page, pageSize }, signal }));
  },
  async getEnterpriseRequest(accessToken: string, scope: "mine" | "admin", id: string, signal?: AbortSignal): Promise<WithEtag<EnterpriseRequest>> {
    const path = scope === "admin" ? `/api/admin/enterprise-quote-requests/${id}` : `/api/billing/enterprise-quote-requests/${id}`;
    const response = await apiClient.requestWithMeta<EnterpriseRequest>(path, { headers: headers(accessToken), signal });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision ?? 1) };
  },
  /** Admin replies are append-only and visible to the requesting organization, oldest first. */
  async listEnterpriseResponses(accessToken: string, scope: "mine" | "admin", id: string, page = 1, pageSize = 50, signal?: AbortSignal): Promise<PageResponse<EnterpriseResponse>> {
    const path = scope === "admin" ? `/api/admin/enterprise-quote-requests/${id}/responses` : `/api/billing/enterprise-quote-requests/${id}/responses`;
    return toPageResponse(await apiClient.request<BillingPageResponse<EnterpriseResponse>>(path, { headers: headers(accessToken), query: { page, pageSize }, signal }));
  },
  /** Status (Contacted/Rejected/Cancelled), assignment, or both; an omitted field keeps its value. Needs If-Match. */
  async updateEnterpriseRequest(accessToken: string, id: string, input: EnterpriseStatusInput, etag: string): Promise<WithEtag<EnterpriseRequest>> {
    const response = await apiClient.requestWithMeta<EnterpriseRequest>(`/api/admin/enterprise-quote-requests/${id}`, { headers: headers(accessToken), json: input, method: "PATCH", ifMatch: etag });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision ?? 1) };
  },
  addEnterpriseResponse(accessToken: string, id: string, message: string, idempotencyKey: string) {
    return apiClient.request<EnterpriseResponse>(`/api/admin/enterprise-quote-requests/${id}/responses`, { headers: headers(accessToken), json: { message }, idempotencyKey });
  },
  /** Ends handling only: linked quotations and payments are untouched, no service is granted. */
  async closeEnterpriseRequest(accessToken: string, id: string, reason: string, etag: string, idempotencyKey: string): Promise<WithEtag<EnterpriseRequest>> {
    const response = await apiClient.requestWithMeta<EnterpriseRequest>(`/api/admin/enterprise-quote-requests/${id}/close`, { headers: headers(accessToken), json: { reason }, method: "POST", ifMatch: etag, idempotencyKey });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision ?? 1) };
  },
  /** Drafts a Building quotation for the requesting organization and marks the request Quoted. Never creates a payment. */
  async createEnterpriseQuotation(accessToken: string, id: string, items: QuotationItemInput[], idempotencyKey: string): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>(`/api/admin/enterprise-quote-requests/${id}/quotations`, { headers: headers(accessToken), json: { items }, idempotencyKey });
    return { data: response.data, etag: etagOf(response.headers, response.data.id, response.data.revision) };
  },

  /** 201 link ready, 200 replay, 202 still creating (poll `getCheckout`). Amount and tenant come from the server. */
  async createCheckout(accessToken: string, quotationId: string, idempotencyKey: string): Promise<CheckoutResult> {
    const response = await apiClient.requestWithMeta<PayosCheckout>("/api/payments/payos/create", { headers: headers(accessToken), json: { quotationId }, idempotencyKey });
    return { checkout: response.data, httpStatus: response.status };
  },
  getCheckout(accessToken: string, checkoutId: string, signal?: AbortSignal) {
    return apiClient.request<PayosCheckout>(`/api/payments/payos/checkouts/${checkoutId}`, { headers: headers(accessToken), signal });
  },
  /** `id` is the paymentRequestId. 200 does not mean Cancelled: read `checkoutStatus` (a late payment can win). */
  async cancelPayment(accessToken: string, paymentRequestId: string, idempotencyKey: string): Promise<CheckoutResult> {
    const response = await apiClient.requestWithMeta<PayosCheckout>(`/api/payments/payos/requests/${paymentRequestId}/cancel`, { headers: headers(accessToken), method: "POST", idempotencyKey });
    return { checkout: response.data, httpStatus: response.status };
  },
  /** Payment truth + per-Building provisioning. `Paid` is not provisioned: read `provisioningStatus` and `items`. */
  getPayment(accessToken: string, paymentRequestId: string, signal?: AbortSignal) {
    return apiClient.request<PayosPayment>(`/api/payments/payos/requests/${paymentRequestId}`, { headers: headers(accessToken), signal });
  },
  /** PlatformAdmin enqueues reconciliation (202); it does not change amount, signature or entitlement provenance. */
  reconcile(accessToken: string, checkoutId: string) {
    return apiClient.request<void>(`/api/admin/payments/payos/checkouts/${checkoutId}/reconcile`, { headers: headers(accessToken), method: "POST" });
  },
  /** PlatformAdmin ledger. `checkouts` includes operations that never bound a payment request; `requests` is per payment request. */
  async listLedger(accessToken: string, kind: LedgerKind, filters: LedgerFilters, signal?: AbortSignal): Promise<PageResponse<PayosLedgerItem>> {
    return toPageResponse(await apiClient.request<BillingPageResponse<PayosLedgerItem>>(`/api/admin/payments/payos/${kind}`, { headers: headers(accessToken), query: { page: 1, pageSize: 20, ...filters }, signal }));
  },

  async listEntitlements(accessToken: string, filters: EntitlementFilters, signal?: AbortSignal): Promise<PageResponse<Entitlement>> {
    return toPageResponse(await apiClient.request<BillingPageResponse<Entitlement>>("/api/billing/entitlements", { headers: headers(accessToken), query: { page: 1, pageSize: 50, ...filters }, signal }));
  },
  /** Current and upcoming paid service of one Building: effective learner limit, seats used/remaining, upgrades. */
  getBuildingServiceEntitlement(accessToken: string, buildingId: string, signal?: AbortSignal) {
    return apiClient.request<BuildingServiceEntitlement>(`/api/buildings/${buildingId}/service-entitlement`, { headers: headers(accessToken), signal });
  },

  /** Prepaid pooled AI quota. PlatformAdmin passes `organizationId`; an OrganizationUser reads its own tenant. */
  getAiQuota(accessToken: string, organizationId?: string, signal?: AbortSignal) {
    const path = organizationId ? `/api/admin/organizations/${organizationId}/ai-quota` : "/api/organizations/me/ai-quota";
    return apiClient.request<AiQuotaBalance>(path, { headers: headers(accessToken), signal });
  },
  async listAiGrants(accessToken: string, organizationId: string | undefined, page: number, pageSize: number, signal?: AbortSignal): Promise<PageResponse<AiQuotaGrant>> {
    const path = organizationId ? `/api/admin/organizations/${organizationId}/ai-quota/grants` : "/api/organizations/me/ai-quota/grants";
    return toPageResponse(await apiClient.request<BillingPageResponse<AiQuotaGrant>>(path, { headers: headers(accessToken), query: { page, pageSize }, signal }));
  },
  async listAiUsage(accessToken: string, organizationId: string | undefined, page: number, pageSize: number, signal?: AbortSignal): Promise<PageResponse<AiUsageEntry>> {
    const path = organizationId ? `/api/admin/organizations/${organizationId}/ai-usage` : "/api/organizations/me/ai-usage";
    return toPageResponse(await apiClient.request<BillingPageResponse<AiUsageEntry>>(path, { headers: headers(accessToken), query: { page, pageSize }, signal }));
  },

  /** Expiry reminders addressed to the caller (newest first). */
  async listNotifications(accessToken: string, filters: NotificationFilters, signal?: AbortSignal): Promise<PageResponse<OrganizationNotification>> {
    return toPageResponse(await apiClient.request<BillingPageResponse<OrganizationNotification>>("/api/organizations/me/notifications", { headers: headers(accessToken), query: { page: 1, pageSize: 20, ...filters }, signal }));
  },
  /** Idempotent: the first read time is kept. */
  markNotificationRead(accessToken: string, id: string) {
    return apiClient.request<OrganizationNotification>(`/api/organizations/me/notifications/${id}/read`, { headers: headers(accessToken), method: "PATCH" });
  },
};
