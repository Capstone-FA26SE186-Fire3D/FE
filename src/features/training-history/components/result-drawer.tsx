"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { describeFailure } from "../errors";
import { isUuid } from "../filters";
import { useSessionDetail, type SessionDetail } from "../hooks";
import {
  criterionReasonText, endReasonLabel, formatMetricValue, formatScore, formatWhen, metricName, modeLabel, operatorSymbol, outcomeView,
  reasonText, resultCellView, sessionStatusView, trainingTitle,
} from "../labels";
import type { CriterionResult, HistoryItem, TrainingResult } from "../types";

/** What the header can say about the session, from the list row when it is at hand and from the session state otherwise. */
type Meta = { status: string; mode: string; startedAt: string | null; endedAt: string | null; endReason: string | null; known: HistoryItem | null };

function metaOf(known: HistoryItem | null, detail: SessionDetail | undefined): Meta | null {
  if (known) return { status: known.status, mode: known.mode, startedAt: known.startedAt, endedAt: known.endedAt, endReason: known.endReason, known };
  const state = detail?.state;
  return state ? { status: state.status, mode: state.mode, startedAt: state.startedAt, endedAt: state.endedAt, endReason: state.endReason, known: null } : null;
}

const metricOrder = ["reached_exit", "completion_time_seconds", "wrong_exits", "hazard_exposure", "distance_meters"];

function CriteriaTable({ criteria }: { criteria: CriterionResult[] }) {
  return <table className="th-table">
    <thead><tr><th scope="col">Tiêu chí</th><th scope="col">Số đo</th><th scope="col">Yêu cầu</th><th scope="col">Bắt buộc</th><th scope="col">Kết quả</th></tr></thead>
    <tbody>{criteria.map((criterion, index) => {
      const threshold = criterion.threshold === null ? "—" : `${operatorSymbol(criterion.operator)} ${formatMetricValue(criterion.metric, criterion.threshold)}`;
      const unavailable = criterion.reason === "METRIC_UNAVAILABLE";
      return <tr key={`${criterion.id}-${index}`} data-testid="criterion">
        <td data-label="Tiêu chí" className="th-table-name">
          <strong data-testid={criterion.label ? "criterion-label" : undefined}>{criterion.label || metricName(criterion.metric)}</strong>
          {criterion.label && <span className="th-table-metric">{metricName(criterion.metric)}</span>}
          {criterion.description && <span className="ops-muted th-table-desc">{criterion.description}</span>}
          {criterion.id && <span className="th-code">Mã tiêu chí: {criterion.id}</span>}
        </td>
        <td data-label="Số đo">{formatMetricValue(criterion.metric, criterion.value)}</td>
        <td data-label="Yêu cầu">{threshold}{criterion.weight === null ? null : <small>Trọng số {criterion.weight.toLocaleString("vi-VN")}</small>}</td>
        <td data-label="Bắt buộc">{criterion.mandatory ? "Bắt buộc" : "Không"}</td>
        <td data-label="Kết quả">
          <StatusBadge tone={unavailable ? "warning" : criterion.passed ? "success" : "danger"}>{unavailable ? "Chưa chấm" : criterion.passed ? "Đạt" : "Chưa đạt"}</StatusBadge>
          {criterion.reason && <small>{criterionReasonText(criterion.reason)}</small>}
          {criterion.reason && <span className="th-code">{criterion.reason}</span>}
        </td>
      </tr>;
    })}</tbody>
  </table>;
}

/** Reason and score of the stored result, inside the assessment card. The pass threshold exists only in Assessment. */
function ResultFacts({ result }: { result: TrainingResult }) {
  const assessment = result.mode === "Assessment" && result.passThresholdPercent !== null;
  return <>
    <div data-testid="result-outcome">
      <p>{reasonText(result.reason)}</p>
      {result.reason && <p className="th-code">Mã lý do: {result.reason}</p>}
    </div>
    <div data-testid="result-score" className="th-scoreline">
      <span>Điểm</span>
      <strong className="th-score" data-empty={result.scorePercent === null}>{formatScore(result.scorePercent)}</strong>
      {assessment && <p data-testid="result-threshold">Ngưỡng đạt: {formatScore(result.passThresholdPercent)} (chỉ có ở chế độ Đánh giá)</p>}
    </div>
  </>;
}

