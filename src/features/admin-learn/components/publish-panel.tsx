"use client";

import { FilePlus2, Send } from "lucide-react";
import { DetailList, formatDateTime } from "@/components/ops/detail-parts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { lifecycleCopy, lifecycleFor, postStatusView, versionStatusView } from "../status";
import type { AdminPost, AdminVersion, LifecycleOperation } from "../types";

/**
 * "Xuất bản và hiển thị": the post's state as the server reports it, the publish action for the open Draft, and the lifecycle
 * actions that state allows. Each button explains why it is disabled instead of hiding.
 */
export function PublishPanel({ post, version, dirty, publishBlockers, busy, onPublish, onLifecycle, onNewVersion }: {
  post: AdminPost;
  postEtag: string;
  version: AdminVersion | null;
  versionEtag: string | null;
  dirty: boolean;
  /** Reasons the open Draft cannot be published right now (empty = it can). */
  publishBlockers: string[];
  busy: boolean;
  onPublish: () => void;
  onLifecycle: (operation: LifecycleOperation) => void;
  onNewVersion: () => void;
}) {
  const view = postStatusView[post.publicationStatus];
  const deleted = post.publicationStatus === "Deleted";
  const isDraft = version?.status === "Draft";
  const publishedVersion = post.versions?.find((item) => item.id === post.publishedVersionId) ?? null;
  const publishReasons = [...(deleted ? ["Bài đã bị xóa: khôi phục bài trước khi xuất bản."] : []), ...(dirty ? ["Lưu bản nháp trước khi xuất bản."] : []), ...publishBlockers];

  return <Panel title="Xuất bản và hiển thị" description="Bấm thử lại sau lỗi mạng là an toàn: hệ thống không thực hiện một thao tác hai lần." bodyClassName="ops-stack">
    <DetailList columns={2} items={[
      { label: "Trạng thái bài", value: <StatusBadge tone={view.tone}>{view.label}</StatusBadge> },
      { label: "Bản đang công khai", value: publishedVersion ? `v${publishedVersion.versionNumber} · ${publishedVersion.title}` : post.publishedVersion ? `v${post.publishedVersion.versionNumber} · ${post.publishedVersion.title}` : "Chưa có" },
      { label: "Bản đang mở", value: version ? <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>v{version.versionNumber}<StatusBadge tone={versionStatusView[version.status].tone}>{versionStatusView[version.status].label}</StatusBadge></span> : "—" },
      { label: "Cập nhật", value: formatDateTime(post.updatedAt) },
    ]} />
    <p style={{ margin: 0, color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }} data-testid="status-visibility">{view.visibility}</p>

    <div className="ops-actions" style={{ alignItems: "flex-start" }}>
      {isDraft && <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, maxWidth: 360 }}>
        <Button disabled={busy || publishReasons.length > 0} onClick={onPublish}><Send size={16} aria-hidden="true" />Xuất bản bản nháp</Button>
        {publishReasons.map((reason) => <span key={reason} className="ops-field-hint">{reason}</span>)}
      </span>}
      {!isDraft && version && !deleted && <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, maxWidth: 360 }}>
        <Button variant="secondary" disabled={busy} onClick={onNewVersion}><FilePlus2 size={16} aria-hidden="true" />Tạo bản nháp mới từ v{version.versionNumber}</Button>
        <span className="ops-field-hint">Bản đã xuất bản không sửa được; muốn đổi nội dung, hãy tạo bản nháp mới rồi xuất bản.</span>
      </span>}
      {lifecycleFor[post.publicationStatus].map((operation) => <Button key={operation} variant={lifecycleCopy[operation].danger ? "danger" : operation === "show" || operation === "restore" ? "primary" : "secondary"} disabled={busy} onClick={() => onLifecycle(operation)}>{lifecycleCopy[operation].label}</Button>)}
    </div>
  </Panel>;
}
