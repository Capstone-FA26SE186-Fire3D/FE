"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import type { Change } from "@/features/library/apply";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Drawer, Modal } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { AiProposalApply } from "@/features/org-ai/components/ai-proposal-apply";
import { AI_PROPOSAL_PARAM } from "@/features/org-ai/proposal-param";
import { revisionLabel } from "@/features/buildings/pipeline";

import { scenarioEditorApi, type LoadedDraft } from "../../api";
import type { FloorInfo } from "../../scene/preview-model";
import type { MarkerInput, MarkerRef, Point3, TransformResult } from "../../scene/scene-controller";
import type { ModelRequest, ModelStatus, ViewportHandle } from "../../scene/editor-viewport";
import { useEditorPreview } from "../../use-editor-preview";
import { kindAvailability, type GeometryState } from "../../v1/availability";
import { findRuntime, parseRubricCatalog, parseRuntimeCatalog } from "../../v1/catalog";
import type { ObjectKind } from "../../v1/contract";
import { parseGeometry } from "../../v1/geometry";
import { targetOf } from "../../v1/issues";
import { applyMatrix, glbToLocal, localToGlb, round3, isUnitQuaternion } from "../../v1/matrix";
import { setFieldsCommand } from "../../v1/commands";
import { readGeometryPin, readObjects, readString, type ReferenceContext } from "../../v1/state";
import { useEditorV1 } from "../../v1/use-editor-v1";
import type { Issue } from "../../store/validation";
import { ConflictDialog } from "../conflict-dialog";
import { ifcTabHref, ReprocessGuide } from "../geometry-status";
import { useLeaveGuard, useMediaQuery } from "../hooks";
import { KindAvailability } from "../kind-availability";
import { createV1Actions } from "./actions";
import { V1GeometryPanel } from "./v1-geometry-panel";
import { V1EquipmentImport } from "./v1-equipment-import";
import { V1IssuesPanel } from "./v1-issues";
import { V1LibraryPanel, initialLibraryUi, type AppliedSample, type LibraryUi } from "./v1-library-panel";
import { V1ObjectForm } from "./v1-object-form";
import { V1ScenarioForm } from "./v1-scenario-form";
import { SelectionBar, ViewportPill, ViewportRail } from "../../scene/viewport-controls";
import { V1Toolbar } from "./v1-toolbar";
import { V1Tree } from "./v1-tree";

const EditorViewport = dynamic(() => import("../../scene/editor-viewport"), {
  ssr: false,
  loading: () => <div className="se-viewport" aria-busy="true"><Skeleton style={{ position: "absolute", inset: 0, borderRadius: 0 }} /><span className="se-overlay-chip" role="status">Đang chuẩn bị khung nhìn 3D…</span></div>,
});

type PanelTab = "object" | "scenario" | "library" | "issues" | "geometry" | "kinds";
type MobileTab = "model" | "objects" | "props";

const ORIGIN = { x: 0, y: 0, z: 0 };

