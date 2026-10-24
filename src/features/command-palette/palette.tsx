"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Building2, FilePlus2, Search, Upload } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { stripAccents } from "@/components/ui/combobox";
import { DialogRoot } from "@/components/ui/dialog";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "@/features/buildings/api";
import { usePortalContainer } from "@/features/theme/theme-scope";
import { adminArea, organizationArea, type NavItem } from "@/layouts/nav-config";
import { useRecentBuildings } from "./recent-buildings";

type PaletteApi = { open: () => void };
const PaletteContext = createContext<PaletteApi>({ open: () => undefined });

export function useCommandPalette() {
  return useContext(PaletteContext);
}

const BUILDING_ROUTE = /^\/workspace\/buildings\/([^/]+)/;
const SEARCH_MIN = 2;
const SEARCH_DEBOUNCE_MS = 250;

/** True while the key event comes from a text field, where Ctrl+K belongs to the editor. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Accent-insensitive "contains" so "cong trinh" finds "Công trình" (same rule as the combobox). */
function matches(label: string, query: string, keywords: string[] = []) {
  const needle = stripAccents(query.trim());
  if (!needle) return true;
  const hay = stripAccents([label, ...keywords].join(" "));
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const api = useMemo<PaletteApi>(() => ({ open: () => setOpen(true) }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <PaletteContext.Provider value={api}>
    {children}
    <DialogRoot open={open} onOpenChange={setOpen}>{open && <PaletteDialog onClose={() => setOpen(false)} />}</DialogRoot>
  </PaletteContext.Provider>;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const container = usePortalContainer();
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user } = useAuthSession();
  const recents = useRecentBuildings();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, SEARCH_DEBOUNCE_MS);
  const search = debounced.trim();
  // The building list needs an organization: PlatformAdmin must pass one, so only OrganizationUser searches here.
  const canSearch = Boolean(accessToken) && user?.role === 1 && search.length >= SEARCH_MIN;
  const results = useAsyncData(`palette:buildings:${search}`, (signal) => buildingsApi.list(accessToken ?? "", { search, pageSize: 8 }, signal), canSearch, { keepPrevious: false });

  const area = pathname.startsWith("/admin") ? adminArea : organizationArea;
  const openBuildingId = BUILDING_ROUTE.exec(pathname)?.[1];

  const go = useCallback((href: string) => {
    onClose();
    router.push(href);
  }, [onClose, router]);

  const actions = openBuildingId ? [
    { key: "upload-ifc", label: "Tải IFC mới cho công trình đang mở", icon: Upload, href: `/workspace/buildings/${openBuildingId}?tab=ifc&upload=1`, keywords: ["ifc", "tai len", "upload", "mo hinh"] },
    { key: "create-scenario", label: "Tạo kịch bản", icon: FilePlus2, href: `/workspace/buildings/${openBuildingId}?tab=scenarios&create=1`, keywords: ["scenario", "kich ban", "soan"] },
  ].filter((action) => matches(action.label, query, action.keywords)) : [];
  const recentItems = recents.filter((item) => matches(item.name, query));
  const navItems: NavItem[] = area.nav.filter((item) => matches(item.label, query, [item.href]));
  const found = canSearch ? (results.data?.items ?? []).filter((item) => !recentItems.some((recent) => recent.id === item.id)) : [];
  const searching = canSearch && results.loading;
  const waitingForMore = query.trim().length > 0 && query.trim().length < SEARCH_MIN && user?.role === 1;
  const empty = actions.length === 0 && recentItems.length === 0 && navItems.length === 0 && found.length === 0 && !searching;

  return <DialogPrimitive.Portal container={container ?? undefined}>
    <DialogPrimitive.Overlay className="ops-overlay" />
    <DialogPrimitive.Content className="ops-palette" aria-describedby={undefined} data-testid="command-palette" onOpenAutoFocus={(event) => { event.preventDefault(); (event.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>("[cmdk-input]")?.focus(); }}>
      <DialogPrimitive.Title className="ops-sr-only">Tìm nhanh</DialogPrimitive.Title>
      <Command label="Tìm nhanh" shouldFilter={false} loop>
        <div className="ops-palette-search">
          <Search size={18} aria-hidden="true" />
          <Command.Input value={query} onValueChange={setQuery} placeholder="Tìm công trình, kịch bản, hành động…" autoComplete="off" spellCheck={false} />
          <kbd>esc</kbd>
        </div>
        <Command.List className="ops-palette-list">
          {empty && <Command.Empty className="ops-palette-empty">{waitingForMore ? `Nhập ít nhất ${SEARCH_MIN} ký tự để tìm công trình` : "Không có kết quả"}</Command.Empty>}

          {actions.length > 0 && <Command.Group heading="Hành động" className="ops-palette-group">
            {actions.map((action) => {
              const Icon = action.icon;
              return <Command.Item key={action.key} value={`action:${action.key}`} className="ops-palette-item" data-tone="ember" onSelect={() => go(action.href)}>
                <Icon size={16} aria-hidden="true" /><span className="ops-palette-item-label">{action.label}</span>
              </Command.Item>;
            })}
          </Command.Group>}

          {recentItems.length > 0 && <Command.Group heading="Công trình gần đây" className="ops-palette-group">
            {recentItems.map((item) => <Command.Item key={item.id} value={`recent:${item.id}`} className="ops-palette-item" onSelect={() => go(`/workspace/buildings/${item.id}`)}>
              <Building2 size={16} aria-hidden="true" /><span className="ops-palette-item-label">{item.name}</span>{item.floors !== undefined && <small>{item.floors} tầng</small>}
            </Command.Item>)}
          </Command.Group>}

          {(found.length > 0 || searching) && <Command.Group heading="Công trình" className="ops-palette-group">
            {searching && found.length === 0 && <div className="ops-palette-status" role="status">Đang tìm…</div>}
            {found.map((item) => <Command.Item key={item.id} value={`building:${item.id}`} className="ops-palette-item" onSelect={() => go(`/workspace/buildings/${item.id}`)}>
              <Building2 size={16} aria-hidden="true" /><span className="ops-palette-item-label">{item.name}</span><small>{item.buildingType ? `${item.buildingType} · ` : ""}{item.totalFloors} tầng</small>
            </Command.Item>)}
          </Command.Group>}

          {navItems.length > 0 && <Command.Group heading="Điều hướng" className="ops-palette-group">
            {navItems.map((item) => {
              const Icon = item.icon;
              return <Command.Item key={item.href} value={`nav:${item.href}`} className="ops-palette-item" onSelect={() => go(item.href)}>
                <Icon size={16} aria-hidden="true" /><span className="ops-palette-item-label">{item.label}</span>{item.group && <small>{item.group}</small>}
              </Command.Item>;
            })}
          </Command.Group>}
        </Command.List>
        <div className="ops-palette-foot" aria-hidden="true"><span>↑↓ chọn</span><span>⏎ mở</span><span>esc đóng</span></div>
      </Command>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}

/** Topbar "Tìm nhanh ⌘K" button. */
export function CommandPaletteButton() {
  const { open } = useCommandPalette();
  return <button type="button" className="ops-topbar-search" onClick={open} aria-label="Tìm nhanh (Ctrl K)"><Search size={16} aria-hidden="true" /><span>Tìm nhanh</span><kbd>⌘K</kbd></button>;
}