function ResultBody({ result }: { result: TrainingResult }) {
  const metricKeys = [...metricOrder.filter((key) => key in result.metrics), ...Object.keys(result.metrics).filter((key) => !metricOrder.includes(key))];
  return <>
    <section aria-labelledby="th-criteria-heading">
      <h3 id="th-criteria-heading">Tiêu chí</h3>
      {result.criteria && result.criteria.length > 0
        ? <CriteriaTable criteria={result.criteria} />
        : <p className="ops-muted" data-testid="no-criteria">Máy chủ không trả tiêu chí chi tiết cho lượt này.</p>}
    </section>

    <section aria-labelledby="th-metrics-heading">
      <h3 id="th-metrics-heading">Số đo chính</h3>
      {metricKeys.length > 0
        ? <dl className="th-tiles" data-testid="metrics">{metricKeys.map((key) => <div key={key}><dt>{metricName(key)}</dt><dd>{formatMetricValue(key, result.metrics[key])}</dd></div>)}</dl>
        : <p className="ops-muted">Máy chủ không trả số đo nào cho lượt này.</p>}
    </section>

    <details>
      <summary className="ops-muted" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Thông tin kỹ thuật</summary>
      <dl className="th-metrics" style={{ marginTop: 8 }}>
        <dt>Mã lượt tập</dt><dd className="th-code">{result.sessionId}</dd>
        <dt>Lưu kết quả lúc</dt><dd>{formatWhen(result.createdAt)}</dd>
        {result.lastEventSequence !== null && <><dt>Sự kiện cuối được tính</dt><dd>{result.lastEventSequence}</dd></>}
        {result.rubricHash && <><dt>Bộ tiêu chí (hash)</dt><dd className="th-code">{result.rubricHash.slice(0, 16)}…</dd></>}
      </dl>
    </details>
  </>;
}

