"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@/api/types/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "@/features/buildings/api";
import type { BuildingRevision } from "@/features/buildings/types";

import { scenariosApi } from "../api";
import type { ScenarioDraft, ScenarioDraftState, ScenarioDraftValidation, ScenarioSummary } from "../types";

function messageFrom(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

function canManageScenario(role: number | undefined, organizationId: string | null | undefined) {
  return role === 1 || (role === 0 && !!organizationId);
}

function draftEtag(headers: Headers, draft: ScenarioDraft) {
  return headers.get("etag") ?? `"${draft.version}"`;
}

function parseDraftState(value: string): ScenarioDraftState | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const candidate = parsed as Partial<ScenarioDraftState>;
    if (!Array.isArray(candidate.spawnPoints) || !Array.isArray(candidate.hazards)
      || !candidate.scoringConfig || !candidate.routingConfig || !Array.isArray(candidate.routingConfig.evacuationRoutes)) {
      return null;
    }
    return candidate as ScenarioDraftState;
  } catch {
    return null;
  }
}

export function ScenarioWorkspace({ buildingId }: { buildingId: string }) {
  const { accessToken, isAuthenticated, ready, user } = useAuthSession();
  const [revisions, setRevisions] = useState<BuildingRevision[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [revisionId, setRevisionId] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<ScenarioDraft | null>(null);
  const [eTag, setETag] = useState("");
  const [stateText, setStateText] = useState("");
  const [validation, setValidation] = useState<ScenarioDraftValidation | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState<"create" | "save" | "validate" | "snapshot" | "">("");
  const [refreshToken, setRefreshToken] = useState(0);

  const selectedRevision = useMemo(
    () => revisions.find((revision) => revision.id === revisionId) ?? revisions[0] ?? null,
    [revisionId, revisions],
  );
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const openDraft = useCallback(async (draftId: string) => {
    if (!accessToken) return;
    const response = await scenariosApi.getDraft(accessToken, draftId);
    setDraft(response.data);
    setETag(draftEtag(response.headers, response.data));
    setStateText(JSON.stringify(response.data.state, null, 2));
    setValidation(null);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !canManageScenario(user?.role, user?.organizationId)) return;
    let active = true;
    const load = async () => {
      try {
        const [revisionResponse, scenarioResponse] = await Promise.all([
          buildingsApi.listRevisions(accessToken, buildingId),
          scenariosApi.listBuilding(accessToken, buildingId),
        ]);
        if (!active) return;
        setRevisions(revisionResponse.items);
        setScenarios(scenarioResponse.items);
        setRevisionId((current) => current || revisionResponse.items[0]?.id || "");
      } catch (error) {
        if (active) setMessage(messageFrom(error, "Không thể tải scenario của công trình."));
      }
    };
    void load();
    return () => { active = false; };
  }, [accessToken, buildingId, refreshToken, user?.organizationId, user?.role]);

  const createScenarioAndDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !selectedRevision || !name.trim()) {
      setMessage("Hãy chọn revision IFC và nhập tên kịch bản.");
      return;
    }
    setWorking("create");
    setMessage("");
    try {
      const scenario = await scenariosApi.create(accessToken, { buildingId, name: name.trim() });
      const createdDraft = await scenariosApi.createDraft(accessToken, scenario.id, selectedRevision.id);
      await openDraft(createdDraft.id);
      setName("");
      setMessage("Đã tạo scenario và draft từ revision đã chọn.");
      refresh();
    } catch (error) {
      setMessage(messageFrom(error, "Không thể tạo scenario draft."));
    } finally {
      setWorking("");
    }
  };

  const createDraftForScenario = async (scenarioId: string) => {
    if (!accessToken || !selectedRevision) {
      setMessage("Hãy chọn revision IFC trước khi tạo draft.");
      return;
    }
    setWorking("create");
    setMessage("");
    try {
      const createdDraft = await scenariosApi.createDraft(accessToken, scenarioId, selectedRevision.id);
      await openDraft(createdDraft.id);
      setMessage("Đã mở draft mới từ scenario và revision đã chọn.");
    } catch (error) {
      setMessage(messageFrom(error, "Không thể tạo draft mới."));
    } finally {
      setWorking("");
    }
  };

  const saveDraft = async () => {
    if (!accessToken || !draft || !eTag) return;
    const state = parseDraftState(stateText);
    if (!state) {
      setMessage("Trạng thái draft phải là JSON có spawnPoints, hazards, scoringConfig và routingConfig.evacuationRoutes.");
      return;
    }
    setWorking("save");
    setMessage("");
    try {
      const response = await scenariosApi.updateDraft(accessToken, draft.id, state, eTag);
      setETag(response.headers.get("etag") ?? eTag);
      setDraft((current) => current ? { ...current, state } : current);
      setValidation(null);
      setMessage("Đã lưu draft. Kiểm tra lại trước khi tạo snapshot.");
    } catch (error) {
      setMessage(error instanceof ApiError && error.status === 412
        ? "Draft đã được thay đổi ở nơi khác. Hãy tải lại trước khi ghi đè."
        : messageFrom(error, "Không thể lưu draft."));
    } finally {
      setWorking("");
    }
  };

  const validateDraft = async () => {
    if (!accessToken || !draft) return;
    setWorking("validate");
    setMessage("");
    try {
      const result = await scenariosApi.validateDraft(accessToken, draft.id);
      setValidation(result);
      setMessage(result.isValid ? "Draft hợp lệ về cấu trúc." : "Draft có lỗi cấu trúc cần xử lý.");
    } catch (error) {
      setMessage(messageFrom(error, "Không thể kiểm tra draft."));
    } finally {
      setWorking("");
    }
  };

  const snapshotDraft = async () => {
    if (!accessToken || !draft || !validation?.isValid) return;
    setWorking("snapshot");
    setMessage("");
    try {
      const snapshot = await scenariosApi.snapshotDraft(accessToken, draft.id);
      setMessage(`Đã tạo snapshot ${snapshot.id}.`);
    } catch (error) {
      setMessage(messageFrom(error, "Không thể tạo snapshot."));
    } finally {
      setWorking("");
    }
  };

  if (!ready) return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
  if (!isAuthenticated) return <Card className="admin-card"><h1>Kịch bản diễn tập</h1><p>Hãy đăng nhập để soạn scenario từ BIM revision.</p><Button asChild><Link href={`${routes.login}?next=${routes.workspaceBuildings}/${buildingId}/scenarios`}>Đăng nhập</Link></Button></Card>;
  if (!canManageScenario(user?.role, user?.organizationId)) return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Chỉ OrganizationUser trong đúng tổ chức được tạo scenario draft.</p></Card>;

  return <div className="admin-layout">
    <header className="admin-heading"><p className="kicker"><span className="kicker-line" /> Thiết kế diễn tập</p><h1>Kịch bản diễn tập</h1><p>Soạn và kiểm tra bản nháp diễn tập theo phiên bản IFC đã chọn.</p></header>
    {message && <p className="form-message" role="status">{message}</p>}
    <Card className="admin-card"><h2>Tạo scenario</h2><form className="admin-form" onSubmit={createScenarioAndDraft}>
      <label>Revision IFC<select value={selectedRevision?.id ?? ""} onChange={(event) => setRevisionId(event.target.value)} disabled={!revisions.length}>{revisions.length ? revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.versionLabel} · {revision.status}</option>) : <option>Chưa có revision IFC</option>}</select></label>
      <label>Tên kịch bản<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Thoát hiểm tầng một" /></label>
      <Button type="submit" disabled={!selectedRevision || working === "create"}>{working === "create" ? "Đang tạo…" : "Tạo scenario và draft"}</Button>
    </form></Card>
    <Card className="admin-card"><h2>Scenario hiện có</h2>{scenarios.length ? <div className="account-table-wrap"><table><thead><tr><th>Tên</th><th>Tạo lúc</th><th>Thao tác</th></tr></thead><tbody>{scenarios.map((scenario) => <tr key={scenario.id}><td>{scenario.name}</td><td>{new Date(scenario.createdAt).toLocaleString("vi-VN")}</td><td><Button type="button" variant="quiet" disabled={!selectedRevision || working === "create"} onClick={() => void createDraftForScenario(scenario.id)}>Tạo draft từ revision</Button></td></tr>)}</tbody></table></div> : <p>Chưa có scenario nào cho công trình này.</p>}</Card>
    {draft && <Card className="admin-card"><div className="admin-toolbar"><h2>Draft #{draft.draftNumber}</h2><span>Revision: {draft.revisionId}</span></div><p>Nhập state theo schema BE: spawnPoints, hazards, scoringConfig, routingConfig. ETag bảo vệ thay đổi đồng thời.</p>
      <label className="form-field">Trạng thái draft JSON<textarea rows={18} value={stateText} onChange={(event) => setStateText(event.target.value)} aria-label="Trạng thái draft JSON" /></label>
      <div className="admin-actions"><Button type="button" onClick={() => void saveDraft()} disabled={working !== ""}>{working === "save" ? "Đang lưu…" : "Lưu draft"}</Button><Button type="button" variant="quiet" onClick={() => void validateDraft()} disabled={working !== ""}>{working === "validate" ? "Đang kiểm tra…" : "Kiểm tra draft"}</Button><Button type="button" variant="quiet" onClick={() => void snapshotDraft()} disabled={working !== "" || !validation?.isValid}>{working === "snapshot" ? "Đang tạo…" : "Tạo snapshot phiên bản"}</Button></div>
      {validation && <div className="form-message" role="status"><strong>{validation.isValid ? "Cấu trúc hợp lệ" : "Cấu trúc chưa hợp lệ"}</strong>{validation.issues.length ? <ul>{validation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>Chưa có lỗi được BE trả về.</p>}</div>}
    </Card>}
  </div>;
}
