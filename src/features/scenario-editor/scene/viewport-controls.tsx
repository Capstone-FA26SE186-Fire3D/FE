"use client";

import { Copy, Crosshair, Eye, EyeOff, Lock, LockOpen, Maximize2, Redo2, ShieldCheck, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Floating controls over the 3D viewport in the UIArc Floating Button Group style: a top pill (history + check), a vertical
 * rail (zoom, fit, lock, model visibility) and a contextual bar above the selected object. Zoom, fit, lock and visibility
 * only move the camera or hide the model in the browser; nothing here is sent to the server except "Kiểm tra" (the
 * existing validate call) and the object actions, which are ordinary draft edits (undoable).
 */

function FloatButton({ label, onClick, disabled, pressed, testId, children, tone }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; testId?: string; children: ReactNode; tone?: "danger" }) {
  return <button type="button" className="se-float-btn" data-tone={tone} aria-label={label} title={label} disabled={disabled} aria-pressed={pressed} data-testid={testId} onClick={onClick}>{children}</button>;
}

const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;

export function ViewportPill({ canUndo, canRedo, undoLabel, redoLabel, onUndo, onRedo, onValidate, validating }: {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
  onValidate: () => void;
  validating: boolean;
}) {
  return <div className="se-float se-float-pill" role="group" aria-label="Lịch sử và kiểm tra">
    <FloatButton label={undoLabel ? `Hoàn tác: ${undoLabel}` : "Hoàn tác"} disabled={!canUndo} onClick={onUndo} testId="undo"><Undo2 {...ICON} /></FloatButton>
    <FloatButton label={redoLabel ? `Làm lại: ${redoLabel}` : "Làm lại"} disabled={!canRedo} onClick={onRedo} testId="redo"><Redo2 {...ICON} /></FloatButton>
    <span className="se-float-sep" aria-hidden="true" />
    <FloatButton label={validating ? "Đang kiểm tra bản nháp…" : "Kiểm tra bản nháp"} disabled={validating} onClick={onValidate} testId="pill-validate"><ShieldCheck {...ICON} /></FloatButton>
  </div>;
}

export function ViewportRail({ canFit, locked, modelVisible, hasModel, onZoomIn, onZoomOut, onFit, onToggleLock, onToggleModel }: {
  /** False when there is nothing to fit (no model loaded). */
  canFit: boolean;
  locked: boolean;
  modelVisible: boolean;
  hasModel: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onToggleLock: () => void;
  onToggleModel: () => void;
}) {
  return <div className="se-float se-float-rail" role="group" aria-label="Điều khiển khung nhìn">
    <FloatButton label="Phóng to" disabled={locked} onClick={onZoomIn} testId="zoom-in"><ZoomIn {...ICON} /></FloatButton>
    <FloatButton label="Thu nhỏ" disabled={locked} onClick={onZoomOut} testId="zoom-out"><ZoomOut {...ICON} /></FloatButton>
    <FloatButton label="Vừa khung nhìn" disabled={!canFit || locked} onClick={onFit} testId="fit-view"><Maximize2 {...ICON} /></FloatButton>
    <span className="se-float-sep se-float-sep-h" aria-hidden="true" />
    <FloatButton label={locked ? "Mở khóa khung nhìn" : "Khóa khung nhìn"} pressed={locked} onClick={onToggleLock} testId="lock-view">{locked ? <Lock {...ICON} /> : <LockOpen {...ICON} />}</FloatButton>
    <FloatButton label={modelVisible ? "Ẩn mô hình" : "Hiện mô hình"} pressed={!modelVisible} disabled={!hasModel} onClick={onToggleModel} testId="toggle-model">{modelVisible ? <Eye {...ICON} /> : <EyeOff {...ICON} />}</FloatButton>
  </div>;
}

export function SelectionBar({ position, onCopy, onFocus, onDelete }: { position: { x: number; y: number }; onCopy: () => void; onFocus: () => void; onDelete: () => void }) {
  return <div className="se-float se-float-context" role="toolbar" aria-label="Đối tượng đang chọn" style={{ left: position.x, top: position.y }}>
    <FloatButton label="Nhân bản đối tượng" onClick={onCopy} testId="ctx-copy"><Copy {...ICON} /></FloatButton>
    <FloatButton label="Căn camera vào đối tượng" onClick={onFocus} testId="ctx-focus"><Crosshair {...ICON} /></FloatButton>
    <FloatButton label="Xóa đối tượng" tone="danger" onClick={onDelete} testId="ctx-delete"><Trash2 {...ICON} /></FloatButton>
  </div>;
}
