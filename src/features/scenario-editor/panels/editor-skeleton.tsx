import { Skeleton } from "@/components/ui/skeleton";

export function EditorSkeleton() {
  return <div className="se-root" role="status" aria-live="polite" aria-busy="true">
    <span className="se-sr">Đang tải bản nháp…</span>
    <Skeleton style={{ height: 28, width: 280, marginBottom: 12 }} />
    <Skeleton style={{ height: 48, marginBottom: 12 }} />
    <div className="se-body"><Skeleton style={{ height: "100%", minHeight: 360 }} /><Skeleton style={{ height: "100%", minHeight: 360 }} /><Skeleton style={{ height: "100%", minHeight: 360 }} /></div>
  </div>;
}
