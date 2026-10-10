"use client";

import { Flame, History, MapPinPlus, Move3d, MousePointer2, Redo2, Rotate3d, Save, ShieldCheck, Undo2, Play, PanelLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";

import { BE_ISSUES, EDITOR_CAPABILITIES } from "../config";
import type { SaveStatus, Tool } from "../store/editor-store";

const STATUS: Record<SaveStatus, { label: string; tone: Tone }> = {
  saved: { label: "Đã lưu", tone: "success" },
  dirty: { label: "Chưa lưu", tone: "warning" },
  saving: { label: "Đang lưu…", tone: "pending" },
  conflict: { label: "Xung đột", tone: "danger" },
  error: { label: "Lỗi khi lưu", tone: "danger" },
};

type ToolDef = { tool: Tool; label: string; icon: typeof MousePointer2; gizmo?: boolean };
const TOOLS: ToolDef[] = [
  { tool: "select", label: "Chọn", icon: MousePointer2 },
  { tool: "move", label: "Di chuyển", icon: Move3d, gizmo: true },
  { tool: "rotate", label: "Xoay", icon: Rotate3d, gizmo: true },
  { tool: "place-spawn", label: "Đặt điểm xuất phát", icon: MapPinPlus },
  { tool: "place-hazard", label: "Đặt nguy cơ", icon: Flame },
];

export function EditorToolbar({ tool, onTool, gizmoEnabled, canUndo, canRedo, onUndo, onRedo, status, onSave, onValidate, validating, saveDisabled, versionsHref, onOpenTree, undoLabel, redoLabel, hasTree }: {
  tool: Tool;
  onTool: (tool: Tool) => void;
  gizmoEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  status: SaveStatus;
  onSave: () => void;
  onValidate: () => void;
  validating: boolean;
  saveDisabled: boolean;
  versionsHref: string;
  onOpenTree: () => void;
  undoLabel?: string;
  redoLabel?: string;
  hasTree: boolean;
}) {
  const st = STATUS[status];
  return <div className="se-toolbar" role="toolbar" aria-label="Công cụ chỉnh sửa">
    {hasTree && <Button type="button" variant="secondary" size="icon" className="se-tree-toggle" aria-label="Mở cây tầng và đối tượng" title="Cây tầng và đối tượng" onClick={onOpenTree}><PanelLeft size={18} strokeWidth={1.75} aria-hidden="true" /></Button>}
    <div className="se-tool-group" role="group" aria-label="Công cụ">
      {TOOLS.filter((item) => gizmoEnabled || !item.gizmo).map(({ tool: value, label, icon: Icon }) => (
        <Button key={value} type="button" variant={tool === value ? "primary" : "secondary"} size="icon" aria-pressed={tool === value} aria-label={label} title={label} data-testid={`tool-${value}`} onClick={() => onTool(value)}>
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      ))}
    </div>
    <div className="se-tool-group" role="group" aria-label="Lịch sử">
      <Button type="button" variant="secondary" size="icon" disabled={!canUndo} aria-label={undoLabel ? `Hoàn tác: ${undoLabel}` : "Hoàn tác"} title="Hoàn tác (Ctrl/Cmd+Z)" data-testid="undo" onClick={onUndo}><Undo2 size={18} strokeWidth={1.75} aria-hidden="true" /></Button>
      <Button type="button" variant="secondary" size="icon" disabled={!canRedo} aria-label={redoLabel ? `Làm lại: ${redoLabel}` : "Làm lại"} title="Làm lại (Ctrl/Cmd+Shift+Z)" data-testid="redo" onClick={onRedo}><Redo2 size={18} strokeWidth={1.75} aria-hidden="true" /></Button>
    </div>
    <span className="se-toolbar-spacer" />
    <StatusBadge tone={st.tone} data-testid="save-status" role="status" aria-live="polite">{st.label}</StatusBadge>
    <Button type="button" variant="secondary" disabled={validating} onClick={onValidate} data-testid="validate"><ShieldCheck size={16} aria-hidden="true" /><span className="se-label">{validating ? "Đang kiểm tra…" : "Kiểm tra"}</span></Button>
    <Button type="button" disabled={saveDisabled} onClick={onSave} data-testid="save" title="Lưu (Ctrl/Cmd+S)"><Save size={16} aria-hidden="true" /><span className="se-label se-keep">{status === "saving" ? "Đang lưu…" : "Lưu"}</span></Button>
    <Button asChild variant="quiet"><Link href={versionsHref} data-testid="versions-link"><History size={16} aria-hidden="true" /><span className="se-label">Phiên bản</span></Link></Button>
    <Button type="button" variant="quiet" disabled={!EDITOR_CAPABILITIES.playtest} aria-disabled={!EDITOR_CAPABILITIES.playtest} title={`Chờ ${BE_ISSUES.playtest.label}: chưa có luồng playtest handoff`} data-testid="playtest"><Play size={16} aria-hidden="true" /><span className="se-label">Playtest</span><StatusBadge tone="warning" className="se-pending">Chờ BE #55</StatusBadge></Button>
  </div>;
}
