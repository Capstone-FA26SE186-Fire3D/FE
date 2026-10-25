"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/features/theme/theme-scope";

import { EditorSceneController, isWebGLAvailable, ModelLoadError, type MarkerInput, type MarkerRef, type ModelInfo, type Point3, type SceneTool, type TransformPhase, type TransformResult } from "./scene-controller";
import type { FloorInfo } from "./preview-model";

export type ModelRequest = {
  /** Changes when a new signed URL was fetched. */
  key: string;
  url: string;
  expiresAt: string | null;
  coordinateTransform: unknown;
  floors: FloorInfo[];
  semanticMapping: unknown;
  /** false for `fet3d.editor/1`: the GLB is the scene space and the IFC transform is never applied to the model. */
  applyTransform?: boolean;
};

export type ModelStatus =
  | { phase: "none" }
  | { phase: "loading"; progress: number | null }
  | { phase: "loaded"; info: ModelInfo }
  | { phase: "error"; message: string; expired: boolean }
  | { phase: "unsupported" };

export type ViewportHandle = {
  resetCamera: () => void;
  focusSelection: () => void;
  viewCentre: () => { x: number; y: number; z: number };
  zoomBy: (factor: number) => void;
  setCameraLocked: (locked: boolean) => void;
};

export type ViewportProps = {
  ref?: Ref<ViewportHandle>;
  markers: MarkerInput[];
  selection: MarkerRef | null;
  tool: SceneTool;
  /** What the `place` tool puts down (opaque to the viewport). */
  placeKind: string;
  gizmoEnabled: boolean;
  model: ModelRequest | null;
  activeFloor: string | null;
  /** Known floors independent of the model (optional; the model request also carries them). */
  floors?: FloorInfo[];
  showModel: boolean;
  layerVisibility: Record<string, boolean>;
  onSelect: (selection: MarkerRef | null) => void;
  onPlace: (kind: string, point: Point3) => void;
  onTransform: (ref: MarkerRef, next: TransformResult | null, phase: TransformPhase) => void;
  onModelPick: (pick: { name: string; point: Point3 } | null) => void;
  onModelStatus: (status: ModelStatus) => void;
  /** Called when the signed URL was rejected or had expired: the owner fetches a new one (changes `model.key`). */
  onUrlExpired: () => void;
  /** Screen position of the selected marker after each frame (null when none/off screen); drives the contextual toolbar. */
  onSelectionScreen?: (position: { x: number; y: number } | null) => void;
};

const EXPIRED_STATUSES = new Set([400, 401, 403, 404, 410]);

