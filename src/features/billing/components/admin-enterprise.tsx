"use client";

import { Eye, Mail, PhoneCall, Send, UserCheck, UserX, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ApiError } from "@/api";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "@/features/buildings/api";
import { organizationsApi } from "@/features/organizations/api";
import { billingApi } from "../api";
import { hasPaidHistory } from "../entitlements";
import { billingErrorText, hasCode, isStatus } from "../errors";
import { billingEtag, formatDateTime } from "../format";
import type { Entitlement, EnterpriseRequest, EnterpriseStatusInput, QuotationItemInput, WithEtag } from "../types";
import { EnterpriseResponses, EnterpriseStatusBadge } from "./enterprise-common";
import { PackagePicker, sellablePackages } from "./package-picker";
import "../billing.css";

const PAGE_SIZE = 20;
const CHANGEABLE = ["New", "Contacted", "Quoted"];

type Panel = null | "reject" | "cancel" | "close" | "quote";

/** One request handled end to end (drawer body): status, assignment, replies, a Draft quotation for the requester, and closing. */
function EnterpriseDetail({ accessToken, requestId, orgName, onChanged, onOpenQuotation }: { accessToken: string; requestId: string; orgName: string; onChanged: () => void; onOpenQuotation: (id: string) => void }) {
  const toast = useToast();
  const { user } = useAuthSession();
  const loaded = useAsyncData(`commerce:enterprise:detail:${requestId}`, (signal) => billingApi.getEnterpriseRequest(accessToken, "admin", requestId, signal));
  const [override, setOverride] = useState<WithEtag<EnterpriseRequest> | null>(null);
  const current = override && override.data.id === requestId ? override : loaded.data ?? null;
  const request = current?.data ?? null;

  const [responsesToken, setResponsesToken] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState("");
  const replyKey = useIdempotencyKey();
  const closeKey = useIdempotencyKey();
  const lock = useRef(false);

  const closed = request?.status === "Closed";
  const changeable = Boolean(request) && CHANGEABLE.includes(request!.status);

  const run = async (label: string, action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(billingErrorText(cause));
      if (isStatus(cause, 412) || hasCode(cause, "BILLING_STATE_CONFLICT")) setStale(true);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const reload = () => { setOverride(null); setStale(false); setError(""); loaded.reload(); };

  const patch = (label: string, input: EnterpriseStatusInput, done: string) => run(label, async () => {
    const next = await billingApi.updateEnterpriseRequest(accessToken, requestId, input, current?.etag ?? "");
    setOverride(next);
    setPanel(null);
    onChanged();
    toast.notify({ tone: "success", title: done });
  });

  const sendReply = () => {
    const text = message.trim();
    if (!text || text.length > 10000) { setFieldError("Nhập phản hồi (1–10.000 ký tự)."); return; }
    setFieldError("");
    void run("reply", async () => {
      await billingApi.addEnterpriseResponse(accessToken, requestId, text, replyKey.keyFor({ requestId, text }));
      replyKey.done();
      setMessage("");
      setResponsesToken((value) => value + 1);
      toast.notify({ tone: "success", title: "Đã gửi phản hồi", description: "Tổ chức xem được phản hồi này ở yêu cầu của họ." });
    });
  };

  const confirmClose = () => {
    const text = reason.trim();
    if (!text || text.length > 1000) { setFieldError("Nhập lý do đóng (1–1000 ký tự)."); return; }
    setFieldError("");
    void run("close", async () => {
      const sentEtag = current?.etag ?? "";
      const next = await billingApi.closeEnterpriseRequest(accessToken, requestId, text, sentEtag, closeKey.keyFor({ requestId, text, etag: sentEtag }));
      closeKey.done();
      setOverride(next);
      setPanel(null);
      setReason("");
      onChanged();
      toast.notify({ tone: "success", title: "Đã đóng yêu cầu", description: "Báo giá và thanh toán đã tạo không bị hủy; không cấp dịch vụ." });
    });
  };

  if (loaded.loading && !request) return <SkeletonDetail rows={6} />;
  if (loaded.error !== undefined && !request) return <Alert tone="danger" title="Không tải được yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={loaded.reload}>Thử lại</Button>}>{billingErrorText(loaded.error)}</Alert>;
  if (!request) return null;

  const mine = Boolean(user?.id) && request.assignedTo === user?.id;
  return <div className="ops-stack" data-testid="enterprise-admin-detail">
    <div className="bill-row"><strong>{request.requestedBuildingCount} công trình{request.requestedDurationMonths ? ` · ${request.requestedDurationMonths} tháng` : ""}</strong><EnterpriseStatusBadge status={request.status} /></div>
    <dl className="ops-kv">
      <dt>Tổ chức</dt><dd>{orgName}</dd>
      <dt>Liên hệ</dt><dd>{request.contactName} · {request.contactEmail}{request.contactPhone ? ` · ${request.contactPhone}` : ""}</dd>
      <dt>Gửi lúc</dt><dd>{formatDateTime(request.createdAt)}{request.closedAt ? ` · đóng ${formatDateTime(request.closedAt)}` : ""}</dd>
      <dt>Phụ trách</dt><dd data-testid="enterprise-assignee">{request.assignedTo ? (mine ? "Đang do bạn phụ trách" : `Đang phân công cho ${request.assignedTo.slice(0, 8)}`) : "Chưa phân công"}{request.closeReason ? ` · lý do đóng: ${request.closeReason}` : ""}</dd>
    </dl>
    {request.notes && <p className="bill-wrap" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{request.notes}</p>}
    {request.quotationId && <Alert tone="success" title="Đã tạo báo giá cho yêu cầu này" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => onOpenQuotation(request.quotationId as string)}>Mở báo giá</Button>}>Báo giá ở trạng thái nháp cho tới khi bạn phát hành; chưa có thanh toán hay dịch vụ.</Alert>}

    {stale && <Alert tone="warning" title="Yêu cầu đã thay đổi ở nơi khác" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Tải bản mới</Button>}>Nội dung bạn đang nhập được giữ nguyên. Tải bản mới để đối chiếu trạng thái rồi thao tác lại.</Alert>}
    {error && !stale && <Alert tone="danger" title="Chưa thực hiện được">{error}</Alert>}

    {closed ? <Alert tone="info" title="Yêu cầu đã đóng">Không thể đổi trạng thái, phân công hay phản hồi thêm.</Alert> : <>
      <div className="ops-actions" role="group" aria-label="Thao tác xử lý">
        {request.status === "New" && <Button variant="secondary" onClick={() => void patch("contacted", { status: "Contacted" }, "Đã đánh dấu đã liên hệ")} disabled={busy !== null}><PhoneCall size={16} aria-hidden="true" />Đã liên hệ</Button>}
        {!mine && <Button variant="quiet" onClick={() => void patch("assign", { assignedTo: user?.id }, "Đã nhận xử lý")} disabled={busy !== null || !user?.id}><UserCheck size={16} aria-hidden="true" />Nhận xử lý</Button>}
        {request.assignedTo && <Button variant="quiet" onClick={() => void patch("unassign", { clearAssignment: true }, "Đã bỏ phân công")} disabled={busy !== null}><UserX size={16} aria-hidden="true" />Bỏ phân công</Button>}
        {changeable && <Button variant="quiet" onClick={() => { setFieldError(""); setPanel("reject"); }} disabled={busy !== null}>Từ chối</Button>}
        {changeable && <Button variant="quiet" onClick={() => { setFieldError(""); setPanel("cancel"); }} disabled={busy !== null}>Hủy yêu cầu</Button>}
        <Button variant="quiet" onClick={() => { setFieldError(""); setPanel("close"); }} disabled={busy !== null}>Đóng yêu cầu</Button>
      </div>

      <fieldset className="ops-fieldset"><legend>Trả lời tổ chức</legend>
        <Field label="Nội dung phản hồi" error={fieldError && panel === null ? fieldError : undefined} hint="Hiển thị cho tổ chức; không thể sửa sau khi gửi.">{(p) => <Textarea {...p} maxLength={10000} value={message} onChange={(event) => { setMessage(event.target.value); setFieldError(""); }} />}</Field>
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button onClick={sendReply} disabled={busy !== null}><Send size={16} aria-hidden="true" />{busy === "reply" ? "Đang gửi…" : "Gửi phản hồi"}</Button></div>
      </fieldset>

      {!request.quotationId && <div className="ops-actions"><Button variant="secondary" onClick={() => setPanel("quote")} disabled={busy !== null}>Tạo báo giá từ yêu cầu</Button></div>}
    </>}

    <EnterpriseResponses accessToken={accessToken} scope="admin" requestId={requestId} refreshKey={responsesToken} />

    <Modal open={panel === "reject" || panel === "cancel"} onOpenChange={(open) => { if (!open && busy === null) setPanel(null); }} size="sm" className="ops-dialog--danger" title={panel === "reject" ? "Từ chối yêu cầu?" : "Hủy yêu cầu?"} description="Không tạo thanh toán hay dịch vụ. Báo giá đã tạo (nếu có) không bị hủy."
      footer={<><Button variant="quiet" onClick={() => setPanel(null)} disabled={busy !== null}>Quay lại</Button><Button variant="danger" onClick={() => void patch(panel === "reject" ? "reject" : "cancel", { status: panel === "reject" ? "Rejected" : "Cancelled" }, panel === "reject" ? "Đã từ chối yêu cầu" : "Đã hủy yêu cầu")} disabled={busy !== null}>{busy === "reject" || busy === "cancel" ? "Đang lưu…" : panel === "reject" ? "Từ chối" : "Hủy yêu cầu"}</Button></>}>
      {error && <Alert tone="danger" title="Chưa thực hiện được">{error}</Alert>}
    </Modal>

    <Modal open={panel === "close"} onOpenChange={(open) => { if (!open && busy === null) setPanel(null); }} size="sm" className="ops-dialog--danger" title="Đóng yêu cầu?" description="Kết thúc xử lý, không hoàn tác. Báo giá và thanh toán liên quan không bị hủy; không cấp dịch vụ."
      footer={<><Button variant="quiet" onClick={() => setPanel(null)} disabled={busy !== null}>Giữ mở</Button><Button variant="danger" onClick={confirmClose} disabled={busy !== null}>{busy === "close" ? "Đang đóng…" : "Đóng yêu cầu"}</Button></>}>
      <div className="ops-stack">
        <Field label="Lý do đóng" required error={fieldError && panel === "close" ? fieldError : undefined} hint="Chỉ PlatformAdmin thấy lý do.">{(p) => <Textarea {...p} maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); setFieldError(""); }} />}</Field>
        {error && <Alert tone="danger" title="Chưa đóng được">{error}</Alert>}
      </div>
    </Modal>

    {panel === "quote" && <EnterpriseQuotationModal accessToken={accessToken} request={request} onClose={() => setPanel(null)} onCreated={(id) => { setPanel(null); reload(); onChanged(); onOpenQuotation(id); }} />}
  </div>;
}

