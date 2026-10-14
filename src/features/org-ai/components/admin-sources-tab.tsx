"use client";

import { BookMarked, Plus, RefreshCw, Search } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { ApiError } from "@/api/types/common";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
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
const statusOf = (status: string) => STATUS[status] ?? { label: status, tone: "neutral" as Tone };
const visibilityLabel = (visibility: string) => (visibility === "Common" ? "Dùng chung" : visibility === "Organization" ? "Riêng một tổ chức" : visibility);

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
  if (!SHA256.test(form.sourceHash.trim().toLowerCase())) errors.sourceHash = "SHA-256 của tài liệu gồm 64 ký tự hex.";
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

function SourceForm({ accessToken, onCreated, onClose }: { accessToken: string; onCreated: (source: KnowledgeSource) => void; onClose: () => void }) {
  const { keyFor, done } = useIdempotencyKey();
  const organizations = useAsyncData("admin-ai:orgs", () => accountsApi.organizations(accessToken));
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [hashing, setHashing] = useState<string | null>(null);
  const lock = useRef(false);
  const set = (key: keyof Form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const hashFile = async (file: File | undefined) => {
    if (!file) return;
    setHashing("Đang tính SHA-256…");
    try {
      const hash = await sha256Hex(file);
      setForm((current) => ({ ...current, sourceHash: hash }));
      setHashing(`Đã tính từ “${file.name}” (${file.size.toLocaleString("vi-VN")} byte). Tệp không được tải lên.`);
    } catch (cause) {
      setHashing(cause instanceof Error ? cause.message : "Không tính được SHA-256.");
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
      onCreated(created);
    } catch (cause) {
      setError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const show = (path: string, key: keyof Form) => errors[key] ?? fieldIssue(error, path);

  return <form className={styles.stack} onSubmit={submit} aria-label="Đăng ký nguồn tri thức" noValidate>
    <Alert tone="info" title="Nguồn mới luôn ở trạng thái Bản nháp">Nguồn chỉ được AI trích dẫn sau khi bạn duyệt (Đã duyệt) và còn trong khoảng hiệu lực. Tài liệu gốc không được tải lên đây; hệ thống ghi mã băm SHA-256 và liên kết tham chiếu.</Alert>
    <Field label="Phạm vi dùng" required error={show("$.visibility", "visibility")}>
      {(props) => <Select {...props} value={form.visibility} onChange={set("visibility")}><option value="">Chọn…</option><option value="Common">Dùng chung (mọi tổ chức)</option><option value="Organization">Riêng một tổ chức</option></Select>}
    </Field>
    {form.visibility === "Organization" && <Field label="Tổ chức" required error={show("$.organizationId", "organizationId")}>
      {(props) => <Select {...props} value={form.organizationId} onChange={set("organizationId")}><option value="">Chọn tổ chức…</option>{(organizations.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
    </Field>}
    <Field label="Tiêu đề" required error={show("$.title", "title")}>{(props) => <Input {...props} value={form.title} onChange={set("title")} maxLength={500} />}</Field>
    <div className={styles.grid2}>
      <Field label="Nhãn phiên bản" required hint="Ví dụ năm ban hành hoặc số hiệu." error={show("$.versionLabel", "versionLabel")}>{(props) => <Input {...props} value={form.versionLabel} onChange={set("versionLabel")} autoComplete="off" />}</Field>
      <Field label="Phạm vi pháp lý/khu vực" error={show("$.jurisdiction", "jurisdiction")}>{(props) => <Input {...props} value={form.jurisdiction} onChange={set("jurisdiction")} maxLength={100} />}</Field>
    </div>
    <Field label="SHA-256 của tài liệu" required hint="Dán mã 64 ký tự hex hoặc chọn tệp để tính ngay trong trình duyệt." error={show("$.sourceHash", "sourceHash")}>
      {(props) => <Input {...props} value={form.sourceHash} onChange={set("sourceHash")} autoComplete="off" spellCheck={false} className="font-mono" />}
    </Field>
    <Field label="Tính SHA-256 từ tệp" hint={hashing ?? "Chỉ tính cục bộ; tệp không rời trình duyệt."}>
      {(props) => <input {...props} type="file" onChange={(event) => void hashFile(event.target.files?.[0])} />}
    </Field>
    <Field label="Liên kết tham chiếu (https)" hint="Không chứa tài khoản/mật khẩu. Tùy chọn." error={show("$.sourceUri", "sourceUri")}>{(props) => <Input {...props} type="url" value={form.sourceUri} onChange={set("sourceUri")} placeholder="https://" autoComplete="off" />}</Field>
    <div className={styles.grid2}>
      <Field label="Hiệu lực từ" error={show("$.effectiveFrom", "effectiveFrom")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveFrom} onChange={set("effectiveFrom")} />}</Field>
      <Field label="Hiệu lực đến" error={show("$.effectiveUntil", "effectiveUntil")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveUntil} onChange={set("effectiveUntil")} />}</Field>
    </div>
    {error !== undefined && <Alert tone="danger" title="Chưa đăng ký được nguồn">{aiErrorText(error)} Nội dung bạn nhập vẫn được giữ; bấm Đăng ký để thử lại với cùng khóa chống trùng.</Alert>}
    <div className="ops-actions"><Button type="submit" disabled={busy} data-testid="source-create">{busy ? "Đang đăng ký…" : "Đăng ký nguồn"}</Button><Button type="button" variant="quiet" onClick={onClose} disabled={busy}>Hủy</Button></div>
  </form>;
}

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
    {detail.loading && !current && <SkeletonRows rows={4} label="Đang tải nguồn…" />}
    {detail.error !== undefined && !current && <Alert tone="danger" title="Không tải được nguồn" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{aiErrorText(detail.error)}</Alert>}
    {source && <>
      <div className={styles.row}><strong>{source.title}</strong><StatusBadge tone={statusOf(source.approvalStatus).tone} data-testid="source-status">{statusOf(source.approvalStatus).label}</StatusBadge></div>
      <dl className={styles.meta}>
        <dt>Phạm vi dùng</dt><dd>{visibilityLabel(source.visibility)}{source.visibility === "Organization" ? ` · ${orgName(source.organizationId)}` : ""}</dd>
        <dt>Phiên bản</dt><dd>{source.versionLabel}</dd>
        <dt>SHA-256</dt><dd className={styles.mono}>{source.sourceHash}</dd>
        <dt>Liên kết</dt><dd>{source.sourceUri ? <span className={styles.mono}>{source.sourceUri}</span> : "Không có"}</dd>
        <dt>Pháp lý/khu vực</dt><dd>{source.jurisdiction || "Không nêu"}</dd>
        <dt>Hiệu lực</dt><dd>{source.effectiveFrom ? formatDateTime(source.effectiveFrom) : "Ngay"} – {source.effectiveUntil ? formatDateTime(source.effectiveUntil) : "không giới hạn"}</dd>
        <dt>Duyệt lúc</dt><dd>{source.approvedAt ? formatDateTime(source.approvedAt) : "Chưa duyệt"}</dd>
        <dt>Tạo lúc</dt><dd>{formatDateTime(source.createdAt)}</dd>
        <dt>Phiên bản bản ghi</dt><dd data-testid="source-revision">{source.revision}</dd>
        {source.visibility === "Common" && <><dt>Learn dùng được</dt><dd>Bản nháp Learn: {source.canUseInDraft ? "được trích dẫn" : "chưa"} · xuất bản/RAG: {source.canPublishReference ? "chấp nhận" : "chưa"}</dd></>}
      </dl>

      {stale && <Alert tone="warning" title="Nguồn đã thay đổi ở nơi khác" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reloadFresh} data-testid="source-reload">Tải bản mới</Button>}>
        {aiErrorText(error)} Chưa có gì bị ghi đè: tải bản mới để xem trạng thái hiện tại rồi quyết định lại.
      </Alert>}
      {error !== undefined && !stale && <Alert tone="danger" title="Chưa thực hiện được">{aiErrorText(error)}</Alert>}

      <div className="ops-actions">
        {source.approvalStatus === "Draft" && <Button type="button" onClick={() => setConfirm("approve")} disabled={busy || stale} data-testid="source-approve">Duyệt nguồn</Button>}
        {source.approvalStatus === "Approved" && <Button type="button" variant="danger" onClick={() => setConfirm("retire")} disabled={busy || stale} data-testid="source-retire">Ngừng dùng</Button>}
        {source.approvalStatus === "Retired" && <p className={styles.muted}>Nguồn đã ngừng dùng; không thể duyệt lại. Đăng ký phiên bản mới nếu cần.</p>}
      </div>
    </>}

    <Modal open={confirm !== null} onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }} title={confirm === "approve" ? "Duyệt nguồn tri thức?" : "Ngừng dùng nguồn tri thức?"}
      description={confirm === "approve" ? "Sau khi duyệt, AI của tổ chức có thể trích dẫn nguồn trong khoảng hiệu lực." : "AI không còn trích dẫn nguồn này ở yêu cầu mới; bài Learn đã xuất bản không bị sửa."}
      footer={<><Button type="button" variant="quiet" onClick={() => setConfirm(null)} disabled={busy}>Hủy</Button><Button type="button" variant={confirm === "retire" ? "danger" : "primary"} onClick={() => confirm && void run(confirm)} disabled={busy} data-testid="source-confirm">{busy ? "Đang gửi…" : "Xác nhận"}</Button></>}>
      <p className={styles.muted}>{source?.title} · phiên bản {source?.versionLabel}</p>
    </Modal>
  </div>;
}