/** The only React component that owns a WebGL context. Loaded with next/dynamic (ssr: false). */
export default function EditorViewport({ ref, markers, selection, tool, placeKind, gizmoEnabled, model, activeFloor, floors, showModel, layerVisibility, onSelect, onPlace, onTransform, onModelPick, onModelStatus, onUrlExpired, onSelectionScreen }: ViewportProps) {
  const { resolved } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<EditorSceneController | null>(null);
  const latest = useRef<Omit<ViewportProps, "ref">>({ markers, selection, tool, placeKind, gizmoEnabled, model, activeFloor, floors, showModel, layerVisibility, onSelect, onPlace, onTransform, onModelPick, onModelStatus, onUrlExpired, onSelectionScreen });
  const themeRef = useRef(resolved);
  const [remount, setRemount] = useState(0);
  const [lost, setLost] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [status, setStatus] = useState<ModelStatus>({ phase: "none" });
  const autoRefreshes = useRef(0);
  const lastScreen = useRef<{ x: number; y: number } | null>(null);
  const MAX_AUTO_REFRESH = 2;

  useEffect(() => {
    latest.current = { markers, selection, tool, placeKind, gizmoEnabled, model, activeFloor, floors, showModel, layerVisibility, onSelect, onPlace, onTransform, onModelPick, onModelStatus, onUrlExpired, onSelectionScreen };
    themeRef.current = resolved;
  });

  useImperativeHandle(ref, () => ({
    resetCamera: () => controllerRef.current?.resetCamera(),
    focusSelection: () => controllerRef.current?.focusSelection(),
    viewCentre: () => controllerRef.current?.viewCentre() ?? { x: 0, y: 0, z: 0 },
    zoomBy: (factor) => controllerRef.current?.zoomBy(factor),
    setCameraLocked: (locked) => controllerRef.current?.setCameraLocked(locked),
  }), []);

  const publishStatus = (next: ModelStatus) => {
    setStatus(next);
    latest.current.onModelStatus(next);
  };

  // Scene lifetime. A "remount" (after context loss) rebuilds everything from the latest props.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!isWebGLAvailable()) {
      const timer = window.setTimeout(() => {
        setUnsupported(true);
        publishStatus({ phase: "unsupported" });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new EditorSceneController(host, {
      onSelect: (selection) => latest.current.onSelect(selection),
      onPlace: (kind, point) => latest.current.onPlace(kind, point),
      onTransform: (ref, next, phase) => latest.current.onTransform(ref, next, phase),
      onModelPick: (pick) => latest.current.onModelPick(pick),
      onContextLost: () => setLost(true),
      onContextRestored: () => setLost(false),
      onFrame: () => {
        const report = latest.current.onSelectionScreen;
        if (!report) return;
        const next = controllerRef.current?.selectionScreen() ?? null;
        const before = lastScreen.current;
        if (before?.x === next?.x && before?.y === next?.y) return;
        lastScreen.current = next;
        report(next);
      },
    }, themeRef.current);
    controllerRef.current = controller;
    const p = latest.current;
    controller.setInputs({ markers: p.markers, selection: p.selection, tool: p.gizmoEnabled || p.tool === "select" || p.tool === "place" ? p.tool : "select", placeKind: p.placeKind });
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [remount]);

  useEffect(() => { controllerRef.current?.setTheme(resolved); }, [resolved, remount]);

  useEffect(() => {
    const effective = gizmoEnabled || tool === "select" || tool === "place" ? tool : "select";
    controllerRef.current?.setInputs({ markers, selection, tool: effective, placeKind });
  }, [markers, selection, tool, placeKind, gizmoEnabled, remount]);

  useEffect(() => { if (floors) controllerRef.current?.setFloors(floors); }, [floors, remount]);
  useEffect(() => { controllerRef.current?.setFloor(activeFloor); }, [activeFloor, floors, remount, status.phase]);
  useEffect(() => { controllerRef.current?.setModelVisible(showModel); }, [showModel, remount, status.phase]);
  useEffect(() => {
    for (const [key, visible] of Object.entries(layerVisibility)) controllerRef.current?.setLayerVisible(key, visible);
  }, [layerVisibility, remount, status.phase]);

  // Model loading: once per signed URL (`model.key`) and per scene instance.
  const modelKey = model?.key ?? null;
  useEffect(() => {
    const controller = controllerRef.current;
    const request = latest.current.model;
    if (!controller || !request) return;
    const abort = new AbortController();
    const expired = request.expiresAt ? Date.parse(request.expiresAt) <= Date.now() + 2000 : false;
    const run = async () => {
      if (expired && autoRefreshes.current < MAX_AUTO_REFRESH) {
        autoRefreshes.current += 1;
        publishStatus({ phase: "error", message: "Liên kết tải mô hình 3D đã hết hạn. Đang lấy liên kết mới…", expired: true });
        latest.current.onUrlExpired();
        return;
      }
      publishStatus({ phase: "loading", progress: null });
      try {
        const info = await controller.loadModel(request.url, request, (progress) => {
          if (!abort.signal.aborted) publishStatus({ phase: "loading", progress });
        }, abort.signal);
        if (!abort.signal.aborted) {
          autoRefreshes.current = 0;
          publishStatus({ phase: "loaded", info });
        }
      } catch (cause) {
        if (abort.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
        const isExpired = cause instanceof ModelLoadError && cause.status !== undefined && EXPIRED_STATUSES.has(cause.status);
        if (isExpired && autoRefreshes.current < MAX_AUTO_REFRESH) {
          autoRefreshes.current += 1;
          publishStatus({ phase: "error", message: "Liên kết tải mô hình 3D đã hết hạn. Đang lấy liên kết mới…", expired: true });
          latest.current.onUrlExpired();
          return;
        }
        publishStatus({ phase: "error", message: cause instanceof Error ? cause.message : "Không tải được mô hình 3D.", expired: isExpired });
      }
    };
    void run();
    return () => abort.abort();
  }, [modelKey, remount]);

  return <div className="se-viewport" data-model-state={status.phase}>
    <div ref={hostRef} className="se-canvas-host" role="application" aria-label="Khung nhìn 3D. Dùng chuột hoặc cảm ứng để xoay, kéo để di chuyển, cuộn để thu phóng; danh sách đối tượng bên cạnh là cách chọn bằng bàn phím." />
    {status.phase === "loading" && <div className="se-overlay-chip" role="status"><Skeleton style={{ width: 14, height: 14, borderRadius: 999 }} /> Đang tải mô hình 3D{status.progress !== null ? ` ${Math.round(status.progress * 100)}%` : "…"}</div>}
    {status.phase === "error" && !lost && <div className="se-overlay-card" role="alert">
      <TriangleAlert size={20} aria-hidden="true" />
      <div><strong>{status.expired ? "Liên kết tải mô hình 3D đã hết hạn" : "Không tải được mô hình 3D"}</strong><p>{status.message}</p></div>
      <Button type="button" variant="secondary" size="sm" onClick={() => { autoRefreshes.current = 0; latest.current.onUrlExpired(); }}><RotateCcw size={14} aria-hidden="true" /> Tải lại</Button>
    </div>}
    {unsupported && <div className="se-overlay-full" role="alert">
      <TriangleAlert size={28} aria-hidden="true" />
      <strong>Trình duyệt không bật được WebGL</strong>
      <p>Bạn vẫn có thể thêm và chỉnh đối tượng bằng danh sách đối tượng và biểu mẫu tọa độ. Kiểm tra tăng tốc phần cứng của trình duyệt rồi tải lại trang để xem mô hình.</p>
    </div>}
    {lost && <div className="se-overlay-full" role="alert" data-testid="context-lost">
      <TriangleAlert size={28} aria-hidden="true" />
      <strong>Khung nhìn 3D bị mất ngữ cảnh đồ họa</strong>
      <p>Trình duyệt đã thu hồi GPU (thường do thiếu bộ nhớ hoặc quá nhiều tab 3D). Nội dung bản nháp không bị ảnh hưởng. Khung nhìn tự khôi phục nếu trình duyệt cho phép, hoặc bạn có thể tạo lại ngay.</p>
      <Button type="button" onClick={() => { setLost(false); setRemount((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Tạo lại khung nhìn</Button>
    </div>}
    {!model && !unsupported && status.phase === "none" && <div className="se-overlay-hint">Chưa có mô hình 3D để hiển thị — vẫn có thể đặt đối tượng theo tọa độ.</div>}
  </div>;
}
