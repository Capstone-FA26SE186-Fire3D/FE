"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useId, type ComponentProps, type ReactNode } from "react";
import { m, presets } from "@/components/ui/motion";
import { cn } from "@/utils/cn";

export type SubTabItem = { value: string; label: ReactNode; count?: number; disabled?: boolean; "data-testid"?: string };

/**
 * Second-level navigation as a segmented pill (Figma "Sub-tab pill"). Only one highlight element exists and it springs
 * between triggers (Arc UI pattern), so switching tabs never repaints the pills themselves. Pass `size="sm"` for the
 * 30px variant used inside panels (AI chat mode toggle).
 */
export function SubTabs({ items, value, onValueChange, label, size = "md", className, children, ...rest }: Omit<ComponentProps<typeof TabsPrimitive.Root>, "children"> & {
  items: SubTabItem[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  size?: "sm" | "md";
  children?: ReactNode;
}) {
  const group = useId();
  return <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className} {...rest}>
    <TabsPrimitive.List className="ops-subtabs" data-size={size} aria-label={label}>
      {items.map((item) => <TabsPrimitive.Trigger key={item.value} value={item.value} disabled={item.disabled} className="ops-subtab" data-testid={item["data-testid"]}>
        {item.value === value && <m.span layoutId={`${group}-pill`} className="ops-subtab-pill" transition={presets.spring} />}
        <span className="ops-subtab-text">{item.label}{typeof item.count === "number" && <span className="ops-subtab-count">{item.count}</span>}</span>
      </TabsPrimitive.Trigger>)}
    </TabsPrimitive.List>
    {children}
  </TabsPrimitive.Root>;
}

export function SubTabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("ops-subtabs-content", className)} {...props} />;
}

/** Chip-style filter row where exactly one is pressed (for a third level: Issue · Nhật ký · Artifact · BIM facts). */
export function ChipTabs({ items, value, onValueChange, label, className }: { items: SubTabItem[]; value: string; onValueChange: (value: string) => void; label: string; className?: string }) {
  return <div className={cn("ops-chiptabs", className)} role="group" aria-label={label}>
    {items.map((item) => <button key={item.value} type="button" className="ops-chiptab" aria-pressed={item.value === value} disabled={item.disabled} data-testid={item["data-testid"]} onClick={() => onValueChange(item.value)}>
      {item.label}{typeof item.count === "number" && <span className="ops-subtab-count">{item.count}</span>}
    </button>)}
  </div>;
}