export function AdminSourcesTab({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const visibility = get("visibility");
  const status = get("status");
  const search = get("q");
  const sourceId = get("source");
  const [text, setText] = useUrlSearch(search, setParams);
  const [creating, setCreating] = useState(false);

  const list = useAsyncData(
    `admin-ai:sources:${page}:${visibility}:${status}:${search}`,
    (signal) => adminAiApi.listKnowledgeSources(accessToken, { page, pageSize: PAGE_SIZE, visibility: visibility || undefined, status: status || undefined, search: search || undefined }, signal),
  );
  const organizations = useAsyncData("admin-ai:orgs", () => accountsApi.organizations(accessToken));
  const orgName = (id: string | null | undefined) => (id ? (organizations.data?.items ?? []).find((item) => item.id === id)?.name ?? `${id.slice(0, 8)}…` : "—");
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(visibility || status || search);

  return <>
    <div className="ops-toolbar">
      <div className="ops-toolbar-grow"><Input aria-label="Tìm nguồn" type="search" placeholder="Tìm theo tiêu đề, phiên bản, khu vực" value={text} onChange={(event) => setText(event.target.value)} /></div>
      <Select aria-label="Phạm vi dùng" style={{ width: 190 }} value={visibility} onChange={(event) => setParams({ visibility: event.target.value })}>
        <option value="">Mọi phạm vi</option><option value="Common">Dùng chung</option><option value="Organization">Riêng một tổ chức</option>
      </Select>
      <Select aria-label="Trạng thái nguồn" style={{ width: 180 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option>{Object.keys(STATUS).map((value) => <option key={value} value={value}>{STATUS[value].label}</option>)}
      </Select>
      {filtering && <Button variant="quiet" onClick={() => { setText(""); setParams({ visibility: null, status: null, q: null }); }}>Xóa bộ lọc</Button>}
      <Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
      <Button onClick={() => setCreating(true)} data-testid="source-new"><Plus size={16} aria-hidden="true" />Đăng ký nguồn</Button>
    </div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được nguồn tri thức" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert>}
    <Table caption="Nguồn tri thức" data-testid="admin-sources">
      <thead><tr><th>Nguồn</th><th>Phạm vi</th><th>Trạng thái</th><th>Hiệu lực</th><th>Tạo lúc</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={6} label="Đang tải nguồn tri thức…" /></TableMessage>}
        {items.map((item) => <tr key={item.id} data-testid="source-row">
          <td><button type="button" className={styles.rowButton} onClick={() => setParams({ source: item.id })} aria-label={`Mở nguồn ${item.title}`}><span className={styles.clip}>{item.title}</span></button><span className="ops-cell-sub">phiên bản {item.versionLabel}</span></td>
          <td>{visibilityLabel(item.visibility)}{item.visibility === "Organization" && <span className="ops-cell-sub">{orgName(item.organizationId)}</span>}</td>
          <td><StatusBadge tone={statusOf(item.approvalStatus).tone}>{statusOf(item.approvalStatus).label}</StatusBadge></td>
          <td>{item.effectiveFrom ? formatDateTime(item.effectiveFrom) : "Ngay"}<span className="ops-cell-sub">{item.effectiveUntil ? `đến ${formatDateTime(item.effectiveUntil)}` : "không giới hạn"}</span></td>
          <td>{formatDateTime(item.createdAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtering ? Search : BookMarked} title={filtering ? "Không có nguồn phù hợp." : "Chưa có nguồn tri thức nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Chưa có nguồn đã duyệt thì AI không có gì để trích dẫn. Đăng ký nguồn (bản nháp) rồi duyệt."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={sourceId !== ""} onOpenChange={(open) => { if (!open) setParams({ source: null }); }} title="Chi tiết nguồn tri thức" description="Duyệt hoặc ngừng dùng theo phiên bản bản ghi (If-Match)." className={styles.wideDrawer}>
      {sourceId && <SourceDetail key={sourceId} accessToken={accessToken} id={sourceId} orgName={orgName} onChanged={list.reload} />}
    </Drawer>
    <Drawer open={creating} onOpenChange={setCreating} title="Đăng ký nguồn tri thức" description="Một phiên bản của một tài liệu, ở trạng thái Bản nháp." className={styles.wideDrawer}>
      {creating && <SourceForm accessToken={accessToken} onClose={() => setCreating(false)} onCreated={(created) => { setCreating(false); list.reload(); setParams({ source: created.id }); toast.notify({ tone: "success", title: "Đã đăng ký nguồn (Bản nháp)" }); }} />}
    </Drawer>
  </>;
}
