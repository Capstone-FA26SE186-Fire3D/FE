import { Info } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { POST_STATUSES } from "@/features/learn/types";
import { lifecycleCopy, lifecycleFor } from "../status";

const ACTIONS = (status: (typeof POST_STATUSES)[number]) => [
  ...(status === "Unpublished" ? ["Xuất bản bản nháp"] : []),
  ...lifecycleFor[status].map((operation) => lifecycleCopy[operation].label),
].join(" · ");

/**
 * "Thao tác hợp lệ theo trạng thái": which lifecycle commands the backend accepts per post status (anything else is
 * 409 LEARN_STATE_CONFLICT), taken from the same table the editor uses, plus how Hidden differs from Unpublished.
 */
export function LifecycleRules() {
  return <aside className="adm-pane" aria-label="Quy tắc vòng đời bài">
    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Thao tác hợp lệ theo trạng thái</h2>
    <p className="adm-pane-sub">Mở bài để xuất bản hoặc đổi trạng thái; nút không hợp lệ bị khóa kèm lý do.</p>
    <table className="adm-rules">
      <tbody>
        {POST_STATUSES.map((status) => <tr key={status}><th scope="row">{status}</th><td>{ACTIONS(status)}</td></tr>)}
      </tbody>
    </table>
    <Alert tone="info" title="Hidden khác Unpublished">
      Hidden không công khai nhưng vẫn giữ bản đã xuất bản và vẫn có thể là nguồn RAG hợp lệ. Unpublished (chưa từng xuất bản) và Deleted bị loại khỏi AI.
    </Alert>
    <p className="adm-note" style={{ display: "flex", gap: 6, alignItems: "center" }}><Info size={14} aria-hidden="true" />Learn không có bước duyệt riêng: bài xuất bản là công khai.</p>
  </aside>;
}
