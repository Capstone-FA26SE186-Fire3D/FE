"use client";

import {
  AlertTriangle, ArrowRight, Box, BoxSelect, BrickWall, CheckCircle2, Copy, DoorOpen, Eye, EyeOff, Focus, Layers3, Maximize2, Minimize2,
  MousePointerClick, Palette, RotateCcw, Scissors, ScanEye, Sparkles, Spline, SquareDashed, Upload, Waypoints, X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FloatingButtonGroup, type FloatingButtonItem } from "@/components/ui/floating-button-group";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routes } from "@/configs/routes";
import type { IfcLoadProgress, LoadedIfcModel } from "../ifc-loader";
import type { IfcCategory, IfcElementDetails, IfcElementKind, IfcSceneScan, ScenarioAnchorKind } from "../types";
import { categoryPalette, IfcViewer, type IfcColorMode, type IfcViewerHandle } from "./ifc-viewer";
import styles from "./ifc-scan.module.css";
import "@/assets/styles/ops-v2.css";

const inventoryRows: { kind: IfcElementKind; label: string; icon: typeof BrickWall }[] = [
  { kind: "storey", label: "Tầng", icon: Layers3 },
  { kind: "wall", label: "Tường", icon: BrickWall },
  { kind: "exit", label: "Cửa / lối ra", icon: DoorOpen },
  { kind: "stair", label: "Cầu thang", icon: Waypoints },
  { kind: "room", label: "Không gian", icon: Box },
];

export const categoryLabels: Record<IfcCategory, string> = {
  wall: "Tường",
  slab: "Sàn / trần",
  roof: "Mái",
  door: "Cửa đi",
  window: "Cửa sổ / kính",
  stair: "Cầu thang",
  railing: "Lan can",
  structure: "Cột / dầm",
  space: "Không gian (phòng)",
  furniture: "Nội thất",
  equipment: "Thiết bị",
  site: "Khu đất / cảnh quan",
  other: "Khác",
};

const categoryOrder: IfcCategory[] = ["wall", "slab", "roof", "door", "window", "stair", "railing", "structure", "space", "furniture", "equipment", "site", "other"];
const defaultHidden: IfcCategory[] = ["space"];
const anchorLabels: Record<ScenarioAnchorKind, string> = { room: "không gian nguồn cháy", stair: "cầu thang", exit: "cửa / lối thoát" };
const phaseLabels = { parse: "Đang đọc cấu trúc IFC", geometry: "Đang dựng mô hình 3D", edges: "Đang dựng nét viền" } as const;

function safeErrorMessage(error: unknown) {
  // The IFC parser reports in English for developers: the console keeps it, the page explains in Vietnamese.
  console.warn("IFC parse failed", error);
  return "Không thể đọc tệp IFC này. Kiểm tra tệp có đúng định dạng IFC và không bị hỏng, rồi thử lại.";
}

