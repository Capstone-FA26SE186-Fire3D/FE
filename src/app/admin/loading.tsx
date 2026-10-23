import { Skeleton, SkeletonKpis, SkeletonTable } from "@/components/ui/skeleton";

/** Streams while an admin page's client bundle and first data load. */
export default function AdminLoading() {
  return <div role="status" aria-live="polite" aria-label="Đang tải trang" className="ops-skeleton-stage">
    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}><Skeleton style={{ height: 11, width: 110 }} /><Skeleton style={{ height: 30, width: 280 }} /></div>
    <SkeletonKpis count={4} />
    <div className="ops-dt"><SkeletonTable rows={6} columns={5} /></div>
  </div>;
}
