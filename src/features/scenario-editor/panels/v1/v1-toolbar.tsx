"use client";

import { Ban, Flag, Flame, History, MapPinPlus, Move3d, MousePointer2, PanelLeft, Play, Rotate3d, Save, ShieldCheck, UserRound, Wrench } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";

import { placementBlocked, type KindStatus } from "../../v1/availability";
import { KIND_META, OBJECT_KINDS, type ObjectKind } from "../../v1/contract";
import type { V1Tool } from "../../v1/editor-state";

export type V1Status = "saved" | "dirty" | "saving" | "conflict" | "error" | "invalid";

const STATUS: Record<V1Status, { label: string; tone: Tone }> = {
  saved: { label: "Đã lưu", tone: "success" },
  dirty: { label: "Chưa lưu", tone: "warning" },
  saving: { label: "Đang lưu…", tone: "pending" },
  conflict: { label: "Xung đột", tone: "danger" },
  error: { label: "Lỗi khi lưu", tone: "danger" },
  invalid: { label: "Chưa hợp lệ để lưu", tone: "danger" },
};

const KIND_ICON: Record<ObjectKind, typeof MapPinPlus> = { Spawn: MapPinPlus, Hazard: Flame, Goal: Flag, Npc: UserRound, BlockedElement: Ban, Equipment: Wrench };
/** Figma v3 "thêm đối tượng" bar: each kind keeps its colour so the bar reads at a glance. */
const KIND_TONE: Record<ObjectKind, string> = { Spawn: "info", Hazard: "danger", Goal: "success", Npc: "info", BlockedElement: "neutral", Equipment: "ember" };

const TOOLS: Array<{ tool: V1Tool; label: string; icon: typeof MousePointer2; gizmo?: boolean }> = [
  { tool: "select", label: "Chọn", icon: MousePointer2 },
  { tool: "move", label: "Di chuyển", icon: Move3d, gizmo: true },
  { tool: "rotate", label: "Xoay", icon: Rotate3d, gizmo: true },
];

/** Save state and the page-level actions, in the editor's top bar. */
export function V1Actions({ status, saveBlockedReason, onSave, onValidate, validating, versionsHref }: {
  status: V1Status;
  saveBlockedReason: string | null;
  onSave: () => void;
  onValidate: () => void;
  validating: boolean;
  versionsHref: string;
}) {
  const st = STATUS[status];
  const saveDisabled = status === "saving" || status === "saved" || status === "invalid";
  return <div className="se-actions" role="toolbar" aria-label="Lưu và kiểm tra">
    <StatusBadge tone={st.tone} data-testid="save-status" role="status" aria-live="polite">{st.label}</StatusBadge>
    <Button type="button" variant="secondary" size="sm" disabled={validating} onClick={onValidate} data-testid="validate" title="Kiểm tra nội dung đang sửa với máy chủ, không lưu"><ShieldCheck size={16} aria-hidden="true" /><span className="se-label">{validating ? "Đang kiểm tra…" : "Kiểm tra"}</span></Button>
    <Button type="button" variant="secondary" size="sm" disabled={saveDisabled} onClick={onSave} data-testid="save" title={status === "invalid" ? (saveBlockedReason ?? "Chưa hợp lệ để lưu") : "Lưu (Ctrl/Cmd+S)"}><Save size={16} aria-hidden="true" /><span className="se-label se-keep">{status === "saving" ? "Đang lưu…" : "Lưu"}</span></Button>
    <Button asChild variant="secondary" size="sm"><Link href={`${versionsHref}?tab=playtest`} data-testid="playtest" title="Chạy thử dùng phiên bản đã dựng gói: mở tab Chạy thử ở trang phiên bản"><Play size={16} aria-hidden="true" /><span className="se-label">Chạy thử</span></Link></Button>
    <Button asChild size="sm"><Link href={versionsHref} data-testid="versions-link" aria-label="Phiên bản" title="Tạo phiên bản cố định từ bản nháp đã lưu, rồi dựng gói và gửi duyệt"><History size={16} aria-hidden="true" /><span className="se-label se-keep">Phiên bản</span></Link></Button>
  </div>;
}

/** Floating tool group at the top of the viewport (select / move / rotate). */
export function V1ToolFloat({ tool, onTool, gizmoEnabled, onOpenTree, hasTree }: {
  tool: V1Tool;
  onTool: (tool: V1Tool) => void;
  gizmoEnabled: boolean;
  onOpenTree: () => void;
  hasTree: boolean;
}) {
  return <div className="se-float se-float-tools" role="toolbar" aria-label="Công cụ chỉnh sửa">
    {hasTree && <button type="button" className="se-float-btn se-tree-toggle" aria-label="Mở cây tầng và đối tượng" title="Cây tầng và đối tượng" onClick={onOpenTree}><PanelLeft size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
    <div className="se-float-group" role="group" aria-label="Công cụ">
      {TOOLS.filter((item) => gizmoEnabled || !item.gizmo).map(({ tool: value, label, icon: Icon }) => (
        <button key={value} type="button" className="se-float-tool" aria-pressed={tool === value} aria-label={label} title={label} data-testid={`tool-${value}`} onClick={() => onTool(value)}>
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" /><span>{label}</span>
        </button>
      ))}
    </div>
  </div>;
}

/** Floating "thêm đối tượng" bar at the bottom of the viewport: arm a kind, then click on the model to place it. */
export function V1PlaceFloat({ tool, placeKind, onPlace, kindStatus, placeDisabledReason }: {
  tool: V1Tool;
  placeKind: ObjectKind;
  onPlace: (kind: ObjectKind) => void;
  kindStatus: Record<ObjectKind, KindStatus>;
  /** Why placing is impossible at all (no valid Geometry, no floor selected), or null. */
  placeDisabledReason: string | null;
}) {
  return <div className="se-float se-float-place" role="group" aria-label="Đặt đối tượng">
    {OBJECT_KINDS.map((kind) => {
      const Icon = KIND_ICON[kind];
      const blocked = placeDisabledReason !== null || placementBlocked(kindStatus[kind]);
      const active = tool === "place" && placeKind === kind;
      return <button key={kind} type="button" className="se-float-kind" data-tone={KIND_TONE[kind]} aria-pressed={active} disabled={blocked} data-testid={`place-${kind}`}
        aria-label={`Đặt ${KIND_META[kind].lower}`} title={placeDisabledReason ?? (placementBlocked(kindStatus[kind]) ? `${KIND_META[kind].label}: xem tab “Khả dụng”` : `Đặt ${KIND_META[kind].lower} (bấm lên mô hình)`)}
        onClick={() => onPlace(kind)}>
        <Icon size={15} strokeWidth={1.9} aria-hidden="true" /><span>{KIND_META[kind].label}</span>
      </button>;
    })}
  </div>;
}
