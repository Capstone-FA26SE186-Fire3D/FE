"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuthSession } from "@/features/auth/auth-session";

import { orgAiApi, traineeAiApi } from "../api";
import { traineeBlock, type TraineeTarget } from "../trainee";
import type { AiAudience, AiOperation, AnswerInput, ScenarioDraftInput, TraineeAiContext, TraineeAnswerInput } from "../types";
import { useAiSubmit, type SubmitAdapter, type SubmitPhase } from "../use-ai-submit";

/**
 * One line of the floating conversation. A user line is the text that was sent; an assistant line only names the request
 * the server created for it (`GET /api/ai/requests/{id}` is the source of truth, polled by the message itself).
 */
export type ChatMessage =
  | { id: string; role: "user"; operation: AiOperation; text: string; at: number }
  | { id: string; role: "assistant"; operation: AiOperation; requestId: string; at: number };

export type AiBubbleApi = {
  /** Who is asking: an organization (Answer / ScenarioDraft) or a Trainee (TraineeAnswer only, own daily allowance). */
  audience: AiAudience;
  /** The audience's role with a token: the bubble renders. The provider itself never gates, the view does. */
  enabled: boolean;
  accessToken: string;
  open: boolean;
  expanded: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setExpanded: (value: boolean) => void;
  mode: AiOperation;
  setMode: (value: AiOperation) => void;
  messages: ChatMessage[];
  /** Set while a submit is in progress or ended without a tracked request (blocked, failed, unknown). */
  phase: SubmitPhase;
  working: boolean;
  /** Sends a question (Answer). Nothing is sent when the limits say no. */
  ask: (question: string) => void;
  /** Sends a scenario-draft prompt for a Building. */
  draft: (prompt: string, buildingId: string) => void;
  /** Trainee: sends a question with at most one context (an article, a Training or one of their results). */
  askTrainee: (question: string, context?: TraineeAiContext) => void;
  /** Trainee: what the next question is about; set by a page link, cleared by "Hỏi chung". */
  traineeTarget: TraineeTarget | null;
  setTraineeTarget: (target: TraineeTarget | null) => void;
  /** Opens the panel about `target`, optionally with a question typed in (never sent until the learner presses send). */
  openWith: (target: TraineeTarget | null, draftText?: string) => void;
  /** A question handed over by `openWith`; the composer takes it once, then `consumeDraft`. */
  composerDraft: string | null;
  consumeDraft: () => void;
  retry: () => void;
  lookRecent: () => void;
  track: (requestId: string) => void;
  dismissPhase: () => void;
  /** Bumped each time a request settled; the panel reloads quota and limits on it. */
  settledCount: number;
  noteSettled: () => void;
  clear: () => void;
  /** Non-null right after the panel was opened (or the drawer collapsed): the composer takes focus once, then `consumeFocus`. */
  focusToken: number | null;
  requestFocus: () => void;
  consumeFocus: () => void;
};

const AiBubbleContext = createContext<AiBubbleApi | null>(null);

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}-${(seq += 1)}`;

/**
 * State of the floating "Trợ lý AI": open/expanded, the mode and the conversation. It is mounted in the workspace layout
 * ABOVE the operations shell, so the conversation survives navigation between `/workspace/*` pages (the shell re-mounts its
 * children per pathname). The submit path is the same hook the full page used (`useAiSubmit`): limits gate, Idempotency-Key
 * replay, unknown-outcome recovery.
 */
