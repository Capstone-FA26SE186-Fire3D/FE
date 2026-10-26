"use client";

import { FileCheck2, Upload } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import "./file-drop.css";

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("vi-VN")} KB`);

/**
 * Drop zone in place of the browser's own file input ("Choose File / No file chosen"): drag a file onto it or press it to
 * pick one. Vietnamese text, keyboard reachable (the hidden input keeps its label), shows the chosen file. `accept`
 * filters the picker; a dropped file of another type is refused here with `rejectText`.
 */
export function FileDrop({ label, hint, accept, file, onFile, disabled, busy, rejectText, children, compact = false, "data-testid": testId }: {
  /** Accessible name of the input, e.g. "Chọn tệp để tính mã". */
  label: string;
  /** Line under the call to action (what is accepted, what happens). */
  hint?: ReactNode;
  accept?: string;
  file?: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  /** Work on the chosen file is in progress (hashing, uploading). */
  busy?: ReactNode;
  rejectText?: string;
  children?: ReactNode;
  compact?: boolean;
  "data-testid"?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState("");
  const allowed = (candidate: File) => {
    if (!accept) return true;
    const name = candidate.name.toLowerCase();
    return accept.split(",").map((item) => item.trim().toLowerCase()).some((rule) => (rule.startsWith(".") ? name.endsWith(rule) : rule.endsWith("/*") ? candidate.type.startsWith(rule.slice(0, -1)) : candidate.type === rule));
  };
  const take = (candidate: File | undefined | null) => {
    if (!candidate) return;
    if (!allowed(candidate)) { setRefused(rejectText ?? "Tệp này không đúng loại được nhận."); return; }
    setRefused("");
    onFile(candidate);
  };
  return <div className={cn("file-drop", compact && "file-drop-compact", dragging && "is-dragging", file && "has-file")} data-disabled={disabled || undefined} data-testid={testId}
    onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) take(event.dataTransfer.files?.[0]); }}>
    <input ref={input} id={id} type="file" accept={accept} className="file-drop-input" disabled={disabled} aria-label={label}
      onChange={(event) => { take(event.target.files?.[0]); event.target.value = ""; }} />
    <span className="file-drop-icon" aria-hidden="true">{file ? <FileCheck2 size={18} /> : <Upload size={18} />}</span>
    <div className="file-drop-text">
      {file
        ? <><strong>{file.name}</strong><span>{formatSize(file.size)}{!disabled && <> · <button type="button" className="file-drop-link" onClick={() => input.current?.click()}>chọn tệp khác</button></>}</span></>
        : <><strong>Kéo thả tệp vào đây</strong><span>hoặc <button type="button" className="file-drop-link" disabled={disabled} onClick={() => input.current?.click()}>bấm để chọn tệp</button></span></>}
      {busy && <span className="file-drop-busy" role="status">{busy}</span>}
      {hint && !busy && <span className="file-drop-hint">{hint}</span>}
      {refused && <span className="ops-field-error" role="alert">{refused}</span>}
      {children}
    </div>
  </div>;
}
