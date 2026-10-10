import { CircleCheck, CircleDashed, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { PrototypeBanner } from "@/features/dev-prototype/prototype-banner";

export type PendingIssue = { label: string; href?: string };

/**
 * One row of the contract checklist. `available`: the backend already exposes it (the client may be written);
 * `missing`: a tracked backend gap; `undecided`: the product/route decision itself is not made yet.
 */
export type PendingContractRow = { label: string; status: "available" | "missing" | "undecided"; detail: string };

const contractStatus = {
  available: { tone: "success", text: "Đã có ở BE", Icon: CircleCheck },
  missing: { tone: "warning", text: "Thiếu ở BE", Icon: CircleDashed },
  undecided: { tone: "info", text: "Chưa chốt", Icon: CircleHelp },
} as const;

/**
 * Screen for a module whose backend contract is not available yet. Production shows only the blocker, the
 * contract checklist, the planned behavior and the condition to open it — never fake data or a success button.
 * `prototype` (dev builds only) is the clearly-marked sample UI.
 */
export function PendingModule({ title, description, breadcrumbs, blockers, openWhen, issues, contract, design, prototype }: {
  title: string;
  description: string;
  breadcrumbs?: Crumb[];
  blockers: string[];
  openWhen: string;
  issues: PendingIssue[];
  contract?: PendingContractRow[];
  /** Planned behavior once the backend exists. Text only. */
  design?: { title: string; items: string[] };
  prototype?: ReactNode;
}) {
  const showPrototype = process.env.NODE_ENV !== "production" && prototype;
  return <>
    <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} actions={<StatusBadge tone="warning">Chờ BE</StatusBadge>} />
    <div className="ops-grid ops-grid-main" data-testid="pending-module">
      <Panel title="Chưa thể mở tính năng này" description="Giao diện được thiết kế sẵn nhưng chưa kết nối vì backend chưa có contract cần thiết." bodyClassName="ops-stack">
        <Alert tone="warning" title="Điều đang chặn">
          <span style={{ display: "grid", gap: 4 }}>{blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}</span>
        </Alert>
        <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Điều kiện mở</p><p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>{openWhen}</p></div>
        {contract && contract.length > 0 && <div>
          <p className="ops-field-label" style={{ margin: "0 0 8px" }}>Contract BE</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {contract.map((row) => {
              const status = contractStatus[row.status];
              return <li key={row.label} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 10, alignItems: "start", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 9, background: "var(--bg-soft)" }}>
                <StatusBadge tone={status.tone}><span>{status.text}</span></StatusBadge>
                <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, minWidth: 0, overflowWrap: "anywhere" }}><strong style={{ color: "var(--text)", fontWeight: 600 }}>{row.label}</strong><br />{row.detail}</span>
              </li>;
            })}
          </ul>
        </div>}
      </Panel>
      <div className="ops-stack">
        <Panel title="Issue theo dõi" bodyClassName="ops-stack">
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>
            {issues.map((issue) => <li key={issue.label}>{issue.href ? <a href={issue.href} target="_blank" rel="noreferrer" style={{ color: "var(--ember)", textDecoration: "underline", textUnderlineOffset: 3 }}>{issue.label}</a> : issue.label}</li>)}
          </ul>
        </Panel>
        {design && <Panel title={design.title} bodyClassName="ops-stack">
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.7 }}>
            {design.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Panel>}
      </div>
    </div>
    {showPrototype && <section aria-label="Bản prototype (chỉ môi trường phát triển)" style={{ marginTop: 24 }}>
      <PrototypeBanner />
      {prototype}
    </section>}
  </>;
}