function Body({ sessionId, known, onRefresh, onClose, accessToken }: { sessionId: string; known: HistoryItem | null; onRefresh: () => void; onClose: () => void; accessToken: string | null }) {
  const valid = isUuid(sessionId);
  const detail = useSessionDetail(accessToken, sessionId, known);
  const reload = () => { detail.reload(); onRefresh(); };

  if (!valid) {
    return <Alert tone="danger" title="Liên kết lượt tập không hợp lệ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={onClose}>Về danh sách</Button>}>Mã lượt tập trong liên kết không đúng định dạng. Hãy mở lại từ danh sách lịch sử.</Alert>;
  }
  if (detail.error !== undefined) {
    const failure = describeFailure(detail.error, "detail");
    return <Alert tone="danger" title={failure.title} action={<div className="ops-actions mt-3">
      {failure.retryable && <Button size="sm" variant="secondary" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Thử lại</Button>}
      <Button size="sm" variant="quiet" onClick={onClose}>Về danh sách</Button>
    </div>}>{failure.message}{failure.code ? ` (mã lỗi: ${failure.code})` : ""}</Alert>;
  }
  if (!detail.data) return <SkeletonRows rows={4} label="Đang tải kết quả lượt tập…" />;

  const data = detail.data;
  const meta = metaOf(known, data);
  const sessionView = meta ? sessionStatusView(meta.status) : null;
  const resultView = data.load?.kind === "result" ? outcomeView(data.load.result.outcome) : meta ? resultCellView({ status: meta.status, resultStatus: null }) : null;
  const when = meta?.startedAt ? formatWhen(meta.startedAt) : null;

  return <div className="th-detail" aria-busy={detail.loading}>
    {meta?.known && <dl className="ops-kv">
      <dt>Bài tập</dt><dd>{trainingTitle(meta.known).title}</dd>
      {trainingTitle(meta.known).sub && <><dt>Kịch bản</dt><dd>{trainingTitle(meta.known).sub}</dd></>}
      <dt>Building</dt><dd>{meta.known.building.name || "—"}</dd>
    </dl>}
    {meta && <dl className="ops-kv">
      <dt>Chế độ</dt><dd>{modeLabel(data.load?.kind === "result" ? data.load.result.mode || meta.mode : meta.mode)}</dd>
      {when && <><dt>Bắt đầu</dt><dd>{when}</dd></>}
      {meta.endedAt && <><dt>Kết thúc</dt><dd>{formatWhen(meta.endedAt)}</dd></>}
      {endReasonLabel(meta.endReason) && <><dt>Cách kết thúc</dt><dd>{endReasonLabel(meta.endReason)}</dd></>}
    </dl>}

    {sessionView && resultView && <div className="th-pair" data-testid="detail-status">
      <section className="th-card" data-testid="detail-session-status" aria-label="Hoàn thành phiên"><span>Hoàn thành phiên</span><StatusBadge tone={sessionView.tone}>{sessionView.label}</StatusBadge><p>{sessionView.hint}</p></section>
      <section className="th-card" data-testid="detail-result-status" aria-label="Kết quả đánh giá"><span>Kết quả đánh giá</span><StatusBadge tone={resultView.tone}>{resultView.label}</StatusBadge><p>{resultView.hint}</p>
        {data.load?.kind === "result" && <ResultFacts result={data.load.result} />}
      </section>
    </div>}

    {data.load?.kind === "result" && <ResultBody result={data.load.result} />}
    {data.load?.kind === "result" && <p className="th-ask"><Link className={buttonVariants({ variant: "secondary", size: "md" })} href={`/learning-hub?view=questions&session=${encodeURIComponent(sessionId)}`} data-testid="ask-about-result">Hỏi AI về kết quả này</Link><span className="ops-muted">AI chỉ giải thích kết quả cá nhân đã lưu, không đổi điểm. Không có chứng chỉ hay điểm kinh nghiệm.</span></p>}

    {data.load?.kind === "not-ready" && <Alert tone="info" title="Kết quả chưa sẵn sàng" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload} disabled={detail.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>}>
      Máy chủ chưa lưu kết quả cho lượt tập này (mã RESULT_NOT_READY). Thường là lượt tập đang chờ thiết bị đồng bộ nốt dữ liệu. Đây không phải lỗi: hãy mở ứng dụng để đồng bộ rồi tải lại.
    </Alert>}

    {data.load === null && meta && <Alert tone="info" title="Lượt tập này chưa có kết quả" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload} disabled={detail.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>}>
      {sessionView?.hint} Máy chủ không có kết quả đã lưu cho lượt tập này, nên không có điểm hay tiêu chí để hiển thị.
    </Alert>}

    <p className="th-foot">Kết quả mô phỏng của riêng bạn, không phải chứng nhận hay kết luận an toàn công trình.</p>
  </div>;
}

/**
 * Detail of one of the learner's own sessions, opened by `?session=<id>`. Another learner's id (or a made-up one) gets the
 * server's 404 and is shown as "not found", never with data of the previously opened session.
 */
export function ResultDrawer({ sessionId, known, accessToken, onClose, onRefresh }: {
  sessionId: string;
  known: HistoryItem | null;
  accessToken: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return <Drawer
    open
    onOpenChange={(open) => { if (!open) onClose(); }}
    title={known ? trainingTitle(known).title : "Chi tiết lượt tập"}
    description="Trạng thái phiên và kết quả được máy chủ lưu riêng cho tài khoản của bạn."
    className="th-drawer"
  >
    <Body sessionId={sessionId} known={known} accessToken={accessToken} onRefresh={onRefresh} onClose={onClose} />
  </Drawer>;
}
