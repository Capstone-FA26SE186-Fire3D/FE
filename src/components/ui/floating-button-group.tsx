"use client";

import type { LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { m, presets } from "@/components/ui/motion";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";

export type FloatingButtonItem = { id: string; label: string; icon: LucideIcon; shortcut?: string; pressed?: boolean; disabled?: boolean; separator?: boolean; tone?: "danger" };

/**
 * Floating toolbar for the 3D preview and the editor viewport (Arc UI "floating button group"): one highlight element
 * springs under the hovered button instead of each button re-rendering; `pressed` items are toggles. The tray is
 * `position: absolute` inside its viewport; pass `placement` for the corner.
 */
export function FloatingButtonGroup({ items, onAction, label, placement = "bottom", className, size = 40 }: {
  items: FloatingButtonItem[];
  onAction: (id: string) => void;
  label: string;
  placement?: "top" | "bottom" | "left" | "right";
  className?: string;
  size?: number;
}) {
  const [hover, setHover] = useState<{ x: number; w: number } | null>(null);
  const tray = useRef<HTMLDivElement>(null);
  const vertical = placement === "left" || placement === "right";

  const onEnter = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const base = tray.current?.getBoundingClientRect();
    if (!base) return;
    setHover(vertical ? { x: rect.top - base.top, w: rect.height } : { x: rect.left - base.left, w: rect.width });
  };

  return <div ref={tray} className={cn("ops-fbg", className)} data-placement={placement} role="toolbar" aria-label={label} aria-orientation={vertical ? "vertical" : "horizontal"} onPointerLeave={() => setHover(null)} style={{ "--fbg-size": `${size}px` } as React.CSSProperties}>
    {hover && <m.span aria-hidden="true" className="ops-fbg-highlight" initial={false} animate={vertical ? { y: hover.x, height: hover.w, opacity: 1 } : { x: hover.x, width: hover.w, opacity: 1 }} transition={presets.spring} />}
    {items.map((item) => {
      const Icon = item.icon;
      return <div key={item.id} style={{ display: "contents" }}>
        {item.separator && <span className="ops-fbg-sep" aria-hidden="true" />}
        <Tooltip content={item.shortcut ? <>{item.label} <kbd>{item.shortcut}</kbd></> : item.label} side={placement === "bottom" ? "top" : placement === "top" ? "bottom" : placement === "left" ? "right" : "left"}>
          <button type="button" className="ops-fbg-button" aria-label={item.label} aria-pressed={item.pressed} disabled={item.disabled} data-tone={item.tone} onPointerEnter={onEnter} onFocus={(event) => onEnter(event as unknown as React.PointerEvent<HTMLButtonElement>)} onClick={() => onAction(item.id)}>
            <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>;
    })}
  </div>;
}
