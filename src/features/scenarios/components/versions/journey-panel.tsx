"use client";

import { Check, FlaskConical, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import { buildJourney, nextJourneyStep, type JourneyInput, type JourneyStep } from "../../journey";

const stateWord: Record<JourneyStep["state"], string> = { done: "Xong", active: "Đang làm", todo: "Chưa làm", blocked: "Bị chặn", unknown: "Chưa có dữ liệu" };

function Node({ state, index }: { state: JourneyStep["state"]; index: number }) {
  if (state === "done") return <Check size={13} strokeWidth={3} aria-hidden="true" />;
  if (state === "blocked") return <TriangleAlert size={12} aria-hidden="true" />;
  return <>{index}</>;
}

/**
 * Figma v3 "Hành trình từ draft đến phát hành": eight steps on one line, each with the state the server reports for it,
 * then the three independent gates and a bar with the next step's action. The playtest branch hangs off "Build package"
 * and is optional, so it sits under the line instead of in it. One step's state is never inferred from another's.
 */
export function JourneyPanel({ input, editorHref, onTab, onSnapshot, canAct, gates }: {
  input: JourneyInput;
  editorHref: string;
  /** `focus: "monitor"` asks the page to bring the live job panel into view. */
  onTab: (tab: "build" | "readiness" | "review" | "release" | "playtest", focus?: "monitor") => void;
  onSnapshot: () => void;
  canAct: boolean;
  /** The three gates of the selected version (absent before a version exists). */
  gates?: ReactNode;
}) {
  const steps = buildJourney(input);
  const next = nextJourneyStep(steps);
  const main = steps.filter((item) => item.id !== "playtest");
  const branch = steps.find((item) => item.id === "playtest");

  const action = (item: JourneyStep, primary: boolean) => {
    const variant = primary ? "primary" : "secondary";
    if (item.target.kind === "editor") return <Button asChild size="sm" variant={variant}><Link href={editorHref}>{item.actionLabel}</Link></Button>;
    if (item.target.kind === "snapshot") return <Button size="sm" variant={variant} onClick={onSnapshot} disabled={!canAct}>{item.actionLabel}</Button>;
    const tab = item.target.tab;
    return <Button size="sm" variant={variant} onClick={() => onTab(tab, item.id === "package" && item.state === "active" ? "monitor" : undefined)}>{item.actionLabel}</Button>;
  };

  return <section className="ver-journey" aria-labelledby="ver-journey-title">
    <div className="ver-journey-main" data-testid="journey">
    <div className="ver-journey-head">
      <h2 id="ver-journey-title" className="ver-card-title">Hành trình từ bản nháp đến phát hành</h2>
      <p className="ver-card-sub">Ba điều kiện để học viên dùng được: kiểm tra kỹ thuật đạt, nội dung được duyệt, và bấm phát hành.</p>
    </div>
    <ol className="ver-stepper" aria-label="Các bước từ lưu bản nháp đến phát hành">
      {main.map((item, index) => {
        const isNext = next?.id === item.id;
        return <li key={item.id} className="ver-step" data-step={item.id} data-state={item.state} data-next={isNext || undefined} aria-current={isNext ? "step" : undefined} title={item.detail}>
          <span className="ver-step-node" aria-hidden="true"><Node state={item.state} index={index + 1} /></span>
          <span className="ver-step-title">{item.title}</span>
          <span className="ver-step-label"><span className="ver-sr">{isNext ? "Bước tiếp theo. " : ""}{stateWord[item.state]}. </span>{item.label}<span className="ver-sr">. {item.detail}</span></span>
        </li>;
      })}
    </ol>
    {(next || branch) && <div className="ver-next">
      {next ? <div className="ver-next-text">
        <p className="ver-next-title">Bước tiếp theo: {next.title}</p>
        <p className="ver-next-detail">{next.detail}</p>
      </div> : <p className="ver-next-title">Mọi bước chính đã xong theo máy chủ.</p>}
      <div className="ver-next-actions">
        {branch && <ul className="ver-branch-list" aria-label="Nhánh tùy chọn"><li className="ver-branch" data-step="playtest" data-state={branch.state} title={branch.detail}>
          <FlaskConical size={14} aria-hidden="true" /><span>Chạy thử (tùy chọn)</span><StatusBadge tone={branch.tone}>{branch.label}</StatusBadge>
          {action(branch, false)}
        </li></ul>}
        {next && action(next, true)}
      </div>
    </div>}
    </div>
    {gates}
  </section>;
}
