"use client";

import { ArrowLeft, ClipboardCheck, Search, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { useUrlParams } from "@/api/use-url-params";
import { DetailList, HashValue, formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { PrototypeControls } from "@/features/dev-prototype/prototype-controls";
import { useSampleQuery, type SampleMode } from "@/features/dev-prototype/use-sample-query";
import { describeDecisionError, normalizeDecisionInput, validateDecisionInput, type DecisionErrorView } from "../api";
import { SampleReviewStore, sampleOrganizations } from "../sample-store";
import type { ReviewAction, ReviewDecisionPort, ReviewDetail, ReviewStatus } from "../types";

const PAGE_SIZE = 6;
const statusView: Record<ReviewStatus, { tone: Tone; label: string }> = {
  Submitted: { tone: "warning", label: "Chờ duyệt" },
  Approved: { tone: "success", label: "Đã duyệt" },
  Rejected: { tone: "danger", label: "Đã từ chối" },
};

const isStatus = (value: string): value is ReviewStatus => value === "Submitted" || value === "Approved" || value === "Rejected";

function ContentStatusBadge({ status }: { status: ReviewStatus }) {
  return <StatusBadge tone={statusView[status].tone}>{statusView[status].label}</StatusBadge>;
}

function ReadinessBadge({ ready }: { ready: boolean }) {
  return <StatusBadge tone={ready ? "info" : "neutral"}>{ready ? "Sẵn sàng" : "Chưa sẵn sàng"}</StatusBadge>;
}

export function ReviewsPrototype() {
  const [store, setStore] = useState(() => new SampleReviewStore());
  const [rev, setRev] = useState(0);
  const [mode, setMode] = useState<SampleMode>("normal");
  const [failNext, setFailNext] = useState(false);
  const [mismatchNext, setMismatchNext] = useState(false);
  const url = useUrlParams({ pageSize: PAGE_SIZE });
  const versionId = url.get("review");

  const decide: ReviewDecisionPort = (action, id, input, key) => {
    const simulate = { networkFailure: failNext, hashMismatch: mismatchNext };
    setFailNext(false);
    setMismatchNext(false);
    return store.decide(action, id, input, key, simulate);
  };

  return <div>
    <PrototypeControls mode={mode} onModeChange={setMode} onReset={() => { setStore(new SampleReviewStore()); setRev((value) => value + 1); url.setParams({ review: null }); }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
        <input type="checkbox" checked={failNext} onChange={(event) => setFailNext(event.target.checked)} />Lỗi mạng ở lần gửi quyết định kế tiếp
      </label>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
        <input type="checkbox" checked={mismatchNext} onChange={(event) => setMismatchNext(event.target.checked)} />409 hash không khớp ở lần kế tiếp
      </label>
    </PrototypeControls>
    {versionId
      ? <ReviewDetailView store={store} rev={rev} mode={mode} versionId={versionId} decide={decide} onBack={() => url.setParams({ review: null })} onChanged={() => setRev((value) => value + 1)} />
      : <ReviewQueue store={store} rev={rev} mode={mode} url={url} />}
  </div>;
}

function ReviewQueue({ store, rev, mode, url }: { store: SampleReviewStore; rev: number; mode: SampleMode; url: ReturnType<typeof useUrlParams> }) {
  const statusParam = url.get("status");
  const status = isStatus(statusParam) ? statusParam : "";
  const organizationId = url.get("organizationId");
  const list = useSampleQuery(`reviews:${rev}:${url.page}:${status}:${organizationId}`, mode, (m) =>
    m === "empty" ? { items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE } : store.list({ status, organizationId, page: url.page, pageSize: PAGE_SIZE }));
  const items = list.data?.items ?? [];
  const filtering = Boolean(status || organizationId);

  return <Panel title="Hàng chờ duyệt kịch bản" description="Mỗi dòng là một phiên bản kịch bản và rubric đã được tổ chức nộp, với hash nội dung đã đóng băng." bodyClassName="ops-stack">
    <div className="ops-toolbar" style={{ marginBottom: 0 }}>
      <Select aria-label="Trạng thái duyệt" style={{ width: 200 }} value={status} onChange={(event) => url.setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái duyệt</option><option value="Submitted">Chờ duyệt</option><option value="Approved">Đã duyệt</option><option value="Rejected">Đã từ chối</option>
      </Select>
      <Select aria-label="Tổ chức" style={{ width: 280, maxWidth: "100%" }} value={organizationId} onChange={(event) => url.setParams({ organizationId: event.target.value })}>
        <option value="">Mọi tổ chức</option>{sampleOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
      </Select>
      <span className="ops-field-hint" style={{ marginLeft: "auto" }}>{store.pendingCount()} bản đang chờ duyệt</span>
    </div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được hàng chờ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>Hãy kiểm tra kết nối rồi thử lại.</Alert>}
    <Table caption="Hàng chờ duyệt kịch bản (dữ liệu mẫu)">
      <thead><tr><th>Kịch bản</th><th>Tổ chức</th><th>Nộp lúc</th><th>Duyệt nội dung</th><th>Readiness kỹ thuật</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={5} label="Đang tải hàng chờ duyệt…" /></TableMessage>}
        {items.map((item) => <tr key={item.versionId}>
          <td><button type="button" className="ops-cell-primary" style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", minHeight: 24 }} onClick={() => url.setParams({ review: item.versionId })}>{item.scenarioName}<span className="ops-cell-sub">Phiên bản {item.versionNumber} · {item.buildingName}</span></button></td>
          <td>{item.organizationName}</td>
          <td>{formatDateTime(item.submittedAt)}</td>
          <td><ContentStatusBadge status={item.status} /></td>
          <td><ReadinessBadge ready={item.readinessReady} /></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtering ? Search : ClipboardCheck} title={filtering ? "Không có bản nào phù hợp bộ lọc." : "Chưa có kịch bản nào chờ duyệt"} description={filtering ? "Thử đổi trạng thái hoặc tổ chức." : "Khi tổ chức nộp kịch bản và rubric, chúng sẽ xuất hiện ở đây."} action={filtering ? <Button size="sm" variant="secondary" onClick={() => url.setParams({ status: null, organizationId: null })}>Xóa bộ lọc</Button> : undefined} /></TableMessage>}
      </tbody>
    </Table>
    {(list.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} totalCount={list.data?.totalCount ?? 0} onPageChange={url.setPage} disabled={list.loading} />}
  </Panel>;
}

function ReviewDetailView({ store, rev, mode, versionId, decide, onBack, onChanged }: {
  store: SampleReviewStore; rev: number; mode: SampleMode; versionId: string; decide: ReviewDecisionPort; onBack: () => void; onChanged: () => void;
}) {
  const detailQuery = useSampleQuery(`review:${versionId}:${rev}`, mode, () => store.get(versionId) ?? null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const detail = detailQuery.data;

  const back = <Button variant="quiet" size="sm" style={{ justifySelf: "start" }} onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Về hàng chờ</Button>;
  if (detailQuery.error !== undefined) return <div className="ops-stack">{back}<Alert tone="danger" title="Không tải được chi tiết bản duyệt" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detailQuery.reload}>Thử lại</Button>}>Hãy kiểm tra kết nối rồi thử lại.</Alert></div>;
  if (detailQuery.loading && !detail) return <div className="ops-stack">{back}<SkeletonRows rows={6} label="Đang tải chi tiết bản duyệt…" /></div>;
  if (!detail) return <div className="ops-stack">{back}<EmptyState icon={Search} title="Không tìm thấy bản duyệt" description="Bản này không tồn tại hoặc không còn hiển thị cho bạn. Quay lại hàng chờ để chọn bản khác." /></div>;

  const pending = detail.status === "Submitted";
  return <div className="ops-stack">
    {back}
    <Panel
      title={detail.scenarioName}
      description={`${detail.organizationName} · ${detail.buildingName} · phiên bản ${detail.versionNumber}`}
      actions={pending ? <>
        <Button variant="danger" onClick={() => setAction("reject")}><ThumbsDown size={16} aria-hidden="true" />Từ chối</Button>
        <Button onClick={() => setAction("approve")}><ThumbsUp size={16} aria-hidden="true" />Duyệt nội dung</Button>
      </> : undefined}
      bodyClassName="ops-stack"
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div><p className="ops-field-hint" style={{ margin: "0 0 4px" }}>Duyệt nội dung (PlatformAdmin)</p><ContentStatusBadge status={detail.status} /></div>
        <div><p className="ops-field-hint" style={{ margin: "0 0 4px" }}>Readiness kỹ thuật (IFC QA, xác nhận huấn luyện)</p><ReadinessBadge ready={detail.readinessReady} /></div>
      </div>
      <Alert tone="info" title="Readiness kỹ thuật không thay thế việc duyệt nội dung">Duyệt nội dung xét lời dặn, mục tiêu, tiêu chí chấm và tính an toàn sư phạm của đúng bản đã đóng băng. Readiness chỉ cho biết mô hình và gói chạy được. Phát hành cần cả hai.</Alert>
      {!pending && detail.status === "Rejected" && detail.reason && <Alert tone="danger" title="Lý do từ chối">{detail.reason}</Alert>}
      {!pending && <Alert tone={detail.status === "Approved" ? "success" : "warning"} title={detail.status === "Approved" ? "Đã duyệt đúng hash đã đóng băng" : "Đã từ chối — tổ chức cần tạo phiên bản mới"}>{`${detail.decidedBy ?? ""} · ${formatDateTime(detail.decidedAt)}. Phiên bản này không còn nhận quyết định mới.`}</Alert>}
    </Panel>

    <Tabs defaultValue="content">
      <TabsList aria-label="Chi tiết bản duyệt">
        <TabsTrigger value="content">Nội dung kịch bản</TabsTrigger>
        <TabsTrigger value="rubric">Rubric</TabsTrigger>
        <TabsTrigger value="readiness">Readiness kỹ thuật</TabsTrigger>
        <TabsTrigger value="hash">Hash đóng băng</TabsTrigger>
      </TabsList>
      <TabsContent value="content"><ContentTab detail={detail} /></TabsContent>
      <TabsContent value="rubric"><RubricTab detail={detail} /></TabsContent>
      <TabsContent value="readiness"><ReadinessTab detail={detail} /></TabsContent>
      <TabsContent value="hash"><HashTab detail={detail} /></TabsContent>
    </Tabs>

    {action && <DecisionModal action={action} detail={detail} decide={decide} onClose={() => setAction(null)} onDone={() => { setAction(null); onChanged(); }} onStale={() => { setAction(null); onChanged(); }} />}
  </div>;
}

function ContentTab({ detail }: { detail: ReviewDetail }) {
  return <div className="ops-grid ops-grid-2">
    <Panel title="Mục tiêu học tập" bodyClassName="ops-stack"><ol style={{ margin: 0, paddingLeft: 20, listStyle: "decimal", color: "var(--muted)", lineHeight: 1.7, fontSize: 14 }}>{detail.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ol></Panel>
    <Panel title="Hướng dẫn cho học viên" bodyClassName="ops-stack"><p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.7, fontSize: 14 }}>{detail.learnerInstructions}</p></Panel>
    <Panel title="Tình huống nguy hiểm" description={`${detail.hazards.length} yếu tố`} bodyClassName="ops-stack">
      <Table caption="Yếu tố nguy hiểm"><thead><tr><th>Mã</th><th>Loại</th><th>Cường độ</th><th>Kích hoạt (giây)</th></tr></thead>
        <tbody>{detail.hazards.map((hazard) => <tr key={hazard.id}><td>{hazard.id}</td><td>{hazard.type}</td><td>{hazard.intensity}</td><td>{hazard.activationSeconds}</td></tr>)}</tbody></Table>
    </Panel>
    <Panel title="Chấm điểm, lộ trình, khả năng cần có" bodyClassName="ops-stack">
      <DetailList items={[
        { label: "Điểm gốc", value: detail.scoring.baseScore },
        { label: "Giới hạn thời gian", value: `${detail.scoring.timeLimitSeconds} giây` },
        { label: "Trừ mỗi lỗi", value: detail.scoring.penaltyPerMistake },
        { label: "Lộ trình sơ tán", value: detail.routes.join(", ") },
        { label: "Capability runtime yêu cầu", value: detail.requiredCapabilities.join(", ") },
      ]} />
    </Panel>
  </div>;
}

function RubricTab({ detail }: { detail: ReviewDetail }) {
  const total = detail.rubric.reduce((sum, criterion) => sum + criterion.weight, 0);
  return <Panel title="Tiêu chí chấm" description={`Tổng trọng số ${total}%`} bodyClassName="ops-stack">
    <Table caption="Tiêu chí rubric"><thead><tr><th>Tiêu chí</th><th>Trọng số</th><th>Mô tả</th></tr></thead>
      <tbody>{detail.rubric.map((criterion) => <tr key={criterion.name}><td className="ops-cell-primary">{criterion.name}</td><td>{criterion.weight}%</td><td>{criterion.description}</td></tr>)}</tbody></Table>
    {total !== 100 && <Alert tone="warning" title="Tổng trọng số khác 100%">Ngưỡng và cách chấm rubric chưa được chốt ở Docs; hiển thị đúng dữ liệu đã nộp, không tự sửa.</Alert>}
  </Panel>;
}

function ReadinessTab({ detail }: { detail: ReviewDetail }) {
  const readiness = detail.readiness;
  const rows: Array<{ label: string; ok: boolean; text: string }> = [
    { label: "Lượt kiểm tra IFC/kịch bản gần nhất", ok: readiness.validationOutcome === "Passed", text: readiness.validationOutcome === "Passed" ? "Đạt" : readiness.validationOutcome === "Failed" ? "Không đạt" : "Chưa chạy" },
    { label: "Vấn đề mức Error/Critical", ok: readiness.blockingIssues === 0, text: readiness.blockingIssues === 0 ? "Không có" : `${readiness.blockingIssues} vấn đề chặn` },
    { label: "Xác nhận dùng cho huấn luyện (ConfirmForTraining)", ok: readiness.confirmForTraining, text: readiness.confirmForTraining ? "Đã xác nhận" : "Chưa xác nhận" },
    { label: "Gói tương thích runtime", ok: readiness.runtimeReady, text: readiness.runtimeReady ? "Tương thích" : "Chưa tương thích" },
  ];
  return <Panel title="Readiness kỹ thuật" description="Tình trạng mô hình và gói chạy. Không phải kết quả duyệt nội dung." bodyClassName="ops-stack">
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {rows.map((row) => <li key={row.label} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 9 }}>
        <span style={{ fontSize: 14 }}>{row.label}</span><StatusBadge tone={row.ok ? "success" : "warning"}>{row.text}</StatusBadge>
      </li>)}
    </ul>
    <Alert tone="info">Một lượt kiểm tra thành công chưa có nghĩa nội dung được duyệt, và ngược lại một bản đã duyệt vẫn bị chặn phát hành nếu readiness chưa đạt.</Alert>
  </Panel>;
}

