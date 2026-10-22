"use client";

import { Check, CheckCircle2, ChevronRight, Circle, Lock, Play } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import type { EntitlementSummary } from "@/features/billing/entitlements";
import { scenarioVersionsApi } from "@/features/scenarios/versions-api";
import type { ScenarioSummary } from "@/features/scenarios/types";
import { buildJourney, journeyChecklist, journeyConditions, type JourneyScenarioFacts, type JourneyStepModel } from "../building-journey";
import { deriveQaVerdict, jobLabel, revisionLabel, type RevisionPipeline } from "../pipeline";
import type { Building, BuildingRevision, RevisionIssue } from "../types";
import { useLocalPreference } from "@/utils/local-preference";
import "../journey.css";

const isDismissed = (value: string): value is "yes" | "no" => value === "yes" || value === "no";

function StepMarker({ step }: { step: JourneyStepModel }) {
  if (step.state === "done") return <Check size={14} strokeWidth={2.4} aria-hidden="true" />;
  if (step.state === "locked") return <Lock size={13} aria-hidden="true" />;
  return <span aria-hidden="true">{step.index}</span>;
}

/**
 * "Hành trình công trình": the resume banner, the six-step stepper with locking reasons, the current step, the two
 * independent release conditions plus the service, and a quick-start checklist. Everything is derived from server fields.
 */
