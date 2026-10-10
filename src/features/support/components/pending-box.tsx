import { StatusBadge } from "@/components/ui/status-badge";
import styles from "./support.module.css";

/** Small "Chờ BE" block listing what the screen cannot show yet because the API has no field/route for it. */
export function PendingBox({ title, items }: { title: string; items: string[] }) {
  return <section className={styles.pendingBox} aria-label={title}>
    <h3><StatusBadge tone="warning">Chờ BE</StatusBadge>{title}</h3>
    <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
  </section>;
}
