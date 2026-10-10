"use client";

import { Lock, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import { BE_ISSUES, EDITOR_CAPABILITIES, type EditorCapability } from "../config";
import type { JsonObject } from "../store/json";
import { preservedCount } from "../store/model";

const SECTIONS: Array<{ key: EditorCapability; draftKey?: string; title: string; description: string; add: string; issue: keyof typeof BE_ISSUES }> = [
  { key: "goals", draftKey: "goals", title: "Mục tiêu (goal)", description: "Điểm hoặc vùng người học phải đạt, ví dụ lối ra an toàn.", add: "Thêm mục tiêu", issue: "editorContract" },
  { key: "blockedElements", draftKey: "blockedElements", title: "Cửa và vùng bị chặn", description: "Cửa/vùng không thể đi qua tại thời điểm xác định.", add: "Thêm vùng chặn", issue: "editorContract" },
  { key: "npcs", draftKey: "npcs", title: "NPC", description: "Nhân vật mô phỏng với trạng thái đơn giản.", add: "Thêm NPC", issue: "editorContract" },
  { key: "devices", title: "Thiết bị hỗ trợ", description: "Bình chữa cháy, khăn, nguồn nước và vật phẩm runtime đã hỗ trợ.", add: "Thêm thiết bị", issue: "editorContract" },
];

/**
 * Designed-in, locked sections. Nothing here reads or writes JSON: until BE publishes a schema (BE#54) a payload shape
 * would be a guess. Existing entries in the draft (from AI drafts or other clients) are preserved on save, only counted here.
 */
export function LockedSections({ draft }: { draft: JsonObject }) {
  return <div className="se-form" data-testid="locked-sections">
    {SECTIONS.map((section) => {
      const unlocked = EDITOR_CAPABILITIES[section.key];
      const preserved = section.draftKey ? preservedCount(draft, section.draftKey) : 0;
      const issue = BE_ISSUES[section.issue];
      return <section key={section.key} className="se-locked" aria-labelledby={`locked-${section.key}`} data-capability={section.key} data-locked={!unlocked}>
        <header>
          <h3 id={`locked-${section.key}`}>{section.title}</h3>
          {!unlocked && <StatusBadge tone="warning"><Lock size={12} aria-hidden="true" /> Chờ BE #{issue.href.split("/").pop()}</StatusBadge>}
        </header>
        <p>{section.description}</p>
        {preserved > 0 && <p className="se-preserved">Bản nháp đang có {preserved} mục. Editor giữ nguyên và không sửa chúng khi lưu.</p>}
        <Button type="button" variant="quiet" size="sm" disabled={!unlocked} aria-disabled={!unlocked} title={unlocked ? undefined : "Khóa vì chưa có contract dữ liệu từ BE"}><Plus size={14} aria-hidden="true" /> {section.add}</Button>
        {!unlocked && <a href={issue.href} target="_blank" rel="noreferrer" className="se-issue-link">{issue.label}</a>}
      </section>;
    })}
    <p className="ops-field-hint">Mở khóa khi BE công bố schema có phiên bản và bộ kiểm tra cho từng loại (xem tracker). Khóa này không xóa dữ liệu đã có trong bản nháp.</p>
  </div>;
}
