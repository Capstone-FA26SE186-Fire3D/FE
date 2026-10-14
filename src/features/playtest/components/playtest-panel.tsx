"use client";

import { Ban, FlaskConical, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useIdempotencyKey } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/features/scenarios/components/versions/version-content";
import { shortHash } from "@/features/scenarios/version-readiness";

import "./playtest.css";
import { playtestApi } from "../api";
import { describePlaytestError, outcomeIsUnknown, type PlaytestErrorView } from "../errors";
import { canCancel, describeStatus, isPlaytestTerminal } from "../status";
import type { PlaytestStatus } from "../types";
import { packageMissing, type PlaytestPackageState, type PlaytestPackageWatch } from "../use-playtest-package";
import { useNow } from "../use-now";
import { usePlaytestStatus } from "../use-playtest-status";
import { CompletionView } from "./completion-view";
import { HandoffCard } from "./handoff-card";

export type PlaytestVersionRef = { id: string; revisionId: string; scenarioId: string; buildingId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ErrorLine({ error }: { error: PlaytestErrorView }) {
  return <>
    {error.message}{error.retryAfterSeconds ? ` Thử lại sau ${error.retryAfterSeconds} giây.` : ""}
    {error.fieldErrors.length > 0 && <ul className="ver-list">{error.fieldErrors.map((field, index) => <li key={`${field.path}-${index}`}>{field.path ? `${field.path}: ` : ""}{field.message}</li>)}</ul>}
    {error.code && <span className="pt-code-tag"> Mã lỗi: {error.code}</span>}
  </>;
}

const packageTone: Record<PlaytestPackageState["kind"], Tone> = { loading: "pending", error: "warning", none: "neutral", building: "info", failed: "danger", succeeded: "success" };

function packageLabel(state: PlaytestPackageState) {
  switch (state.kind) {
    case "loading": return "Đang đọc";
    case "error": return "Không đọc được";
    case "none": return "Chưa dựng";
    case "building": return "Đang dựng";
    case "failed": return "Dựng thất bại";
    case "succeeded": return state.qa === "passed" ? "Job xong, QA đạt" : state.qa === "failed" ? "QA không đạt" : state.qa === "checking" ? "Job xong, đang chờ QA" : "Job xong, chưa có QA";
  }
}

function PackageChecklist({ watch, buildHref }: { watch: PlaytestPackageWatch; buildHref?: string }) {
  const { state } = watch;
  const missing = packageMissing(state);
  return <section className="pt-card" aria-labelledby="pt-pkg-title" data-testid="playtest-package">
    <h3 id="pt-pkg-title" className="ver-section-title">Điều kiện trước khi chạy thử</h3>
    <div className="ver-actions-row">
      <span className="ver-note">PlaytestPackage của phiên bản này:</span>
      <StatusBadge tone={packageTone[state.kind]}>{packageLabel(state)}</StatusBadge>
    </div>
    {state.kind === "loading" && <SkeletonRows rows={1} label="Đang đọc trạng thái package…" />}
    {state.kind === "error" && <Alert tone="warning" title="Không đọc được trạng thái package" action={<Button size="sm" variant="secondary" className="mt-3" onClick={watch.reload}>Thử lại</Button>}>Máy chủ vẫn kiểm tra điều kiện khi bạn tạo playtest.</Alert>}
    {missing.length > 0 && <>
      <p className="ver-note" style={{ marginTop: 8 }}>Còn thiếu:</p>
      <ul className="ver-list" data-testid="playtest-missing">{missing.map((line) => <li key={line}>{line}</li>)}</ul>
      {buildHref && <Link href={buildHref} className="pt-link">Mở tab Package build</Link>}
    </>}
    <p className="ver-note" style={{ marginTop: 8 }}>Quyền dịch vụ của công trình, lượt dùng thử và runtime tương thích do máy chủ kiểm tra khi bạn tạo playtest và khi Mobile bắt đầu. Web không trừ lượt dùng thử.</p>
  </section>;
}

function Facts({ playtest }: { playtest: PlaytestStatus }) {
  const pkg = playtest.package;
  return <dl className="ver-dl" data-testid="playtest-facts">
    <dt>Mã playtest</dt><dd className="ver-hash">{playtest.id}</dd>
    <dt>Tạo lúc</dt><dd>{formatDateTime(playtest.createdAt)}</dd>
    <dt>Package ghim</dt><dd className="ver-hash">#{shortHash(pkg.packageHash, 12)} · {pkg.buildTarget}</dd>
    <dt>Manifest</dt><dd className="ver-hash">#{shortHash(pkg.manifestHash, 12)} · protocol {pkg.protocolVersion} · schema {pkg.manifestSchemaVersion}</dd>
    {playtest.runtimeVersion && <><dt>Runtime</dt><dd>{playtest.runtimeVersion}</dd></>}
    {playtest.startedAt && <><dt>Bắt đầu</dt><dd>{formatDateTime(playtest.startedAt)}</dd></>}
    {playtest.grant && <><dt>Mã khởi chạy</dt><dd>Thế hệ {playtest.grant.generation}, hết hạn {formatDateTime(playtest.grant.expiresAt)}</dd></>}
    {playtest.launchedAt && <><dt>Khởi chạy lúc</dt><dd>{formatDateTime(playtest.launchedAt)}</dd></>}
    {playtest.lastHeartbeatAt && <><dt>Tín hiệu cuối</dt><dd>{formatDateTime(playtest.lastHeartbeatAt)}</dd></>}
    {playtest.launchedAt && <><dt>Đã đồng bộ</dt><dd>{playtest.acknowledgedSequence} sự kiện</dd></>}
    {playtest.endedAt && <><dt>Kết thúc</dt><dd>{formatDateTime(playtest.endedAt)}</dd></>}
  </dl>;
}

function CancelModal({ open, onOpenChange, playtest, accessToken, onCancelled, onTerminal }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playtest: PlaytestStatus;
  accessToken: string;
  onCancelled: (status: PlaytestStatus) => void;
  /** 409 PLAYTEST_TERMINAL: someone else ended it first; re-read instead of showing a stale state. */
  onTerminal: () => void;
}) {
  const key = useIdempotencyKey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlaytestErrorView | null>(null);
  const started = playtest.status.toLowerCase() !== "created";

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await playtestApi.cancel(accessToken, playtest.id, key.keyFor({ playtestId: playtest.id, action: "cancel" }));
      key.done();
      onCancelled(result);
      onOpenChange(false);
    } catch (cause) {
      const view = describePlaytestError(cause);
      if (!outcomeIsUnknown(cause)) key.done();
      if (view.code === "PLAYTEST_TERMINAL") { onTerminal(); onOpenChange(false); } else setError(view);
    } finally {
      setBusy(false);
    }
  };

  return <Modal
    open={open}
    onOpenChange={(next) => { if (!busy) { onOpenChange(next); if (!next) setError(null); } }}
    title="Hủy playtest này?"
    description="Playtest sẽ kết thúc ở trạng thái Đã hủy và không thể mở lại."
    footer={<>
      <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>Giữ lại</Button>
      <Button variant="danger" onClick={() => void confirm()} disabled={busy}>{busy ? "Đang hủy…" : "Hủy playtest"}</Button>
    </>}
  >
    <p className="ver-note">{started
      ? "Playtest đã bắt đầu nên lượt dùng thử (nếu đã trừ khi Mobile bắt đầu) không được hoàn lại tự động. Mã chuyển đang mở sẽ bị thu hồi."
      : "Playtest chưa bắt đầu nên chưa trừ lượt dùng thử. Mã chuyển đang mở sẽ bị thu hồi."}</p>
    {error && <Alert tone="danger" title={error.title} className="pt-error"><ErrorLine error={error} /></Alert>}
  </Modal>;
}

