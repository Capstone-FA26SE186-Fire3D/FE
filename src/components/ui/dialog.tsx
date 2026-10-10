"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePortalContainer } from "@/features/theme/theme-scope";
import { cn } from "@/utils/cn";

export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type SurfaceProps = {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Visible title is required by assistive tech; set false only if the content shows its own heading. */
  hideTitle?: boolean;
};

type SurfaceKind = SurfaceProps & { kind: "dialog" | "drawer"; side?: "left" | "right" };

// Mounted only while open (inside Portal), so `opener` is the element focused when the dialog opened.
function SurfaceContent({ kind, side = "right", title, description, children, footer, className, hideTitle }: SurfaceKind) {
  // Radix only restores focus to a <Trigger>; our dialogs are opened by arbitrary buttons, so remember the opener.
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));
  return <>
    <DialogPrimitive.Overlay className="ops-overlay" />
    <DialogPrimitive.Content
      onCloseAutoFocus={(event) => { event.preventDefault(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); }}
      className={cn(kind === "dialog" ? "ops-dialog" : "ops-drawer", className)}
      data-side={kind === "drawer" ? side : undefined}
      aria-describedby={description ? undefined : undefined /* no description: opt out of Radix's warning */}
    >
      <div className="ops-dialog-head">
        <div style={hideTitle ? { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } : undefined}>
          <DialogPrimitive.Title asChild><h2>{title}</h2></DialogPrimitive.Title>
          {description && <DialogPrimitive.Description asChild><p>{description}</p></DialogPrimitive.Description>}
        </div>
        <DialogPrimitive.Close className="ops-icon-button" aria-label="Đóng"><X size={18} aria-hidden="true" /></DialogPrimitive.Close>
      </div>
      <div className="ops-dialog-body">{children}</div>
      {footer && <div className="ops-dialog-foot">{footer}</div>}
    </DialogPrimitive.Content>
  </>;
}

function Surface(props: SurfaceKind) {
  const container = usePortalContainer();
  return <DialogPrimitive.Portal container={container ?? undefined}><SurfaceContent {...props} /></DialogPrimitive.Portal>;
}

/** Centered modal for confirmations and short forms. Focus is trapped and returned by Radix. */
export function Modal({ open, onOpenChange, ...props }: SurfaceProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <DialogRoot open={open} onOpenChange={onOpenChange}><Surface kind="dialog" {...props} /></DialogRoot>;
}

/** Side panel for short tasks (create, detail) so the list underneath keeps its place. */
export function Drawer({ open, onOpenChange, side, ...props }: SurfaceProps & { open: boolean; onOpenChange: (open: boolean) => void; side?: "left" | "right" }) {
  return <DialogRoot open={open} onOpenChange={onOpenChange}><Surface kind="drawer" side={side} {...props} /></DialogRoot>;
}