export function JourneyOverview({ accessToken, building, revision, pipeline, issues, scenarios, scenarioCount, service, onGoTo, onFocusInfo }: {
  accessToken: string;
  building: Building;
  revision: BuildingRevision | null;
  pipeline: RevisionPipeline;
  issues: RevisionIssue[] | undefined;
  scenarios: ScenarioSummary[] | undefined;
  scenarioCount: number | undefined;
  service: EntitlementSummary | undefined;
  onGoTo: (tab: string) => void;
  onFocusInfo: () => void;
}) {
  const newest = useMemo(() => [...(scenarios ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [scenarios]);
  const scenarioId = newest?.id ?? "";
  const detail = useAsyncData(`journey:scenario:${scenarioId}`, (signal) => scenarioVersionsApi.getScenario(accessToken, scenarioId, signal), Boolean(scenarioId), { keepPrevious: false });
  const versions = useAsyncData(`journey:versions:${scenarioId}`, (signal) => scenarioVersionsApi.listVersions(accessToken, scenarioId, 1, 1, signal), Boolean(scenarioId), { keepPrevious: false });
  const releases = useAsyncData(`journey:releases:${building.id}`, (signal) => scenarioVersionsApi.listReleases(accessToken, { buildingId: building.id }, 1, 1, signal), true, { keepPrevious: false });
  const [dismissed, setDismissed] = useLocalPreference<"yes" | "no">("fire3d-journey-quickstart-dismissed", "no", isDismissed);

  const latestVersion = versions.data?.items[0];
  const scenario: JourneyScenarioFacts | null = newest ? {
    id: newest.id,
    name: newest.name,
    draftCount: detail.data?.draftCount,
    versionNumber: latestVersion?.versionNumber ?? detail.data?.latestVersionNumber ?? null,
    reviewStatus: latestVersion?.reviewStatus ?? null,
    rejectReason: latestVersion?.rejectReason ?? null,
  } : null;
  const input = { building, revision, scenarioCount, scenario, releaseStatus: releases.data?.items[0]?.status ?? null, service: service?.state };
  const steps = buildJourney(input);
  const conditions = journeyConditions(input);
  const checklist = journeyChecklist(input);
  const current = steps.find((step) => step.state === "current") ?? null;
  // Nothing is workable but something waits (for example PlatformAdmin review): keep the last finished step in view.
  const firstLocked = steps.findIndex((step) => step.state === "locked");
  const focus = current ?? (firstLocked > 0 ? steps[firstLocked - 1] : null);
  const waiting = !current && focus !== null;

  const base = `${routes.workspaceBuildings}/${building.id}`;
  const editorHref = newest ? `${base}/scenarios/${newest.id}` : null;
  const versionsHref = newest ? `${base}/scenarios/${newest.id}/versions` : null;

  const rev = revision ? revisionLabel(revision.status) : null;
  const job = jobLabel(pipeline.job?.status);
  const verdict = deriveQaVerdict(pipeline, issues?.filter((issue) => issue.isCurrentAttempt));

  const approved = scenario?.reviewStatus?.toLowerCase() === "approved";
  const releaseLocked = steps.find((step) => step.key === "release")?.state === "locked";

  // The banner offers the one action that moves the current step forward.
  const banner = (() => {
    if (waiting && focus) {
      const review = scenario?.reviewStatus?.toLowerCase();
      const title = review === "submitted" ? `Đang chờ PlatformAdmin duyệt v${scenario?.versionNumber}` : review === "rejected" ? `Phiên bản v${scenario?.versionNumber} bị từ chối` : "Tiếp theo: gửi duyệt nội dung";
      const detail = review === "rejected" && scenario?.rejectReason ? `Lý do: ${scenario.rejectReason}` : "Bạn vẫn xem và sửa bản nháp; sửa sau khi gửi sẽ tạo phiên bản mới và duyệt lại.";
      return versionsHref ? { title, detail, label: "Xem phiên bản", href: versionsHref } : null;
    }
    if (!current) return null;
    switch (current.key) {
      case "ifc": return { title: revision ? "Tiếp tục: hoàn tất mô hình IFC" : "Bắt đầu: tải lên mô hình IFC", detail: current.detail, label: "Mở IFC & xử lý", onClick: () => onGoTo("ifc") };
      case "scenario": return editorHref
        ? { title: `Tiếp tục: soạn kịch bản “${scenario?.name}”`, detail: current.detail, label: "Mở trình soạn", href: editorHref }
        : { title: "Bắt đầu: tạo kịch bản đầu tiên", detail: "Đặt điểm xuất phát, nguồn lửa và đường thoát trong trình soạn.", label: "Tạo kịch bản", onClick: () => onGoTo("scenarios") };
      case "version": return versionsHref ? { title: "Tạo phiên bản từ bản nháp", detail: current.detail, label: "Mở phiên bản", href: versionsHref } : { title: "Tạo phiên bản từ bản nháp", detail: current.detail, label: "Mở kịch bản", onClick: () => onGoTo("scenarios") };
      case "release": return versionsHref ? { title: "Chuẩn bị phát hành", detail: current.detail, label: "Mở phát hành", href: versionsHref } : null;
      case "usage": return { title: "Quản lý sử dụng", detail: current.detail, label: "Xem dịch vụ", onClick: () => onGoTo("services") };
      default: return null;
    }
  })();

  const stepDetail = focus && (() => {
    switch (focus.key) {
      case "ifc": return {
        text: "Tải tệp IFC, chờ worker xử lý rồi xác nhận kiểm tra QA. Mô hình sẵn sàng mới mở bước soạn kịch bản.",
        rows: [["Revision", revision ? `${revision.versionLabel} · ${rev?.label}` : "Chưa có revision"], ["Xử lý IFC", job.label], ["QA", verdict.label]] as Array<[string, string]>,
        actions: <Button onClick={() => onGoTo("ifc")}>Mở IFC &amp; xử lý</Button>,
      };
      case "scenario": return {
        text: "Đặt cửa thoát, thiết bị và nguồn lửa trên mô hình, rồi lưu thành phiên bản. Thay đổi chưa lưu được giữ lại khi bạn chuyển tab và có cảnh báo trước khi rời trang.",
        rows: [["Kịch bản", scenario ? `${scenario.name}${scenario.draftCount !== undefined ? ` · ${scenario.draftCount} bản nháp` : ""}` : "Chưa có kịch bản"], ["Revision IFC", revision?.versionLabel ?? "—"], ["Kịch bản trong công trình", String(scenarioCount ?? "—")]] as Array<[string, string]>,
        actions: <>
          {editorHref ? <Button asChild><Link href={editorHref}>Mở trình soạn kịch bản</Link></Button> : <Button onClick={() => onGoTo("scenarios")}>Tạo kịch bản</Button>}
          {versionsHref && <Button asChild variant="secondary"><Link href={versionsHref}>Xem phiên bản</Link></Button>}
        </>,
      };
      case "version": return {
        text: "Phiên bản đóng băng nội dung và rubric. Sửa nội dung sau đó sẽ tạo phiên bản mới.",
        rows: [["Kịch bản", scenario?.name ?? "—"], ["Phiên bản mới nhất", scenario?.versionNumber != null ? `v${scenario.versionNumber}` : "Chưa có"]] as Array<[string, string]>,
        actions: versionsHref ? <Button asChild><Link href={versionsHref}>Mở phiên bản</Link></Button> : <Button onClick={() => onGoTo("scenarios")}>Mở kịch bản</Button>,
      };
      case "release": return {
        text: "Dựng package, chạy thử, rồi tạo release và phát hành. Hai điều kiện (kỹ thuật và duyệt nội dung) độc lập với nhau.",
        rows: [["Phiên bản", scenario?.versionNumber != null ? `v${scenario.versionNumber}` : "—"], ["Duyệt nội dung", conditions[1].label]] as Array<[string, string]>,
        actions: versionsHref ? <Button asChild><Link href={versionsHref}>Mở phát hành</Link></Button> : null,
      };
      default: return {
        text: "Theo dõi dịch vụ, suất Trainee và mã QR của công trình đã phát hành.",
        rows: [["Dịch vụ", conditions[2].label]] as Array<[string, string]>,
        actions: <><Button onClick={() => onGoTo("services")}>Dịch vụ</Button><Button variant="secondary" onClick={() => onGoTo("qr")}>Mã QR</Button><Button asChild variant="secondary"><Link href={routes.workspaceAnalytics}>Báo cáo</Link></Button></>,
      };
    }
  })();

  return <div className="jr-stack">
    {banner && <section className="jr-banner" aria-label="Bước tiếp theo">
      <span className="jr-banner-icon" aria-hidden="true"><Play size={18} /></span>
      <div className="jr-banner-text"><strong>{banner.title}</strong><span>{banner.detail}</span></div>
      <div className="jr-banner-actions">
        {"href" in banner && banner.href ? <Button asChild><Link href={banner.href}>{banner.label}</Link></Button> : <Button onClick={banner.onClick}>{banner.label}</Button>}
        {dismissed === "yes" && <Button variant="ghost" onClick={() => setDismissed("no")}>Xem hướng dẫn</Button>}
      </div>
    </section>}

    <section className="ops-panel jr-journey" aria-labelledby="jr-journey-title">
      <div className="ops-panel-body">
        <h2 id="jr-journey-title" className="jr-title">Hành trình công trình</h2>
        <ol className="jr-steps" aria-label="Các bước của công trình">
          {steps.map((step) => <li key={step.key} className="jr-step" data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
            <span className="jr-step-dot"><StepMarker step={step} /></span>
            <span className="jr-step-title">{step.index} · {step.title}</span>
            <span className="jr-step-detail">{step.detail}{step.state === "locked" && <span className="sr-only"> (đang khóa)</span>}</span>
          </li>)}
        </ol>
      </div>
    </section>

    <div className="jr-grid">
      <div className="jr-stack">
        {focus && stepDetail && <section className="ops-panel" aria-labelledby="jr-step-title">
          <div className="ops-panel-body jr-step-panel">
            <header className="jr-step-head"><h2 id="jr-step-title" className="jr-title">Bước {focus.index} · {focus.title}</h2>{waiting ? <StatusBadge tone="warning">Đang chờ</StatusBadge> : <StatusBadge tone="ember">Đang làm</StatusBadge>}</header>
            <p className="ops-muted">{stepDetail.text}</p>
            <dl className="jr-kv">{stepDetail.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <div className="ops-actions">{stepDetail.actions}</div>
          </div>
        </section>}

        {approved && <aside className="jr-callout" data-tone="success"><CheckCircle2 size={18} aria-hidden="true" /><div>
          <strong>Nội dung v{scenario?.versionNumber} đã được PlatformAdmin duyệt</strong>
          <p>Hash nội dung khớp bản đã gửi. Bạn có thể chuẩn bị phát hành: kiểm tra package, chạy thử và tạo mã QR. Bản đã duyệt chỉ đọc; sửa sẽ tạo phiên bản mới.</p>
          {versionsHref && <Link href={versionsHref}>Mở bước chuẩn bị phát hành <ChevronRight size={14} aria-hidden="true" /></Link>}
        </div></aside>}
        {!approved && releaseLocked && <aside className="jr-callout" data-tone="locked"><Lock size={18} aria-hidden="true" /><div>
          <strong>Chưa thể phát hành: nội dung chưa được duyệt</strong>
          <p>Cần PlatformAdmin duyệt đúng phiên bản đã đóng băng trước khi chuẩn bị phát hành. Bạn vẫn xem và sửa bản nháp.</p>
          {versionsHref ? <Link href={versionsHref}>Xem trạng thái duyệt <ChevronRight size={14} aria-hidden="true" /></Link> : <button type="button" className="jr-link" onClick={() => onGoTo("scenarios")}>Mở kịch bản <ChevronRight size={14} aria-hidden="true" /></button>}
        </div></aside>}
      </div>

      <div className="jr-stack">
        <section className="ops-panel" aria-labelledby="jr-cond-title">
          <div className="ops-panel-body jr-cond">
            <h2 id="jr-cond-title" className="jr-title">Điều kiện phát hành</h2>
            <p className="ops-muted">Hai điều kiện độc lập, cùng dẫn tới phát hành. Không điều kiện nào thay thế điều kiện còn lại.</p>
            {conditions.map((item) => <div key={item.key} className="jr-cond-card">
              <div className="jr-cond-top"><strong>{item.title}</strong><StatusBadge tone={item.tone}>{item.label}</StatusBadge></div>
              <p>{item.description}</p>
            </div>)}
          </div>
        </section>

        {dismissed === "no" && <section className="ops-panel" aria-labelledby="jr-quick-title" id="jr-quickstart">
          <div className="ops-panel-body jr-cond">
            <h2 id="jr-quick-title" className="jr-title">Bắt đầu nhanh</h2>
            <ul className="jr-checklist">
              {checklist.map((item) => <li key={item.key} data-state={item.state}>
                {item.state === "done" ? <CheckCircle2 size={20} aria-hidden="true" /> : item.state === "locked" ? <Lock size={16} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                <span>{item.label}<span className="sr-only">{item.state === "done" ? " (xong)" : item.state === "locked" ? " (đang khóa)" : " (chưa làm)"}</span></span>
                {item.state === "todo" && item.tab && <button type="button" className="jr-link" onClick={() => onGoTo(item.tab as string)} aria-label={`Mở: ${item.label}`}>Mở</button>}
              </li>)}
            </ul>
            <div className="jr-quick-foot"><p>Tiến độ lấy từ dữ liệu thật, không tính vì đã xem hướng dẫn.</p><Button variant="ghost" size="sm" onClick={() => setDismissed("yes")}>Bỏ qua</Button></div>
          </div>
        </section>}

        <p className="jr-info-link"><button type="button" className="jr-link" onClick={onFocusInfo}>Xem thông tin công trình <ChevronRight size={14} aria-hidden="true" /></button></p>
      </div>
    </div>
  </div>;
}