function HashTab({ detail }: { detail: ReviewDetail }) {
  return <Panel title="Hash đã đóng băng khi nộp" description="Quyết định chỉ có hiệu lực với đúng cặp hash này. Sửa nội dung hoặc rubric tạo phiên bản mới và phải nộp lại." bodyClassName="ops-stack">
    <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Hash nội dung (SHA-256)</p><HashValue label="Hash nội dung" value={detail.contentHash} /></div>
    <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Hash rubric (SHA-256)</p><HashValue label="Hash rubric" value={detail.rubricHash} /></div>
    <DetailList items={[
      { label: "Người nộp", value: detail.submittedBy },
      { label: "Nộp lúc", value: formatDateTime(detail.submittedAt) },
      { label: "Người quyết định", value: detail.decidedBy ?? "—" },
      { label: "Quyết định lúc", value: formatDateTime(detail.decidedAt) },
    ]} />
  </Panel>;
}

function DecisionModal({ action, detail, decide, onClose, onDone, onStale }: {
  action: ReviewAction; detail: ReviewDetail; decide: ReviewDecisionPort; onClose: () => void; onDone: () => void; onStale: () => void;
}) {
  const toast = useToast();
  const idempotency = useIdempotencyKey();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<DecisionErrorView | null>(null);
  const approve = action === "approve";
  const input = { contentHash: detail.contentHash, rubricHash: detail.rubricHash, ...(approve ? {} : { reason }) };
  const fieldError = error?.fieldErrors.reason;

  const submit = async () => {
    if (saving) return;
    const problems = validateDecisionInput(action, input);
    if (Object.keys(problems).length > 0) { setError({ message: "", fieldErrors: problems, retryable: false }); return; }
    setSaving(true);
    setError(null);
    try {
      // Same payload => same key, so a retry after a lost response replays the first decision instead of repeating it.
      const key = idempotency.keyFor({ action, versionId: detail.versionId, input: normalizeDecisionInput(action, input) });
      await decide(action, detail.versionId, input, key);
      idempotency.done();
      toast.notify({ tone: "success", title: approve ? "Đã duyệt nội dung kịch bản" : "Đã từ chối kịch bản", description: `${detail.scenarioName} (dữ liệu mẫu — không gọi API thật)` });
      onDone();
    } catch (cause) {
      setError(describeDecisionError(cause));
    } finally {
      setSaving(false);
    }
  };

  const stale = error && !error.retryable && !error.fieldErrors.reason && error.message;
  return <Modal open onOpenChange={(open) => { if (!open && !saving) onClose(); }}
    title={approve ? "Duyệt nội dung kịch bản?" : "Từ chối kịch bản"}
    description={approve ? `Duyệt đúng phiên bản ${detail.versionNumber} với hash đã đóng băng. Không thể hoàn tác; sửa đổi sau này phải tạo phiên bản mới.` : "Tổ chức sẽ thấy lý do này. Họ cần tạo phiên bản mới và nộp lại."}
    footer={<>
      <Button variant="quiet" onClick={onClose} disabled={saving}>Hủy</Button>
      {stale
        ? <Button variant="secondary" onClick={onStale}>Tải lại chi tiết</Button>
        : <Button variant={approve ? "primary" : "danger"} onClick={() => void submit()} disabled={saving || (approve && !confirmed)}>{saving ? "Đang gửi…" : error?.retryable ? "Thử lại" : approve ? "Duyệt nội dung" : "Từ chối"}</Button>}
    </>}>
    <div className="ops-stack">
      {approve ? <>
        <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Hash nội dung</p><HashValue label="Hash nội dung sẽ duyệt" value={detail.contentHash} /></div>
        <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Hash rubric</p><HashValue label="Hash rubric sẽ duyệt" value={detail.rubricHash} /></div>
        {!detail.readinessReady && <Alert tone="warning" title="Readiness kỹ thuật chưa đạt">Bạn vẫn có thể duyệt nội dung, nhưng bản này chưa phát hành được cho tới khi readiness đạt.</Alert>}
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, cursor: "pointer" }}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} style={{ marginTop: 3 }} />
          Tôi đã xem nội dung và rubric của đúng phiên bản này.
        </label>
      </> : <Field label="Lý do từ chối" required hint={`${reason.trim().length}/4000 ký tự`} error={fieldError}>
        {(props) => <Textarea {...props} rows={5} maxLength={4000} value={reason} onChange={(event) => { setReason(event.target.value); if (fieldError) setError(null); }} placeholder="Nêu rõ điều cần sửa để tổ chức chỉnh lại." />}
      </Field>}
      {error?.message && <Alert tone="danger">{error.message}</Alert>}
    </div>
  </Modal>;
}
