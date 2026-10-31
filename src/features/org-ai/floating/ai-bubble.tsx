"use client";

import { Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Drawer } from "@/components/ui/dialog";
import { AnimatePresence, m, presets } from "@/components/ui/motion";
import { routes } from "@/configs/routes";
import { useMediaQuery } from "@/utils/use-media-query";

import { AI_PROPOSAL_PARAM } from "../proposal-param";
import type { AiRequest } from "../types";
import { useAiBubble } from "./ai-bubble-context";
import { usePageContext } from "./use-page-context";
// The bubble also opens on pages outside the workspace shells (public Learn articles), which do not load the ops tokens.
import "@/assets/styles/ops.css";
import "./ai-bubble.css";

// The conversation UI and the apply dialog load when the panel first opens; the page only ships the launcher.
const AiChatPanel = dynamic(() => import("./ai-chat-panel").then((module) => module.AiChatPanel), { ssr: false });
const TraineeChatPanel = dynamic(() => import("./trainee-chat-panel").then((module) => module.TraineeChatPanel), { ssr: false });
const ApplyTargetDialog = dynamic(() => import("../components/apply-target-dialog").then((module) => module.ApplyTargetDialog), { ssr: false });

export { useAiBubble } from "./ai-bubble-context";

/**
 * Floating "Trợ lý AI" on every `/workspace/*` page (Figma 43:197 / 43:255 / 57:731) for the OrganizationUser, and on the
 * Trainee's learning hub (`AiBubbleProvider audience="trainee"`, own daily allowance and question context). The admin
 * never sees it. Collapsed: pill + ember sparkle button, bottom-right. Open: a 400×600 panel anchored bottom-right, a
 * full-screen sheet under 768px, or (expand) a 640px drawer. The conversation lives in `AiBubbleProvider` (layout), so it
 * survives navigation; this component only draws it and manages focus (into the composer on open, back to the launcher
 * on close) and Escape.
 */
export function AiBubble() {
  const bubble = useAiBubble();
  const { audience, enabled, accessToken, open, expanded, openPanel, closePanel, togglePanel, setExpanded, focusToken, consumeFocus } = bubble;
  const router = useRouter();
  const pathname = usePathname();
  const phone = useMediaQuery("(max-width: 767px)");
  const trainee = audience === "trainee";
  const context = usePageContext(accessToken, enabled && open && !trainee);
  const launcher = useRef<HTMLButtonElement>(null);
  const [applying, setApplying] = useState<AiRequest | null>(null);
  const wasOpen = useRef(open);

  // Focus returns to the launcher when the panel closes (the composer took it on open, see the provider's focusToken).
  useEffect(() => {
    if (!open && wasOpen.current) launcher.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const onApply = useCallback((request: AiRequest) => {
    // Already in the editor of a scenario: the proposal is offered to that draft directly (the editor re-reads it by id).
    if (context.scenarioId && context.buildingId) {
      router.push(`${routes.workspaceBuildings}/${encodeURIComponent(context.buildingId)}/scenarios/${encodeURIComponent(context.scenarioId)}?${AI_PROPOSAL_PARAM}=${encodeURIComponent(request.requestId)}`);
      closePanel();
      return;
    }
    setApplying(request);
  }, [closePanel, context.buildingId, context.scenarioId, router]);

  if (!enabled) return null;

  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === "Escape") { event.stopPropagation(); closePanel(); } };
  const toggleExpand = () => setExpanded(!expanded);
  const showPanel = open && !expanded && !phone;
  const showSheet = open && !expanded && phone;
  const showDrawer = open && expanded;

  return <>
    <div className="ai-launcher" data-open={open || undefined} data-testid="ai-bubble">
      {!open && <button type="button" className="ai-launcher-pill" onClick={openPanel} tabIndex={-1} aria-hidden="true" data-testid="ai-bubble-pill">Hỏi Trợ lý AI</button>}
      <button ref={launcher} type="button" className="ai-launcher-button" onClick={togglePanel} aria-expanded={open} aria-controls={showPanel ? "ai-bubble-panel" : undefined} aria-label={open ? "Đóng Trợ lý AI" : "Hỏi Trợ lý AI"} data-testid="ai-bubble-button">
        <Sparkles size={26} aria-hidden="true" />
      </button>
    </div>

    <AnimatePresence>
      {showPanel && <m.div key={pathname} id="ai-bubble-panel" className="ai-panel-float" role="dialog" aria-modal="false" aria-labelledby="ai-bubble-title" onKeyDown={onPanelKey}
        initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={presets.softSpring} data-testid="ai-bubble-float">
        {trainee
          ? <TraineeChatPanel variant="panel" onClose={closePanel} onToggleExpand={toggleExpand} focusToken={showPanel ? focusToken : null} onFocused={consumeFocus} />
          : <AiChatPanel context={context} variant="panel" onClose={closePanel} onToggleExpand={toggleExpand} onApply={onApply} focusToken={showPanel ? focusToken : null} onFocused={consumeFocus} />}
      </m.div>}
    </AnimatePresence>

    <Drawer open={showSheet} onOpenChange={(value) => { if (!value) closePanel(); }} side="bottom" title="Trợ lý AI" hideTitle flush className="ai-sheet" data-testid="ai-bubble-sheet">
      {trainee
        ? <TraineeChatPanel variant="sheet" onClose={closePanel} focusToken={showSheet ? focusToken : null} onFocused={consumeFocus} />
        : <AiChatPanel context={context} variant="sheet" onClose={closePanel} onApply={onApply} focusToken={showSheet ? focusToken : null} onFocused={consumeFocus} />}
    </Drawer>

    <Drawer open={showDrawer} onOpenChange={(value) => { if (!value) closePanel(); }} size="lg" title="Trợ lý AI" hideTitle flush className="ai-sheet ai-sheet--wide" data-testid="ai-bubble-drawer">
      {/* Only the variant on screen takes the focus request: a drawer or sheet that is closing must not keep it. */}
      {trainee
        ? <TraineeChatPanel variant="drawer" onClose={closePanel} onToggleExpand={toggleExpand} focusToken={showDrawer ? focusToken : null} onFocused={consumeFocus} />
        : <AiChatPanel context={context} variant="drawer" onClose={closePanel} onToggleExpand={toggleExpand} onApply={onApply} focusToken={showDrawer ? focusToken : null} onFocused={consumeFocus} />}
    </Drawer>

    {applying && <ApplyTargetDialog accessToken={accessToken} request={applying} onClose={() => setApplying(null)} />}
  </>;
}
