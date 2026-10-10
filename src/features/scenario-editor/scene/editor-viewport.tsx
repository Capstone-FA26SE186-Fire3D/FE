"use client";

import { Crosshair, Home, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/features/theme/theme-scope";

import type { Hazard, Position } from "../store/model";
import type { ObjectKind, Selection } from "../store/model";
import type { Tool } from "../store/editor-store";
import { EditorSceneController, isWebGLAvailable, ModelLoadError, type ModelInfo, type TransformPhase } from "./scene-controller";
import type { FloorInfo } from "./preview-model";

export type ModelRequest = {
  /** Changes when a new signed URL was fetched. */
  key: string;
  url: string;
  expiresAt: string | null;
  coordinateTransform: unknown;
  floors: FloorInfo[];
  semanticMapping: unknown;
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
};

export type ViewportProps = {
  ref?: Ref<ViewportHandle>;
  spawns: Position[];
  hazards: Hazard[];
  selection: Selection;
  tool: Tool;
  previewTime: number;
  gizmoEnabled: boolean;
  model: ModelRequest | null;
  activeFloor: string | null;
  showModel: boolean;
  layerVisibility: Record<string, boolean>;
  onSelect: (selection: Selection) => void;
  onPlace: (kind: ObjectKind, position: Position) => void;
  onTransform: (kind: ObjectKind, index: number, next: Partial<Position>, phase: TransformPhase) => void;
  onModelPick: (pick: { name: string; point: { x: number; y: number; z: number } } | null) => void;
  onModelStatus: (status: ModelStatus) => void;
  /** Called when the signed URL was rejected or had expired: the owner fetches a new one (changes `model.key`). */
  onUrlExpired: () => void;
};

const EXPIRED_STATUSES = new Set([400, 401, 403, 404, 410]);

/** The only React component that owns a WebGL context. Loaded with next/dynamic (ssr: false). */
export default function EditorViewport({ ref, spawns, hazards, selection, tool, previewTime, gizmoEnabled, model, activeFloor, showModel, layerVisibility, onSelect, onPlace, onTransform, onModelPick, onModelStatus, onUrlExpired }: ViewportProps) {
  const { resolved } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<EditorSceneController | null>(null);
  const latest = useRef<Omit<ViewportProps, "ref">>({ spawns, hazards, selection, tool, previewTime, gizmoEnabled, model, activeFloor, showModel, layerVisibility, onSelect, onPlace, onTransform, onModelPick, onModelStatus, onUrlExpired });
  const themeRef = useRef(resolved);
  const [remount, setRemount] = useState(0);
  const [lost, setLost] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [status, setStatus] = useState<ModelStatus>({ phase: "none" });
  const autoRefreshedKey = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { spawns, hazards, selection, tool, previewTime, gizmoEnabled, model, activeFloor, showModel, layerVisibility, onSelect, onPlace, onTransform, onModelPick, onModelStatus, onUrlExpired };
    themeRef.current = resolved;
  });

  useImperativeHandle(ref, () => ({
    resetCamera: () => controllerRef.current?.resetCamera(),
    focusSelection: () => controllerRef.current?.focusSelection(),
    viewCentre: () => controllerRef.current?.viewCentre() ?? { x: 0, y: 0, z: 0 },
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
      onPlace: (kind, position) => latest.current.onPlace(kind, position),
      onTransform: (kind, index, next, phase) => latest.current.onTransform(kind, index, next, phase),
      onModelPick: (pick) => latest.current.onModelPick(pick),
      onContextLost: () => setLost(true),
      onContextRestored: () => setLost(false),
    }, themeRef.current);
    controllerRef.current = controller;
    const p = latest.current;
    controller.setInputs({ spawns: p.spawns, hazards: p.hazards, selection: p.selection, tool: p.gizmoEnabled || p.tool === "select" || p.tool.startsWith("place") ? p.tool : "select", previewTime: p.previewTime });
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [remount]);

  useEffect(() => { controllerRef.current?.setTheme(resolved); }, [resolved, remount]);

  useEffect(() => {
    const effective = gizmoEnabled || tool === "select" || tool.startsWith("place") ? tool : "select";
    controllerRef.current?.setInputs({ spawns, hazards, selection, tool: effective, previewTime });
  }, [spawns, hazards, selection, tool, previewTime, gizmoEnabled, remount]);

  useEffect(() => { controllerRef.current?.setFloor(activeFloor); }, [activeFloor, remount, status.phase]);
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
      if (expired) {
        if (autoRefreshedKey.current !== request.key) {
          autoRefreshedKey.current = request.key;
          latest.current.onUrlExpired();
        }
        publishStatus({ phase: "error", message: "Liên kết tải mô hình đã hết hạn. Đang lấy liên kết mới…", expired: true });
        return;
      }
      publishStatus({ phase: "loading", progress: null });
      try {
        const info = await controller.loadModel(request.url, request, (progress) => {
          if (!abort.signal.aborted) publishStatus({ phase: "loading", progress });
        }, abort.signal);
        if (!abort.signal.aborted) publishStatus({ phase: "loaded", info });
      } catch (cause) {
        if (abort.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
        const isExpired = cause instanceof ModelLoadError && cause.status !== undefined && EXPIRED_STATUSES.has(cause.status);
        if (isExpired && autoRefreshedKey.current !== request.key) {
          autoRefreshedKey.current = request.key;
          publishStatus({ phase: "error", message: "Liên kết tải mô hình đã hết hạn. Đang lấy liên kết mới…", expired: true });
          latest.current.onUrlExpired();
          return;
        }
        publishStatus({ phase: "error", message: cause instanceof Error ? cause.message : "Không tải được mô hình.", expired: isExpired });
      }
    };
    void run();
    return () => abort.abort();
  }, [modelKey, remount]);

  return <div className="se-viewport" data-model-state={status.phase}>
    <div ref={hostRef} className="se-canvas-host" role="application" aria-label="Khung nhìn 3D. Dùng chuột hoặc cảm ứng để xoay, kéo để di chuyển, cuộn để thu phóng; danh sách đối tượng bên cạnh là cách chọn bằng bàn phím." />
    {!unsupported && <div className="se-viewport-tools">
      <Button type="button" variant="secondary" size="icon" aria-label="Đặt lại camera" title="Đặt lại camera" onClick={() => controllerRef.current?.resetCamera()}><Home size={18} strokeWidth={1.75} aria-hidden="true" /></Button>
      <Button type="button" variant="secondary" size="icon" aria-label="Căn camera vào đối tượng đang chọn" title="Căn camera vào đối tượng đang chọn" disabled={!selection} onClick={() => controllerRef.current?.focusSelection()}><Crosshair size={18} strokeWidth={1.75} aria-hidden="true" /></Button>
    </div>}
    {status.phase === "loading" && <div className="se-overlay-chip" role="status"><Skeleton style={{ width: 14, height: 14, borderRadius: 999 }} /> Đang tải mô hình{status.progress !== null ? ` ${Math.round(status.progress * 100)}%` : "…"}</div>}
    {status.phase === "error" && !lost && <div className="se-overlay-card" role="alert">
      <TriangleAlert size={20} aria-hidden="true" />
      <div><strong>Không tải được mô hình</strong><p>{status.message}</p></div>
      <Button type="button" variant="secondary" size="sm" onClick={() => { autoRefreshedKey.current = null; latest.current.onUrlExpired(); }}><RotateCcw size={14} aria-hidden="true" /> Tải lại mô hình</Button>
    </div>}
    {unsupported && <div className="se-overlay-full" role="alert">
      <TriangleAlert size={28} aria-hidden="true" />
      <strong>Trình duyệt không bật được WebGL</strong>
      <p>Bạn vẫn có thể thêm và chỉnh điểm xuất phát, nguy cơ bằng danh sách đối tượng và biểu mẫu tọa độ. Kiểm tra tăng tốc phần cứng của trình duyệt rồi tải lại trang để xem mô hình.</p>
    </div>}
    {lost && <div className="se-overlay-full" role="alert" data-testid="context-lost">
      <TriangleAlert size={28} aria-hidden="true" />
      <strong>Khung nhìn 3D bị mất ngữ cảnh đồ họa</strong>
      <p>Trình duyệt đã thu hồi GPU (thường do thiếu bộ nhớ hoặc quá nhiều tab 3D). Nội dung bản nháp không bị ảnh hưởng. Khung nhìn tự khôi phục nếu trình duyệt cho phép, hoặc bạn có thể tạo lại ngay.</p>
      <Button type="button" onClick={() => { setLost(false); setRemount((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Tạo lại khung nhìn</Button>
    </div>}
    {!model && !unsupported && status.phase === "none" && <div className="se-overlay-hint">Chưa có mô hình để hiển thị — vẫn có thể đặt đối tượng theo tọa độ.</div>}
  </div>;
}
