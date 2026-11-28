"use client";

import { Lock, PencilRuler, Plus, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { describeApiError } from "@/api/describe-error";
import { useIdempotencyKey } from "@/api/idempotency";
import { ApiError } from "@/api/types/common";
import { useAsyncData } from "@/api/use-async-data";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupportCode } from "@/components/ui/support-code";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import type { DraftValidationIssue } from "@/features/scenario-editor/api";
import { parameterIssueText } from "@/features/scenario-editor/v1/object-name";
import { categoryOf, itemPathToObjectPath, itemsToObjects, type InfrastructureCategory } from "@/features/scenario-editor/v1/scope";
import { readObjects, type ObjectView } from "@/features/scenario-editor/v1/state";

import { fireInfrastructureApi, INFRASTRUCTURE_STATUS, type FireInfrastructure } from "../api";

const CATEGORY_LABEL: Record<InfrastructureCategory, string> = { Exit: "lối thoát", AssemblyPoint: "điểm tập kết", Equipment: "thiết bị cố định", WaterSource: "nguồn nước" };
const CATEGORY_ORDER: InfrastructureCategory[] = ["Exit", "AssemblyPoint", "Equipment", "WaterSource"];

/** "2 lối thoát · 1 điểm tập kết · 14 thiết bị cố định": what a version holds, counted from its items. */
export function summarizeItems(items: unknown): string {
  const counts: Record<InfrastructureCategory, number> = { Exit: 0, AssemblyPoint: 0, Equipment: 0, WaterSource: 0 };
  for (const object of readObjects({ objects: itemsToObjects(items) })) {
    const category = categoryOf(object.kind, object.capability?.id);
    if (category) counts[category] += 1;
  }
  const parts = CATEGORY_ORDER.filter((category) => counts[category] > 0).map((category) => `${counts[category]} ${CATEGORY_LABEL[category]}`);
  return parts.length ? parts.join(" · ") : "Chưa có mục nào";
}

/** Vietnamese for the submit checks the server reports in English; unknown codes fall back to a neutral sentence. */
function issueText(issue: DraftValidationIssue, objects: readonly ObjectView[]): string {
  const path = typeof issue.path === "string" ? issue.path : "";
  // A missing parameter names the object and the field ("Bình chữa cháy xách tay #1: chưa điền Loại chất chữa cháy").
  if (issue.code === "FIELD_REQUIRED") {
    const named = parameterIssueText({ ...issue, path: itemPathToObjectPath(path) }, objects);
    if (named) return `${named}.`;
  }
  switch (issue.code) {
    case "EXIT_REQUIRED": return "Cần ít nhất một lối thoát nạn.";
    case "FIELD_REQUIRED": return path.startsWith("$.geometry") ? "Chưa gắn mô hình 3D của bản IFC. Mở trình soạn rồi lưu lại." : path.startsWith("$.runtimeVersion") ? "Chưa chọn phiên bản ứng dụng. Mở trình soạn rồi lưu lại." : "Một mục còn thiếu thông tin bắt buộc.";
    case "CAPABILITY_REQUIRED": return "Một thiết bị chưa chọn loại.";
    case "INFRASTRUCTURE_CAPABILITY_NOT_FIXED": return "Có mục không thuộc hạ tầng (khăn, đồ đạc cá nhân hoặc thang máy). Hãy xóa khỏi hạ tầng.";
    case "FLOOR_NOT_FOUND": return "Một mục nằm ở tầng không còn trong mô hình 3D.";
    case "ANCHOR_NOT_FOUND": case "ANCHOR_FLOOR_MISMATCH": return "Một mục gắn vào bộ phận không còn đúng trong mô hình 3D.";
    default: return "Một mục chưa hợp lệ. Mở trình soạn và xem tab Kiểm tra.";
  }
}

type Checked = { id: string; revision: number; isValid: boolean; issues: DraftValidationIssue[] };

/**
 * "Hạ tầng PCCC" of one IFC revision (BE#213, FR-PLAN-04): every version with its status, and the steps of the open one
 * (edit on the 3D model, check, send to the expert queue). A decided version never changes; a fix is a new version.
 */
