"use client";

import { Gauge, LifeBuoy, RefreshCw, Search } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatQuota } from "@/features/billing/format";

import { aiErrorText, operationLabel, statusLabel } from "../labels";
import type { SubmitPhase } from "../use-ai-submit";
import styles from "../org-ai.module.css";
import { BILLING_AI_HREF } from "./request-view";

/**
 * What the form shows between "Gửi" and a request id. The three non-success outcomes are kept apart on purpose:
 * blocked (nothing was sent), refused (the BE said no, nothing was created) and unknown (the BE may have stored it).
 */
export function SubmitStatus({ phase, operation, onRetry, onLook, onTrack, trainee }: {
  phase: SubmitPhase;
  operation: string;
  /** Trainee wording: a personal daily allowance, no organization quota or top-up. */
  trainee?: boolean;
  onRetry: () => void;
  onLook: () => void;
  onTrack: (requestId: string) => void;
}) {
  if (phase.kind === "checking") return <p role="status" className={styles.dim}>{trainee ? "Đang kiểm tra lượt hỏi AI hôm nay của bạn…" : "Đang kiểm tra chính sách và hạn mức AI của tổ chức…"}</p>;
  if (phase.kind === "submitting") return <p role="status" className={styles.dim}>{phase.replay ? "Đang gửi lại yêu cầu cũ…" : "Đang gửi yêu cầu…"}</p>;

  if (phase.kind === "blocked" && phase.message) {
    return <div data-testid="ai-quota-blocked"><Alert tone="warning" title={phase.message.title}>{phase.message.text}</Alert></div>;
  }
  if (phase.kind === "blocked") {
    const limit = phase.limit;
    if (!limit || !limit.policyActive) {
      return <div data-testid="ai-policy-blocked"><Alert tone="warning" title="Chưa có chính sách AI cho thao tác này">
        Quản trị FET3D chưa bật chính sách AI cho {operationLabel(operation).toLowerCase()} nên yêu cầu chưa được gửi và không có hạn mức nào bị giữ.
      </Alert></div>;
    }
    const unit = limit.quotaUnit ?? undefined;
    return <div data-testid="ai-quota-blocked"><Alert tone="warning" title={limit.availableUnits <= 0 ? "Hạn mức AI đã hết" : "Hạn mức AI không đủ cho một yêu cầu"}
      action={<Button asChild size="sm" variant="secondary" className="mt-3"><Link href={BILLING_AI_HREF} data-testid="ai-topup-link"><Gauge size={14} aria-hidden="true" />Nạp thêm hạn mức AI</Link></Button>}>
      {`Mỗi yêu cầu tạm trừ ${limit.estimatedReserve != null ? formatQuota(limit.estimatedReserve, unit) : "một phần hạn mức"}, tổ chức còn ${formatQuota(limit.availableUnits, unit)}. Yêu cầu chưa được gửi, hệ thống không tính vượt mức. Hãy nạp thêm hạn mức (trả trước), thanh toán và chờ kích hoạt rồi gửi lại.`}
    </Alert></div>;
  }

  if (phase.kind === "failed") {
    return <Alert tone="danger" title={phase.stage === "quota" ? "Chưa kiểm tra được chính sách và hạn mức nên chưa gửi" : "Máy chủ từ chối yêu cầu, chưa có yêu cầu nào được tạo"}
      action={phase.stage === "quota" ? <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>Thử lại</Button> : undefined}>
      {aiErrorText(phase.error)}
    </Alert>;
  }

  if (phase.kind === "unknown") {
    return <div className={styles.stack} data-testid="ai-unknown">
      <Alert tone="warning" title="Chưa rõ yêu cầu đã được ghi nhận hay chưa"
        action={<div className="ops-actions mt-3">
          <Button size="sm" variant="secondary" onClick={onLook} disabled={phase.looking}><Search size={14} aria-hidden="true" />{phase.looking ? "Đang tra cứu…" : "Tra yêu cầu gần nhất của tôi"}</Button>
          <Button size="sm" variant="quiet" onClick={onRetry} data-testid="ai-retry-same-key"><RefreshCw size={14} aria-hidden="true" />Gửi lại (không trừ hai lần)</Button>
        </div>}>
        Mất phản hồi hoặc quá thời gian chờ. Đừng tạo yêu cầu mới: có thể máy chủ đã nhận và đã tạm trừ {trainee ? "lượt hỏi" : "hạn mức"}. Hãy tra yêu cầu gần nhất, hoặc bấm gửi lại: hệ thống nhận ra yêu cầu cũ và không trừ lần hai.
      </Alert>
      {phase.lookError !== undefined && <Alert tone="danger" title="Không tra được danh sách yêu cầu">{aiErrorText(phase.lookError)}</Alert>}
      {phase.candidates && phase.candidates.length === 0 && <p className={styles.muted} data-testid="ai-no-candidates">Chưa thấy yêu cầu {operationLabel(operation).toLowerCase()} nào mới của bạn. Có thể yêu cầu chưa tới máy chủ: bấm gửi lại là an toàn.</p>}
      {phase.candidates && phase.candidates.length > 0 && <div className={styles.stack}>
        <p className={styles.muted}>Các yêu cầu {operationLabel(operation).toLowerCase()} của bạn tạo từ lúc gửi:</p>
        <ul className={styles.list}>{phase.candidates.map((candidate) => <li key={candidate.requestId} className={styles.item} data-testid="ai-candidate">
          <span className={styles.mono}>{candidate.requestId}</span>
          <span className={styles.dim}>{statusLabel(candidate.status, candidate.resultType)} · {new Date(candidate.createdAt).toLocaleString("vi-VN")}</span>
          <div><Button size="sm" variant="secondary" onClick={() => onTrack(candidate.requestId)}><LifeBuoy size={14} aria-hidden="true" />Theo dõi yêu cầu này</Button></div>
        </li>)}</ul>
      </div>}
    </div>;
  }
  return null;
}
