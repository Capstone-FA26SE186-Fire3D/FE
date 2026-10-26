"use client";

import { Ban, BookMarked, CheckCircle2, Eye, Plus, RefreshCw, Search } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { ApiError } from "@/api/types/common";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { SupportCode } from "@/components/ui/support-code";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { accountsApi } from "@/features/accounts/api";
import { formatDateTime } from "@/features/billing/format";

import { adminAiApi, knowledgeEtag } from "../api";
import { aiErrorText, fieldIssue } from "../labels";
import { sha256Hex } from "../sha256";
import type { CreateKnowledgeSourceInput, KnowledgeSource, WithEtag } from "../types";
import styles from "../org-ai.module.css";

const PAGE_SIZE = 20;
const STATUS: Record<string, { label: string; tone: Tone }> = { Draft: { label: "Bản nháp", tone: "info" }, Approved: { label: "Đã duyệt", tone: "success" }, Retired: { label: "Đã ngừng dùng", tone: "neutral" } };
const statusOf = (status: string) => STATUS[status] ?? { label: "Không rõ", tone: "neutral" as Tone };
const visibilityLabel = (visibility: string) => (visibility === "Common" ? "Dùng chung" : visibility === "Organization" ? "Riêng một tổ chức" : "Khác");
const VISIBILITY_OPTIONS = [{ value: "Common", label: "Dùng chung (mọi tổ chức)" }, { value: "Organization", label: "Riêng một tổ chức" }];

const VERSION_LABEL = /^[A-Za-z0-9._-]{1,100}$/;
const SHA256 = /^[0-9a-f]{64}$/;
// The BE rejects markup and control characters in plain-text fields.
const MARKUP = /<\s*[a-zA-Z/!?]/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

type Form = { visibility: string; organizationId: string; title: string; versionLabel: string; sourceHash: string; sourceUri: string; jurisdiction: string; effectiveFrom: string; effectiveUntil: string };
const EMPTY: Form = { visibility: "", organizationId: "", title: "", versionLabel: "", sourceHash: "", sourceUri: "", jurisdiction: "", effectiveFrom: "", effectiveUntil: "" };
type Errors = Partial<Record<keyof Form, string>>;

function plainText(value: string, max: number): string | undefined {
  if (!value.trim()) return "Bắt buộc.";
  if (value.length > max) return `Tối đa ${max} ký tự.`;
  if (MARKUP.test(value) || CONTROL.test(value)) return "Chỉ văn bản thuần, không HTML hay ký tự điều khiển.";
  return undefined;
}

/** `https` without credentials, as the controller checks it. */
export function sourceUriProblem(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return "Chỉ nhận liên kết https.";
    if (url.username || url.password) return "Liên kết không được chứa tài khoản hoặc mật khẩu.";
    return undefined;
  } catch {
    return "Liên kết tuyệt đối dạng https://… không hợp lệ.";
  }
}

