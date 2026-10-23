import { Skeleton, SkeletonKpis, SkeletonTable } from "@/components/ui/skeleton";

/** Streams while a workspace page's client bundle and first data load: the page frame appears at once, in the real layout. */
export default function WorkspaceLoading() {
  return <div role="status" aria-live="polite" aria-label="Đang tải trang" className="ops-skeleton-stage">
    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}><Skeleton style={{ height: 11, width: 90 }} /><Skeleton style={{ height: 30, width: 260 }} /><Skeleton style={{ height: 12, width: 360 }} /></div>
    <SkeletonKpis count={4} />
    <div className="ops-dt"><SkeletonTable rows={6} columns={5} /></div>
  </div>;
}
