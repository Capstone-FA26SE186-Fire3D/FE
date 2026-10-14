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
import { describeError, missingText, releaseGate, shortHash, type DescribedError } from "../../version-readiness";
import type { ScenarioVersionDetail, VersionReadiness } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { formatDateTime } from "./version-content";

/** A publish that did not happen is a gate decision, not a failure of the release: it stays Built. */
function PublishBlocked({ error }: { error: DescribedError }) {
  return <Alert tone="warning" title={error.message}>
    Release vẫn ở trạng thái <strong>Built</strong>, chưa Published.{error.code && <> Mã: {error.code}.</>}
    {error.status === 503 && " Cổng phát hành chưa được bật ở môi trường này; không phải lỗi của release."}
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
      toast.notify({ tone: "success", title: "Đã tạo release (Built)", description: "Release chưa được phát hành." });
    } catch (cause) {
      setError(describeError(cause, "Không tạo được release."));
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
      else toast.notify({ tone: "warning", title: "Máy chủ chưa báo Published", description: "Trạng thái hiện tại: " + (result?.status ?? "không rõ") + "." });
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
      toast.notify({ tone: "success", title: "Đã thu hồi release" });
    } catch (cause) {
      setRevokeError(describeError(cause, "Không thu hồi được."));
    } finally {
      setRevokeBusy(false);
    }
  };

  const status = release?.status.toLowerCase();

  return <div className="ops-stack">
    <Panel title="Release" description="Release đóng gói bản đã duyệt và đã xác nhận kỹ thuật. Built chưa phải Published." bodyClassName="ops-stack">
      {view.loading && !release && <SkeletonRows rows={2} label="Đang tải release…" />}
      {view.error !== undefined && <Alert tone="danger" title="Không tải được release" action={<Button size="sm" variant="secondary" className="mt-3" onClick={view.reload}>Thử lại</Button>}>{describeError(view.error).message}</Alert>}

      {release && <>
        <div className="ver-actions-row">
          <StatusBadge tone={gate.tone}>{gate.label}</StatusBadge>
          <span className="ver-note">{gate.detail}</span>
        </div>
        <dl className="ver-dl">
          <dt>Mã release</dt><dd className="ver-hash" data-testid="release-id">{release.id}</dd>
          <dt>Trạng thái (BE)</dt><dd data-testid="release-status">{release.status}</dd>
          <dt>Build target</dt><dd>{release.package.buildTarget}</dd>
          <dt>Runtime tối thiểu</dt><dd>{release.package.minRuntimeVersion} · schema {release.package.schemaVersion}</dd>
          <dt>Kích thước</dt><dd>{release.package.packageSizeBytes.toLocaleString("vi-VN")} byte</dd>
          <dt>SHA-256 package</dt><dd className="ver-hash">{release.package.checksumSha256}</dd>
          <dt>SHA-256 manifest</dt><dd className="ver-hash">{release.package.manifestSha256}</dd>
          <dt>Tạo lúc</dt><dd>{formatDateTime(release.createdAt)}</dd>
          {release.publishedAt && <><dt>Phát hành lúc</dt><dd>{formatDateTime(release.publishedAt)}</dd></>}
          {release.revokedAt && <><dt>Thu hồi lúc</dt><dd>{formatDateTime(release.revokedAt)} · {release.revokedReason}</dd></>}
          {release.entitlement !== undefined && <>
            <dt>Dịch vụ của Building</dt>
            <dd data-testid="release-entitlement">{release.entitlement
              ? `${release.entitlement.status} · ${formatDateTime(release.entitlement.startsAt)} → ${formatDateTime(release.entitlement.endsAt)} · ${release.entitlement.paid ? "đã thanh toán" : "chưa thanh toán"}${release.entitlement.learnerLimit != null ? ` · tối đa ${release.entitlement.learnerLimit} học viên` : ""}`
              : "Không có kỳ dịch vụ nào đang hiệu lực"}</dd>
          </>}
        </dl>

        {status === "built" && <Alert tone="info" title="Release đang ở trạng thái Built">
          Gói đã được dựng và ghim, nhưng Trainee chưa dùng được cho tới khi phát hành. Khi bạn bấm Phát hành, máy chủ kiểm tra lại: nội dung được duyệt đúng hash, readiness kỹ thuật, tương thích runtime và Building còn dịch vụ trả phí hiệu lực.
        </Alert>}
        {publishError && (publishError.status === 503 || publishError.status === 409 ? <PublishBlocked error={publishError} /> : <Alert tone="danger" title={publishError.message}>{publishError.code && <>Mã lỗi: {publishError.code}.</>}</Alert>)}
        <div className="ver-actions-row">
          {status === "built" && <Button onClick={() => void publish()} disabled={!canAct || publishing}><Rocket size={16} aria-hidden="true" />{publishing ? "Đang gửi…" : publishError ? "Thử lại phát hành (cùng khóa)" : "Phát hành"}</Button>}
          {(status === "built" || status === "published") && <Button variant="quiet" onClick={() => { setRevokeError(null); setRevoking(true); }} disabled={!canAct}><Undo2 size={16} aria-hidden="true" />Thu hồi release</Button>}
        </div>
      </>}

      {!release && !view.loading && view.error === undefined && <>
        <p className="ver-note">Chưa có release cho phiên bản này. Release chỉ tạo được khi nội dung đã được PlatformAdmin duyệt đúng hash và đã xác nhận kỹ thuật; máy chủ kiểm tra lại các điều kiện đó.</p>
        <form className="ops-stack" onSubmit={build} noValidate>
          <fieldset className="ops-fieldset">
            <legend>Tạo release (Built)</legend>
            <dl className="ver-dl">
              <dt>Revision</dt><dd className="ver-hash">{version.revisionId}</dd>
              <dt>Phiên bản</dt><dd>v{version.versionNumber}</dd>
              <dt>Xác nhận kỹ thuật</dt><dd className="ver-hash" data-testid="release-confirmation">{confirmationId ?? "Chưa có — xác nhận ở tab Kết quả kỹ thuật"}</dd>
              <dt>Artifact ứng viên</dt><dd className="ver-hash" data-testid="release-artifact">{artifactId ?? "Chưa có — cần job ReleasePackage có QA Passed"}</dd>
              <dt>Duyệt nội dung</dt><dd>{version.reviewStatus ?? "Chưa có dữ liệu"}</dd>
            </dl>
          </fieldset>
          {readiness.error !== undefined && !state && <Alert tone="danger" title="Không đọc được readiness" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={readiness.reload}>Thử lại</Button>}>{describeError(readiness.error).message}</Alert>}
          {state && state.missing.length > 0 && <ul className="ver-list" data-testid="release-missing">{state.missing.map((code) => <li key={code}><strong>{code}</strong>: {missingText(code)}</li>)}</ul>}
          {!approved && version.reviewStatus && <p className="ver-note">Phiên bản chưa ở trạng thái Đã duyệt: máy chủ sẽ từ chối với CONTENT_APPROVAL_REQUIRED.</p>}
          {error && <Alert tone="danger" title={error.message} action={<Button size="sm" variant="secondary" type="submit" className="mt-3" disabled={!canBuild}>Thử lại (cùng khóa)</Button>}>
            {error.code && <>Mã lỗi: {error.code}. </>}Thử lại dùng cùng Idempotency-Key nên không tạo release trùng.
          </Alert>}
          <div className="ver-actions-row">
            <Button type="submit" disabled={!canBuild}><Package size={16} aria-hidden="true" />{busy ? "Đang tạo…" : "Tạo release (Built)"}</Button>
            {!canAct && <span className="ver-note">Tài khoản của bạn chỉ có quyền xem.</span>}
          </div>
        </form>
      </>}
    </Panel>

    <Panel title="Training của công trình" description="Chỉ đọc, không phân trang. Chỉ gồm training đã gắn với nội dung được duyệt." bodyClassName="ops-stack">
      {trainings.error !== undefined && <Alert tone="danger" title="Không tải được danh sách training" action={<Button size="sm" variant="secondary" className="mt-3" onClick={trainings.reload}>Thử lại</Button>}>{describeError(trainings.error).message}</Alert>}
      <Table caption="Training của công trình">
        <thead><tr><th>Tên</th><th>Trạng thái</th><th>Release</th><th>Phiên bản</th></tr></thead>
        <tbody>
          {trainings.loading && !trainings.data && <TableMessage colSpan={4}><SkeletonRows rows={2} label="Đang tải training…" /></TableMessage>}
          {(trainings.data ?? []).map((training) => <tr key={training.id}>
            <td className="ops-cell-primary">{training.name}</td>
            <td><StatusBadge tone={training.status.toLowerCase() === "active" ? "success" : "neutral"}>{training.status}</StatusBadge></td>
            <td><span className="ver-hash">{shortHash(training.releaseId, 13)}</span>{training.releaseStatus && <> · {training.releaseStatus}</>}</td>
            <td>{training.scenarioVersionId === version.id ? "Phiên bản này" : "Phiên bản khác"}</td>
          </tr>)}
          {trainings.data && trainings.data.length === 0 && <TableMessage colSpan={4}><EmptyState icon={Package} title="Chưa có training" description="Training xuất hiện khi release được tạo và gắn với nội dung đã duyệt." /></TableMessage>}
        </tbody>
      </Table>
    </Panel>

    <Modal
      open={revoking}
      onOpenChange={(open) => { if (!revokeBusy) setRevoking(open); }}
      title="Thu hồi release?"
      description="Release bị thu hồi không còn được dùng. Hành động này được ghi vào nhật ký."
      footer={<><Button variant="quiet" onClick={() => setRevoking(false)} disabled={revokeBusy}>Hủy</Button><Button variant="danger" onClick={() => void revoke()} disabled={revokeBusy || !revokeReason.trim() || revokeReason.length > 1000}>{revokeBusy ? "Đang thu hồi…" : "Thu hồi"}</Button></>}
    >
      <div className="ops-stack">
        <Field label="Lý do thu hồi" required hint="1–1000 ký tự." error={revokeReason.length > 1000 ? "Tối đa 1000 ký tự." : undefined}>
          {(p) => <Textarea {...p} rows={3} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} />}
        </Field>
        {revokeError && <Alert tone="danger" title={revokeError.message}>{revokeError.code && <>Mã lỗi: {revokeError.code}.</>}</Alert>}
      </div>
    </Modal>
  </div>;
}