export function InfrastructurePanel({ accessToken, buildingId, revisionId, readOnly }: { accessToken: string; buildingId: string; revisionId: string; /** PlatformAdmin reads the list; the organization authors. */ readOnly: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const versions = useAsyncData(`fire-infrastructures:${revisionId}`, (signal) => fireInfrastructureApi.list(accessToken, revisionId, signal));
  const createKey = useIdempotencyKey();
  const submitKey = useIdempotencyKey();
  const [busy, setBusy] = useState<"create" | "validate" | "submit" | null>(null);
  const [failure, setFailure] = useState<{ message: string; code?: string } | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [confirming, setConfirming] = useState<FireInfrastructure | null>(null);

  const items = versions.data ?? [];
  const open = items.find((item) => item.status === "Draft" || item.status === "Submitted");
  const editorHref = (id: string) => `${routes.workspaceBuildings}/${buildingId}/infrastructure/${id}`;
  const fail = (error: unknown, fallback: string) => setFailure({ message: describeApiError(error, fallback), code: error instanceof ApiError ? error.code : undefined });

  const create = async () => {
    if (busy) return;
    setBusy("create");
    setFailure(null);
    try {
      const created = await fireInfrastructureApi.create(accessToken, revisionId, createKey.keyFor({ revisionId, after: items[0]?.id ?? null }));
      createKey.done();
      router.push(editorHref(created.id));
    } catch (error) {
      // Someone else opened a version meanwhile: the list is the truth.
      if (error instanceof ApiError && error.code === "FIRE_INFRASTRUCTURE_OPEN_VERSION_EXISTS") versions.reload();
      fail(error, "Chưa tạo được phiên bản hạ tầng.");
    } finally {
      setBusy(null);
    }
  };

  const validate = async (item: FireInfrastructure) => {
    if (busy) return;
    setBusy("validate");
    setFailure(null);
    try {
      const result = await fireInfrastructureApi.validate(accessToken, item.id);
      setChecked({ id: item.id, revision: item.revision, isValid: result.isValid, issues: result.issues });
    } catch (error) {
      fail(error, "Chưa kiểm tra được hạ tầng.");
    } finally {
      setBusy(null);
    }
  };

  const submit = async (item: FireInfrastructure) => {
    if (busy) return;
    setBusy("submit");
    setFailure(null);
    try {
      await fireInfrastructureApi.submit(accessToken, item.id, `"${item.revision}"`, submitKey.keyFor({ id: item.id, revision: item.revision }));
      submitKey.done();
      setConfirming(null);
      setChecked(null);
      toast.notify({ tone: "success", title: "Đã gửi thẩm định", description: "Chuyên viên PCCC sẽ xem và trả kết quả. Bạn nhận thông báo khi có kết quả." });
      versions.reload();
    } catch (error) {
      setConfirming(null);
      if (error instanceof ApiError && Array.isArray(error.payload?.issues)) setChecked({ id: item.id, revision: item.revision, isValid: false, issues: error.payload.issues as DraftValidationIssue[] });
      fail(error, "Chưa gửi thẩm định được.");
      versions.reload();
    } finally {
      setBusy(null);
    }
  };

  const createLabel = items.length === 0 ? "Lập hạ tầng PCCC" : "Tạo phiên bản mới";
  const createButton = !readOnly && !open
    ? <Button onClick={() => void create()} disabled={busy !== null} data-testid="infrastructure-create"><Plus size={16} aria-hidden="true" />{busy === "create" ? "Đang tạo…" : createLabel}</Button>
    : undefined;

  return <Panel title="Hạ tầng PCCC" description="Lối thoát nạn, điểm tập kết, thiết bị cố định và nguồn nước của bản IFC này. Chuyên viên PCCC thẩm định; khi đạt, hạ tầng được khoá và mọi tình huống dùng chung." actions={createButton} bodyClassName="ops-stack" data-testid="infrastructure-panel">
    {failure && <Alert tone="danger" title="Không thực hiện được">{failure.message}<SupportCode code={failure.code} /></Alert>}
    {versions.loading && !versions.data ? <div role="status" aria-label="Đang tải hạ tầng PCCC"><Skeleton style={{ height: 96 }} /></div>
      : versions.error !== undefined && !versions.data ? <Alert tone="danger" title="Không tải được hạ tầng PCCC" action={<Button size="sm" variant="secondary" className="mt-3" onClick={versions.reload}>Thử lại</Button>}>{describeApiError(versions.error, "Hãy thử lại sau.")}</Alert>
        : items.length === 0 ? <EmptyState icon={ShieldCheck} title="Chưa lập hạ tầng PCCC"
          description={readOnly ? "Tổ chức chưa lập hạ tầng cho bản IFC này." : "Phiên bản đầu tiên lấy sẵn các thiết bị đã xác nhận ở mục Thiết bị. Bạn thêm lối thoát nạn và điểm tập kết trên mô hình 3D rồi gửi thẩm định."} />
          : <ul className="ops-stack" style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Các phiên bản hạ tầng">
            {items.map((item) => {
              const status = INFRASTRUCTURE_STATUS[item.status] ?? { label: "Không rõ", tone: "neutral" as const };
              const result = checked?.id === item.id && checked.revision === item.revision ? checked : null;
              const objects = result ? readObjects({ objects: itemsToObjects(item.items) }) : [];
              return <li key={item.id} className="ops-panel" data-testid={`infrastructure-${item.version}`} data-status={item.status}>
                <div className="ops-panel-body ops-stack">
                  <div className="ops-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>Phiên bản {item.version}</strong> <StatusBadge tone={status.tone}>{item.status === "Approved" && <Lock size={12} aria-hidden="true" />}{status.label}</StatusBadge>
                      <p className="ops-field-hint" style={{ margin: "4px 0 0" }}>{summarizeItems(item.items)} · cập nhật {formatDateTime(item.updatedAt)}</p>
                    </div>
                    {!readOnly && item.status === "Draft" && <div className="ops-actions">
                      <Button asChild variant="secondary" size="sm"><Link href={editorHref(item.id)} data-testid="infrastructure-edit"><PencilRuler size={16} aria-hidden="true" />Sửa trên mô hình 3D</Link></Button>
                      <Button variant="secondary" size="sm" onClick={() => void validate(item)} disabled={busy !== null} data-testid="infrastructure-validate"><ShieldCheck size={16} aria-hidden="true" />{busy === "validate" ? "Đang kiểm tra…" : "Kiểm tra"}</Button>
                      <Button size="sm" onClick={() => setConfirming(item)} disabled={busy !== null} data-testid="infrastructure-submit"><Send size={16} aria-hidden="true" />Gửi thẩm định</Button>
                    </div>}
                  </div>
                  {item.status === "Submitted" && <p className="ops-field-hint" style={{ margin: 0 }}>Đã gửi {formatDateTime(item.submittedAt)}{item.submittedByName ? ` bởi ${item.submittedByName}` : ""}. Nội dung không sửa được trong lúc chờ Chuyên viên PCCC thẩm định.</p>}
                  {item.status === "Approved" && <p className="ops-field-hint" style={{ margin: 0 }}>Đạt thẩm định {formatDateTime(item.decidedAt)}{item.decidedByName ? ` bởi ${item.decidedByName}` : ""}. {item.scenarioDraftCount > 0 ? `${item.scenarioDraftCount} bản nháp tình huống đang dùng phiên bản này.` : "Bạn có thể tạo tình huống trên phiên bản này."} Muốn thay đổi, hãy tạo phiên bản mới.</p>}
                  {item.status === "Rejected" && <Alert tone="warning" title="Chưa đạt thẩm định"><span data-testid="infrastructure-reason">Lý do: {item.decisionReason || "Không có lý do được lưu."}</span> Hãy tạo phiên bản mới, sửa theo lý do này rồi gửi lại.</Alert>}
                  {result && (result.isValid
                    ? <Alert tone="success" title="Đủ điều kiện gửi thẩm định">Không còn vấn đề nào chặn.</Alert>
                    : <Alert tone="warning" title={`Còn ${result.issues.length} vấn đề cần sửa`}>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }} data-testid="infrastructure-issues">{result.issues.slice(0, 10).map((issue, index) => <li key={index}>{issueText(issue, objects)}<SupportCode code={issue.code} detail={issue.path} /></li>)}</ul>
                    </Alert>)}
                </div>
              </li>;
            })}
          </ul>}

    <ConfirmDialog open={confirming !== null} onOpenChange={(next) => { if (!next) setConfirming(null); }} title={`Gửi thẩm định phiên bản ${confirming?.version ?? ""}?`}
      description="Sau khi gửi, nội dung không sửa được nữa. Nếu cần thay đổi sau khi có kết quả, bạn tạo phiên bản mới."
      confirmLabel="Gửi thẩm định" busy={busy === "submit"} onConfirm={() => { if (confirming) return submit(confirming); }} />
  </Panel>;
}
