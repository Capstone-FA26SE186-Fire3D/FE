"use client";

import { DetailList, formatDateTime } from "@/components/ops/detail-parts";
import { Modal } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { capabilityName } from "@/configs/capability-labels";
import type { RuntimeCatalogEntry } from "../model";

const KIND_LABELS: Record<string, string> = { Spawn: "Điểm xuất phát", Hazard: "Nguy cơ", Goal: "Đích đến", Npc: "Nhân vật", BlockedElement: "Lối bị chặn", Equipment: "Thiết bị" };
const kindName = (kind: string) => KIND_LABELS[kind] ?? kind;

/** Read-only detail of one registered version: every capability with its events (and scored metric) and actions. */
export function RuntimeDetailModal({ entry, onClose }: { entry: RuntimeCatalogEntry; onClose: () => void }) {
  return <Modal open onOpenChange={(open) => { if (!open) onClose(); }} size="lg" data-testid="runtime-detail"
    eyebrow={<StatusBadge tone={entry.isActive ? "success" : "neutral"}>{entry.isActive ? "Đang dùng" : "Tắt"}</StatusBadge>}
    title={`Phiên bản ${entry.runtimeVersion}`} description="Phiên bản đã đăng ký không sửa được. Năng lực dưới đây là những gì ứng dụng trên điện thoại hỗ trợ ở phiên bản này.">
    <div className="ops-stack">
      <DetailList columns={3} items={[
        { label: "Giao thức kết nối", value: entry.protocolVersion || "—" },
        { label: "Định dạng gói bài", value: entry.manifestSchemaVersion || "—" },
        { label: "Ngày đăng ký", value: formatDateTime(entry.createdAt) },
      ]} />
      <h3 className="rt-heading">{entry.capabilities.length} năng lực</h3>
      {entry.capabilities.length === 0 && <p className="adm-note">Phiên bản này không khai báo năng lực nào.</p>}
      <ul className="rt-caps">
        {entry.capabilities.map((id) => {
          const contract = entry.capabilityContracts[id];
          return <li key={id} className="rt-cap">
            <div className="rt-cap-head">
              <strong>{capabilityName(id)}</strong>
              {contract && contract.objectKinds.length > 0 && <span className="rt-cap-kinds">{contract.objectKinds.map(kindName).join(" · ")}</span>}
            </div>
            {!contract && <p className="rt-cap-empty">Chưa có mô tả sự kiện hay thao tác.</p>}
            {contract && contract.events.length === 0 && contract.actions.length === 0 && <p className="rt-cap-empty">Không ghi sự kiện hay thao tác.</p>}
            {contract && contract.events.length > 0 && <div className="rt-cap-group">
              <span className="rt-cap-label">Sự kiện</span>
              <ul>{contract.events.map((event) => <li key={event.type}><span className="adm-mono">{event.type}</span>{event.metric ? <span className="rt-metric">Chấm điểm: <span className="adm-mono">{event.metric}</span></span> : <span className="rt-metric rt-metric--none">Không chấm điểm</span>}</li>)}</ul>
            </div>}
            {contract && contract.actions.length > 0 && <div className="rt-cap-group">
              <span className="rt-cap-label">Thao tác</span>
              <ul>{contract.actions.map((action) => <li key={action.id}><span className="adm-mono">{action.id}</span>{action.event && <span className="rt-metric">tạo sự kiện <span className="adm-mono">{action.event}</span></span>}</li>)}</ul>
            </div>}
          </li>;
        })}
      </ul>
    </div>
  </Modal>;
}
