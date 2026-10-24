"use client";

import { Check, CircleDashed, FlaskConical, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import { buildJourney, nextJourneyStep, type JourneyInput, type JourneyStep } from "../../journey";

const stateWord: Record<JourneyStep["state"], string> = { done: "Xong", active: "Đang làm", todo: "Chưa làm", blocked: "Bị chặn", unknown: "Chưa có dữ liệu" };

function Mark({ state }: { state: JourneyStep["state"] }) {
  if (state === "done") return <Check size={14} aria-hidden="true" />;
  if (state === "blocked") return <TriangleAlert size={14} aria-hidden="true" />;
  return <CircleDashed size={14} aria-hidden="true" />;
}

/**
 * Eight-step map from draft to publish. Each card shows the state the server reports for that step; the next one is
 * highlighted with a link to where it is done. The playtest branch hangs off "Build package" and is optional. This sits
 * above, and never replaces, the three independent gates.
 */
export function JourneyPanel({ input, editorHref, onTab, onSnapshot, canAct }: {
  input: JourneyInput;
  editorHref: string;
  /** `focus: "monitor"` asks the page to bring the live job panel into view (the journey card sits far above it). */
  onTab: (tab: "build" | "readiness" | "review" | "release" | "playtest", focus?: "monitor") => void;
  onSnapshot: () => void;
  canAct: boolean;
}) {
  const steps = buildJourney(input);
  const next = nextJourneyStep(steps);
  const numbers = new Map(steps.filter((item) => item.id !== "playtest").map((item, index) => [item.id, index + 1]));

  const action = (item: JourneyStep, primary: boolean) => {
    const variant = primary ? "primary" : "quiet";
    if (item.target.kind === "editor") return <Button asChild size="sm" variant={variant}><Link href={editorHref}>{item.actionLabel}</Link></Button>;
    if (item.target.kind === "snapshot") return <Button size="sm" variant={variant} onClick={onSnapshot} disabled={!canAct}>{item.actionLabel}</Button>;
    const tab = item.target.tab;
    return <Button size="sm" variant={variant} onClick={() => onTab(tab, item.id === "package" && item.state === "active" ? "monitor" : undefined)}>{item.actionLabel}</Button>;
  };

  return <section className="ver-journey" aria-labelledby="ver-journey-title" data-testid="journey">
    <div className="ver-journey-head">
      <h2 id="ver-journey-title" className="ver-section-title" style={{ margin: 0 }}>Hành trình từ draft đến phát hành</h2>
      <p className="ver-caption" style={{ margin: 0 }}>{next ? <>Bước tiếp theo: <strong>{next.title}</strong>.</> : "Mọi bước chính đã xong theo máy chủ."} Trạng thái từng bước đọc riêng từ máy chủ.</p>
    </div>
    <ol className="ver-journey-list" aria-label="Các bước từ lưu draft đến phát hành">
      {steps.map((item) => {
        const isNext = next?.id === item.id;
        const branch = item.id === "playtest";
        return <li key={item.id} className="ver-journey-step" data-step={item.id} data-state={item.state} data-next={isNext || undefined} data-branch={branch || undefined} aria-current={isNext ? "step" : undefined}>
          <div className="ver-journey-top">
            <span className="ver-journey-index" aria-hidden="true">{branch ? <FlaskConical size={13} /> : numbers.get(item.id)}</span>
            <p className="ver-journey-title">{item.title}</p>
          </div>
          <div className="ver-actions-row">
            <StatusBadge tone={item.tone}><Mark state={item.state} />{item.label}</StatusBadge>
            {isNext && <StatusBadge tone="ember">Bước tiếp theo</StatusBadge>}
          </div>
          <p className="ver-gate-detail" style={{ margin: 0 }}><span className="ver-sr">{stateWord[item.state]}. </span>{item.detail}</p>
          {(isNext || branch) && action(item, isNext)}
        </li>;
      })}
    </ol>
  </section>;
}
