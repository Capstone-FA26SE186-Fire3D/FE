import { StatusBadge } from "@/components/ui/status-badge";

import type { GateState } from "../../version-readiness";

export type Gate = { id: string; title: string; state: GateState };

/**
 * Three independent gates (Figma v3: three boxes under the journey line). A badge always carries text, and a gate BE
 * cannot read back says so explicitly: one gate's state is never inferred from another's.
 */
export function GateStepper({ gates }: { gates: Gate[] }) {
  return <ol className="ver-gates" aria-label="Ba điều kiện độc lập: kiểm tra kỹ thuật, duyệt nội dung, phát hành">
    {gates.map((gate, index) => <li key={gate.id} className="ver-gate" data-known={gate.state.known} data-gate={gate.id}>
      <p className="ver-gate-title">Cổng {index + 1} · {gate.title}</p>
      <StatusBadge tone={gate.state.tone}>{gate.state.label}</StatusBadge>
      <p className="ver-gate-detail">{gate.state.detail}</p>
    </li>)}
  </ol>;
}
