import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

export type PendingIssue = { label: string; href?: string };

/**
 * Screen for a module whose backend contract is not available yet. Production shows only the blocker and
 * the condition to open it — never fake data or a success button. `prototype` (dev builds only) is the
 * clearly-marked sample UI.
 */
export function PendingModule({ title, description, breadcrumbs, blockers, openWhen, issues, prototype }: {
  title: string;
  description: string;
  breadcrumbs?: Crumb[];
  blockers: string[];
  openWhen: string;
  issues: PendingIssue[];
  prototype?: ReactNode;
}) {
  const showPrototype = process.env.NODE_ENV !== "production" && prototype;
  return <>
    <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} actions={<StatusBadge tone="warning">Chờ BE</StatusBadge>} />
    <Panel title="Chưa thể mở tính năng này" description="Giao diện được thiết kế sẵn nhưng chưa kết nối vì backend chưa có contract cần thiết." bodyClassName="ops-stack">
      <Alert tone="warning" title="Điều đang chặn">
        {blockers.join(" ")}
      </Alert>
      <div className="ops-stack">
        <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Điều kiện mở</p><p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>{openWhen}</p></div>
        <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Issue theo dõi</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>
            {issues.map((issue) => <li key={issue.label}>{issue.href ? <a href={issue.href} target="_blank" rel="noreferrer" style={{ color: "var(--ember)" }}>{issue.label}</a> : issue.label}</li>)}
          </ul></div>
      </div>
    </Panel>
    {showPrototype && <section aria-label="Bản prototype (chỉ môi trường phát triển)" style={{ marginTop: 20 }}>
      <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}><span className="ops-proto"><Lock size={12} aria-hidden="true" style={{ marginRight: 4 }} />Dữ liệu mẫu · chỉ môi trường phát triển</span><span style={{ color: "var(--dim)", fontSize: 12 }}>Không phải bằng chứng tích hợp; không có trong bản production.</span></p>
      {prototype}
    </section>}
  </>;
}
