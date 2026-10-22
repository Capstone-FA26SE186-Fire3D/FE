import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Card for an empty, limited or failed state ("Rỗng, giới hạn và lỗi" in the Figma page): what happened, why, and what the
 * learner can do next. Restyle only: the caller keeps its own logic and passes the real buttons/links as `actions`.
 */
export function StateCard({ icon: Icon, tone, kicker, title, children, actions, role, testId }: {
  icon: LucideIcon;
  tone?: "warning" | "danger";
  /** Small upper-case line that names the place and the state ("Bài đã lưu · chưa có bài"). */
  kicker?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  role?: "alert" | "status";
  testId?: string;
}) {
  return <section className="ov-state" data-tone={tone} role={role} data-testid={testId}>
    <span className="ov-state-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.75} /></span>
    {kicker && <p className="ov-state-kicker">{kicker}</p>}
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {actions && <div className="ov-state-actions">{actions}</div>}
  </section>;
}