export function validateSource(form: Form): { errors: Errors; input?: CreateKnowledgeSourceInput } {
  const errors: Errors = {};
  if (form.visibility !== "Common" && form.visibility !== "Organization") errors.visibility = "Chọn phạm vi dùng.";
  if (form.visibility === "Organization" && !form.organizationId) errors.organizationId = "Nguồn riêng phải gắn một tổ chức.";
  const title = plainText(form.title.trim(), 500);
  if (title) errors.title = title;
  if (!VERSION_LABEL.test(form.versionLabel.trim())) errors.versionLabel = "1–100 ký tự gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.";
  if (!SHA256.test(form.sourceHash.trim().toLowerCase())) errors.sourceHash = "Mã kiểm tra chưa đúng. Chọn tệp bên dưới để hệ thống tự tính.";
  const uri = sourceUriProblem(form.sourceUri);
  if (uri) errors.sourceUri = uri;
  if (form.jurisdiction.trim()) { const problem = plainText(form.jurisdiction.trim(), 100); if (problem) errors.jurisdiction = problem; }
  const from = form.effectiveFrom ? new Date(form.effectiveFrom).getTime() : null;
  const until = form.effectiveUntil ? new Date(form.effectiveUntil).getTime() : null;
  if (from !== null && Number.isNaN(from)) errors.effectiveFrom = "Thời điểm không hợp lệ.";
  if (until !== null && Number.isNaN(until)) errors.effectiveUntil = "Thời điểm không hợp lệ.";
  if (from !== null && until !== null && !Number.isNaN(from) && !Number.isNaN(until) && until <= from) errors.effectiveUntil = "Phải sau thời điểm bắt đầu hiệu lực.";
  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    input: {
      visibility: form.visibility, title: form.title.trim(), versionLabel: form.versionLabel.trim(), sourceHash: form.sourceHash.trim().toLowerCase(),
      ...(form.visibility === "Organization" ? { organizationId: form.organizationId } : {}),
      ...(form.sourceUri.trim() ? { sourceUri: form.sourceUri.trim() } : {}), ...(form.jurisdiction.trim() ? { jurisdiction: form.jurisdiction.trim() } : {}),
      ...(form.effectiveFrom ? { effectiveFrom: new Date(form.effectiveFrom).toISOString() } : {}), ...(form.effectiveUntil ? { effectiveUntil: new Date(form.effectiveUntil).toISOString() } : {}),
    },
  };
}