export function V1Workspace({ accessToken, buildingId, scenarioId, draftId, initial }: { accessToken: string; buildingId: string; scenarioId: string; draftId: string; initial: LoadedDraft }) {
  const toast = useToast();
  const viewportRef = useRef<ViewportHandle>(null);
  const gesture = useRef(0);
  const revisionId = initial.draft.revisionId;

  const [panelTab, setPanelTab] = useState<PanelTab>("object");
  const [mobileTab, setMobileTab] = useState<MobileTab>("model");
  const [treeOpen, setTreeOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [floorChoice, setFloorChoice] = useState<string | null | undefined>(undefined);
  const [modelVisible, setModelVisible] = useState(true);
  const [viewLocked, setViewLocked] = useState(false);
  const [selectionScreen, setSelectionScreen] = useState<{ x: number; y: number } | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ phase: "none" });
  const [pick, setPick] = useState<{ name: string; point: Point3 } | null>(null);
  const [applied, setApplied] = useState<AppliedSample[]>([]);
  const [libraryUi, setLibraryUi] = useState<LibraryUi>(initialLibraryUi);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isDesktop = useMediaQuery("(min-width: 1100px)");

  const preview = useEditorPreview(accessToken, buildingId, revisionId);
  const scenario = useAsyncData(`scenario:${scenarioId}`, (signal) => scenarioEditorApi.getScenario(accessToken, scenarioId, signal));
  const catalogQuery = useAsyncData("runtime-catalog", (signal) => scenarioEditorApi.catalog(accessToken, signal));
  const rubricQuery = useAsyncData("rubric-catalog", (signal) => scenarioEditorApi.rubricCatalog(accessToken, signal));

  const runtimes = useMemo(() => (catalogQuery.data ? parseRuntimeCatalog(catalogQuery.data) : null), [catalogQuery.data]);
  const rubricView = useMemo(() => (rubricQuery.data ? parseRubricCatalog(rubricQuery.data) : null), [rubricQuery.data]);
  const reading = useMemo(() => parseGeometry(preview.preview), [preview.preview]);
  const geometry = reading.kind === "valid" ? reading.info : null;
  const metrics = useMemo(() => (rubricView ? new Set(rubricView.metrics.map((metric) => metric.id)) : null), [rubricView]);
  const context = useMemo<ReferenceContext>(() => ({ geometry, runtimes, metrics }), [geometry, runtimes, metrics]);

  const editor = useEditorV1({ accessToken, draftId, initial, context });
  const { state, dispatch, edit, dirty, status, meta, issues } = editor;
  const guard = useLeaveGuard(dirty);

  // "Áp dụng vào bản nháp" from the AI page arrives as ?aiRequest=<id>: the proposal is re-read from the server and applied only after a confirmed preview.
  const aiRequestId = useSearchParams().get(AI_PROPOSAL_PARAM);
  const [aiDismissed, setAiDismissed] = useState(false);
  const aiFloorIds = useMemo(() => (geometry ? new Set(geometry.floors.map((floor) => floor.id)) : null), [geometry]);
  const closeAiProposal = useCallback(() => {
    setAiDismissed(true);
    const url = new URL(window.location.href);
    url.searchParams.delete(AI_PROPOSAL_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const geometryState: GeometryState = reading.kind === "valid" ? "valid" : reading.kind === "reprocess" ? "reprocess" : reading.kind === "invalid" ? "invalid"
    : (preview.phase === "idle" || preview.phase === "loading") && !preview.preview ? "loading" : "not-ready";
  const catalogView = useMemo(() => ({ loading: catalogQuery.loading && !catalogQuery.data, error: Boolean(catalogQuery.error) && !catalogQuery.data, reload: catalogQuery.reload, runtimes: runtimes ?? [] }), [catalogQuery.loading, catalogQuery.data, catalogQuery.error, catalogQuery.reload, runtimes]);
  const rubricState = useMemo(() => ({ loading: rubricQuery.loading && !rubricQuery.data, error: Boolean(rubricQuery.error) && !rubricQuery.data, reload: rubricQuery.reload, view: rubricView }), [rubricQuery.loading, rubricQuery.data, rubricQuery.error, rubricQuery.reload, rubricView]);
  const runtimeVersion = readString(state.draft, "runtimeVersion") || undefined;
  const kindStatus = useMemo(() => kindAvailability({ geometry: geometryState, geometryInfo: geometry, catalog: { loading: catalogView.loading, error: catalogView.error, runtimes: runtimes ?? [] }, runtimeVersion }), [geometryState, geometry, catalogView.loading, catalogView.error, runtimes, runtimeVersion]);

  const objects = useMemo(() => readObjects(state.draft), [state.draft]);
  const pin = useMemo(() => readGeometryPin(state.draft), [state.draft]);
  const sceneFloors = useMemo<FloorInfo[]>(() => (geometry?.floors ?? []).map((floor) => ({ key: floor.id, name: floor.name, elevation: applyMatrix(floor.transform, ORIGIN).y })).sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0)), [geometry]);
  const defaultFloor = [...(geometry?.floors ?? [])].sort((a, b) => a.elevationMeters - b.elevationMeters)[0]?.id ?? null;
  const activeFloor = floorChoice === undefined || (floorChoice !== null && !geometry?.floors.some((floor) => floor.id === floorChoice)) ? defaultFloor : floorChoice;
  const activeFloorV1 = geometry?.floors.find((floor) => floor.id === activeFloor);

  const markers = useMemo<MarkerInput[]>(() => objects.flatMap((object): MarkerInput[] => {
    const floor = geometry?.floors.find((item) => item.id === object.floorId);
    if (!floor || !object.kind) return [];
    return [{ kind: "object", index: object.index, variant: object.kind, layer: object.kind, position: localToGlb(floor.transform, object.position), quaternion: isUnitQuaternion(object.rotation, 0.5) ? object.rotation : undefined }];
  }), [objects, geometry]);

  const layerSource = useMemo(() => {
    const byType: Record<string, string[]> = {};
    for (const entry of geometry?.semantic ?? []) (byType[entry.semanticType] ??= []).push(entry.nodeId);
    return byType;
  }, [geometry]);

  const model: ModelRequest | null = preview.phase === "ready" && preview.preview?.downloadUrl && geometry
    ? { key: `${geometry.artifactId}:${preview.nonce}`, url: preview.preview.downloadUrl, expiresAt: preview.preview.expiresAt, coordinateTransform: geometry.coordinateTransform, floors: sceneFloors, semanticMapping: layerSource, applyTransform: false }
    : null;
  const modelLayers = modelStatus.phase === "loaded" ? modelStatus.info.layers : [];
  const modelInfo = modelStatus.phase === "loaded" ? modelStatus.info : null;
  const modelSummary = modelInfo ? `${modelInfo.meshes} mesh · ${modelInfo.triangles.toLocaleString("vi-VN")} tam giác · ${modelInfo.size.join(" × ")} m` : null;

  const actions = useMemo(() => createV1Actions(edit, (selection) => dispatch({ type: "select", selection }), geometry), [edit, dispatch, geometry]);
  const gizmoEnabled = !isMobile;
  const selectedIndex = state.selection?.index ?? null;
  const selectedObject = selectedIndex === null ? undefined : objects[selectedIndex];
  /** A library sample becomes ONE undoable command; the sample is recorded for this session only (the draft schema has no provenance field). */
  const onApplySample = useCallback((changes: Change[], sample: Omit<AppliedSample, "at">) => {
    if (changes.length === 0) return;
    const label = `Áp dụng ${sample.code} v${sample.versionNumber}`;
    edit((draft, id, selection, now) => setFieldsCommand(draft, id, changes, { label, at: now, selection }));
    setApplied((current) => [...current, { ...sample, at: Date.now() }]);
    toast.notify({ tone: "success", title: "Đã áp dụng mẫu vào bản nháp", description: "Chưa lưu. Hoàn tác bằng nút Hoàn tác hoặc Ctrl+Z." });
  }, [edit, toast]);

  const placeDisabledReason = !geometry ? "Cần Geometry hợp lệ để đặt đối tượng" : activeFloor === null ? "Chọn một tầng trước khi đặt đối tượng" : null;

  const onSave = useCallback(async () => {
    const result = await editor.save();
    if (result.status === "saved") toast.notify({ tone: "success", title: "Đã lưu bản nháp" });
    if (result.status === "conflict") setConflictOpen(true);
    if (result.status === "invalid") setPanelTab("issues");
  }, [editor, toast]);

  const onValidate = useCallback(async () => {
    setPanelTab("issues");
    if (isMobile) setMobileTab("props");
    await editor.validate();
  }, [editor, isMobile]);

  const selectObject = useCallback((index: number | null) => {
    dispatch({ type: "select", selection: index === null ? null : { kind: "object", index } });
    if (index !== null) {
      setPanelTab("object");
      const floorId = objects[index]?.floorId;
      if (floorId && activeFloor !== null && floorId !== activeFloor) setFloorChoice(floorId);
    }
  }, [dispatch, objects, activeFloor]);

  /** Places an object on the active floor. `world` is a GLB point (picked on the model); null means the floor origin. */
  const placeAt = useCallback((kind: ObjectKind, world: Point3 | null) => {
    if (!activeFloorV1) {
      toast.notify({ tone: "warning", title: "Chọn một tầng trước", description: "Vị trí được lưu theo tọa độ cục bộ của tầng." });
      return;
    }
    const local = world ? glbToLocal(activeFloorV1.transform, world) : ORIGIN;
    if (!local) return;
    actions.addObject({ kind, floorId: activeFloorV1.id, position: { x: round3(local.x), y: round3(local.y), z: round3(local.z) } });
    dispatch({ type: "tool", tool: "select" });
    setPanelTab("object");
  }, [actions, activeFloorV1, dispatch, toast]);

  const addAtCentre = useCallback((kind: ObjectKind) => {
    const centre = viewportRef.current?.viewCentre();
    // Without a rendered view (no WebGL / no model) the object goes to the floor origin, never to a guessed GLB point.
    placeAt(kind, centre && modelStatus.phase === "loaded" ? centre : null);
    if (isMobile) setMobileTab("props");
  }, [placeAt, isMobile, modelStatus.phase]);

  const onTransform = useCallback((ref: MarkerRef, next: TransformResult | null, phase: "start" | "change" | "end") => {
    if (phase === "start") { gesture.current += 1; return; }
    if (phase === "end" || !next) return;
    const object = objects[ref.index];
    const floor = geometry?.floors.find((item) => item.id === object?.floorId);
    if (!object || !floor) return;
    if (state.tool === "rotate") { actions.rotateTo(ref.index, next.quaternion, gesture.current); return; }
    const local = glbToLocal(floor.transform, next.position);
    if (local) actions.dragTo(ref.index, { x: round3(local.x), y: round3(local.y), z: round3(local.z) }, gesture.current);
  }, [actions, geometry, objects, state.tool]);

  const onJump = useCallback((issue: Issue) => {
    const target = targetOf(issue.path);
    if (target.section === "object") selectObject(target.index);
    else if (target.section === "geometry") setPanelTab("geometry");
    else if (target.section === "objects") setPanelTab("issues");
    else setPanelTab("scenario");
    if (isMobile) setMobileTab("props");
  }, [selectObject, isMobile]);

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
        act.removeObject(current.selection.index);
        return;
      }
      if (key === "escape") { dispatch({ type: "tool", tool: "select" }); dispatch({ type: "select", selection: null }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const lastPast = state.history.past[state.history.past.length - 1];
  const nextFuture = state.history.future[0];
  const versionsHref = `${routes.workspaceBuildings}/${buildingId}/scenarios/${scenarioId}/versions`;
  const listHref = `${routes.workspaceBuildings}/${buildingId}/scenarios`;
  const saveBlockedReason = editor.shapeProblems.length > 0 ? `Chưa thể lưu: ${editor.shapeProblems[0].path} ${editor.shapeProblems[0].message}` : null;
  const issueCount = issues.length;

  const tree = <V1Tree floors={geometry?.floors ?? []} geometryNote={reading.kind === "reprocess" ? "Cần xử lý lại IFC; chưa có dữ liệu tầng." : reading.kind === "invalid" ? reading.reason : null}
    activeFloor={activeFloor} onFloor={setFloorChoice} objects={objects} selected={selectedIndex} issues={issues}
    onSelect={(index) => { selectObject(index); setTreeOpen(false); if (isMobile) setMobileTab("props"); }}
    onAdd={(kind) => { addAtCentre(kind); setTreeOpen(false); }} kindStatus={kindStatus} addDisabledReason={placeDisabledReason}
    modelLayers={modelLayers} layerVisibility={layerVisibility} onLayer={(key, visible) => setLayerVisibility((current) => ({ ...current, [key]: visible }))}
    modelVisible={modelVisible} onModelVisible={setModelVisible} hasModel={modelStatus.phase === "loaded"}
    onImportEquipment={() => { setImportOpen(true); setTreeOpen(false); }} />;

  const previewBanner = preview.phase === "reprocess"
    ? <ReprocessGuide buildingId={buildingId} revisionId={revisionId} />
    : preview.phase === "not-ready"
      ? <Alert tone="warning" title="Mô hình 3D chưa sẵn sàng" action={<div className="se-banner-actions"><span data-testid="preview-revision-status">Trạng thái revision: {revisionLabel(preview.preview?.revisionStatus).label}.{preview.preview?.revisionStatus === "NeedsFix" ? " QA chưa đạt hoặc chưa xác nhận cửa thoát; xử lý ở tab IFC." : ""} Tự kiểm tra lại mỗi vài giây{preview.attempts >= 24 ? " (đã dừng, hãy thử lại)" : ""}.{geometry ? " Có thể đặt đối tượng theo tọa độ tầng." : ""}</span><Button type="button" size="sm" variant="secondary" onClick={preview.refresh}>Kiểm tra lại</Button>{preview.preview?.revisionStatus === "NeedsFix" && <Button asChild size="sm" variant="quiet"><Link href={ifcTabHref(buildingId, revisionId)} data-testid="preview-ifc-link">Mở tab IFC</Link></Button>}</div>} />
      : preview.phase === "error"
        ? <Alert tone="danger" title="Không lấy được thông tin mô hình" action={<div className="se-banner-actions"><span>{preview.error}</span><Button type="button" size="sm" variant="secondary" onClick={preview.refresh}>Thử lại</Button></div>} />
        : reading.kind === "invalid"
          ? <Alert tone="danger" title="Geometry không đạt contract fet3d.editor/1">{reading.reason}</Alert>
          : null;

  const pinBanner = geometry && pin && (pin.artifactId !== geometry.artifactId || pin.sha256Hash !== geometry.sha256Hash)
    ? <Alert tone="warning" title="Geometry của revision đã đổi sau khi bản nháp ghim" action={<div className="se-banner-actions"><span>Tầng và neo có thể không còn khớp.</span><Button type="button" size="sm" variant="secondary" onClick={() => setPanelTab("geometry")}>Xem Geometry</Button></div>} />
    : null;

  const saveBanner = (status === "conflict" || status === "error") && state.saveError
    ? <Alert tone="danger" title={status === "conflict" ? "Xung đột phiên bản" : "Lưu không thành công"} action={<div className="se-banner-actions"><span>{state.saveError}</span>
      {status === "conflict"
        ? <Button type="button" size="sm" onClick={() => setConflictOpen(true)} data-testid="open-conflict">Đối chiếu với bản mới</Button>
        : <><Button type="button" size="sm" variant="secondary" onClick={() => void onSave()}>Thử lại</Button>{editor.report?.source === "save" && <Button type="button" size="sm" variant="quiet" onClick={() => setPanelTab("issues")}>Xem vấn đề</Button>}</>}</div>} />
    : null;

  const viewportTool = state.tool;

  return <div className="se-root" data-mobile-tab={mobileTab} data-testid="scenario-editor" data-draft-mode="v1">
    <header className="se-header">
      <Breadcrumbs items={[{ label: "Công trình", href: routes.workspaceBuildings }, { label: "Chi tiết", href: `${routes.workspaceBuildings}/${buildingId}` }, { label: "Kịch bản", href: listHref }, { label: `Bản nháp #${meta.draftNumber}` }]} />
      <h1>{readString(state.draft, "name") || scenario.data?.name || "Soạn kịch bản"} <StatusBadge tone="info" data-testid="schema-badge">fet3d.editor/1</StatusBadge></h1>
    </header>

    <V1Toolbar tool={state.tool} placeKind={state.placeKind} onTool={(tool, kind) => dispatch({ type: "tool", tool, placeKind: kind })} gizmoEnabled={gizmoEnabled}
      status={status} saveBlockedReason={saveBlockedReason} onSave={() => void onSave()} onValidate={() => void onValidate()} validating={editor.validating}
      versionsHref={versionsHref} onOpenTree={() => setTreeOpen(true)} hasTree={!isDesktop && !isMobile} kindStatus={kindStatus} placeDisabledReason={placeDisabledReason} />

    {(previewBanner || saveBanner || pinBanner) && <div className="se-banners">{saveBanner}{pinBanner}{previewBanner}</div>}

    <nav className="se-mobile-tabs" aria-label="Phần của trình soạn thảo">
      {([["model", "Mô hình"], ["objects", "Đối tượng"], ["props", "Thuộc tính"]] as const).map(([value, label]) => (
        <button key={value} type="button" aria-pressed={mobileTab === value} onClick={() => setMobileTab(value)}>{label}{value === "props" && issueCount > 0 ? ` (${issueCount})` : ""}</button>
      ))}
    </nav>

    <div className="se-body">
      <aside className="se-panel se-left" aria-label="Tầng và đối tượng">{isDesktop || isMobile ? tree : null}</aside>
      <section className="se-center" aria-label="Khung nhìn 3D">
        <div className="se-stage">
        <EditorViewport ref={viewportRef} markers={markers} selection={state.selection} tool={viewportTool} placeKind={state.placeKind} gizmoEnabled={gizmoEnabled}
          model={model} floors={sceneFloors} activeFloor={activeFloor} showModel={modelVisible} layerVisibility={layerVisibility}
          onSelect={(ref) => selectObject(ref && ref.kind === "object" ? ref.index : null)} onPlace={(kind, point) => placeAt(kind as ObjectKind, point)}
          onTransform={onTransform} onModelPick={setPick} onModelStatus={setModelStatus} onUrlExpired={preview.refresh} onSelectionScreen={setSelectionScreen} />
        <ViewportPill canUndo={state.history.past.length > 0} canRedo={state.history.future.length > 0} undoLabel={lastPast?.label} redoLabel={nextFuture?.label}
          onUndo={() => dispatch({ type: "undo" })} onRedo={() => dispatch({ type: "redo" })} onValidate={() => void onValidate()} validating={editor.validating} />
        <ViewportRail canFit={modelStatus.phase === "loaded"} hasModel={modelStatus.phase === "loaded"} locked={viewLocked} modelVisible={modelVisible}
          onZoomIn={() => viewportRef.current?.zoomBy(0.8)} onZoomOut={() => viewportRef.current?.zoomBy(1.25)} onFit={() => viewportRef.current?.resetCamera()}
          onToggleLock={() => { const next = !viewLocked; setViewLocked(next); viewportRef.current?.setCameraLocked(next); }} onToggleModel={() => setModelVisible((value) => !value)} />
        {selectedIndex !== null && selectedObject && selectionScreen && <SelectionBar position={selectionScreen}
          onCopy={() => actions.duplicateObject(selectedIndex)} onFocus={() => viewportRef.current?.focusSelection()} onDelete={() => actions.removeObject(selectedIndex)} />}
        </div>
        <div className="se-viewport-foot">
          {modelSummary && <span data-testid="model-info">{modelSummary}</span>}
          {pick && <span className="se-pick">Phần tử: {pick.name}</span>}
        </div>
      </section>
      <aside className="se-panel se-right" aria-label="Thuộc tính">
        <Tabs value={panelTab} onValueChange={(value) => setPanelTab(value as PanelTab)}>
          <TabsList aria-label="Nhóm thuộc tính">
            <TabsTrigger value="object">Đối tượng</TabsTrigger>
            <TabsTrigger value="scenario">Kịch bản</TabsTrigger>
            <TabsTrigger value="library" data-testid="tab-library">Thư viện</TabsTrigger>
            <TabsTrigger value="issues" data-testid="tab-issues">Kiểm tra{issueCount > 0 ? ` (${issueCount})` : ""}</TabsTrigger>
            <TabsTrigger value="geometry" data-testid="tab-geometry">Mô hình</TabsTrigger>
            <TabsTrigger value="kinds" data-testid="tab-kinds">Khả dụng</TabsTrigger>
          </TabsList>
          <div className="se-panel-scroll">
            <TabsContent value="object"><V1ObjectForm object={selectedObject} issues={issues} actions={actions} geometry={geometry} catalog={catalogView} runtimeVersion={runtimeVersion} pick={pick} onOpenScenario={() => setPanelTab("scenario")} /></TabsContent>
            <TabsContent value="scenario"><V1ScenarioForm draft={state.draft} issues={issues} actions={actions} catalog={catalogView} rubricCatalog={rubricState} /></TabsContent>
            <TabsContent value="library"><V1LibraryPanel accessToken={accessToken} ui={libraryUi} onUi={setLibraryUi} draft={state.draft} selectedObject={selectedObject} runtimeVersion={runtimeVersion} runtimes={runtimes} rubric={rubricView} applied={applied} canUndoLast={(label) => lastPast?.label === label} onUndo={() => dispatch({ type: "undo" })} onApply={onApplySample} /></TabsContent>
            <TabsContent value="issues"><V1IssuesPanel issues={issues} shapeProblems={editor.shapeProblems} report={editor.report} reportStale={editor.reportStale} validating={editor.validating} validateError={editor.validateError} dirty={dirty} onValidate={() => void onValidate()} onJump={onJump} /></TabsContent>
            <TabsContent value="geometry"><V1GeometryPanel reading={reading} preview={preview} pin={pin} buildingId={buildingId} revisionId={revisionId} onRepin={actions.pinGeometry} modelSummary={modelSummary} /></TabsContent>
            <TabsContent value="kinds"><KindAvailability statuses={kindStatus} onRetryCatalog={catalogQuery.reload} /></TabsContent>
          </div>
        </Tabs>
      </aside>
    </div>

    <Drawer open={treeOpen && !isDesktop && !isMobile} onOpenChange={setTreeOpen} side="left" title="Tầng và đối tượng">{tree}</Drawer>

    <ConflictDialog key={editor.conflict?.theirs?.etag ?? "none"} open={conflictOpen} conflict={editor.conflict}
      onLoad={() => void editor.loadConflict()}
      onApply={(choices) => { editor.applyMerge(choices); setConflictOpen(false); toast.notify({ tone: "info", title: "Đã đối chiếu", description: "Kết quả chưa được lưu. Kiểm tra rồi bấm Lưu." }); }}
      onClose={() => { setConflictOpen(false); editor.closeConflict(); }} />

    {importOpen && <V1EquipmentImport accessToken={accessToken} buildingId={buildingId} revisionId={revisionId} draft={state.draft} runtime={findRuntime(runtimes ?? [], runtimeVersion)}
      runtimeVersion={runtimeVersion} geometry={geometry} onApply={edit} onClose={() => setImportOpen(false)} />}

    {aiRequestId && !aiDismissed && <AiProposalApply key={aiRequestId} accessToken={accessToken} requestId={aiRequestId} draft={state.draft} floorIds={aiFloorIds} onApply={edit} onClose={closeAiProposal} />}

    <Modal open={guard.pending} onOpenChange={(open) => { if (!open) guard.stay(); }} title="Rời khỏi trình soạn thảo?"
      description="Bạn có thay đổi chưa lưu. Nếu rời đi bây giờ, các thay đổi này sẽ mất."
      footer={<><Button type="button" variant="primary" onClick={guard.stay} data-testid="leave-stay">Ở lại và tiếp tục sửa</Button><Button type="button" variant="danger" onClick={guard.proceed} data-testid="leave-confirm">Rời đi, bỏ thay đổi</Button></>}>
      <p className="ops-field-hint">Bấm “Lưu” (hoặc Ctrl/Cmd+S) trước khi rời trang để giữ lại thay đổi.</p>
    </Modal>
  </div>;
}
