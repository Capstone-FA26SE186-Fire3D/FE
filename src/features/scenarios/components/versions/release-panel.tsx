"use client";

import { Package, Rocket, Search, Undo2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useIdempotencyKey } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

import type { VersionJobs } from "../../use-version-jobs";
import type { VersionMemory } from "../../use-version-memory";
import { describeError, isUuid, releaseGate, shortHash, type DescribedError } from "../../version-readiness";
import type { Release, ScenarioVersionDetail } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { formatDateTime } from "./version-content";

const BE51 = "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/51";
const BE53 = "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/53";

export type ReleaseView = {
  /** Release that belongs to this version, if known. */
  release: Release | undefined;
  /** A release was requested by id but it belongs to another version. */
  foreign: boolean;
  loading: boolean;
  error: unknown;
  reload: () => void;
};

function PublishBlocked({ error }: { error: DescribedError }) {
  return <Alert tone="warning" title="Chưa thể phát hành: cổng phát hành đang chặn (503 PUBLISH_GATE_UNAVAILABLE)">
    Release vẫn ở trạng thái <strong>Built</strong>, chưa Published. Backend chỉ cho phát hành khi cổng riêng đã hoạt động: nội dung được duyệt đúng hash, readiness kỹ thuật đạt và Building còn quyền sử dụng (entitlement). Hiện cổng này chưa được bật.{" "}
    <a href={BE51} target="_blank" rel="noreferrer" style={{ color: "var(--ember)" }}>Issue BE #51</a>
    {error.retryAfterSeconds ? ` Thử lại sau ${error.retryAfterSeconds} giây.` : ""}
  </Alert>;
}

/**
 * Release (Built) and the read-only list of the building's trainings. Built is a pinned package, not a published
 * training: Publish is contained by BE (always 503 PUBLISH_GATE_UNAVAILABLE) and the UI never reports it as success.
 */