/** Create modal (Figma "Modal / Đăng ký nguồn"): one version of one document, registered as Draft. */
function SourceModal({ open, accessToken, organizations, onCreated, onClose }: { open: boolean; accessToken: string; organizations: Array<{ value: string; label: string }>; onCreated: (source: KnowledgeSource) => void; onClose: () => void }) {
  const formId = useId();
  const { keyFor, done } = useIdempotencyKey();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [hashing, setHashing] = useState<string | null>(null);
  const lock = useRef(false);
  const set = (key: keyof Form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const pick = (key: keyof Form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const hashFile = async (file: File | undefined) => {
    if (!file) return;
    setHashing("Đang tính mã nội dung…");
    try {
      const hash = await sha256Hex(file);
      setForm((current) => ({ ...current, sourceHash: hash }));
      setHashing(`Đã tính từ “${file.name}” (${file.size.toLocaleString("vi-VN")} byte). Tệp không được tải lên.`);
    } catch (cause) {
      setHashing(cause instanceof Error && /[à-ỹ]/i.test(cause.message) ? cause.message : "Không tính được mã nội dung. Hãy thử lại hoặc dán mã.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    const checked = validateSource(form);
    setErrors(checked.errors);
    if (!checked.input) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const created = await adminAiApi.createKnowledgeSource(accessToken, checked.input, keyFor(checked.input));
      done();
      setForm(EMPTY);
      setErrors({});
      setHashing(null);
      onCreated(created);
    } catch (cause) {
      setError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const show = (path: string, key: keyof Form) => errors[key] ?? fieldIssue(error, path);

  return <Modal open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }} size="lg" title="Đăng ký nguồn tri thức" description="Một phiên bản của một tài liệu, ở trạng thái Bản nháp."
    footer={<><Button type="button" variant="quiet" onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" form={formId} disabled={busy} data-testid="source-create">{busy ? "Đang đăng ký…" : "Đăng ký nguồn"}</Button></>}>
    <form id={formId} className={styles.stack} onSubmit={submit} aria-label="Đăng ký nguồn tri thức" noValidate>
      <Alert tone="info" title="Nguồn mới luôn ở trạng thái Bản nháp">Nguồn chỉ được AI trích dẫn sau khi bạn duyệt (Đã duyệt) và còn trong khoảng hiệu lực. Tài liệu gốc không được tải lên đây; hệ thống chỉ lưu mã nội dung của tệp và liên kết tham chiếu.</Alert>
      <Field label="Phạm vi dùng" required error={show("$.visibility", "visibility")}>
        {(props) => <Combobox {...props} aria-label="Phạm vi dùng" value={form.visibility} onChange={pick("visibility")} options={VISIBILITY_OPTIONS} placeholder="Chọn…" groupLabel="Phạm vi" />}
      </Field>
      {form.visibility === "Organization" && <Field label="Tổ chức" required error={show("$.organizationId", "organizationId")}>
        {(props) => <Combobox {...props} aria-label="Tổ chức" value={form.organizationId} onChange={pick("organizationId")} options={organizations} placeholder="Chọn tổ chức…" searchPlaceholder="Tìm tổ chức" groupLabel="Tổ chức" />}
      </Field>}
      <Field label="Tiêu đề" required error={show("$.title", "title")}>{(props) => <Input {...props} value={form.title} onChange={set("title")} maxLength={500} />}</Field>
      <div className={styles.grid2}>
        <Field label="Nhãn phiên bản" required hint="Ví dụ năm ban hành hoặc số hiệu." error={show("$.versionLabel", "versionLabel")}>{(props) => <Input {...props} value={form.versionLabel} onChange={set("versionLabel")} autoComplete="off" />}</Field>
        <Field label="Phạm vi pháp lý/khu vực" error={show("$.jurisdiction", "jurisdiction")}>{(props) => <Input {...props} value={form.jurisdiction} onChange={set("jurisdiction")} maxLength={100} />}</Field>
      </div>
      <Field label="Mã kiểm tra tài liệu" required hint="Chọn tệp bên dưới để tự tính ngay trong trình duyệt (tệp không bị tải lên)." error={show("$.sourceHash", "sourceHash")}>
        {(props) => <Input {...props} value={form.sourceHash} onChange={set("sourceHash")} autoComplete="off" spellCheck={false} className="font-mono" />}
      </Field>
      <Field label="Tính mã nội dung từ tệp" hint={hashing ?? "Chỉ tính cục bộ; tệp không rời trình duyệt."}>
        {(props) => <Input {...props} type="file" onChange={(event) => void hashFile(event.target.files?.[0])} />}
      </Field>
      <Field label="Liên kết tham chiếu (https)" hint="Không chứa tài khoản/mật khẩu. Tùy chọn." error={show("$.sourceUri", "sourceUri")}>{(props) => <Input {...props} type="url" value={form.sourceUri} onChange={set("sourceUri")} placeholder="https://" autoComplete="off" />}</Field>
      <div className={styles.grid2}>
        <Field label="Hiệu lực từ" error={show("$.effectiveFrom", "effectiveFrom")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveFrom} onChange={set("effectiveFrom")} />}</Field>
        <Field label="Hiệu lực đến" error={show("$.effectiveUntil", "effectiveUntil")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveUntil} onChange={set("effectiveUntil")} />}</Field>
      </div>
      {error !== undefined && <Alert tone="danger" title="Chưa đăng ký được nguồn">{aiErrorText(error)} Nội dung bạn nhập vẫn được giữ; bấm Đăng ký để thử lại (không tạo trùng).</Alert>}
    </form>
  </Modal>;
}

/** Drawer body: the source as the server has it, with approve / retire behind a confirmation (If-Match = revision). */
function SourceDetail({ accessToken, id, orgName, onChanged }: { accessToken: string; id: string; orgName: (id: string | null | undefined) => string; onChanged: () => void }) {
  const toast = useToast();
  const detail = useAsyncData(`admin-ai:source:${id}`, (signal) => adminAiApi.getKnowledgeSource(accessToken, id, signal));
  const [override, setOverride] = useState<WithEtag<KnowledgeSource> | null>(null);
  const [confirm, setConfirm] = useState<"approve" | "retire" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const current = override && override.data.id === id ? override : detail.data;
  const source = current?.data;
  const stale = error instanceof ApiError && error.status === 412;

  const reloadFresh = () => { setOverride(null); setError(undefined); detail.reload(); };

  const run = async (operation: "approve" | "retire") => {
    if (!current || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = await adminAiApi.changeKnowledgeSource(accessToken, id, operation, current.etag || knowledgeEtag(current.data.revision));
      setOverride(next);
      setConfirm(null);
      onChanged();
      toast.notify({ tone: "success", title: operation === "approve" ? "Đã duyệt nguồn" : "Đã ngừng dùng nguồn" });
    } catch (cause) {
      setError(cause);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.stack} data-testid="source-detail">
    {detail.loading && !current && <SkeletonDetail rows={8} />}
    {detail.error !== undefined && !current && <Alert tone="danger" title="Không tải được nguồn" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{aiErrorText(detail.error)}</Alert>}
    {source && <>
      <div className={styles.row}><strong>{source.title}</strong><StatusBadge tone={statusOf(source.approvalStatus).tone} data-testid="source-status">{statusOf(source.approvalStatus).label}</StatusBadge></div>
      <dl className="ops-kv">
        <dt>Phạm vi dùng</dt><dd>{visibilityLabel(source.visibility)}{source.visibility === "Organization" ? ` · ${orgName(source.organizationId)}` : ""}</dd>
        <dt>Phiên bản</dt><dd>{source.versionLabel}</dd>
        <dt>Mã kiểm tra tài liệu</dt><dd><SupportCode id={source.sourceHash} /></dd>
        <dt>Liên kết</dt><dd>{source.sourceUri ? <span className={styles.mono}>{source.sourceUri}</span> : "Không có"}</dd>
        <dt>Pháp lý/khu vực</dt><dd>{source.jurisdiction || "Không nêu"}</dd>
        <dt>Hiệu lực</dt><dd>{source.effectiveFrom ? formatDateTime(source.effectiveFrom) : "Ngay"} – {source.effectiveUntil ? formatDateTime(source.effectiveUntil) : "không giới hạn"}</dd>
        <dt>Duyệt lúc</dt><dd>{source.approvedAt ? formatDateTime(source.approvedAt) : "Chưa duyệt"}</dd>
        <dt>Tạo lúc</dt><dd>{formatDateTime(source.createdAt)}</dd>
        <dt>Lần cập nhật</dt><dd data-testid="source-revision">{source.revision}</dd>
        {source.visibility === "Common" && <><dt>Dùng cho bài học</dt><dd>Bản nháp bài học: {source.canUseInDraft ? "được trích dẫn" : "chưa"} · bài đã xuất bản và AI: {source.canPublishReference ? "được dùng" : "chưa"}</dd></>}
      </dl>

      {stale && <Alert tone="warning" title="Nguồn đã thay đổi ở nơi khác" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reloadFresh} data-testid="source-reload">Tải bản mới</Button>}>
        {aiErrorText(error)} Chưa có gì bị ghi đè: tải bản mới để xem trạng thái hiện tại rồi quyết định lại.
      </Alert>}
      {error !== undefined && !stale && <Alert tone="danger" title="Chưa thực hiện được">{aiErrorText(error)}</Alert>}

      <div className="ops-actions">
        {source.approvalStatus === "Draft" && <Button type="button" onClick={() => setConfirm("approve")} disabled={busy || stale} data-testid="source-approve"><CheckCircle2 size={16} aria-hidden="true" />Duyệt nguồn</Button>}
        {source.approvalStatus === "Approved" && <Button type="button" variant="danger" onClick={() => setConfirm("retire")} disabled={busy || stale} data-testid="source-retire"><Ban size={16} aria-hidden="true" />Ngừng dùng</Button>}
        {source.approvalStatus === "Retired" && <p className={styles.muted}>Nguồn đã ngừng dùng; không thể duyệt lại. Đăng ký phiên bản mới nếu cần.</p>}
      </div>
    </>}

    <Modal open={confirm !== null} onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }} size="sm" title={confirm === "approve" ? "Duyệt nguồn tri thức?" : "Ngừng dùng nguồn tri thức?"}
      description={confirm === "approve" ? "Sau khi duyệt, AI của tổ chức có thể trích dẫn nguồn trong khoảng hiệu lực." : "AI không còn trích dẫn nguồn này ở yêu cầu mới; bài học đã xuất bản không bị sửa."}
      className={confirm === "retire" ? "ops-dialog--danger" : undefined}
      footer={<><Button type="button" variant="quiet" onClick={() => setConfirm(null)} disabled={busy}>Hủy</Button><Button type="button" variant={confirm === "retire" ? "danger" : "primary"} onClick={() => confirm && void run(confirm)} disabled={busy} data-testid="source-confirm">{busy ? "Đang gửi…" : "Xác nhận"}</Button></>}>
      <p className={styles.muted}>{source?.title} · phiên bản {source?.versionLabel}</p>
    </Modal>
  </div>;
}