export function AiBubbleProvider({ children, audience = "organization" }: { children: ReactNode; audience?: AiAudience }) {
  const { accessToken, user } = useAuthSession();
  const token = accessToken ?? "";
  const trainee = audience === "trainee";
  const enabled = user?.role === (trainee ? 2 : 1) && token !== "";

  const [open, setOpen] = useState(false);
  const [expanded, setExpandedState] = useState(false);
  const [mode, setMode] = useState<AiOperation>(trainee ? "TraineeAnswer" : "Answer");
  const [traineeTarget, setTraineeTarget] = useState<TraineeTarget | null>(null);
  const [composerDraft, setComposerDraft] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settledCount, setSettledCount] = useState(0);
  // The operation of the line being sent: the tracked callback runs after an await, when `mode` may already have changed.
  const sending = useRef<AiOperation>(trainee ? "TraineeAnswer" : "Answer");

  const onTracked = useCallback((requestId: string) => {
    setMessages((current) => (current.some((item) => item.role === "assistant" && item.requestId === requestId) ? current : [...current, { id: nextId(), role: "assistant", operation: sending.current, requestId, at: Date.now() }]));
  }, []);
  // A Trainee is gated by their own daily allowance and finds lost requests in their own list.
  const adapter: SubmitAdapter | undefined = useMemo(() => (trainee ? {
    check: async (signal) => {
      const block = traineeBlock(await traineeAiApi.quota(token, signal));
      return block ? { kind: "blocked", limit: null, message: block } : null;
    },
    recent: async () => (await traineeAiApi.listRequests(token, { page: 1, pageSize: 5 })).items,
  } : undefined), [token, trainee]);
  const { phase, submit, retry, lookRecent, track, reset, working } = useAiSubmit(token, mode, onTracked, adapter);

  const ask = useCallback((question: string) => {
    const text = question.trim();
    if (!text || !token) return;
    sending.current = "Answer";
    const body: AnswerInput = { question: text };
    setMessages((current) => [...current, { id: nextId(), role: "user", operation: "Answer", text, at: Date.now() }]);
    void submit({ operation: "Answer", ...body }, (key, signal) => orgAiApi.submitAnswer(token, body, key, signal));
  }, [submit, token]);

  const draft = useCallback((prompt: string, buildingId: string) => {
    const text = prompt.trim();
    if (!text || !buildingId || !token) return;
    sending.current = "ScenarioDraft";
    const body: ScenarioDraftInput = { buildingId, prompt: text };
    setMessages((current) => [...current, { id: nextId(), role: "user", operation: "ScenarioDraft", text, at: Date.now() }]);
    void submit({ operation: "ScenarioDraft", ...body }, (key, signal) => orgAiApi.submitScenarioDraft(token, body, key, signal));
  }, [submit, token]);

  const askTrainee = useCallback((question: string, context?: TraineeAiContext) => {
    const text = question.trim();
    if (!text || !token) return;
    sending.current = "TraineeAnswer";
    const body: TraineeAnswerInput = { question: text, ...(context ? { context } : {}) };
    setMessages((current) => [...current, { id: nextId(), role: "user", operation: "TraineeAnswer", text, at: Date.now() }]);
    void submit({ operation: "TraineeAnswer", ...body }, (key, signal) => traineeAiApi.submit(token, body, key, signal));
  }, [submit, token]);

  // Focus is requested here (not in the view) so a re-mount of the view on navigation never steals focus into the composer.
  const [focusToken, setFocusToken] = useState<number | null>(null);
  const requestFocus = useCallback(() => setFocusToken(Date.now()), []);
  const consumeFocus = useCallback(() => setFocusToken(null), []);
  const openPanel = useCallback(() => { setOpen(true); setFocusToken(Date.now()); }, []);
  const openWith = useCallback((target: TraineeTarget | null, draftText?: string) => {
    setTraineeTarget(target);
    if (draftText) setComposerDraft(draftText);
    setOpen(true);
    setFocusToken(Date.now());
  }, []);
  const consumeDraft = useCallback(() => setComposerDraft(null), []);
  const closePanel = useCallback(() => { setOpen(false); setExpandedState(false); setFocusToken(null); }, []);
  const togglePanel = useCallback(() => setOpen((value) => { if (value) setExpandedState(false); else setFocusToken(Date.now()); return !value; }), []);
  const setExpanded = useCallback((value: boolean) => { setExpandedState(value); if (value) setOpen(true); else setFocusToken(Date.now()); }, []);
  const noteSettled = useCallback(() => setSettledCount((value) => value + 1), []);
  const clear = useCallback(() => { reset(); setMessages([]); }, [reset]);
  const changeMode = useCallback((value: AiOperation) => { setMode(value); reset(); }, [reset]);

  const value = useMemo<AiBubbleApi>(() => ({
    audience, enabled, accessToken: token, open, expanded, openPanel, closePanel, togglePanel, setExpanded, mode, setMode: changeMode, messages, phase, working,
    ask, draft, askTrainee, traineeTarget, setTraineeTarget, openWith, composerDraft, consumeDraft, retry: () => void retry(), lookRecent: () => void lookRecent(), track, dismissPhase: reset, settledCount, noteSettled, clear, focusToken, requestFocus, consumeFocus,
  }), [audience, enabled, token, open, expanded, openPanel, closePanel, togglePanel, setExpanded, mode, changeMode, messages, phase, working, ask, draft, askTrainee, traineeTarget, openWith, composerDraft, consumeDraft, retry, lookRecent, track, reset, settledCount, noteSettled, clear, focusToken, requestFocus, consumeFocus]);

  return <AiBubbleContext.Provider value={value}>{children}</AiBubbleContext.Provider>;
}

/** The floating assistant; pages call `openPanel()` ("Mở trợ lý"). Throws outside the workspace layout. */
export function useAiBubble() {
  const context = useContext(AiBubbleContext);
  if (!context) throw new Error("useAiBubble must be used inside AiBubbleProvider (workspace layout)");
  return context;
}

/** Same as `useAiBubble` but null when no provider is mounted (admin pages, tests of a lone component). */
export function useOptionalAiBubble() {
  return useContext(AiBubbleContext);
}