function PlaytestSession({ accessToken, playtestId, canAct, versionId, onForget, onOpenVersion }: {
  accessToken: string;
  playtestId: string;
  canAct: boolean;
  versionId: string;
  onForget: () => void;
  onOpenVersion?: (versionId: string) => void;
}) {
  const toast = useToast();
  const watch = usePlaytestStatus({ accessToken, playtestId });
  const [cancelOpen, setCancelOpen] = useState(false);
  const playtest = watch.status;
  const failure = watch.error !== undefined ? describePlaytestError(watch.error) : undefined;

  if (!playtest) {
    if (failure) {
      return <Alert tone="danger" title={failure.title} action={<div className="ver-actions-row mt-3">
        <Button size="sm" variant="secondary" onClick={watch.refresh}>Thử lại</Button>
        <Button size="sm" variant="quiet" onClick={onForget}>Bỏ playtest này</Button>
      </div>}><ErrorLine error={failure} /></Alert>;
    }
    return <SkeletonRows rows={4} label="Đang tải playtest…" />;
  }

  const view = describeStatus(playtest);
  const terminal = isPlaytestTerminal(playtest.status);
  const foreign = playtest.scenarioVersionId !== versionId;

  return <div className="ops-stack" data-testid="playtest-session">
    {failure && <Alert tone={watch.fatal ? "danger" : "warning"} title={watch.fatal ? failure.title : "Dữ liệu có thể đã cũ"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={watch.refresh}>Tải lại</Button>}>
      {watch.fatal ? <ErrorLine error={failure} /> : <>Không làm mới được trạng thái playtest; đang hiển thị lần đọc gần nhất và sẽ thử lại. <ErrorLine error={failure} /></>}
    </Alert>}
    {foreign && <Alert tone="warning" title="Playtest này thuộc phiên bản khác" action={onOpenVersion ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => onOpenVersion(playtest.scenarioVersionId)}>Mở phiên bản đó</Button> : undefined}>Playtest {shortHash(playtest.id, 8)} ghim package của một phiên bản khác với phiên bản đang xem.</Alert>}

    <div className="pt-status" data-testid="playtest-status" data-status={playtest.status}>
      <div className="ver-actions-row">
        <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
        <span className="ver-caption" style={{ margin: 0 }} aria-live="polite">{watch.watching ? "Đang theo dõi" : terminal ? "Đã dừng theo dõi" : ""}</span>
      </div>
      <p className="ver-note" style={{ marginTop: 6 }}>{view.detail}</p>
    </div>

    {playtest.status.toLowerCase() === "completed" && <section className="pt-card" aria-labelledby="pt-result-title">
      <h3 id="pt-result-title" className="ver-section-title">Kết quả do Mobile gửi</h3>
      <CompletionView completion={playtest.completion} />
    </section>}

    <HandoffCard accessToken={accessToken} playtest={playtest} canAct={canAct} onIssued={watch.refresh} />
    <Facts playtest={playtest} />

    <div className="ver-actions-row">
      {canAct && canCancel(playtest) && <Button variant="quiet" onClick={() => setCancelOpen(true)}><Ban size={16} aria-hidden="true" />Hủy playtest</Button>}
      {!canAct && !terminal && <p className="ver-note">Chỉ OrganizationUser của công trình mới hủy được playtest.</p>}
      {!terminal && !canCancel(playtest) && <p className="ver-note">Máy chủ không cho phép phiên này hủy playtest.</p>}
      <Button variant="quiet" onClick={watch.refresh}><RefreshCw size={16} aria-hidden="true" />Tải lại trạng thái</Button>
      {terminal && <Button variant="secondary" onClick={onForget}><Play size={16} aria-hidden="true" />Tạo playtest mới</Button>}
    </div>

    <CancelModal
      open={cancelOpen}
      onOpenChange={setCancelOpen}
      playtest={playtest}
      accessToken={accessToken}
      onCancelled={(status) => { watch.apply(status); toast.notify({ tone: "info", title: "Đã hủy playtest" }); }}
      onTerminal={() => { watch.refresh(); toast.notify({ tone: "warning", title: "Playtest đã kết thúc", description: "Đã tải lại trạng thái mới nhất." }); }}
    />
  </div>;
}

