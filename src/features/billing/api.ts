import { apiClient } from "@/api/client";
import type { PageResponse } from "@/api/types/common";

import { billingEtag } from "./format";
import {
  toPageResponse,
  type BillingPageResponse,
  type DiscountInput,
  type DiscountRule,
  type Entitlement,
  type EntitlementFilters,
  type EnterpriseRequest,
  type EnterpriseRequestInput,
  type IssueQuotationInput,
  type PackageInput,
  type PayosCheckout,
  type PayosPayment,
  type Quotation,
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

/** `Idempotency-Key` is mandatory for quotation create, enterprise request, PayOS create and cancel. */
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
  async createQuotation(accessToken: string, items: QuotationItemInput[], idempotencyKey: string): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>("/api/billing/quotations", { headers: headers(accessToken), json: { items }, idempotencyKey });
    return { data: response.data, etag: etagOf(response.headers, response.data.id, response.data.revision) };
  },
  async listQuotations(accessToken: string, page: number, pageSize: number, signal?: AbortSignal): Promise<PageResponse<Quotation>> {
    return toPageResponse(await apiClient.request<BillingPageResponse<Quotation>>("/api/billing/quotations", { headers: headers(accessToken), query: { page, pageSize }, signal }));
  },
  async getQuotation(accessToken: string, id: string, signal?: AbortSignal): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>(`/api/billing/quotations/${id}`, { headers: headers(accessToken), signal });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  async updateDraft(accessToken: string, id: string, items: QuotationItemInput[], etag: string): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>(`/api/billing/quotations/${id}`, { headers: headers(accessToken), json: { items }, method: "PATCH", ifMatch: etag });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  /** PlatformAdmin freezes the Draft snapshot: explicit tax, terms and future expiry are required. */
  async issueQuotation(accessToken: string, id: string, input: IssueQuotationInput, etag: string): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>(`/api/admin/quotations/${id}/issue`, { headers: headers(accessToken), json: input, ifMatch: etag });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },
  /** 409 once past `validUntil` or no longer Issued. Acceptance does not charge or grant service. */
  async acceptQuotation(accessToken: string, id: string, etag: string): Promise<WithEtag<Quotation>> {
    const response = await apiClient.requestWithMeta<Quotation>(`/api/billing/quotations/${id}/accept`, { headers: headers(accessToken), method: "POST", ifMatch: etag });
    return { data: response.data, etag: etagOf(response.headers, id, response.data.revision) };
  },

  createEnterpriseRequest(accessToken: string, input: EnterpriseRequestInput, idempotencyKey: string) {
    return apiClient.request<EnterpriseRequest>("/api/billing/enterprise-quote-requests", { headers: headers(accessToken), json: input, idempotencyKey });
  },
  async listEnterpriseRequests(accessToken: string, page: number, pageSize: number, scope: "mine" | "admin", signal?: AbortSignal): Promise<PageResponse<EnterpriseRequest>> {
    const path = scope === "admin" ? "/api/admin/enterprise-quote-requests" : "/api/billing/enterprise-quote-requests";
    return toPageResponse(await apiClient.request<BillingPageResponse<EnterpriseRequest>>(path, { headers: headers(accessToken), query: { page, pageSize }, signal }));
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

  async listEntitlements(accessToken: string, filters: EntitlementFilters, signal?: AbortSignal): Promise<PageResponse<Entitlement>> {
    return toPageResponse(await apiClient.request<BillingPageResponse<Entitlement>>("/api/billing/entitlements", { headers: headers(accessToken), query: { page: 1, pageSize: 50, ...filters }, signal }));
  },
};
