"use client";

import { Package, Rocket, Undo2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useIdempotencyKey } from "@/api";
import { useAsyncData, type AsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

import type { ReleaseView } from "../../use-version-server-state";
import { approvalGate, describeError, missingText, releaseGate, shortHash, type DescribedError } from "../../version-readiness";
import type { ScenarioVersionDetail, VersionReadiness } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { SupportCode } from "@/components/ui/support-code";
import { formatDateTime } from "./version-content";

/** A publish that did not happen is a gate decision, not a failure of the release: it stays Built. */
function PublishBlocked({ error }: { error: DescribedError }) {
  return <Alert tone="warning" title={error.message}>
    Bản phát hành vẫn giữ nguyên và học viên chưa dùng được.
    {error.status === 503 && " Chức năng phát hành chưa được bật; đây không phải lỗi của bản phát hành."}
    <SupportCode code={error.code} />
    {error.retryAfterSeconds ? ` Thử lại sau ${error.retryAfterSeconds} giây.` : ""}
  </Alert>;
}

/**
 * Release (Built → Published) and the read-only list of the building's trainings. Every value here is read from the
 * server: the release of this version comes from the release list, and the confirmation and candidate artifact a new
 * release needs come from the version's readiness, so nothing is typed in or remembered by the browser. Built is a
 * pinned package, not a published training; publish status always comes from the server response.
 */
export function ReleasePanel({ accessToken, buildingId, version, readiness, view, noteRelease, canAct }: {
  accessToken: string;
  buildingId: string;
  version: ScenarioVersionDetail;
  readiness: AsyncData<VersionReadiness>;
  view: ReleaseView;
  noteRelease: (releaseId: string) => void;
  canAct: boolean;
}) {
  const toast = useToast();
  const buildKey = useIdempotencyKey();
  const publishKey = useIdempotencyKey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DescribedError | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<DescribedError | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<DescribedError | null>(null);

  const trainings = useAsyncData(`trainings:${buildingId}`, (signal) => scenarioVersionsApi.listTrainings(accessToken, buildingId, signal));

  const release = view.release;
  const gate = releaseGate(release);
  const state = readiness.data;
  const confirmationId = state?.confirmationReviewId ?? null;
  const artifactId = state?.candidateArtifactId ?? null;
  const canBuild = canAct && !busy && Boolean(confirmationId) && Boolean(artifactId);
  const approved = version.reviewStatus?.toLowerCase() === "approved";

  const build = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canBuild || !confirmationId || !artifactId) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { revisionId: version.revisionId, scenarioVersionId: version.id, confirmationReviewId: confirmationId, candidateArtifactId: artifactId };
      const created = await scenarioVersionsApi.buildRelease(accessToken, payload, buildKey.keyFor(payload));
      buildKey.done();
      noteRelease(created.id);
      view.reload();
      trainings.reload();
      toast.notify({ tone: "success", title: "Đã tạo bản phát hành", description: "Học viên chưa dùng được cho tới khi bạn bấm Phát hành." });
    } catch (cause) {
      setError(describeError(cause, "Không tạo được bản phát hành."));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!release || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await scenarioVersionsApi.publishRelease(accessToken, release.id, publishKey.keyFor({ releaseId: release.id }));
      publishKey.done();
      view.reload(); // Status comes from the server, never assumed.
      trainings.reload();
      if (result?.status?.toLowerCase() === "published") toast.notify({ tone: "success", title: "Đã phát hành", description: "Trạng thái được tải lại từ máy chủ." });
      else toast.notify({ tone: "warning", title: "Chưa phát hành được", description: "Hệ thống chưa xác nhận phát hành. Tải lại trang để xem trạng thái mới nhất." });
    } catch (cause) {
      setPublishError(describeError(cause, "Không phát hành được."));
    } finally {
      setPublishing(false);
    }
  };

  const revoke = async () => {
    if (!release || revokeBusy || !revokeReason.trim()) return;
    setRevokeBusy(true);
    setRevokeError(null);
    try {
      await scenarioVersionsApi.revokeRelease(accessToken, release.id, revokeReason.trim());
      setRevoking(false);
      setRevokeReason("");
      view.reload();
      trainings.reload();
      toast.notify({ tone: "success", title: "Đã thu hồi bản phát hành" });
    } catch (cause) {
      setRevokeError(describeError(cause, "Không thu hồi được."));
    } finally {
      setRevokeBusy(false);
    }
  };

  const status = release?.status.toLowerCase();

  return <div className="ops-stack">
    <Panel title={release ? "Bản phát hành của phiên bản này" : "Tạo bản phát hành"} description={release ? "Học viên chỉ dùng được sau khi bạn bấm Phát hành." : "Dùng nội dung đã duyệt và gói đã chốt; không cần nhập gì."} actions={release ? <StatusBadge tone={gate.tone}>{gate.label}</StatusBadge> : undefined} bodyClassName="ops-stack">
      {view.loading && !release && <SkeletonRows rows={2} label="Đang tải bản phát hành…" />}
      {view.error !== undefined && <Alert tone="danger" title="Không tải được bản phát hành" action={<Button size="sm" variant="secondary" className="mt-3" onClick={view.reload}>Thử lại</Button>}>{describeError(view.error).message}</Alert>}

      {release && <>
        <p className="ver-note">{gate.detail}</p>
        <dl className="ver-meta">
          <div><dt>Trạng thái</dt><dd>{gate.label}<span className="ver-sr" data-testid="release-status">{release.status}</span></dd></div>
          <div><dt>Tạo lúc</dt><dd>{formatDateTime(release.createdAt)}</dd></div>
          <div><dt>Phát hành lúc</dt><dd>{release.publishedAt ? formatDateTime(release.publishedAt) : "Chưa phát hành"}</dd></div>
          <div><dt>Nền tảng</dt><dd>{release.package.buildTarget}</dd></div>
          
          <div><dt>Ứng dụng tối thiểu</dt><dd>{release.package.minRuntimeVersion}</dd></div>
          <div><dt>Dung lượng gói</dt><dd>{(release.package.packageSizeBytes / 1048576).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB</dd></div>
          {release.revokedAt && <div><dt>Thu hồi lúc</dt><dd>{formatDateTime(release.revokedAt)} · {release.revokedReason}</dd></div>}
        </dl>
        {release.entitlement !== undefined && <div className="ver-service">
          <span>Dịch vụ của công trình</span>
          <strong data-testid="release-entitlement">{release.entitlement
            ? `${release.entitlement.status} · ${formatDateTime(release.entitlement.startsAt)} → ${formatDateTime(release.entitlement.endsAt)} · ${release.entitlement.paid ? "đã thanh toán" : "chưa thanh toán"}${release.entitlement.learnerLimit != null ? ` · tối đa ${release.entitlement.learnerLimit} học viên` : ""}`
            : "Không có kỳ dịch vụ nào đang hiệu lực"}</strong>
        </div>}
        <details className="ver-details">
          <summary>Thông tin cho bộ phận hỗ trợ</summary>
          <dl className="ver-dl">
            <dt>Mã bản phát hành</dt><dd className="ver-hash" data-testid="release-id">{release.id}</dd>
            <dt>Định dạng gói</dt><dd className="ver-hash">{release.package.schemaVersion}</dd>
            <dt>Mã kiểm tra gói</dt><dd className="ver-hash">{release.package.checksumSha256}</dd>
            <dt>Mã kiểm tra danh mục</dt><dd className="ver-hash">{release.package.manifestSha256}</dd>
          </dl>
        </details>

        {status === "built" && <Alert tone="info" title="Đã tạo, chưa phát hành">
          Gói đã được dựng và ghim, nhưng Trainee chưa dùng được cho tới khi phát hành. Khi bạn bấm Phát hành, máy chủ kiểm tra lại: nội dung được duyệt đúng hash, readiness kỹ thuật, tương thích runtime và Building còn dịch vụ trả phí hiệu lực.
        </Alert>}
        {publishError && (publishError.status === 503 || publishError.status === 409 ? <PublishBlocked error={publishError} /> : <Alert tone="danger" title={publishError.message}><SupportCode code={publishError.code} /></Alert>)}
        <div className="ver-actions-row">
          {status === "built" && <Button onClick={() => void publish()} disabled={!canAct || publishing}><Rocket size={16} aria-hidden="true" />{publishing ? "Đang gửi…" : publishError ? "Thử lại phát hành" : "Phát hành"}</Button>}
          {(status === "built" || status === "published") && <Button variant="quiet" onClick={() => { setRevokeError(null); setRevoking(true); }} disabled={!canAct}><Undo2 size={16} aria-hidden="true" />Thu hồi release</Button>}
        </div>
      </>}

      {!release && !view.loading && view.error === undefined && <>
        <p className="ver-note">Phiên bản này chưa có bản phát hành. Cần nội dung đã được quản trị FET3D duyệt và gói đã chốt; hệ thống kiểm tra lại khi tạo.</p>
        <form className="ops-stack" onSubmit={build} noValidate>
          <dl className="ver-meta">
            <div><dt>Gói đã chốt</dt><dd>{confirmationId ? "Đã chốt" : "Chưa chốt (tab Kiểm tra)"}<span className="ver-sr" data-testid="release-confirmation">{confirmationId ?? "Chưa có"}</span></dd></div>
            <div><dt>Gói phát hành</dt><dd>{artifactId ? "Đã dựng, kiểm tra đạt" : "Chưa có gói kiểm tra đạt"}<span className="ver-sr" data-testid="release-artifact">{artifactId ?? "Chưa có"}</span></dd></div>
            <div><dt>Duyệt nội dung</dt><dd>{approvalGate(version.reviewStatus, version.rejectReason).label}</dd></div>
            <div><dt>Phiên bản</dt><dd>v{version.versionNumber}</dd></div>
          </dl>
          {readiness.error !== undefined && !state && <Alert tone="danger" title="Không đọc được readiness" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={readiness.reload}>Thử lại</Button>}>{describeError(readiness.error).message}</Alert>}
          {state && state.missing.length > 0 && <ul className="ver-list" data-testid="release-missing">{state.missing.map((code) => <li key={code} data-code={code}>{missingText(code)}</li>)}</ul>}
          {!approved && version.reviewStatus && <p className="ver-note">Phiên bản chưa ở trạng thái Đã duyệt: máy chủ sẽ từ chối với CONTENT_APPROVAL_REQUIRED.</p>}
          {error && <Alert tone="danger" title={error.message} action={<Button size="sm" variant="secondary" type="submit" className="mt-3" disabled={!canBuild}>Thử lại</Button>}>
            Bấm thử lại an toàn: hệ thống không tạo bản trùng.<SupportCode code={error.code} />
          </Alert>}
          <div className="ver-actions-row">
            <Button type="submit" disabled={!canBuild}><Package size={16} aria-hidden="true" />{busy ? "Đang tạo…" : "Tạo bản phát hành"}</Button>
            <span className="ver-note">{canAct ? "Tạo xong học viên vẫn chưa dùng được; bấm Phát hành ở bước sau." : "Tài khoản của bạn chỉ có quyền xem."}</span>
          </div>
        </form>
      </>}
    </Panel>

    <Panel title="Training của công trình" description="Chỉ đọc, không phân trang. Chỉ gồm training đã gắn với nội dung được duyệt." bodyClassName="ops-stack">
      {trainings.error !== undefined && <Alert tone="danger" title="Không tải được danh sách training" action={<Button size="sm" variant="secondary" className="mt-3" onClick={trainings.reload}>Thử lại</Button>}>{describeError(trainings.error).message}</Alert>}
      <Table caption="Training của công trình">
        <thead><tr><th>Tên</th><th>Trạng thái</th><th>Bản phát hành</th><th>Phiên bản</th></tr></thead>
        <tbody>
          {trainings.loading && !trainings.data && <TableMessage colSpan={4}><SkeletonRows rows={2} label="Đang tải training…" /></TableMessage>}
          {(trainings.data ?? []).map((training) => <tr key={training.id}>
            <td className="ops-cell-primary">{training.name}</td>
            <td><StatusBadge tone={training.status.toLowerCase() === "active" ? "success" : "neutral"}>{training.status}</StatusBadge></td>
            <td><span className="ver-hash">{shortHash(training.releaseId, 13)}</span>{training.releaseStatus && <> · {training.releaseStatus}</>}</td>
            <td>{training.scenarioVersionId === version.id ? "Phiên bản này" : "Phiên bản khác"}</td>
          </tr>)}
          {trainings.data && trainings.data.length === 0 && <TableMessage colSpan={4}><EmptyState icon={Package} title="Chưa có bài huấn luyện" description="Bài huấn luyện xuất hiện khi bản phát hành được tạo và gắn với nội dung đã duyệt." /></TableMessage>}
        </tbody>
      </Table>
    </Panel>

    <Modal
      open={revoking}
      onOpenChange={(open) => { if (!revokeBusy) setRevoking(open); }}
      title="Thu hồi bản phát hành?"
      description="Học viên sẽ không dùng được bản này nữa. Hành động này được ghi vào nhật ký."
      footer={<><Button variant="quiet" onClick={() => setRevoking(false)} disabled={revokeBusy}>Hủy</Button><Button variant="danger" onClick={() => void revoke()} disabled={revokeBusy || !revokeReason.trim() || revokeReason.length > 1000}>{revokeBusy ? "Đang thu hồi…" : "Thu hồi"}</Button></>}
    >
      <div className="ops-stack">
        <Field label="Lý do thu hồi" required hint="1–1000 ký tự." error={revokeReason.length > 1000 ? "Tối đa 1000 ký tự." : undefined}>
          {(p) => <Textarea {...p} rows={3} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} />}
        </Field>
        {revokeError && <Alert tone="danger" title={revokeError.message}><SupportCode code={revokeError.code} /></Alert>}
      </div>
    </Modal>
  </div>;
}
