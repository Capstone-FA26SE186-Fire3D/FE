"use client";

import { MessageSquareText, Send } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";

import { orgAiApi } from "../api";
import { fieldIssue } from "../labels";
import { useAiSubmit } from "../use-ai-submit";
import type { AiEligibleSource } from "../types";
import styles from "../org-ai.module.css";
import { RequestPanel } from "./request-panel";
import { ALL_SOURCES, SourcePicker, toSourceRefs, type SourceChoice } from "./source-picker";
import { SubmitStatus } from "./submit-status";

/** `POST /api/ai/organization/answer`: a grounded answer over the sources the BE pins. Nothing here changes any data of the organization. */
export function AskTab({ accessToken, requestId, onRequest }: { accessToken: string; requestId: string; onRequest: (requestId: string | null) => void }) {
  const [question, setQuestion] = useState("");
  const [choice, setChoice] = useState<SourceChoice>(ALL_SOURCES);
  const [available, setAvailable] = useState<AiEligibleSource[]>([]);
  const tracked = useCallback((id: string) => onRequest(id), [onRequest]);
  const { phase, submit, retry, lookRecent, track, reset, working } = useAiSubmit(accessToken, "Answer", tracked);

  const text = question.trim();
  const refs = toSourceRefs(choice, available);
  const noSourceChosen = choice.mode === "selected" && (refs?.length ?? 0) === 0;
  const canSend = text.length > 0 && !working && !noSourceChosen;

  const doSubmit = () => {
    if (!canSend) return;
    const body = { question: text, ...(refs ? { sources: refs } : {}) };
    void submit({ operation: "Answer", ...body }, (key, signal) => orgAiApi.submitAnswer(accessToken, body, key, signal));
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    doSubmit();
  };

  const questionError = phase.kind === "failed" ? fieldIssue(phase.error, "$.question") : undefined;
  const showPanel = requestId !== "" && (phase.kind === "idle" || phase.kind === "tracking");

  return <div className={styles.stack}>
    <Panel title="Hỏi đáp có trích dẫn" description="Câu trả lời chỉ dựa trên nguồn đủ điều kiện của tổ chức và luôn kèm nguồn, phiên bản. Đây là thông tin tham khảo, không phải chứng nhận an toàn.">
      <form className={styles.stack} onSubmit={send} aria-label="Hỏi đáp AI">
        <Field label="Câu hỏi" required error={questionError} hint="Văn bản thuần, không dán HTML. Giới hạn độ dài theo chính sách AI hiện hành.">
          {(props) => <Textarea {...props} rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={working} placeholder="Ví dụ: Yêu cầu về lối thoát nạn cho nhà trường là gì?" />}
        </Field>
        <SourcePicker accessToken={accessToken} value={choice} onChange={setChoice} disabled={working} onLoaded={setAvailable} />
        <div className="ops-actions">
          <Button type="submit" disabled={!canSend} data-testid="ai-send"><Send size={16} aria-hidden="true" />{working ? "Đang gửi…" : "Gửi câu hỏi"}</Button>
          {requestId && <Button type="button" variant="quiet" onClick={() => { reset(); onRequest(null); }}>Hỏi câu khác</Button>}
        </div>
        <SubmitStatus phase={phase} operation="Answer" onRetry={() => void (phase.kind === "failed" ? doSubmit() : retry())} onLook={() => void lookRecent()} onTrack={track} />
      </form>
    </Panel>
    {showPanel && <Panel title="Kết quả" description="Lấy từ máy chủ theo mã yêu cầu; tải lại trang vẫn mở lại được." actions={<MessageSquareText size={18} aria-hidden="true" />}>
      <RequestPanel accessToken={accessToken} requestId={requestId} />
    </Panel>}
    {phase.kind === "idle" && !requestId && <Alert tone="info" title="Cách hoạt động">Yêu cầu được xử lý bất đồng bộ: gửi xong sẽ có mã yêu cầu rồi trang tự cập nhật. Mất mạng giữa chừng không tạo thêm yêu cầu hay trừ quota thêm.</Alert>}
  </div>;
}
