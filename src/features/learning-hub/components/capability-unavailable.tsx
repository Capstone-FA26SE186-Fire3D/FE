import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

export type NextStep = { label: string; href: string };

/**
 * A capability of the Learning Hub that the server cannot serve yet. It states the reason and what the learner can do
 * now; it never shows sample data or a success. Replace a call site with the real view when its contract exists
 * (AI for Trainee: BE#77) and keep this component for the next blocked capability. Personal history/results (BE#78) is real now: features/training-history.
 */
export function CapabilityUnavailable({ icon: Icon, title, reason, context, steps }: {
  icon: LucideIcon;
  title: string;
  /** Why it is not available, in the learner's words. */
  reason: string;
  /** Optional line that ties the screen to what the learner opened (for example the article they came from). */
  context?: ReactNode;
  /** Useful things to do instead, first one is the primary action. */
  steps: NextStep[];
}) {
  return <Panel
      className="hub-unavailable"
      title={title}
      actions={<StatusBadge tone="info">Chưa khả dụng</StatusBadge>}
      bodyClassName="ops-stack"
      data-testid="capability-unavailable"
    >
      <Icon className="hub-unavailable-icon" size={28} strokeWidth={1.75} aria-hidden="true" />
      <Alert tone="info" title="Vì sao chưa dùng được">{reason}</Alert>
      {context && <div className="ops-muted" data-testid="capability-context">{context}</div>}
      <div>
        <h3 className="hub-unavailable-heading">Bạn có thể làm gì lúc này</h3>
        <ul className="hub-unavailable-steps">
          {steps.map((step, index) => <li key={step.href}><Link className={buttonVariants({ variant: index === 0 ? "primary" : "secondary" })} href={step.href}>{step.label}</Link></li>)}
        </ul>
      </div>
    </Panel>;
}
