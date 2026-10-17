"use client";

import { Gauge, LifeBuoy, RefreshCw, Search } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/features/billing/format";

import { aiErrorText, operationLabel, statusLabel } from "../labels";
import type { SubmitPhase } from "../use-ai-submit";
import styles from "../org-ai.module.css";
import { BILLING_AI_HREF } from "./request-view";

/**
 * What the form shows between "Gửi" and a request id. The three non-success outcomes are kept apart on purpose:
 * blocked (nothing was sent), refused (the BE said no, nothing was created) and unknown (the BE may have stored it).
 */
export function SubmitStatus({ phase, operation, onRetry, onLook, onTrack }: {
  phase: SubmitPhase;
  operation: string;
  onRetry: () => void;
  onLook: () => void;
  onTrack: (requestId: string) => void;
}) {
  if (phase.kind === "checking") return <p role="status" className={styles.dim}>Đang kiểm tra quota AI của tổ chức…</p>;
  if (phase.kind === "submitting") return <p role="status" className={styles.dim}>{phase.replay ? "Đang gửi lại với cùng khóa chống trùng…" : "Đang gửi yêu cầu…"}</p>;

  if (phase.kind === "blocked") {
    const exhausted = phase.units.filter((unit) => unit.available <= 0);
    return <div data-testid="ai-quota-blocked"><Alert tone="warning" title={phase.units.length === 0 ? "Chưa có quota AI" : "Quota AI đã hết"}
      action={<Button asChild size="sm" variant="secondary" className="mt-3"><Link href={BILLING_AI_HREF} data-testid="ai-topup-link"><Gauge size={14} aria-hidden="true" />Mở Quota AI để mua top-up</Link></Button>}>
      {phase.units.length === 0
        ? "Tổ chức chưa được cấp quota AI nên yêu cầu chưa được gửi. Quota đến từ gói công trình hoặc top-up đã thanh toán."
        : `Không còn quota ở đơn vị ${exhausted.map((unit) => `${unit.quotaUnit} (còn ${formatNumber(unit.available)})`).join(", ")}. Yêu cầu chưa được gửi, hệ thống không tính vượt mức. Mua top-up trả trước, thanh toán và chờ kích hoạt rồi gửi lại.`}
    </Alert></div>;
  }

  if (phase.kind === "failed") {
    return <Alert tone="danger" title={phase.stage === "quota" ? "Chưa kiểm tra được quota nên chưa gửi" : "Máy chủ từ chối yêu cầu, chưa có yêu cầu nào được tạo"}
      action={phase.stage === "quota" ? <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>Thử lại</Button> : undefined}>
      {aiErrorText(phase.error)}
    </Alert>;
  }

  if (phase.kind === "unknown") {
    return <div className={styles.stack} data-testid="ai-unknown">
      <Alert tone="warning" title="Chưa rõ yêu cầu đã được ghi nhận hay chưa"
        action={<div className="ops-actions mt-3">
          <Button size="sm" variant="secondary" onClick={onLook} disabled={phase.looking}><Search size={14} aria-hidden="true" />{phase.looking ? "Đang tra cứu…" : "Tra yêu cầu gần nhất của tôi"}</Button>
          <Button size="sm" variant="quiet" onClick={onRetry} data-testid="ai-retry-same-key"><RefreshCw size={14} aria-hidden="true" />Gửi lại với cùng khóa</Button>
        </div>}>
        Mất phản hồi hoặc quá thời gian chờ. Không gửi một yêu cầu mới: có thể máy chủ đã nhận và đã giữ chỗ quota. Hãy tra yêu cầu gần nhất, hoặc gửi lại với cùng khóa chống trùng (máy chủ trả lại đúng yêu cầu cũ, không trừ lần hai).
      </Alert>
      {phase.lookError !== undefined && <Alert tone="danger" title="Không tra được danh sách yêu cầu">{aiErrorText(phase.lookError)}</Alert>}
      {phase.candidates && phase.candidates.length === 0 && <p className={styles.muted} data-testid="ai-no-candidates">Chưa thấy yêu cầu {operationLabel(operation).toLowerCase()} nào mới của bạn. Có thể yêu cầu chưa tới máy chủ: gửi lại với cùng khóa là an toàn.</p>}
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
