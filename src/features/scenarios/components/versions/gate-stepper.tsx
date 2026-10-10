import { StatusBadge } from "@/components/ui/status-badge";

import type { GateState } from "../../version-readiness";

export type Gate = { id: string; title: string; state: GateState };

/**
 * Three independent gates. A badge always carries text, and a gate BE cannot read back says so explicitly:
 * one gate's state is never inferred from another's.
 */
export function GateStepper({ gates }: { gates: Gate[] }) {
  return <>
    <ol className="ver-gates" aria-label="Ba cổng độc lập: kết quả kỹ thuật, duyệt nội dung, release">
      {gates.map((gate, index) => <li key={gate.id} className="ver-gate" data-known={gate.state.known} data-gate={gate.id}>
        <span className="ver-gate-index" aria-hidden="true">{index + 1}</span>
        <div>
          <p className="ver-gate-title">{gate.title}</p>
          <StatusBadge tone={gate.state.tone}>{gate.state.label}</StatusBadge>
          <p className="ver-gate-detail">{gate.state.detail}</p>
        </div>
      </li>)}
    </ol>
    <p className="ver-caption">Ba cổng này độc lập: job Succeeded không phải QA Passed, xác nhận kỹ thuật không thay duyệt nội dung, và release Built không phải Published.</p>
  </>;
}