/** Knowledge-source registry: search + chips in the URL; a row opens the drawer, the "···" menu approves/retires with If-Match. */
export function AdminSourcesTab({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const visibility = get("visibility");
  const status = get("status");
  const search = get("q");
  const sourceId = get("source");
  const creating = get("create") === "1";
  const [text, setText] = useUrlSearch(search, setParams);
  const [quick, setQuick] = useState<{ source: KnowledgeSource; operation: "approve" | "retire" } | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);

  const list = useAsyncData(
    `admin-ai:sources:${page}:${visibility}:${status}:${search}`,
    (signal) => adminAiApi.listKnowledgeSources(accessToken, { page, pageSize: PAGE_SIZE, visibility: visibility || undefined, status: status || undefined, search: search || undefined }, signal),
  );
  const organizations = useAsyncData("admin-ai:orgs", () => accountsApi.organizations(accessToken));
  const organizationOptions = (organizations.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }));
  const orgName = (id: string | null | undefined) => (id ? organizationOptions.find((item) => item.value === id)?.label ?? `${id.slice(0, 8)}…` : "—");
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(visibility || status || search);
  const open = (id: string) => setParams({ source: id });
  const setCreating = (value: boolean) => setParams({ create: value ? "1" : null });

  /** Row-menu approve/retire: If-Match from the revision the list showed; a 412 means someone changed it meanwhile. */
  const runQuick = async () => {
    if (!quick || quickBusy) return;
    setQuickBusy(true);
    try {
      await adminAiApi.changeKnowledgeSource(accessToken, quick.source.id, quick.operation, knowledgeEtag(quick.source.revision));
      toast.notify({ tone: "success", title: quick.operation === "approve" ? "Đã duyệt nguồn" : "Đã ngừng dùng nguồn", description: quick.source.title });
      setQuick(null);
      list.reload();
    } catch (cause) {
      const stale = cause instanceof ApiError && cause.status === 412;
      toast.notify({ tone: stale ? "warning" : "danger", title: stale ? "Nguồn đã thay đổi ở nơi khác" : "Chưa thực hiện được", description: stale ? "Chưa ghi đè gì. Danh sách được tải lại; mở chi tiết để xem trạng thái hiện tại." : aiErrorText(cause) });
      setQuick(null);
      list.reload();
    } finally {
      setQuickBusy(false);
    }
  };

  const columns: DataColumn<KnowledgeSource>[] = [
    { key: "title", header: "Nguồn", primary: true, render: (item) => <CellTitle title={<span className={styles.clip}>{item.title}</span>} sub={`phiên bản ${item.versionLabel}`} /> },
    { key: "visibility", header: "Phạm vi", width: 190, hideBelow: 900, render: (item) => <CellTitle title={visibilityLabel(item.visibility)} sub={item.visibility === "Organization" ? orgName(item.organizationId) : undefined} /> },
    { key: "status", header: "Trạng thái", width: 150, render: (item) => <StatusBadge tone={statusOf(item.approvalStatus).tone}>{statusOf(item.approvalStatus).label}</StatusBadge> },
    { key: "period", header: "Hiệu lực", width: 210, hideBelow: 1100, render: (item) => <CellTitle title={item.effectiveFrom ? formatDateTime(item.effectiveFrom) : "Ngay"} sub={item.effectiveUntil ? `đến ${formatDateTime(item.effectiveUntil)}` : "không giới hạn"} /> },
    { key: "created", header: "Tạo lúc", width: 170, hideBelow: 1200, render: (item) => formatDateTime(item.createdAt) },
  ];

  return <div className={styles.stack}>
    <DataTable<KnowledgeSource>
      caption="Nguồn tri thức"
      data-testid="ai-sources-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={(item) => open(item.id)}
      rowTone={(item) => (item.approvalStatus === "Retired" ? "muted" : undefined)}
      rowMenu={(item) => [
        { label: "Xem chi tiết", icon: Eye, onSelect: () => open(item.id) },
        ...(item.approvalStatus === "Draft" ? [{ label: "Duyệt nguồn", icon: CheckCircle2, onSelect: () => setQuick({ source: item, operation: "approve" }), separator: true }] : []),
        ...(item.approvalStatus === "Approved" ? [{ label: "Ngừng dùng", icon: Ban, tone: "danger" as const, onSelect: () => setQuick({ source: item, operation: "retire" }), separator: true }] : []),
      ]}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được nguồn tri thức" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <TableSearch value={text} onChange={setText} label="Tìm nguồn" placeholder="Tìm theo tiêu đề, phiên bản, khu vực" />
        <FilterChips label="Bộ lọc nguồn tri thức">
          <FilterChip label="Phạm vi" value={visibility} onChange={(value) => setParams({ visibility: value })} options={[{ value: "Common", label: "Dùng chung" }, { value: "Organization", label: "Riêng một tổ chức" }]} />
          <FilterChip label="Trạng thái" value={status} onChange={(value) => setParams({ status: value })} options={Object.keys(STATUS).map((value) => ({ value, label: STATUS[value].label }))} />
        </FilterChips>
        {filtering && <Button variant="quiet" onClick={() => { setText(""); setParams({ visibility: null, status: null, q: null }); }}>Xóa bộ lọc</Button>}
        <Button variant="quiet" onClick={list.reload} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
        <Button onClick={() => setCreating(true)} data-testid="source-new"><Plus size={16} aria-hidden="true" />Đăng ký nguồn</Button>
      </>}
      empty={<EmptyState icon={filtering ? Search : BookMarked} title={filtering ? "Không có nguồn phù hợp." : "Chưa có nguồn tri thức nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Chưa có nguồn đã duyệt thì AI không có gì để trích dẫn. Đăng ký nguồn (bản nháp) rồi duyệt."} action={!filtering ? <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Đăng ký nguồn</Button> : undefined} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.hint}>Bấm hàng để xem chi tiết; menu “···” để duyệt hoặc ngừng dùng nguồn.</p>

    <Drawer open={sourceId !== ""} onOpenChange={(open) => { if (!open) setParams({ source: null }); }} size="md" data-testid="ai-source-drawer" title="Chi tiết nguồn tri thức" description="Xem thông tin, duyệt hoặc ngừng dùng nguồn.">
      {sourceId && <SourceDetail key={sourceId} accessToken={accessToken} id={sourceId} orgName={orgName} onChanged={list.reload} />}
    </Drawer>

    <SourceModal open={creating} accessToken={accessToken} organizations={organizationOptions} onClose={() => setCreating(false)} onCreated={(created) => { list.reload(); setParams({ create: null, source: created.id }); toast.notify({ tone: "success", title: "Đã đăng ký nguồn (Bản nháp)" }); }} />

    <ConfirmDialog open={quick !== null} onOpenChange={(open) => { if (!open && !quickBusy) setQuick(null); }} busy={quickBusy}
      title={quick?.operation === "approve" ? "Duyệt nguồn tri thức?" : "Ngừng dùng nguồn tri thức?"}
      description={quick?.operation === "approve" ? "Sau khi duyệt, AI của tổ chức có thể trích dẫn nguồn trong khoảng hiệu lực." : "AI không còn trích dẫn nguồn này ở yêu cầu mới; bài học đã xuất bản không bị sửa."}
      tone={quick?.operation === "retire" ? "danger" : "primary"} confirmLabel={quick?.operation === "approve" ? "Duyệt nguồn" : "Ngừng dùng"} onConfirm={runQuick}>
      <p className={styles.muted}>{quick?.source.title} · phiên bản {quick?.source.versionLabel}</p>
    </ConfirmDialog>
  </div>;
}
