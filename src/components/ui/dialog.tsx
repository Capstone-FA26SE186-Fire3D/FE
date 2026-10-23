"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePortalContainer } from "@/features/theme/theme-scope";
import { cn } from "@/utils/cn";

export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type ModalSize = "sm" | "md" | "lg";
export type DrawerSize = "sm" | "md" | "lg" | "xl";

type SurfaceProps = {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Visible title is required by assistive tech; set false only if the content shows its own heading. */
  hideTitle?: boolean;
  /** Status chip / meta line drawn above the title (drawer "Chờ duyệt · v2 · Thoát hiểm tầng 3"). */
  eyebrow?: ReactNode;
  /** Extra controls next to the close button (open in new tab, expand). */
  headerExtra?: ReactNode;
  /** Padding-less body for tables and 3D viewers. */
  flush?: boolean;
  "data-testid"?: string;
};

type SurfaceKind = SurfaceProps & { kind: "dialog" | "drawer"; side?: "left" | "right" | "bottom"; size?: ModalSize | DrawerSize };

// Mounted only while open (inside Portal), so `opener` is the element focused when the dialog opened.
function SurfaceContent({ kind, side = "right", size, title, description, children, footer, className, hideTitle, eyebrow, headerExtra, flush, ...rest }: SurfaceKind) {
  // Radix only restores focus to a <Trigger>; our dialogs are opened by arbitrary buttons, so remember the opener.
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));
  return <>
    <DialogPrimitive.Overlay className="ops-overlay" />
    <DialogPrimitive.Content
      onCloseAutoFocus={(event) => { event.preventDefault(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); }}
      className={cn(kind === "dialog" ? "ops-dialog" : "ops-drawer", className)}
      data-side={kind === "drawer" ? side : undefined}
      data-size={size}
      data-testid={rest["data-testid"]}
      aria-describedby={description ? undefined : undefined /* no description: opt out of Radix's warning */}
    >
      <div className="ops-dialog-head">
        <div className="ops-dialog-titles" style={hideTitle ? { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } : undefined}>
          {eyebrow && <div className="ops-dialog-eyebrow">{eyebrow}</div>}
          <DialogPrimitive.Title asChild><h2>{title}</h2></DialogPrimitive.Title>
          {description && <DialogPrimitive.Description asChild><p>{description}</p></DialogPrimitive.Description>}
        </div>
        <div className="ops-dialog-tools">{headerExtra}<DialogPrimitive.Close className="ops-icon-button ops-icon-button--sm" aria-label="Đóng"><X size={16} aria-hidden="true" /></DialogPrimitive.Close></div>
      </div>
      <div className={cn("ops-dialog-body", flush && "ops-dialog-body--flush")}>{children}</div>
      {footer && <div className="ops-dialog-foot">{footer}</div>}
    </DialogPrimitive.Content>
  </>;
}

function Surface(props: SurfaceKind) {
  const container = usePortalContainer();
  return <DialogPrimitive.Portal container={container ?? undefined}><SurfaceContent {...props} /></DialogPrimitive.Portal>;
}

/** Centered modal for every create/edit form and confirmation. Focus is trapped and returned by Radix. sm 440 · md 520 · lg 720. */
export function Modal({ open, onOpenChange, size = "md", ...props }: SurfaceProps & { open: boolean; onOpenChange: (open: boolean) => void; size?: ModalSize }) {
  return <DialogRoot open={open} onOpenChange={onOpenChange}><Surface kind="dialog" size={size} {...props} /></DialogRoot>;
}

/** Side panel for record detail so the list underneath keeps its place. sm 480 · md 560 · lg 640 · xl 720; `side="bottom"` is the phone sheet. */
export function Drawer({ open, onOpenChange, side, size = "sm", ...props }: SurfaceProps & { open: boolean; onOpenChange: (open: boolean) => void; side?: "left" | "right" | "bottom"; size?: DrawerSize }) {
  return <DialogRoot open={open} onOpenChange={onOpenChange}><Surface kind="drawer" side={side} size={size} {...props} /></DialogRoot>;
}

/**
 * Yes/no question with one primary action. `tone="danger"` is for one-way actions (archive, revoke, lock): the
 * description must say that it cannot be undone. While `busy`, the dialog cannot be dismissed.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Xác nhận", cancelLabel = "Hủy", tone = "primary", onConfirm, busy, children, confirmDisabled }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  return <Modal open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }} size="sm" title={title} description={description} className={tone === "danger" ? "ops-dialog--danger" : undefined}
    footer={<>
      <Button variant="ghost" type="button" disabled={busy} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
      <Button variant={tone === "danger" ? "danger" : "primary"} type="button" disabled={busy || confirmDisabled} onClick={() => void onConfirm()}>{busy && <Spinner size={16} />}{confirmLabel}</Button>
    </>}>
    {children}
  </Modal>;
}