function formatMetres(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} m`;
}

function formatBytes(value: number) {
  if (value >= 1_048_576) return `${(value / 1_048_576).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(value / 1024)).toLocaleString("vi-VN")} KB`;
}

function hex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Short tag for the floating storey rail ("T3", "L1", "Tầng 2" → "T2"); the full name stays in the tooltip. */
function storeyTag(name: string, index: number) {
  const match = name.match(/(-?\d+)/);
  if (match) return `T${match[1]}`;
  const compact = name.replace(/\s+/g, "");
  return compact.length <= 4 ? compact : `T${index + 1}`;
}

type IfcScanWorkspaceProps = {
  embedded?: boolean;
  eyebrow?: string;
  title?: string;
  description?: string;
};

/**
 * Local IFC reader (Figma 62:5869 / 62:6378, mobile 66:3169): header with the file button, the viewer as the drop zone with a
 * floating storey rail and a floating button group, the section slider under it, layer chips, and a summary column (scan
 * result, selected element, next step). The file never leaves the browser; web-ifc is loaded on demand.
 */
export function IfcScanWorkspace({
  embedded = false,
  eyebrow = "IFC · xem ngay trên máy",
  title = "Quét mô hình IFC",
  description = "Xem nhanh một tệp IFC ngay trên máy bạn. Tệp không được tải lên máy chủ và không lưu vào công trình nào.",
}: IfcScanWorkspaceProps) {
  const [model, setModel] = useState<LoadedIfcModel | null>(null);
  const [scan, setScan] = useState<IfcSceneScan | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [selectedExpressID, setSelectedExpressID] = useState<number | null>(null);
  const [details, setDetails] = useState<IfcElementDetails | null>(null);
  const [progress, setProgress] = useState<IfcLoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<ReadonlySet<IfcCategory>>(() => new Set(defaultHidden));
  const [storeyID, setStoreyID] = useState<number | null>(null);
  const [sectionHeight, setSectionHeight] = useState<number | null>(null);
  const [xray, setXray] = useState(false);
  const [colorMode, setColorMode] = useState<IfcColorMode>("category");
  const [showEdges, setShowEdges] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const viewerRef = useRef<IfcViewerHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const kindCursor = useRef<Partial<Record<IfcElementKind, number>>>({});

  useEffect(() => () => { model?.dispose(); }, [model]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const select = useCallback((expressID: number | null) => {
    setSelectedExpressID(expressID);
    setCopied(false);
    setDetails(expressID === null || !model ? null : model.getDetails(expressID));
  }, [model]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") select(null);
      if (event.key.toLowerCase() === "f" && selectedExpressID !== null) viewerRef.current?.focusSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, selectedExpressID]);

  async function openFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    select(null);
    if (!file.name.toLowerCase().endsWith(".ifc") || file.size === 0) {
      setProgress(null);
      setError("Hãy chọn một tệp IFC (.ifc) không rỗng.");
      return;
    }

    try {
      setProgress({ completed: 0, total: 1, phase: "parse" });
      const { loadIfcFile } = await import("../ifc-loader");
      const loaded = await loadIfcFile(file, setProgress);
      setStoreyID(null);
      setSectionHeight(null);
      setHiddenCategories(new Set(defaultHidden));
      kindCursor.current = {};
      setModel(loaded);
      setScan(loaded.scan);
      setFileSize(file.size);
      setProgress(null);
    } catch (loadError) {
      setProgress(null);
      setError(safeErrorMessage(loadError));
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    void openFile(file);
  }

  const heightRange = useMemo(() => {
    if (!model) return null;
    const levels = [...model.storeyLevels.values()];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const mesh of model.meshes) {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
      if (!box) continue;
      min = Math.min(min, box.min.y);
      max = Math.max(max, box.max.y);
    }
    if (!Number.isFinite(min)) return null;
    // Ground = lowest storey holding a real share of the elements, so piles/foundations do not skew heights.
    const total = model.storeys.reduce((sum, storey) => sum + storey.elementCount, 0);
    const ground = model.storeys.find((storey) => storey.elevation !== null && storey.elementCount >= total * 0.15)?.elevation;
    return { min, max, firstLevel: ground ?? (levels.length ? Math.min(...levels) : min) };
  }, [model]);

  function toggleSection() {
    if (sectionHeight !== null || !heightRange || !model) { setSectionHeight(null); return; }
    const level = storeyID !== null ? model.storeyLevels.get(storeyID) ?? heightRange.firstLevel : heightRange.firstLevel;
    setSectionHeight(Math.min(heightRange.max, level + 1.2));
  }

  function toggleCategory(category: IfcCategory) {
    setHiddenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  }

  function cycleKind(kind: IfcElementKind) {
    if (!scan) return;
    const candidates = scan.elements.filter((element) => element.kind === kind && (kind === "storey" || element.bounds));
    if (!candidates.length) return;
    if (kind === "storey") {
      const storeys = model?.storeys ?? [];
      const index = ((kindCursor.current.storey ?? -1) + 1) % Math.max(storeys.length, 1);
      kindCursor.current.storey = index;
      if (storeys[index]) setStoreyID(storeys[index].expressID);
      return;
    }
    if (kind === "room") setHiddenCategories((current) => { const next = new Set(current); next.delete("space"); return next; });
    const index = ((kindCursor.current[kind] ?? -1) + 1) % candidates.length;
    kindCursor.current[kind] = index;
    select(candidates[index].expressID);
    requestAnimationFrame(() => viewerRef.current?.focusSelection());
  }

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen?.().catch(() => setFullscreen((value) => !value));
  }

  async function copyGlobalId() {
    if (!details?.globalId) return;
    await navigator.clipboard?.writeText(details.globalId).catch(() => undefined);
    setCopied(true);
  }

  const onToolbarAction = (id: string) => {
    switch (id) {
      case "iso": viewerRef.current?.setView("iso"); break;
      case "top": viewerRef.current?.setView("top"); break;
      case "front": viewerRef.current?.setView("front"); break;
      case "section": toggleSection(); break;
      case "xray": setXray((value) => !value); break;
      case "edges": setShowEdges((value) => !value); break;
      case "palette": setColorMode((value) => (value === "category" ? "ifc" : "category")); break;
      case "reset": viewerRef.current?.resetView(); break;
      case "fullscreen": void toggleFullscreen(); break;
      default: break;
    }
  };

  const toolbarItems: FloatingButtonItem[] = [
    { id: "iso", label: "Góc nhìn 3D", icon: Box, disabled: !model },
    { id: "top", label: "Nhìn từ trên xuống (mặt bằng)", icon: SquareDashed, disabled: !model },
    { id: "front", label: "Mặt đứng", icon: BoxSelect, disabled: !model },
    { id: "section", label: "Mặt cắt ngang", icon: Scissors, pressed: sectionHeight !== null, disabled: !model, separator: true },
    { id: "xray", label: "Chế độ nhìn xuyên", icon: ScanEye, pressed: xray, disabled: !model },
    { id: "edges", label: "Nét viền", icon: Spline, pressed: showEdges, disabled: !model },
    { id: "palette", label: colorMode === "category" ? "Đang tô màu theo loại — đổi sang màu trong IFC" : "Đang dùng màu IFC — đổi sang màu theo loại", icon: Palette, pressed: colorMode === "ifc", disabled: !model },
    { id: "reset", label: "Đặt lại góc nhìn", icon: RotateCcw, disabled: !model, separator: true },
    { id: "fullscreen", label: fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình", icon: fullscreen ? Minimize2 : Maximize2 },
  ];

  const sectionReference = (storeyID !== null ? model?.storeyLevels.get(storeyID) : undefined) ?? heightRange?.firstLevel ?? 0;
  const percent = progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const activeStorey = model?.storeys.find((storey) => storey.expressID === storeyID) ?? null;
  const visibleCategories = model ? categoryOrder.filter((category) => model.categoryCounts[category] > 0) : [];

  const fileButton = <label className={styles.uploadButton} data-primary={embedded || undefined}>
    <Upload size={17} aria-hidden="true" />
    <span>Chọn tệp IFC</span>
    <input aria-label="Chọn tệp IFC" type="file" accept=".ifc" onChange={handleFileChange} />
  </label>;

  return <section className={`${styles.workspace} ${embedded ? styles.embedded : ""}`}>
    {embedded
      ? <PageHeader eyebrow={eyebrow} title={title} description={description} breadcrumbs={[{ label: "Công cụ" }, { label: title }]} actions={fileButton} />
      : <header className={styles.hero}>
        <p className="kicker"><span className="kicker-line" /> {eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className={styles.heroActions}>{fileButton}<p className={styles.localNote}><CheckCircle2 size={15} aria-hidden="true" /> Tệp chỉ được xử lý trong trình duyệt này.</p></div>
      </header>}

    <div className={styles.layout}>
      <div className={styles.main}>
        <div ref={stageRef} className={`${styles.stage} ${fullscreen ? styles.stageFullscreen : ""} ${dragging ? styles.dragging : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void openFile(event.dataTransfer.files?.[0]); }}>
          <IfcViewer ref={viewerRef} model={model} selectedExpressID={selectedExpressID} onSelect={select}
            hiddenCategories={hiddenCategories} storeyID={storeyID} sectionHeight={sectionHeight} xray={xray} colorMode={colorMode} showEdges={showEdges} />

          {model && model.storeys.length > 0 && <div className={styles.storeyRail} role="group" aria-label="Tầng">
            {[...model.storeys].reverse().map((storey, index, all) => <button type="button" key={storey.expressID} aria-pressed={storeyID === storey.expressID} aria-label={`Tầng ${storey.name}`} title={`${storey.name}${storey.elevation === null ? "" : ` · ${formatMetres(storey.elevation)}`}`} onClick={() => setStoreyID(storeyID === storey.expressID ? null : storey.expressID)}>{storeyTag(storey.name, all.length - 1 - index)}</button>)}
            <button type="button" aria-pressed={storeyID === null} aria-label="Tất cả tầng" title="Tất cả tầng" onClick={() => setStoreyID(null)}><Layers3 size={15} aria-hidden="true" /></button>
          </div>}

          <TooltipProvider>
            <FloatingButtonGroup label="Công cụ xem mô hình" items={toolbarItems} onAction={onToolbarAction} placement="bottom" className={styles.toolbar} />
          </TooltipProvider>

          {model && <p className={styles.hint}><MousePointerClick size={14} aria-hidden="true" /> Bấm để chọn · kéo để xoay · chuột phải để di chuyển · cuộn để phóng to · F phóng tới cấu kiện · Esc bỏ chọn</p>}

          {!model && !progress && <div className={styles.dropZone}>
            <Upload size={28} aria-hidden="true" />
            <strong>Kéo thả tệp IFC vào đây</strong>
            <span>hoặc dùng nút “Chọn tệp IFC”. Hỗ trợ IFC2X3 và IFC4. Tệp chỉ được xử lý trong trình duyệt.</span>
          </div>}

          {progress && <div className={styles.progress} role="status" aria-live="polite">
            <span>{phaseLabels[progress.phase ?? "geometry"]}</span><strong>{percent}%</strong><i><b style={{ width: `${percent}%` }} /></i>
          </div>}
          {error && <p className={styles.error} role="alert"><AlertTriangle size={16} aria-hidden="true" /> {error}</p>}
        </div>

        {model && heightRange && <div className={styles.sectionCard} data-active={sectionHeight !== null || undefined}>
          <div className={styles.sectionHead}>
            <strong><Scissors size={15} aria-hidden="true" /> Mặt cắt</strong>
            {sectionHeight === null
              ? <Button size="sm" variant="quiet" onClick={toggleSection}>Bật mặt cắt</Button>
              : <span className={styles.sectionValue} title={activeStorey ? `So với sàn ${activeStorey.name}` : "So với sàn tầng trệt"}>Cao {formatMetres(sectionHeight - sectionReference)}<button type="button" aria-label="Tắt mặt cắt" onClick={() => setSectionHeight(null)}><X size={14} aria-hidden="true" /></button></span>}
          </div>
          {sectionHeight !== null && <input type="range" min={heightRange.min} max={heightRange.max} step={0.05} value={sectionHeight} onChange={(event) => setSectionHeight(Number(event.currentTarget.value))} aria-label="Cao độ mặt cắt" />}
        </div>}

        <div className={styles.chips} role="group" aria-label="Lớp hiển thị">
          {model ? visibleCategories.map((category) => {
            const hidden = hiddenCategories.has(category);
            return <button type="button" key={category} aria-pressed={!hidden} onClick={() => toggleCategory(category)} className={styles.chip}>
              <i style={{ background: hex(categoryPalette[category].color) }} aria-hidden="true" />
              <span>{categoryLabels[category]}</span>
              <small>{model.categoryCounts[category]}</small>
              {hidden ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
            </button>;
          }) : <p className={styles.empty} style={{ margin: 0 }}>Bật/tắt tường, sàn, cửa, cầu thang… để nhìn vào bên trong sau khi mở mô hình.</p>}
        </div>
      </div>

      <aside className={styles.side} aria-live="polite">
        <section className={styles.panel} aria-labelledby="ifc-scan-title">
          <div className={styles.panelHead}><h2 id="ifc-scan-title">Kết quả quét</h2>{scan && model && <p title={scan.fileName}>{scan.fileName}{fileSize !== null ? ` · ${formatBytes(fileSize)}` : ""} · {scan.schema}</p>}</div>
          {scan ? <>
            <div className={styles.inventory}>
              {inventoryRows.map(({ kind, label, icon: Icon }) => <button type="button" key={kind} onClick={() => cycleKind(kind)} disabled={!scan.inventory[kind]} title="Bấm nhiều lần để duyệt từng phần tử">
                <Icon size={16} aria-hidden="true" /><span>{label}</span><strong>{scan.inventory[kind]}</strong>
              </button>)}
            </div>
            {scan.suggestion.readyForReview
              ? <p className={styles.ready}><CheckCircle2 size={16} aria-hidden="true" /> Đủ điểm neo (không gian, cầu thang, cửa) để soạn kịch bản. Cửa thoát vẫn phải được xác nhận trong trình soạn.</p>
              : <p className={styles.warning}><AlertTriangle size={16} aria-hidden="true" /> Cần kiểm tra hoặc chọn bổ sung: {scan.suggestion.missingAnchorKinds.map((kind) => anchorLabels[kind]).join(", ")}.</p>}
          </> : <p className={styles.empty}>Scenario cần một không gian nguồn cháy, cầu thang và cửa/lối thoát. Số tầng, tường, cửa và cầu thang hiện ở đây sau khi mở mô hình.</p>}
        </section>

        <section className={styles.panel} aria-labelledby="ifc-selected-title">
          <div className={styles.panelHead}><h2 id="ifc-selected-title">Cấu kiện đang chọn</h2>{details && <p>{details.typeName}{details.name ? ` · ${details.name}` : ""}</p>}</div>
          {details ? <>
            <dl className={styles.props}>
              <div><dt>Loại</dt><dd>{categoryLabels[details.category]} <code>{details.typeName}</code></dd></div>
              {details.objectType && <div><dt>Kiểu</dt><dd>{details.objectType}</dd></div>}
              <div><dt>Tầng</dt><dd>{details.storeyName ?? "—"}</dd></div>
              <div><dt>Kích thước</dt><dd>{details.size ? details.size.map((value) => value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })).join(" × ") + " m" : "Không có hình học"}</dd></div>
              <div><dt>GlobalId</dt><dd className={styles.globalId}><code>{details.globalId ?? "—"}</code>{details.globalId && <button type="button" onClick={() => void copyGlobalId()} aria-label="Sao chép GlobalId"><Copy size={13} aria-hidden="true" />{copied ? "Đã chép" : ""}</button>}</dd></div>
              <div><dt>Số thứ tự trong tệp</dt><dd>#{details.expressID}</dd></div>
            </dl>
            <div className={styles.propActions}>
              <button type="button" onClick={() => viewerRef.current?.focusSelection()}><Focus size={14} aria-hidden="true" /> Phóng tới</button>
              <button type="button" onClick={() => toggleCategory(details.category)}><EyeOff size={14} aria-hidden="true" /> Ẩn loại này</button>
              <button type="button" onClick={() => select(null)}><X size={14} aria-hidden="true" /> Bỏ chọn</button>
            </div>
          </> : <p className={styles.empty}>Bấm vào một phần tử trong mô hình để xem tên, loại, tầng, kích thước và GlobalId.</p>}
        </section>

        {embedded && <section className={`${styles.panel} ${styles.nextStep}`} aria-labelledby="ifc-next-title">
          <p className={styles.nextKicker} id="ifc-next-title"><Sparkles size={13} aria-hidden="true" /> Bước tiếp theo</p>
          <p className={styles.nextText}>Muốn dùng mô hình này cho huấn luyện? Tạo công trình rồi tải IFC lên để hệ thống dựng mô hình 3D và kiểm tra tự động, sau đó soạn kịch bản và phát hành.</p>
          <Button asChild><Link href={routes.workspaceBuildings}>Tới danh sách công trình <ArrowRight size={15} aria-hidden="true" /></Link></Button>
        </section>}
      </aside>
    </div>
  </section>;
}
