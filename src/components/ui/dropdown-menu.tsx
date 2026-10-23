"use client";

import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { usePortalContainer } from "@/features/theme/theme-scope";
import { cn } from "@/utils/cn";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;

export function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  const container = usePortalContainer();
  return <MenuPrimitive.Portal container={container ?? undefined}>
    <MenuPrimitive.Content className={cn("ops-menu", className)} sideOffset={sideOffset} align={align} collisionPadding={12} {...props} />
  </MenuPrimitive.Portal>;
}

export function DropdownMenuItem({ className, tone, ...props }: ComponentProps<typeof MenuPrimitive.Item> & { tone?: "danger" }) {
  return <MenuPrimitive.Item className={cn("ops-menu-item", className)} data-tone={tone} {...props} />;
}

export function DropdownMenuSeparator(props: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className="ops-menu-sep" {...props} />;
}

export function DropdownMenuLabel(props: ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className="ops-menu-label" {...props} />;
}

export type RowMenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: "danger";
  disabled?: boolean;
  /** Why it is disabled; shown under the label. */
  hint?: string;
  /** Draws a hairline above this item. */
  separator?: boolean;
};

/**
 * The "···" menu at the end of a table row or a page header. Items are plain callbacks; the menu is only mounted while
 * open, so a table with 50 rows costs 50 buttons and nothing else.
 */
export function RowMenu({ items, label = "Thao tác", className, trigger, align = "end" }: { items: RowMenuItem[]; label?: string; className?: string; trigger?: ReactNode; align?: "start" | "end" }) {
  if (!items.length) return null;
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      {trigger ?? <button type="button" className={cn("ops-row-menu-button", className)} aria-label={label} onClick={(event) => event.stopPropagation()}><MoreHorizontal size={18} aria-hidden="true" /></button>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align={align} onClick={(event) => event.stopPropagation()}>
      {items.map((item) => {
        const Icon = item.icon;
        return <div key={item.label} style={{ display: "contents" }}>
          {item.separator && <DropdownMenuSeparator />}
          <DropdownMenuItem tone={item.tone} disabled={item.disabled} onSelect={item.onSelect}>
            {Icon && <Icon size={16} aria-hidden="true" />}
            <span><span>{item.label}</span>{item.hint && <small>{item.hint}</small>}</span>
          </DropdownMenuItem>
        </div>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}
