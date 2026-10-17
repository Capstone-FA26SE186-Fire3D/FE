"use client";

import { useMemo, useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { Command } from "@/features/scenario-editor/store/commands";
import type { Json, JsonObject } from "@/features/scenario-editor/store/json";

import { orgAiApi } from "../api";
import { applyCount, buildApplyCommand, buildApplyPlan, previewIssues, readProposalNotes, readProposalState, type Chosen } from "../apply-plan";
import { aiErrorText, isSuccessfulDraft } from "../labels";
import styles from "../org-ai.module.css";

function show(value: Json | undefined): string {
  if (value === undefined) return "(trống)";
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.length ? value.map((item) => `• ${item}`).join("\n") : "(danh sách rỗng)";
  const text = JSON.stringify(value, null, 2);
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

/**
 * Editor side of "Áp dụng vào bản nháp". The proposal is read again from the server by request id (never passed through the
 * URL or memory), shown as a preview next to what the draft has now, and applied only after an explicit confirmation as ONE
 * editor command: one Undo reverts all of it, and nothing is saved, validated or published by this step.
 */
export function AiProposalApply<S>({ accessToken, requestId, draft, floorIds, onApply, onClose }: {
  accessToken: string;
  requestId: string;
  draft: JsonObject;
  /** Floors of the draft's own Geometry; null while it is not available. */
  floorIds: Set<string> | null;
  onApply: (build: (draft: JsonObject, id: number, selection: S, now: number) => Command<S> | null) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const request = useAsyncData(`ai-proposal:${requestId}`, (signal) => orgAiApi.getRequest(accessToken, requestId, signal));
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const found = request.data;
  const proposal = found && isSuccessfulDraft(found) ? readProposalState(found.result) : null;
  const notes = found ? readProposalNotes(found.result) : null;
  const plan = useMemo(() => (proposal ? buildApplyPlan(proposal, draft, floorIds) : null), [proposal, draft, floorIds]);

  const chosen: Chosen | null = plan ? {
    fields: new Set(plan.fields.filter((field) => field.selectable && (overrides[field.key] ?? field.defaultOn)).map((field) => field.key)),
    objects: plan.objects.some((item) => item.eligible) && (overrides.__objects ?? false),
  } : null;
  const count = plan && chosen ? applyCount(chosen, plan) : 0;
  const problems = plan && chosen ? previewIssues(draft, plan, chosen) : [];

  const confirm = () => {
    if (!plan || !chosen || count === 0 || problems.length > 0) return;
    const keep = chosen;
    const keepPlan = plan;
    onApply((current, id, selected, now) => buildApplyCommand(current, id, now, selected, keepPlan, keep));
    toast.notify({ tone: "success", title: "Đã áp dụng đề xuất AI vào bản nháp", description: "Thay đổi chưa được lưu. Dùng Hoàn tác để bỏ, hoặc kiểm tra rồi bấm Lưu." });
    onClose();
  };

  return <Modal open onOpenChange={(value) => { if (!value) onClose(); }} className={styles.wideModal} title="Áp dụng đề xuất AI vào bản nháp này"
    description="Xem trước từng thay đổi. Chỉ phần bạn chọn mới được đưa vào bản nháp đang mở; chưa lưu, hoàn tác được."
    footer={<><Button type="button" variant="quiet" onClick={onClose}>Không áp dụng</Button>
      <Button type="button" onClick={confirm} disabled={count === 0 || problems.length > 0} data-testid="ai-confirm-apply">Áp dụng {count} thay đổi (chưa lưu)</Button></>}>
    <div className={styles.stack} data-testid="ai-apply-dialog">
      {request.loading && !found && <SkeletonRows rows={3} label="Đang tải đề xuất AI…" />}
      {request.error !== undefined && <Alert tone="danger" title="Không tải được đề xuất" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={request.reload}>Thử lại</Button>}>{aiErrorText(request.error)}</Alert>}
      {found && !proposal && <Alert tone="warning" title="Yêu cầu này không có đề xuất áp dụng được">Chỉ yêu cầu “Đề xuất kịch bản” đã hoàn tất theo fet3d.editor/1 mới áp dụng được (trạng thái hiện tại: {found.status}).</Alert>}
      {plan && <>
        <Alert tone="info" title="AI chỉ đề xuất">Đề xuất không thay thế quyết định của tổ chức. Phần ngưỡng đạt, chế độ và thời gian không được chọn sẵn.</Alert>
        {notes && <p className={styles.quote}>{notes}</p>}
        <section className={styles.section} aria-label="Trường nội dung">
          <h3>Trường nội dung ({plan.fields.length})</h3>
          {plan.fields.length === 0 && <p className={styles.dim}>Đề xuất không có trường nội dung.</p>}
          <ul className={styles.list}>
            {plan.fields.map((field) => <li key={field.key} className={styles.item} data-muted={!field.selectable} data-testid={`ai-field-${field.key}`}>
              <label className={styles.pick} data-disabled={!field.selectable} style={{ border: 0, padding: 0 }}>
                <input type="checkbox" disabled={!field.selectable} checked={field.selectable && (overrides[field.key] ?? field.defaultOn)} onChange={(event) => setOverrides((current) => ({ ...current, [field.key]: event.target.checked }))} />
                <span><strong>{field.label}</strong>{!field.differs && <span className={styles.dim}> · giống bản nháp hiện tại</span>}{field.note && <span className={styles.dim}> · {field.note}</span>}</span>
              </label>
              {field.differs && <div className={styles.diff}>
                <div><h4>Hiện tại</h4><pre className={styles.value}>{show(field.current)}</pre></div>
                <div><h4>Đề xuất</h4><pre className={styles.value}>{show(field.proposed)}</pre></div>
              </div>}
            </li>)}
          </ul>
        </section>

        <section className={styles.section} aria-label="Đối tượng không gian">
          <h3>Đối tượng không gian ({plan.objects.length})</h3>
          <p className={styles.dim} data-testid="ai-geometry-match">
            {plan.geometry.matches ? "Đề xuất ghim cùng Geometry với bản nháp: tọa độ theo tầng có thể đối chiếu."
              : plan.geometry.proposed ? "Đề xuất ghim Geometry khác với bản nháp nên không đưa đối tượng không gian vào."
                : "Đề xuất không ghim Geometry nên không đưa đối tượng không gian vào."} Geometry của bản nháp luôn được giữ nguyên.
          </p>
          {plan.objects.length === 0 && <p className={styles.dim}>Đề xuất không có đối tượng không gian.</p>}
          {plan.objects.some((item) => item.eligible) && <label className={styles.pick}>
            <input type="checkbox" checked={overrides.__objects ?? false} onChange={(event) => setOverrides((current) => ({ ...current, __objects: event.target.checked }))} data-testid="ai-apply-objects" />
            <span><strong>Thêm {plan.objects.filter((item) => item.eligible).length} đối tượng vào bản nháp</strong><span className={styles.dim}> · thêm mới, không sửa đối tượng đang có; năng lực/tham số được kiểm tra ở bước Kiểm tra</span></span>
          </label>}
          <ul className={styles.list}>
            {plan.objects.map((object) => <li key={object.index} className={styles.item} data-muted={!object.eligible} data-testid="ai-object">
              <span className={styles.itemTitle}>{object.id || "?"} · {object.kind}{object.label ? ` · ${object.label}` : ""}</span>
              <span className={styles.dim}>Tầng {object.floorId || "?"}{object.anchorId ? ` · Neo BIM ${object.anchorId}` : ""} · {object.eligible ? "có thể thêm" : `chỉ xem: ${object.reason}`}</span>
            </li>)}
          </ul>
        </section>
        {plan.ignoredKeys.length > 0 && <p className={styles.dim}>Trường không thuộc trình soạn thảo (bỏ qua, chỉ xem): {plan.ignoredKeys.join(", ")}.</p>}
        {problems.length > 0 && <Alert tone="danger" title="Kết quả sẽ không hợp lệ nếu áp dụng">{problems.slice(0, 4).map((issue) => `${issue.path} ${issue.message}`).join("; ")}. Bỏ chọn mục gây lỗi.</Alert>}
      </>}
    </div>
  </Modal>;
}
