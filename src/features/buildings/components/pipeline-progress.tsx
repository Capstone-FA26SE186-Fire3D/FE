"use client";

import { ArrowRight, CircleCheck, DoorOpen, ListChecks, Minus, PenLine, Play, RefreshCw, RotateCcw, Upload, X } from "lucide-react";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { PipelineAction, PipelineProgressModel, StepState } from "../pipeline";

const STATE_TEXT: Record<StepState, string> = { todo: "Chờ", active: "Đang chạy", done: "Xong", error: "Lỗi", skipped: "Không chặn" };

const ACTIONS: Record<PipelineAction, { label: string; icon: ReactNode }> = {
  upload: { label: "Tải lên IFC mới", icon: <Upload size={16} aria-hidden="true" /> },
  process: { label: "Chạy xử lý IFC", icon: <Play size={16} aria-hidden="true" /> },
  retry: { label: "Chạy lại job thất bại", icon: <RotateCcw size={16} aria-hidden="true" /> },
  refresh: { label: "Tải lại trạng thái", icon: <RefreshCw size={16} aria-hidden="true" /> },
  issues: { label: "Xem issue QA", icon: <ListChecks size={16} aria-hidden="true" /> },
  exit: { label: "Chọn cửa thoát", icon: <DoorOpen size={16} aria-hidden="true" /> },
  author: { label: "Soạn kịch bản", icon: <PenLine size={16} aria-hidden="true" /> },
  latest: { label: "Xem revision mới nhất", icon: <ArrowRight size={16} aria-hidden="true" /> },
};

/** Upload → processing → QA → ready, with the one call to action that unblocks the selected revision. */
export function PipelineProgress({ model, versionLabel, onAction, busy, actionError }: {
  model: PipelineProgressModel;
  versionLabel: string;
  onAction: (action: PipelineAction) => void;
  busy: PipelineAction | null;
  actionError?: string;
}) {
  const { steps, next } = model;
  return <Panel title="Tiến trình IFC" description={`Từ tải lên đến sẵn sàng soạn kịch bản · ${versionLabel}`} bodyClassName="ops-stack" data-testid="pipeline-progress">
    <ol className="ops-pipeline" aria-label="Tiến trình xử lý IFC" style={{ ["--steps" as string]: steps.length }}>
      {steps.map((step, index) => <li key={step.id} data-step={step.id} data-state={step.state} aria-current={step.state === "active" || step.state === "error" ? "step" : undefined}>
        <span className="ops-stepper-dot" aria-hidden="true">{step.state === "done" ? <CircleCheck size={16} /> : step.state === "error" ? <X size={14} /> : step.state === "skipped" ? <Minus size={14} /> : index + 1}</span>
        <span className="ops-pipeline-text">
          <span className="ops-pipeline-label">{step.label}</span>
          <span className="ops-pipeline-state">{STATE_TEXT[step.state]}{step.detail ? ` · ${step.detail}` : ""}</span>
        </span>
      </li>)}
    </ol>
    <div data-testid="pipeline-next">
      <Alert tone={next.tone} title={next.title}
        action={next.actions.length > 0 ? <div className="ops-actions mt-3" style={{ flexWrap: "wrap" }}>
          {next.actions.map((action, index) => <Button key={action} size="sm" variant={index === 0 ? "primary" : "secondary"} onClick={() => onAction(action)} disabled={busy !== null} data-action={action}>
            {ACTIONS[action].icon}{busy === action ? "Đang gửi…" : ACTIONS[action].label}
          </Button>)}
        </div> : undefined}>
        {next.guidance || undefined}
      </Alert>
    </div>
    {actionError && <Alert tone="danger">{actionError}</Alert>}
  </Panel>;
}