/** Draft quotation for the requesting organization (modal): Buildings and one package. The BE prices it and marks the request Quoted. */
function EnterpriseQuotationModal({ accessToken, request, onClose, onCreated }: { accessToken: string; request: EnterpriseRequest; onClose: () => void; onCreated: (quotationId: string) => void }) {
  const toast = useToast();
  const key = useIdempotencyKey();
  const lock = useRef(false);
  const buildings = useAsyncData(`commerce:enterprise:buildings:${request.organizationId}`, (signal) => buildingsApi.list(accessToken, { organizationId: request.organizationId, isActive: true, page: 1, pageSize: 100 }, signal));
  const entitlements = useAsyncData(`commerce:enterprise:entitlements:${request.organizationId}`, (signal) => billingApi.listEntitlements(accessToken, { organizationId: request.organizationId, pageSize: 100 }, signal));
  const packages = useAsyncData("commerce:packages", (signal) => billingApi.listPackages(accessToken, signal));
  const [picked, setPicked] = useState<string[]>([]);
  const [packageId, setPackageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const byBuilding = useMemo(() => {
    const map = new Map<string, Entitlement[]>();
    for (const item of entitlements.data?.items ?? []) map.set(item.buildingId, [...(map.get(item.buildingId) ?? []), item]);
    return map;
  }, [entitlements.data]);
  const sellable = useMemo(() => sellablePackages(packages.data), [packages.data]);
  const canSubmit = picked.length > 0 && Boolean(packageId) && !saving;

  const submit = async () => {
    if (lock.current || !canSubmit) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const items: QuotationItemInput[] = [...picked].sort().map((buildingId) => ({ buildingId, servicePackageId: packageId, purchaseAction: hasPaidHistory(byBuilding.get(buildingId) ?? []) ? "Renewal" : "New" }));
      const result = await billingApi.createEnterpriseQuotation(accessToken, request.id, items, key.keyFor({ id: request.id, items }));
      key.done();
      toast.notify({ tone: "success", title: "Đã tạo báo giá nháp", description: "Yêu cầu chuyển sang “Đã có báo giá”. Phát hành báo giá để tổ chức chấp nhận." });
      onCreated(result.data.id);
    } catch (cause) {
      setError(billingErrorText(cause));
    } finally { lock.current = false; setSaving(false); }
  };

  return <Modal open onOpenChange={(open) => { if (!open && !saving) onClose(); }} size="lg" title="Tạo báo giá từ yêu cầu" description="Chọn công trình của tổ chức và gói. Hệ thống tính giá; không tạo thanh toán."
    footer={<><Button variant="quiet" onClick={onClose} disabled={saving}>Hủy</Button><Button onClick={() => void submit()} disabled={!canSubmit}>{saving ? "Đang tạo…" : `Tạo báo giá (${picked.length})`}</Button></>}>
    <div className="ops-stack">
      <fieldset className="ops-fieldset"><legend>1. Công trình</legend>
        {buildings.loading && !buildings.data && <SkeletonDetail rows={3} />}
        {buildings.error !== undefined && <Alert tone="danger" title="Không tải được công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={buildings.reload}>Thử lại</Button>}>{billingErrorText(buildings.error)}</Alert>}
        {buildings.data && buildings.data.items.length === 0 && <p className="bill-muted">Tổ chức chưa có công trình đang hoạt động. Báo giá cần tên và địa chỉ công trình.</p>}
        <div className="bill-picker" role="group" aria-label="Chọn công trình">
          {(buildings.data?.items ?? []).map((building) => <label key={building.id}>
            <input type="checkbox" checked={picked.includes(building.id)} onChange={() => setPicked((state) => (state.includes(building.id) ? state.filter((id) => id !== building.id) : [...state, building.id]))} />
            <span><strong>{building.name}</strong> <span className="bill-dim">· {hasPaidHistory(byBuilding.get(building.id) ?? []) ? "Gia hạn" : "Mua mới"}</span></span>
          </label>)}
        </div>
      </fieldset>
      <fieldset className="ops-fieldset"><legend>2. Gói</legend>
        {packages.data && sellable.length === 0 && <p className="bill-muted">Chưa có gói đủ điều kiện bán. Cấu hình gói ở tab “Gói dịch vụ”.</p>}
        {sellable.length > 0 && <PackagePicker packages={sellable} value={packageId} onChange={setPackageId} name="enterprise-package" />}
      </fieldset>
      {error && <Alert tone="danger" title="Chưa tạo được báo giá">{error}</Alert>}
    </div>
  </Modal>;
}

type QuickAction = { request: EnterpriseRequest; kind: "contacted" | "assign" | "reject" | "cancel" };

/**
 * Enterprise requests (Figma "Thương mại · Liên hệ"): a row opens the drawer; the "···" menu changes status straight from
 * the list (PATCH with If-Match from the revision the list returned; reject/cancel ask first). A 412 is reported and
 * the list reloaded — nothing is overwritten.
 */
export function EnterpriseAdminSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const { user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const requestId = get("request");
  const list = useAsyncData(`commerce:enterprise:${page}`, (signal) => billingApi.listEnterpriseRequests(accessToken, page, PAGE_SIZE, "admin", signal));
  const organizations = useAsyncData("commerce:orgs", () => organizationsApi.list(accessToken, { page: 1, pageSize: 100 }));
  const orgName = useMemo(() => Object.fromEntries((organizations.data?.items ?? []).map((item) => [item.id, item.name])), [organizations.data]);
  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;
  const selected = items.find((item) => item.id === requestId);
  const [quick, setQuick] = useState<QuickAction | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const open = (id: string) => setParams({ request: id });

  const quickPatch = async (action: QuickAction) => {
    if (quickBusy) return;
    const input: EnterpriseStatusInput = action.kind === "contacted" ? { status: "Contacted" } : action.kind === "assign" ? { assignedTo: user?.id } : action.kind === "reject" ? { status: "Rejected" } : { status: "Cancelled" };
    const label = action.kind === "contacted" ? "Đã đánh dấu đã liên hệ" : action.kind === "assign" ? "Đã nhận xử lý" : action.kind === "reject" ? "Đã từ chối yêu cầu" : "Đã hủy yêu cầu";
    setQuickBusy(true);
    try {
      // The list carries the revision; the header ETag is only available after a detail read, so the same format is rebuilt here.
      await billingApi.updateEnterpriseRequest(accessToken, action.request.id, input, billingEtag(action.request.id, action.request.revision ?? 0));
      toast.notify({ tone: "success", title: label });
      setQuick(null);
      list.reload();
    } catch (cause) {
      const stale = isStatus(cause, 412) || hasCode(cause, "BILLING_STATE_CONFLICT") || (cause instanceof ApiError && cause.isPreconditionFailed);
      toast.notify({ tone: stale ? "warning" : "danger", title: stale ? "Yêu cầu đã thay đổi ở nơi khác" : "Chưa thực hiện được", description: stale ? "Chưa ghi đè gì. Danh sách được tải lại; mở chi tiết để đối chiếu." : billingErrorText(cause) });
      setQuick(null);
      list.reload();
    } finally {
      setQuickBusy(false);
    }
  };

  const columns: DataColumn<EnterpriseRequest>[] = [
    { key: "organization", header: "Tổ chức", primary: true, render: (item) => <CellTitle title={orgName[item.organizationId] ?? item.organizationId.slice(0, 8)} sub={formatDateTime(item.createdAt)} /> },
    { key: "need", header: "Nhu cầu", width: 220, render: (item) => <CellTitle title={`${item.requestedBuildingCount} công trình${item.requestedDurationMonths ? ` · ${item.requestedDurationMonths} tháng` : ""}`} sub={item.notes ? <span className="bill-wrap">{item.notes}</span> : undefined} /> },
    { key: "contact", header: "Liên hệ", width: 240, hideBelow: 1000, render: (item) => <CellTitle title={item.contactName} sub={`${item.contactEmail}${item.contactPhone ? ` · ${item.contactPhone}` : ""}`} /> },
    { key: "status", header: "Trạng thái", width: 170, render: (item) => <CellTitle title={<EnterpriseStatusBadge status={item.status} />} sub={item.assignedTo ? "Đã phân công" : undefined} /> },
  ];

  return <div className="ops-stack">
    <DataTable<EnterpriseRequest>
      caption="Yêu cầu báo giá số lượng lớn"
      data-testid="admin-enterprise-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={(item) => open(item.id)}
      rowTone={(item) => (item.status === "Closed" || item.status === "Rejected" || item.status === "Cancelled" ? "muted" : undefined)}
      rowMenu={(item) => {
        const changeable = CHANGEABLE.includes(item.status);
        return [
          { label: "Xử lý", icon: Eye, onSelect: () => open(item.id) },
          ...(item.status === "New" ? [{ label: "Đã liên hệ", icon: PhoneCall, onSelect: () => void quickPatch({ request: item, kind: "contacted" }), disabled: quickBusy, separator: true }] : []),
          ...(item.status !== "Closed" && item.assignedTo !== user?.id ? [{ label: "Nhận xử lý", icon: UserCheck, onSelect: () => void quickPatch({ request: item, kind: "assign" }), disabled: quickBusy || !user?.id }] : []),
          ...(changeable ? [{ label: "Từ chối", icon: XCircle, tone: "danger" as const, onSelect: () => setQuick({ request: item, kind: "reject" }), disabled: quickBusy, separator: true }, { label: "Hủy yêu cầu", icon: XCircle, tone: "danger" as const, onSelect: () => setQuick({ request: item, kind: "cancel" }), disabled: quickBusy }] : []),
        ];
      }}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert> : undefined}
      toolbar={<p className="bill-muted ops-toolbar-grow" style={{ margin: 0 }}>Yêu cầu báo giá số lượng lớn của các tổ chức. Đánh dấu đã liên hệ, phân công, trả lời, tạo báo giá nháp hoặc đóng. Không bước nào tự thu tiền hay cấp dịch vụ.</p>}
      empty={<EmptyState icon={Mail} title="Chưa có yêu cầu liên hệ" description="Yêu cầu của tổ chức cần số lượng lớn sẽ hiện ở đây." />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className="bill-hint">Bấm hàng để xử lý trong ngăn bên phải; menu “···” đổi trạng thái ngay trên danh sách (If-Match theo phiên bản).</p>

    <Drawer open={Boolean(requestId)} onOpenChange={(open) => { if (!open) setParams({ request: null }); }} size="lg" data-testid="enterprise-drawer" title="Xử lý yêu cầu doanh nghiệp" description="Thay đổi dùng phiên bản (If-Match); nếu có người khác vừa sửa, bạn được báo và nội dung đang nhập được giữ.">
      {requestId && <EnterpriseDetail key={requestId} accessToken={accessToken} requestId={requestId} orgName={selected ? orgName[selected.organizationId] ?? selected.organizationId.slice(0, 8) : "Tổ chức"} onChanged={list.reload} onOpenQuotation={(id) => setParams({ tab: "quotes", quotation: id, request: null, page: null })} />}
    </Drawer>

    <ConfirmDialog open={quick !== null} onOpenChange={(open) => { if (!open && !quickBusy) setQuick(null); }} busy={quickBusy} tone="danger"
      title={quick?.kind === "reject" ? "Từ chối yêu cầu?" : "Hủy yêu cầu?"} description="Không hoàn tác. Không tạo thanh toán hay dịch vụ; báo giá đã tạo (nếu có) không bị hủy."
      confirmLabel={quick?.kind === "reject" ? "Từ chối" : "Hủy yêu cầu"} cancelLabel="Quay lại" onConfirm={() => { if (quick) void quickPatch(quick); }}>
      {quick && <p className="bill-muted">{orgName[quick.request.organizationId] ?? quick.request.organizationId.slice(0, 8)} · {quick.request.requestedBuildingCount} công trình · {quick.request.contactName}</p>}
    </ConfirmDialog>
  </div>;
}
