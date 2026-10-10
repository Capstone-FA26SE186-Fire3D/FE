"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";

import { scenarioEditorApi } from "../api";
import { useEditorPreview } from "../use-editor-preview";
import type { useScenarioEditor } from "../use-scenario-editor";
import { parseFloors } from "../scene/preview-model";
import type { ModelRequest, ModelStatus, ViewportHandle } from "../scene/editor-viewport";
import type { Tool } from "../store/editor-store";
import { readHazards, readNumber, readSpawns, type ObjectKind, type Position, type Selection } from "../store/model";
import { issueSelection, type Issue } from "../store/validation";
import { createActions } from "./actions";
import { ConflictDialog } from "./conflict-dialog";
import { useLeaveGuard, useMediaQuery } from "./hooks";
import { IssuesPanel } from "./issues-panel";
import { LockedSections } from "./locked-sections";
import { ObjectForm } from "./object-form";
import { ScenarioForm } from "./scenario-form";
import { SceneTree } from "./scene-tree";
import { TimelineBar } from "./timeline-bar";
import { EditorToolbar } from "./toolbar";

const EditorViewport = dynamic(() => import("../scene/editor-viewport"), {
  ssr: false,
  loading: () => <div className="se-viewport" aria-busy="true"><Skeleton style={{ position: "absolute", inset: 0, borderRadius: 0 }} /><span className="se-overlay-chip" role="status">Đang chuẩn bị khung nhìn 3D…</span></div>,
});

type PanelTab = "object" | "scenario" | "issues" | "locked";
type MobileTab = "model" | "objects" | "props";

