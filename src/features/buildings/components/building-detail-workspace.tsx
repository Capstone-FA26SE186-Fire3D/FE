"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@/api/types/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { uploadIfcRevision } from "../ifc-upload";
import { buildingsApi } from "../api";
import { hasRuntimePreview } from "../runtime-preview";
import type { AnnotationItem, AnnotationSnapshot, BimFact, Building, BuildingRevision, EditorPreview, ProcessingJob, RevisionIssue } from "../types";

const RuntimePreviewViewer = dynamic(
  () => import("./runtime-preview-viewer").then((module) => module.RuntimePreviewViewer),
  { ssr: false, loading: () => <p>Đang chuẩn bị preview 3D…</p> },
);

type RevisionDetails = {
  annotations: AnnotationSnapshot | null;
  facts: BimFact[];
  issues: RevisionIssue[];
  jobs: ProcessingJob[];
  preview: EditorPreview | null;
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

function canManageBuilding(role: number | undefined, organizationId: string | null | undefined) {
  return role === 1 || (role === 0 && !!organizationId);
}

function AnnotationEditor({ accessToken, revisionId, snapshot, onSaved }: { accessToken: string; revisionId: string; snapshot: AnnotationSnapshot; onSaved: () => void }) {
  const [value, setValue] = useState(() => JSON.stringify(snapshot.data.items, null, 2));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const save = async () => {
    let items: AnnotationItem[];
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error();
      items = parsed as AnnotationItem[];
    } catch {
      setMessage("Overlay phải là mảng JSON gồm id, ifcGlobalId, label và note.");
      return;
    }

    if (!snapshot.eTag) {
      setMessage("Không có ETag overlay; hãy tải lại revision trước khi lưu.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await buildingsApi.saveAnnotations(accessToken, revisionId, items, snapshot.eTag);
      setMessage("Đã lưu overlay annotation.");
      onSaved();
    } catch (error) {
      setMessage(error instanceof ApiError && error.status === 412
        ? "Overlay đã được người khác cập nhật. Hãy tải lại trước khi ghi đè."
        : messageFrom(error, "Không thể lưu overlay annotation."));
    } finally {
      setSaving(false);
    }
  };

  return <Card className="admin-card">
    <div className="admin-toolbar"><h2>Annotation overlay</h2><span>Version {snapshot.version}</span></div>
    <p>Overlay bám theo IFC GlobalId và tách khỏi geometry. Lưu dùng ETag để không ghi đè thay đổi mới hơn.</p>
    <label className="form-field">Các annotation (JSON)<textarea rows={8} value={value} onChange={(event) => setValue(event.target.value)} aria-label="Các annotation JSON" /></label>
    <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Đang lưu…" : "Lưu annotation"}</Button>
    {message && <p className="form-message" role="status">{message}</p>}
  </Card>;
}

export function BuildingDetailWorkspace({ buildingId }: { buildingId: string }) {
  const { accessToken, isAuthenticated, ready, user } = useAuthSession();
  const [building, setBuilding] = useState<Building | null>(null);
  const [revisions, setRevisions] = useState<BuildingRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const [details, setDetails] = useState<RevisionDetails | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const selectedRevision = useMemo(
    () => revisions.find((revision) => revision.id === selectedRevisionId) ?? revisions[0] ?? null,
    [revisions, selectedRevisionId],
  );
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    if (!accessToken || !canManageBuilding(user?.role, user?.organizationId)) return;
    let active = true;

    const load = async () => {
      try {
        const [buildingResponse, revisionResponse] = await Promise.all([
          buildingsApi.get(accessToken, buildingId),
          buildingsApi.listRevisions(accessToken, buildingId),
        ]);
        if (!active) return;
        setBuilding(buildingResponse);
        setRevisions(revisionResponse.items);
      } catch (error) {
        if (active) setMessage(messageFrom(error, "Không thể tải công trình."));
      }
    };

    void load();
    return () => { active = false; };
  }, [accessToken, buildingId, refreshToken, user?.organizationId, user?.role]);

  useEffect(() => {
    if (!accessToken || !selectedRevision) return;
    let active = true;

    const load = async () => {
      const [jobs, issues, facts, preview, annotations] = await Promise.allSettled([
        buildingsApi.listProcessingJobs(accessToken, selectedRevision.id),
        buildingsApi.listIssues(accessToken, selectedRevision.id),
        buildingsApi.listBimFacts(accessToken, selectedRevision.id),
        buildingsApi.getPreview(accessToken, buildingId, selectedRevision.id),
        buildingsApi.getAnnotations(accessToken, selectedRevision.id),
      ]);
      if (!active) return;
      setDetails({
        jobs: jobs.status === "fulfilled" ? jobs.value.items : [],
        issues: issues.status === "fulfilled" ? issues.value.items : [],
        facts: facts.status === "fulfilled" ? facts.value.items : [],
        preview: preview.status === "fulfilled" ? preview.value : null,
        annotations: annotations.status === "fulfilled" ? annotations.value : null,
      });
    };

    void load();
    return () => { active = false; };
  }, [accessToken, buildingId, refreshToken, selectedRevision]);

  const processRevision = async () => {
    if (!accessToken || !selectedRevision) return;
    setMessage("");
    try {
      await buildingsApi.processRevision(accessToken, selectedRevision.id);
      setMessage("Đã gửi yêu cầu xử lý IFC.");
      refresh();
    } catch (error) {
      setMessage(messageFrom(error, "Không thể gửi yêu cầu xử lý IFC."));
    }
  };

  const submitUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !file || !versionLabel.trim()) {
      setMessage("Hãy chọn IFC và nhập nhãn revision.");
      return;
    }

    setUploading(true);
    setMessage("");
    try {
      const uploaded = await uploadIfcRevision({
        file,
        versionLabel: versionLabel.trim(),
        initiate: (input) => buildingsApi.initiateUpload(accessToken, buildingId, input),
        finalize: (revisionId, input) => buildingsApi.finalizeUpload(accessToken, revisionId, input),
      });
      try {
        await buildingsApi.processRevision(accessToken, uploaded.revisionId);
        setMessage("Đã tải IFC và gửi xử lý revision.");
      } catch (error) {
        setMessage(`IFC đã được lưu, nhưng chưa gửi được xử lý: ${messageFrom(error, "hãy thử lại từ revision.")}`);
      }
      setFile(null);
      setVersionLabel("");
      refresh();
    } catch (error) {
      setMessage(messageFrom(error, "Không thể tải IFC."));
    } finally {
      setUploading(false);
    }
  };

  if (!ready) return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
  if (!isAuthenticated) return <Card className="admin-card"><h1>Công trình</h1><p>Hãy đăng nhập để xem revision IFC.</p><Button asChild><Link href={`${routes.login}?next=${routes.workspaceBuildings}/${buildingId}`}>Đăng nhập</Link></Button></Card>;
  if (!canManageBuilding(user?.role, user?.organizationId)) return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Chỉ OrganizationUser trong đúng tổ chức được quản lý Building và IFC.</p></Card>;

  return <div className="admin-layout">
    <p className="workspace-scenario-link"><Link href={`${routes.workspaceBuildings}/${buildingId}/scenarios`}>Soạn kịch bản diễn tập từ revision IFC</Link></p>
    <header className="admin-heading"><p className="kicker"><span className="kicker-line" /> Không gian mô hình</p><h1>{building?.name ?? "Đang tải công trình…"}</h1><p>Theo dõi phiên bản IFC, trạng thái xử lý và mô hình xem trước của công trình.</p></header>
    {message && <p className="form-message" role="status">{message}</p>}
    <Card className="admin-card"><div className="admin-toolbar"><h2>Revision IFC</h2><Button type="button" variant="quiet" onClick={refresh}>Tải lại</Button></div>
      {revisions.length ? <label className="form-field">Chọn revision<select value={selectedRevision?.id ?? ""} onChange={(event) => setSelectedRevisionId(event.target.value)}>{revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.versionLabel} · {revision.status}</option>)}</select></label> : <p>Chưa có revision IFC.</p>}
      {selectedRevision && <div className="admin-grid"><div><strong>{selectedRevision.versionLabel}</strong><p>{selectedRevision.sourceDocument?.originalFilename ?? "Chưa có source document"}</p></div><div><strong>{selectedRevision.status}</strong><p>Trạng thái do worker/backend quyết định.</p></div><Button type="button" onClick={() => void processRevision()}>Chạy xử lý IFC</Button></div>}
    </Card>
    <Card className="admin-card"><h2>Thêm revision IFC</h2><form className="admin-form" onSubmit={submitUpload}><label>Nhãn revision<input required maxLength={100} value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="IFC rev. 02" /></label><label>Tệp IFC<input required type="file" accept=".ifc" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><Button type="submit" disabled={uploading}>{uploading ? "Đang tải…" : "Tải IFC và xử lý"}</Button></form></Card>
    {selectedRevision && details && <>
      <Card className="admin-card"><h2>QA và processing</h2><p>{details.jobs.length ? details.jobs.map((job) => `${job.kind}: ${job.status}`).join(" · ") : "Chưa có logical processing job."}</p><div className="account-table-wrap"><table><thead><tr><th>Mức độ</th><th>Mã</th><th>Nội dung</th></tr></thead><tbody>{details.issues.map((issue) => <tr key={issue.id}><td>{issue.severity}</td><td>{issue.issueCode}</td><td>{issue.message}</td></tr>)}{!details.issues.length && <tr><td colSpan={3}>Chưa có issue hiện hành.</td></tr>}</tbody></table></div></Card>
      <Card className="admin-card"><h2>BIM facts</h2><div className="account-table-wrap"><table><thead><tr><th>IFC GlobalId</th><th>Thực thể</th><th>Thuộc tính</th><th>Giá trị</th></tr></thead><tbody>{details.facts.slice(0, 20).map((fact) => <tr key={fact.id}><td>{fact.ifcGlobalId}</td><td>{fact.entityType}</td><td>{fact.propertyPath}</td><td>{typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)}</td></tr>)}{!details.facts.length && <tr><td colSpan={4}>Chưa có BIM facts từ worker.</td></tr>}</tbody></table></div></Card>
      <Card className="admin-card"><h2>Preview worker</h2>{hasRuntimePreview(details.preview) ? <><RuntimePreviewViewer downloadUrl={details.preview.downloadUrl} /><p><a href={details.preview.downloadUrl} target="_blank" rel="noreferrer">Mở artifact GLB đã xử lý</a> · SHA-256: {details.preview.sha256Hash}</p></> : <p>Chưa có preview artifact đã sẵn sàng. Không dùng file IFC local thay cho artifact của revision.</p>}</Card>
      {details.annotations && <AnnotationEditor key={`${selectedRevision.id}-${details.annotations.version}`} accessToken={accessToken!} revisionId={selectedRevision.id} snapshot={details.annotations} onSaved={refresh} />}
    </>}
  </div>;
}
