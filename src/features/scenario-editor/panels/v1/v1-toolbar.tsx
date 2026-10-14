"use client";

import { Ban, Flag, Flame, History, MapPinPlus, Move3d, MousePointer2, PanelLeft, Play, Redo2, Rotate3d, Save, ShieldCheck, Undo2, UserRound, Wrench } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";

import { BE_ISSUES, EDITOR_CAPABILITIES } from "../../config";
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

const TOOLS: Array<{ tool: V1Tool; label: string; icon: typeof MousePointer2; gizmo?: boolean }> = [
  { tool: "select", label: "Chọn", icon: MousePointer2 },
  { tool: "move", label: "Di chuyển", icon: Move3d, gizmo: true },
  { tool: "rotate", label: "Xoay", icon: Rotate3d, gizmo: true },
];

export function V1Toolbar({ tool, placeKind, onTool, gizmoEnabled, canUndo, canRedo, onUndo, onRedo, undoLabel, redoLabel, status, saveBlockedReason, onSave, onValidate, validating, versionsHref, onOpenTree, hasTree, kindStatus, placeDisabledReason }: {
  tool: V1Tool;
  placeKind: ObjectKind;
  onTool: (tool: V1Tool, placeKind?: ObjectKind) => void;
  gizmoEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  undoLabel?: string;
  redoLabel?: string;
  status: V1Status;
  saveBlockedReason: string | null;
  onSave: () => void;
  onValidate: () => void;
  validating: boolean;
  versionsHref: string;
  onOpenTree: () => void;
  hasTree: boolean;
  kindStatus: Record<ObjectKind, KindStatus>;
  /** Why placing is impossible at all (no valid Geometry, no floor selected), or null. */
  placeDisabledReason: string | null;
}) {
  const st = STATUS[status];
  const saveDisabled = status === "saving" || status === "saved" || status === "invalid";
  return <div className="se-toolbar" role="toolbar" aria-label="Công cụ chỉnh sửa">
    {hasTree && <Button type="button" variant="secondary" size="icon" className="se-tree-toggle" aria-label="Mở cây tầng và đối tượng" title="Cây tầng và đối tượng" onClick={onOpenTree}><PanelLeft size={18} strokeWidth={1.75} aria-hidden="true" /></Button>}
    <div className="se-tool-group" role="group" aria-label="Công cụ">
      {TOOLS.filter((item) => gizmoEnabled || !item.gizmo).map(({ tool: value, label, icon: Icon }) => (
        <Button key={value} type="button" variant={tool === value ? "primary" : "secondary"} size="icon" aria-pressed={tool === value} aria-label={label} title={label} data-testid={`tool-${value}`} onClick={() => onTool(value)}>
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      ))}
    </div>
    <div className="se-tool-group" role="group" aria-label="Đặt đối tượng">
      {OBJECT_KINDS.map((kind) => {
        const Icon = KIND_ICON[kind];
        const blocked = placeDisabledReason !== null || placementBlocked(kindStatus[kind]);
        const active = tool === "place" && placeKind === kind;
        return <Button key={kind} type="button" variant={active ? "primary" : "secondary"} size="icon" aria-pressed={active} disabled={blocked} data-testid={`place-${kind}`}
          aria-label={`Đặt ${KIND_META[kind].lower}`} title={placeDisabledReason ?? (placementBlocked(kindStatus[kind]) ? `${KIND_META[kind].label}: xem tab “Khả dụng”` : `Đặt ${KIND_META[kind].lower} (bấm lên mô hình)`)}
          onClick={() => onTool("place", kind)}>
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </Button>;
      })}
    </div>
    <div className="se-tool-group" role="group" aria-label="Lịch sử">
      <Button type="button" variant="secondary" size="icon" disabled={!canUndo} aria-label={undoLabel ? `Hoàn tác: ${undoLabel}` : "Hoàn tác"} title="Hoàn tác (Ctrl/Cmd+Z)" data-testid="undo" onClick={onUndo}><Undo2 size={18} strokeWidth={1.75} aria-hidden="true" /></Button>
      <Button type="button" variant="secondary" size="icon" disabled={!canRedo} aria-label={redoLabel ? `Làm lại: ${redoLabel}` : "Làm lại"} title="Làm lại (Ctrl/Cmd+Shift+Z)" data-testid="redo" onClick={onRedo}><Redo2 size={18} strokeWidth={1.75} aria-hidden="true" /></Button>
    </div>
    <span className="se-toolbar-spacer" />
    <StatusBadge tone={st.tone} data-testid="save-status" role="status" aria-live="polite">{st.label}</StatusBadge>
    <Button type="button" variant="secondary" disabled={validating} onClick={onValidate} data-testid="validate" title="Kiểm tra nội dung đang sửa với máy chủ, không lưu"><ShieldCheck size={16} aria-hidden="true" /><span className="se-label">{validating ? "Đang kiểm tra…" : "Kiểm tra"}</span></Button>
    <Button type="button" disabled={saveDisabled} onClick={onSave} data-testid="save" title={status === "invalid" ? (saveBlockedReason ?? "Chưa hợp lệ để lưu") : "Lưu (Ctrl/Cmd+S)"}><Save size={16} aria-hidden="true" /><span className="se-label se-keep">{status === "saving" ? "Đang lưu…" : "Lưu"}</span></Button>
    <Button asChild variant="quiet"><Link href={versionsHref} data-testid="versions-link"><History size={16} aria-hidden="true" /><span className="se-label">Phiên bản</span></Link></Button>
    <Button type="button" variant="quiet" disabled={!EDITOR_CAPABILITIES.playtest} aria-disabled={!EDITOR_CAPABILITIES.playtest} title={`Chờ ${BE_ISSUES.playtest.label}: chưa có luồng playtest handoff`} data-testid="playtest"><Play size={16} aria-hidden="true" /><span className="se-label">Playtest</span><StatusBadge tone="warning" className="se-pending">Chờ BE #55</StatusBadge></Button>
  </div>;
}