export function ReleasePanel({ accessToken, buildingId, version, jobs, memory, remember, canAct, view }: {
  accessToken: string;
  buildingId: string;
  version: ScenarioVersionDetail;
  jobs: VersionJobs;
  memory: VersionMemory;
  remember: (patch: VersionMemory) => void;
  canAct: boolean;
  view: ReleaseView;
}) {
  const toast = useToast();
  const buildKey = useIdempotencyKey();
  const jobKind = jobs.detail?.job.kind;
  const suggestedArtifact = jobs.verdict?.kind === "passed" && jobKind === "ReleasePackage" ? jobs.verdict.run.artifactId ?? "" : "";
  const [confirmationId, setConfirmationId] = useState(memory.confirmReviewId ?? "");
  const [artifactId, setArtifactId] = useState("");
  const [lookupId, setLookupId] = useState("");
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
  const confirmationValue = confirmationId.trim();
  const artifactValue = (artifactId || suggestedArtifact).trim();
  const confirmationError = confirmationValue && !isUuid(confirmationValue) ? "Mã xác nhận phải là UUID." : undefined;
  const artifactError = artifactValue && !isUuid(artifactValue) ? "Mã artifact phải là UUID." : undefined;
  const canBuild = canAct && !busy && !confirmationError && !artifactError && Boolean(confirmationValue) && Boolean(artifactValue);

  const build = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canBuild) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { revisionId: version.revisionId, scenarioVersionId: version.id, confirmationReviewId: confirmationValue, candidateArtifactId: artifactValue };
      const created = await scenarioVersionsApi.buildRelease(accessToken, payload, buildKey.keyFor(payload));
      buildKey.done();
      remember({ releaseId: created.id });
      view.reload();
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
      await scenarioVersionsApi.publishRelease(accessToken, release.id);
      view.reload(); // Status comes from the server, never assumed.
      toast.notify({ tone: "success", title: "Yêu cầu phát hành đã được chấp nhận", description: "Trạng thái được tải lại từ máy chủ." });
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
      toast.notify({ tone: "success", title: "Đã thu hồi release" });
    } catch (cause) {
      setRevokeError(describeError(cause, "Không thu hồi được."));
    } finally {
      setRevokeBusy(false);
    }
  };

  const status = release?.status.toLowerCase();
  const publishBlocked = publishError?.code === "PUBLISH_GATE_UNAVAILABLE";

  return <div className="ops-stack">
    <Panel title="Release" description="Release đóng gói bản đã duyệt và đã xác nhận kỹ thuật. Built chưa phải Published." bodyClassName="ops-stack">
      {view.loading && !release && <SkeletonRows rows={2} label="Đang tải release…" />}
      {view.error !== undefined && <Alert tone="danger" title="Không tải được release" action={<Button size="sm" variant="secondary" className="mt-3" onClick={view.reload}>Thử lại</Button>}>{describeError(view.error).message}</Alert>}
      {view.foreign && <Alert tone="warning" title="Release này thuộc phiên bản khác">Mã release bạn nhập không gắn với phiên bản đang xem nên không được tính vào trạng thái của phiên bản này.</Alert>}

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
        </dl>

        {status === "built" && <Alert tone="info" title="Release đang ở trạng thái Built">
          Gói đã được dựng và ghim, nhưng Trainee chưa dùng được cho tới khi phát hành. Điều kiện phát hành: nội dung được duyệt đúng hash, readiness kỹ thuật đạt, Building còn entitlement.
        </Alert>}
        {publishError && (publishBlocked ? <PublishBlocked error={publishError} /> : <Alert tone="danger" title={publishError.message}>{publishError.code && <>Mã lỗi: {publishError.code}.</>}</Alert>)}
        <div className="ver-actions-row">
          {status === "built" && <Button onClick={() => void publish()} disabled={!canAct || publishing}><Rocket size={16} aria-hidden="true" />{publishing ? "Đang gửi…" : "Phát hành"}</Button>}
          {(status === "built" || status === "published") && <Button variant="quiet" onClick={() => { setRevokeError(null); setRevoking(true); }} disabled={!canAct}><Undo2 size={16} aria-hidden="true" />Thu hồi release</Button>}
        </div>
        {status === "built" && !publishError && <p className="ver-note">Cổng phát hành đang bị chặn ở backend (BE#51): bấm &quot;Phát hành&quot; hiện luôn nhận 503. Release vẫn là Built.</p>}
      </>}

      {!release && !view.loading && <>
        <p className="ver-note">Chưa có release cho phiên bản này trong phiên làm việc. Release chỉ tạo được khi nội dung đã được PlatformAdmin duyệt đúng hash và đã xác nhận kỹ thuật; BE kiểm tra lại các điều kiện đó.</p>
        <form className="ops-stack" onSubmit={build} noValidate>
          <fieldset className="ops-fieldset">
            <legend>Tạo release (Built)</legend>
            <dl className="ver-dl">
              <dt>Revision</dt><dd className="ver-hash">{version.revisionId}</dd>
              <dt>Phiên bản</dt><dd>v{version.versionNumber}</dd>
            </dl>
            <Field label="Mã xác nhận kỹ thuật" required error={confirmationError} hint="Mã nhận được khi xác nhận kỹ thuật. Nếu mất, xác nhận lại ở tab Kết quả kỹ thuật.">
              {(p) => <Input {...p} value={confirmationId} placeholder="UUID" autoComplete="off" spellCheck={false} onChange={(event) => setConfirmationId(event.target.value)} />}
            </Field>
            <Field label="Artifact ứng viên (gói release)" required error={artifactError} hint={suggestedArtifact && !artifactId ? "Đã điền từ validation run Passed của job ReleasePackage." : "Lấy từ validation run Passed của job ReleasePackage."}>
              {(p) => <Input {...p} value={artifactId || suggestedArtifact} placeholder="UUID" autoComplete="off" spellCheck={false} onChange={(event) => setArtifactId(event.target.value)} />}
            </Field>
          </fieldset>
          {error && <Alert tone="danger" title={error.message} action={<Button size="sm" variant="secondary" type="submit" className="mt-3" disabled={!canBuild}>Thử lại (cùng khóa)</Button>}>
            {error.code && <>Mã lỗi: {error.code}. </>}Thử lại dùng cùng Idempotency-Key nên không tạo release trùng.
          </Alert>}
          <div className="ver-actions-row">
            <Button type="submit" disabled={!canBuild}><Package size={16} aria-hidden="true" />{busy ? "Đang tạo…" : "Tạo release (Built)"}</Button>
            {!canAct && <span className="ver-note">Tài khoản của bạn chỉ có quyền xem.</span>}
          </div>
        </form>
      </>}

      <form className="ops-toolbar" onSubmit={(event) => { event.preventDefault(); if (isUuid(lookupId)) { remember({ releaseId: lookupId.trim() }); setLookupId(""); } }} aria-label="Mở release theo mã">
        <Field label="Mở release theo mã" className="ops-toolbar-grow" hint="BE chưa có API tìm release theo phiên bản (BE#53).">
          {(p) => <Input {...p} value={lookupId} placeholder="UUID release" autoComplete="off" spellCheck={false} onChange={(event) => setLookupId(event.target.value)} />}
        </Field>
        <Button type="submit" variant="quiet" disabled={!isUuid(lookupId)}><Search size={16} aria-hidden="true" />Mở</Button>
      </form>
      <p className="ver-note">Mã release và mã xác nhận được nhớ trong phiên trình duyệt này; sau khi đóng tab bạn cần nhập lại. <a href={BE53} target="_blank" rel="noreferrer" style={{ color: "var(--ember)" }}>Issue BE #53</a></p>
    </Panel>

    <Panel title="Training của công trình" description="Chỉ đọc, không phân trang. Chỉ có dữ liệu sau khi phát hành hoạt động (BE#51)." bodyClassName="ops-stack">
      {trainings.error !== undefined && <Alert tone="danger" title="Không tải được danh sách training" action={<Button size="sm" variant="secondary" className="mt-3" onClick={trainings.reload}>Thử lại</Button>}>{describeError(trainings.error).message}</Alert>}
      <Table caption="Training của công trình">
        <thead><tr><th>Tên</th><th>Trạng thái</th><th>Release</th><th aria-label="Thao tác" /></tr></thead>
        <tbody>
          {trainings.loading && !trainings.data && <TableMessage colSpan={4}><SkeletonRows rows={2} label="Đang tải training…" /></TableMessage>}
          {(trainings.data ?? []).map((training) => <tr key={training.id}>
            <td className="ops-cell-primary">{training.name}</td>
            <td><StatusBadge tone={training.status.toLowerCase() === "active" ? "success" : "neutral"}>{training.status}</StatusBadge></td>
            <td className="ver-hash">{shortHash(training.releaseId, 13)}</td>
            <td className="ops-cell-actions"><Button size="sm" variant="quiet" onClick={() => remember({ releaseId: training.releaseId })}>Xem release</Button></td>
          </tr>)}
          {trainings.data && trainings.data.length === 0 && <TableMessage colSpan={4}><EmptyState icon={Package} title="Chưa có training" description="Training xuất hiện sau khi release được phát hành. Hiện phát hành đang bị chặn (BE#51)." /></TableMessage>}
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