/**
 * Prepare, follow and hand off one playtest of a scenario version. The playtest id lives in the caller's URL
 * (`?playtest=`), so a reload or another tab reopens it from `GET /api/playtests/{id}`.
 * Web never redeems, starts, launches or consumes a grant: that is the Mobile session's job.
 */
export function PlaytestPanel({ accessToken, version, packageWatch, canPlaytest, playtestId, onPlaytestIdChange, buildHref, onOpenVersion }: {
  accessToken: string;
  version: PlaytestVersionRef;
  packageWatch: PlaytestPackageWatch;
  /** OrganizationUser only: PlatformAdmin is not a playtest actor (BE 403). */
  canPlaytest: boolean;
  /** `?playtest=` value; empty when none is open. */
  playtestId: string;
  onPlaytestIdChange: (id: string) => void;
  buildHref?: string;
  onOpenVersion?: (versionId: string) => void;
}) {
  const toast = useToast();
  const key = useIdempotencyKey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlaytestErrorView | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const missing = packageMissing(packageWatch.state);
  const validId = UUID.test(playtestId);

  const create = async () => {
    if (busy || !canPlaytest || missing.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { revisionId: version.revisionId, scenarioVersionId: version.id };
      const created = await playtestApi.prepare(accessToken, version.scenarioId, version.buildingId, payload, key.keyFor({ scenarioId: version.scenarioId, ...payload }));
      key.done();
      toast.notify({ tone: "success", title: "Đã chuẩn bị playtest", description: "Chưa bắt đầu và chưa trừ lượt dùng thử." });
      onPlaytestIdChange(created.id);
    } catch (cause) {
      const view = describePlaytestError(cause);
      setError(view);
      if (!outcomeIsUnknown(cause)) key.done();
      if (view.retryAfterSeconds) setBlockedUntil(Date.now() + view.retryAfterSeconds * 1000);
      if (view.code === "PLAYTEST_PACKAGE_REQUIRED" || view.code === "RUNTIME_INCOMPATIBLE" || view.code === "DRAFT_SNAPSHOT_REQUIRED") packageWatch.reload();
    } finally {
      setBusy(false);
    }
  };

  const now = useNow(blockedUntil > 0);
  const retryLeft = blockedUntil > now;

  return <Panel
    title="Playtest trên Mobile"
    description="Chạy thử phiên bản này trên điện thoại của bạn. Web chuẩn bị, hiển thị mã chuyển và theo dõi; bắt đầu, khởi chạy và kết quả do ứng dụng Mobile thực hiện."
  >
    <div className="ops-stack">
      {!canPlaytest && <Alert tone="info" title="Chỉ OrganizationUser chạy thử được">PlatformAdmin không phải người chạy thử nên không tạo hay xem playtest ở đây.</Alert>}

      {canPlaytest && playtestId && !validId && <Alert tone="warning" title="Mã playtest trên đường dẫn không hợp lệ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => onPlaytestIdChange("")}>Bỏ mã này</Button>}>Tham số ?playtest phải là UUID do máy chủ cấp.</Alert>}

      {canPlaytest && playtestId && validId
        ? <PlaytestSession key={playtestId} accessToken={accessToken} playtestId={playtestId} canAct={canPlaytest} versionId={version.id} onForget={() => onPlaytestIdChange("")} onOpenVersion={onOpenVersion} />
        : canPlaytest && <>
          <PackageChecklist watch={packageWatch} buildHref={buildHref} />
          {error && <Alert tone="danger" title={error.title} className="pt-error"><ErrorLine error={error} /></Alert>}
          <div className="ver-actions-row">
            <Button onClick={() => void create()} disabled={busy || missing.length > 0 || retryLeft} data-testid="playtest-create">
              <FlaskConical size={16} aria-hidden="true" />{busy ? "Đang chuẩn bị…" : "Tạo playtest"}
            </Button>
            {retryLeft && <StatusBadge tone="warning">Chờ rồi thử lại</StatusBadge>}
          </div>
          <p className="ver-caption">Tạo playtest chỉ ghim package đã dựng của phiên bản này; chưa trừ lượt dùng thử, chưa cấp mã khởi chạy.</p>
        </>}
    </div>
  </Panel>;
}