export function EditorWorkspace({ accessToken, buildingId, scenarioId, editor }: {
  accessToken: string;
  buildingId: string;
  scenarioId: string;
  editor: ReturnType<typeof useScenarioEditor>;
}) {
  const { state, dispatch, edit, dirty, status, meta, issues } = editor;
  const toast = useToast();
  const viewportRef = useRef<ViewportHandle>(null);
  const gesture = useRef(0);
  const [panelTab, setPanelTab] = useState<PanelTab>("object");
  const [mobileTab, setMobileTab] = useState<MobileTab>("model");
  const [treeOpen, setTreeOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [activeFloor, setActiveFloor] = useState<string | null>(null);
  const [modelVisible, setModelVisible] = useState(true);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [previewTime, setPreviewTime] = useState(Number.POSITIVE_INFINITY);
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ phase: "none" });
  const [pick, setPick] = useState<{ name: string; point: { x: number; y: number; z: number } } | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isDesktop = useMediaQuery("(min-width: 1100px)");
  const guard = useLeaveGuard(dirty);

  const preview = useEditorPreview(accessToken, buildingId, meta?.revisionId);
  const scenario = useAsyncData(`scenario:${scenarioId}`, (signal) => scenarioEditorApi.getScenario(accessToken, scenarioId, signal));
  const catalog = useAsyncData("runtime-catalog", (signal) => scenarioEditorApi.catalog(accessToken, signal));

  const spawns = useMemo(() => readSpawns(state.draft), [state.draft]);
  const hazards = useMemo(() => readHazards(state.draft), [state.draft]);
  const floors = useMemo(() => parseFloors(preview.preview?.floors), [preview.preview?.floors]);
  const modelLayers = modelStatus.phase === "loaded" ? modelStatus.info.layers : [];
  const modelInfo = modelStatus.phase === "loaded" ? modelStatus.info : null;
  const floorsNote = modelInfo?.floorsOutsideModel ? "Cao độ tầng nằm ngoài khung của mô hình; đơn vị hoặc trục chưa được BE#54 chốt nên không cắt theo tầng." : null;

  const model: ModelRequest | null = preview.phase === "ready" && preview.preview?.downloadUrl
    ? { key: `${preview.preview.artifactId ?? "artifact"}:${preview.nonce}`, url: preview.preview.downloadUrl, expiresAt: preview.preview.expiresAt, coordinateTransform: preview.preview.coordinateTransform, floors, semanticMapping: preview.preview.semanticMapping }
    : null;

  const actions = useMemo(() => createActions(edit, (selection) => dispatch({ type: "select", selection })), [edit, dispatch]);
  const gizmoEnabled = !isMobile;
  const timeLimit = readNumber(state.draft, ["scoringConfig", "timeLimitSeconds"]);

  const onSave = useCallback(async () => {
    const result = await editor.save();
    if (result === "saved") toast.notify({ tone: "success", title: "Đã lưu bản nháp" });
    if (result === "conflict") setConflictOpen(true);
  }, [editor, toast]);

  const onValidate = useCallback(async () => {
    setPanelTab("issues");
    if (isMobile) setMobileTab("props");
    await editor.validate();
  }, [editor, isMobile]);

  const place = useCallback((kind: ObjectKind, position: Position) => {
    actions.place(kind, position);
    dispatch({ type: "tool", tool: "select" });
    setPanelTab("object");
  }, [actions, dispatch]);

  const addAtCentre = useCallback((kind: ObjectKind) => {
    const centre = viewportRef.current?.viewCentre() ?? { x: 0, y: 0, z: 0 };
    place(kind, { ...centre, rotation: 0 });
    if (isMobile) setMobileTab("props");
  }, [place, isMobile]);

  const onSelect = useCallback((selection: Selection) => {
    dispatch({ type: "select", selection });
    if (selection) setPanelTab("object");
  }, [dispatch]);

  const onTransform = useCallback((kind: ObjectKind, index: number, next: Partial<Position>, phase: "start" | "change" | "end") => {
    if (phase === "start") { gesture.current += 1; return; }
    if (phase === "end") return;
    actions.drag(kind, index, next, gesture.current, state.tool === "rotate" ? "Xoay" : "Di chuyển");
  }, [actions, state.tool]);

  const onJump = useCallback((issue: Issue) => {
    const selection = issueSelection(issue.path);
    if (selection) { dispatch({ type: "select", selection }); setPanelTab("object"); } else setPanelTab("scenario");
    if (isMobile) setMobileTab("props");
  }, [dispatch, isMobile]);

  // Keyboard: Ctrl/Cmd+S saves anywhere; the rest only when the focus is not in a text control.
  const handlers = useRef({ onSave, state, actions });
  useEffect(() => {
    handlers.current = { onSave, state, actions };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { onSave: save, state: current, actions: act } = handlers.current;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "s") { event.preventDefault(); void save(); return; }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (mod && key === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); return; }
      if (mod && key === "y") { event.preventDefault(); dispatch({ type: "redo" }); return; }
      if ((key === "delete" || key === "backspace") && current.selection && !target?.closest("[role='dialog']")) {
        event.preventDefault();
        act.remove(current.selection.kind, current.selection.index);
        return;
      }
      if (key === "escape") { dispatch({ type: "tool", tool: "select" }); dispatch({ type: "select", selection: null }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const setTool = (tool: Tool) => dispatch({ type: "tool", tool });
  const lastPast = state.history.past[state.history.past.length - 1];
  const nextFuture = state.history.future[0];
  const versionsHref = `${routes.workspaceBuildings}/${buildingId}/scenarios/${scenarioId}/versions`;
  const listHref = `${routes.workspaceBuildings}/${buildingId}/scenarios`;
  const selectedHazard = state.selection?.kind === "hazard" ? state.selection.index : null;

  const tree = <SceneTree floors={floors} floorsNote={floorsNote} activeFloor={activeFloor} onFloor={setActiveFloor} spawns={spawns} hazards={hazards}
    selection={state.selection} issues={issues} onSelect={(selection) => { onSelect(selection); setTreeOpen(false); if (isMobile) setMobileTab("props"); }} onAdd={(kind) => { addAtCentre(kind); setTreeOpen(false); }}
    modelLayers={modelLayers} layerVisibility={layerVisibility} onLayer={(key, visible) => setLayerVisibility((current) => ({ ...current, [key]: visible }))}
    modelVisible={modelVisible} onModelVisible={setModelVisible} hasModel={modelStatus.phase === "loaded"} />;

  const previewBanner = preview.phase === "not-ready"
    ? <Alert tone="warning" title="Mô hình 3D chưa sẵn sàng" action={<div className="se-banner-actions"><span>Trạng thái revision: {preview.preview?.revisionStatus ?? "?"}. Tự kiểm tra lại mỗi vài giây{preview.attempts >= 24 ? " (đã dừng, hãy thử lại)" : ""}. Bạn vẫn đặt được đối tượng bằng tọa độ.</span><Button type="button" size="sm" variant="secondary" onClick={preview.refresh}>Kiểm tra lại</Button></div>} />
    : preview.phase === "error"
      ? <Alert tone="danger" title="Không lấy được thông tin mô hình" action={<div className="se-banner-actions"><span>{preview.error}</span><Button type="button" size="sm" variant="secondary" onClick={preview.refresh}>Thử lại</Button></div>} />
      : null;

  const saveBanner = (status === "conflict" || status === "error") && state.saveError
    ? <Alert tone="danger" title={status === "conflict" ? "Xung đột phiên bản" : "Lưu không thành công"} action={<div className="se-banner-actions"><span>{state.saveError}</span>
      {status === "conflict"
        ? <Button type="button" size="sm" onClick={() => setConflictOpen(true)} data-testid="open-conflict">Đối chiếu với bản mới</Button>
        : <Button type="button" size="sm" variant="secondary" onClick={() => void onSave()}>Thử lại</Button>}</div>} />
    : null;

  return <div className="se-root" data-mobile-tab={mobileTab} data-testid="scenario-editor">
    <header className="se-header">
      <nav aria-label="Đường dẫn" className="se-crumbs">
        <Link href={routes.workspaceBuildings}>Công trình</Link><ChevronRight size={14} aria-hidden="true" />
        <Link href={`${routes.workspaceBuildings}/${buildingId}`}>Chi tiết</Link><ChevronRight size={14} aria-hidden="true" />
        <Link href={listHref}>Kịch bản</Link><ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">Bản nháp #{meta?.draftNumber}</span>
      </nav>
      <h1>{scenario.data?.name ?? "Soạn kịch bản"}</h1>
    </header>

    <EditorToolbar tool={state.tool} onTool={setTool} gizmoEnabled={gizmoEnabled} canUndo={state.history.past.length > 0} canRedo={state.history.future.length > 0}
      onUndo={() => dispatch({ type: "undo" })} onRedo={() => dispatch({ type: "redo" })} undoLabel={lastPast?.label} redoLabel={nextFuture?.label}
      status={status} onSave={() => void onSave()} onValidate={() => void onValidate()} validating={editor.validating}
      saveDisabled={status === "saving" || (status === "saved")} versionsHref={versionsHref} onOpenTree={() => setTreeOpen(true)} hasTree={!isDesktop && !isMobile} />

    {(previewBanner || saveBanner) && <div className="se-banners">{saveBanner}{previewBanner}</div>}

    <nav className="se-mobile-tabs" aria-label="Phần của trình soạn thảo">
      {([["model", "Mô hình"], ["objects", "Đối tượng"], ["props", "Thuộc tính"]] as const).map(([value, label]) => (
        <button key={value} type="button" aria-pressed={mobileTab === value} onClick={() => setMobileTab(value)}>{label}{value === "props" && issues.length > 0 ? ` (${issues.length})` : ""}</button>
      ))}
    </nav>

    <div className="se-body">
      <aside className="se-panel se-left" aria-label="Tầng và đối tượng">{isDesktop || isMobile ? tree : null}</aside>
      <section className="se-center" aria-label="Khung nhìn 3D">
        <EditorViewport ref={viewportRef} spawns={spawns} hazards={hazards} selection={state.selection} tool={state.tool} previewTime={previewTime} gizmoEnabled={gizmoEnabled}
          model={model} activeFloor={activeFloor} showModel={modelVisible} layerVisibility={layerVisibility}
          onSelect={onSelect} onPlace={place} onTransform={onTransform} onModelPick={setPick} onModelStatus={setModelStatus} onUrlExpired={preview.refresh} />
        <div className="se-viewport-foot">
          {modelInfo && <span data-testid="model-info">{modelInfo.meshes} mesh · {modelInfo.triangles.toLocaleString("vi-VN")} tam giác · {modelInfo.size.join(" × ")} m</span>}
          {pick && <span className="se-pick">Phần tử: {pick.name}</span>}
        </div>
        <TimelineBar hazards={hazards} timeLimit={timeLimit} time={previewTime} onTime={setPreviewTime} selectedIndex={selectedHazard} onSelect={(index) => onSelect({ kind: "hazard", index })} />
      </section>
      <aside className="se-panel se-right" aria-label="Thuộc tính">
        <Tabs value={panelTab} onValueChange={(value) => setPanelTab(value as PanelTab)}>
          <TabsList aria-label="Nhóm thuộc tính">
            <TabsTrigger value="object">Đối tượng</TabsTrigger>
            <TabsTrigger value="scenario">Kịch bản</TabsTrigger>
            <TabsTrigger value="issues" data-testid="tab-issues">Kiểm tra{issues.length > 0 ? ` (${issues.length})` : ""}</TabsTrigger>
            <TabsTrigger value="locked">Chờ BE</TabsTrigger>
          </TabsList>
          <div className="se-panel-scroll">
            <TabsContent value="object"><ObjectForm draft={state.draft} selection={state.selection} issues={issues} actions={actions} /></TabsContent>
            <TabsContent value="scenario"><ScenarioForm draft={state.draft} issues={issues} actions={actions} catalog={{ loading: catalog.loading && !catalog.data, error: Boolean(catalog.error), items: catalog.data }} /></TabsContent>
            <TabsContent value="issues"><IssuesPanel issues={issues} serverStale={editor.serverStale} validating={editor.validating} validateError={editor.validateError} lastValidation={editor.lastValidation} dirty={dirty} onValidate={() => void onValidate()} onJump={onJump} /></TabsContent>
            <TabsContent value="locked"><LockedSections draft={state.draft} /></TabsContent>
          </div>
        </Tabs>
      </aside>
    </div>

    <Drawer open={treeOpen && !isDesktop && !isMobile} onOpenChange={setTreeOpen} side="left" title="Tầng và đối tượng">{tree}</Drawer>

    <ConflictDialog key={editor.conflict?.theirs?.etag ?? "none"} open={conflictOpen} conflict={editor.conflict}
      onLoad={() => void editor.loadConflict()}
      onApply={(choices) => { editor.applyMerge(choices); setConflictOpen(false); toast.notify({ tone: "info", title: "Đã đối chiếu", description: "Kết quả chưa được lưu. Kiểm tra rồi bấm Lưu." }); }}
      onClose={() => { setConflictOpen(false); editor.closeConflict(); }} />

    <Modal open={guard.pending} onOpenChange={(open) => { if (!open) guard.stay(); }} title="Rời khỏi trình soạn thảo?"
      description="Bạn có thay đổi chưa lưu. Nếu rời đi bây giờ, các thay đổi này sẽ mất."
      footer={<><Button type="button" variant="primary" onClick={guard.stay} data-testid="leave-stay">Ở lại và tiếp tục sửa</Button><Button type="button" variant="danger" onClick={guard.proceed} data-testid="leave-confirm">Rời đi, bỏ thay đổi</Button></>}>
      <p className="ops-field-hint">Bấm “Lưu” (hoặc Ctrl/Cmd+S) trước khi rời trang để giữ lại thay đổi.</p>
    </Modal>
  </div>;
}
