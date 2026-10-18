"use client";

import {
  AlertTriangle, ArrowRight, Box, BoxSelect, BrickWall, CheckCircle2, Copy, DoorOpen, Eye, EyeOff, Focus, Layers3, Maximize2, Minimize2,
  MousePointerClick, Palette, RotateCcw, Scissors, ScanEye, Sparkles, Spline, SquareDashed, Upload, Waypoints, X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { routes } from "@/configs/routes";
import type { IfcLoadProgress, LoadedIfcModel } from "../ifc-loader";
import type { IfcCategory, IfcElementDetails, IfcElementKind, IfcSceneScan, ScenarioAnchorKind } from "../types";
import { categoryPalette, IfcViewer, type IfcColorMode, type IfcViewerHandle } from "./ifc-viewer";
import styles from "./ifc-scan.module.css";

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
const phaseLabels = { parse: "Đang đọc cấu trúc IFC", geometry: "Đang dựng hình học", edges: "Đang dựng nét viền" } as const;

function safeErrorMessage(error: unknown) {
  // The IFC parser reports in English: lead with a Vietnamese explanation and keep its text only as a technical detail.
  const detail = error instanceof Error && error.message ? ` Chi tiết kỹ thuật: ${error.message.slice(0, 200)}` : "";
  return `Không thể đọc tệp IFC này. Kiểm tra tệp có đúng định dạng IFC và không bị hỏng, rồi thử lại.${detail}`;
}

function formatMetres(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} m`;
}

function hex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

type IfcScanWorkspaceProps = {
  embedded?: boolean;
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function IfcScanWorkspace({
  embedded = false,
  eyebrow = "IFC / local prototype",
  title = "Quét mô hình IFC",
  description = "Đọc mô hình thực ngay trên máy của bạn, nhận diện các điểm neo và kiểm tra mức sẵn sàng cho kịch bản thoát nạn mẫu.",
}: IfcScanWorkspaceProps) {
  const [model, setModel] = useState<LoadedIfcModel | null>(null);
  const [scan, setScan] = useState<IfcSceneScan | null>(null);
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

  const sectionReference = (storeyID !== null ? model?.storeyLevels.get(storeyID) : undefined) ?? heightRange?.firstLevel ?? 0;
  const percent = progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const activeStorey = model?.storeys.find((storey) => storey.expressID === storeyID) ?? null;
  const visibleCategories = model ? categoryOrder.filter((category) => model.categoryCounts[category] > 0) : [];

  return <section className={`${styles.workspace} ${embedded ? styles.embedded : ""}`}>
    <header className={styles.hero}>
      <p className="kicker"><span className="kicker-line" /> {eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>

    <div className={styles.fileBar}>
      <label className={styles.uploadButton}>
        <Upload size={17} />
        <span>Chọn tệp IFC</span>
        <input aria-label="Chọn tệp IFC" type="file" accept=".ifc" onChange={handleFileChange} />
      </label>
      {scan && model ? <div className={styles.fileMeta}>
        <strong title={scan.fileName}>{scan.fileName}</strong>
        <span>Schema {scan.schema} · {model.storeys.length} tầng · {model.meshes.length.toLocaleString("vi-VN")} khối · {Math.round(model.triangleCount).toLocaleString("vi-VN")} tam giác</span>
      </div> : <p className={styles.localNote}><CheckCircle2 size={15} /> File chỉ được xử lý trong trình duyệt này.</p>}
      {scan && <p className={`${styles.localNote} ${styles.localNoteInline}`}><CheckCircle2 size={15} /> Chỉ xử lý trong trình duyệt</p>}
    </div>

    <div className={styles.layout}>
      <aside className={styles.leftRail} aria-label="Tầng và lớp hiển thị">
        <section className={styles.panel}>
          <div className={styles.panelHeading}><Layers3 size={17} /><div><p>Tầng</p><h2>{activeStorey ? activeStorey.name : "Toàn bộ công trình"}</h2></div></div>
          {model?.storeys.length ? <div className={styles.storeyList}>
            <button type="button" aria-pressed={storeyID === null} onClick={() => setStoreyID(null)}><span>Tất cả tầng</span><small>{model.meshes.length}</small></button>
            {[...model.storeys].reverse().map((storey) => <button type="button" key={storey.expressID} aria-pressed={storeyID === storey.expressID} onClick={() => setStoreyID(storey.expressID)}>
              <span>{storey.name}</span><small>{storey.elevation === null ? "—" : formatMetres(storey.elevation)}</small>
            </button>)}
          </div> : <p className={styles.empty}>{model ? "Tệp không khai báo IfcBuildingStorey." : "Danh sách tầng hiện khi mở mô hình."}</p>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><Eye size={17} /><div><p>Lớp hiển thị</p><h2>Loại phần tử</h2></div></div>
          {model ? <div className={styles.categoryList}>
            {visibleCategories.map((category) => {
              const hidden = hiddenCategories.has(category);
              return <button type="button" key={category} aria-pressed={!hidden} onClick={() => toggleCategory(category)} className={hidden ? styles.off : ""}>
                <i style={{ background: hex(categoryPalette[category].color) }} />
                <span>{categoryLabels[category]}</span>
                <small>{model.categoryCounts[category]}</small>
                {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>;
            })}
          </div> : <p className={styles.empty}>Bật/tắt tường, sàn, cửa, cầu thang… để nhìn vào bên trong.</p>}
        </section>
      </aside>

      <div ref={stageRef} className={`${styles.stage} ${fullscreen ? styles.stageFullscreen : ""} ${dragging ? styles.dragging : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void openFile(event.dataTransfer.files?.[0]); }}>
        <IfcViewer ref={viewerRef} model={model} selectedExpressID={selectedExpressID} onSelect={select}
          hiddenCategories={hiddenCategories} storeyID={storeyID} sectionHeight={sectionHeight} xray={xray} colorMode={colorMode} showEdges={showEdges} />

        <div className={styles.toolRail} role="toolbar" aria-label="Công cụ xem mô hình">
          <button type="button" title="Góc nhìn 3D" aria-label="Góc nhìn 3D" onClick={() => viewerRef.current?.setView("iso")} disabled={!model}><Box size={17} /></button>
          <button type="button" title="Nhìn từ trên xuống (mặt bằng)" aria-label="Nhìn từ trên xuống" onClick={() => viewerRef.current?.setView("top")} disabled={!model}><SquareDashed size={17} /></button>
          <button type="button" title="Mặt đứng" aria-label="Mặt đứng" onClick={() => viewerRef.current?.setView("front")} disabled={!model}><BoxSelect size={17} /></button>
          <span className={styles.toolDivider} />
          <button type="button" title="Mặt cắt ngang" aria-label="Mặt cắt ngang" aria-pressed={sectionHeight !== null} onClick={toggleSection} disabled={!model}><Scissors size={17} /></button>
          <button type="button" title="X-quang (nhìn xuyên)" aria-label="Chế độ nhìn xuyên" aria-pressed={xray} onClick={() => setXray((value) => !value)} disabled={!model}><ScanEye size={17} /></button>
          <button type="button" title="Nét viền" aria-label="Nét viền" aria-pressed={showEdges} onClick={() => setShowEdges((value) => !value)} disabled={!model}><Spline size={17} /></button>
          <button type="button" title={colorMode === "category" ? "Đang tô màu theo loại — đổi sang màu trong IFC" : "Đang dùng màu IFC — đổi sang màu theo loại"} aria-label="Đổi cách tô màu" aria-pressed={colorMode === "ifc"} onClick={() => setColorMode((value) => value === "category" ? "ifc" : "category")} disabled={!model}><Palette size={17} /></button>
          <span className={styles.toolDivider} />
          <button type="button" title="Đặt lại góc nhìn" aria-label="Đặt lại góc nhìn" onClick={() => viewerRef.current?.resetView()} disabled={!model}><RotateCcw size={17} /></button>
          <button type="button" title={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"} aria-label="Toàn màn hình" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
        </div>

        {model && <p className={styles.hint}><MousePointerClick size={14} /> Bấm để chọn · kéo để xoay · chuột phải để di chuyển · cuộn để phóng to · F focus · Esc bỏ chọn</p>}

        {sectionHeight !== null && heightRange && <label className={styles.sectionBar}>
          <Scissors size={15} />
          <span>Cao độ cắt</span>
          <input type="range" min={heightRange.min} max={heightRange.max} step={0.05} value={sectionHeight} onChange={(event) => setSectionHeight(Number(event.currentTarget.value))} aria-label="Cao độ mặt cắt" />
          <strong title={activeStorey ? `So với sàn ${activeStorey.name}` : "So với sàn tầng trệt"}>{formatMetres(sectionHeight - sectionReference)}</strong>
          <button type="button" aria-label="Tắt mặt cắt" onClick={() => setSectionHeight(null)}><X size={14} /></button>
        </label>}

        {!model && !progress && <div className={styles.dropZone}>
          <Upload size={28} />
          <strong>Kéo thả tệp IFC vào đây</strong>
          <span>hoặc dùng nút “Chọn tệp IFC”. Hỗ trợ IFC2X3 và IFC4.</span>
        </div>}

        {progress && <div className={styles.progress} role="status" aria-live="polite">
          <span>{phaseLabels[progress.phase ?? "geometry"]}</span><strong>{percent}%</strong><i><b style={{ width: `${percent}%` }} /></i>
        </div>}
        {error && <p className={styles.error} role="alert"><AlertTriangle size={16} /> {error}</p>}
      </div>

      <aside className={styles.rightRail} aria-live="polite">
        <section className={styles.panel}>
          <div className={styles.panelHeading}><Focus size={17} /><div><p>Phần tử đang chọn</p><h2>{details ? details.name ?? categoryLabels[details.category] : "Chưa chọn"}</h2></div></div>
          {details ? <>
            <dl className={styles.props}>
              <div><dt>Loại</dt><dd>{categoryLabels[details.category]} <code>{details.typeName}</code></dd></div>
              {details.objectType && <div><dt>Kiểu</dt><dd>{details.objectType}</dd></div>}
              <div><dt>Tầng</dt><dd>{details.storeyName ?? "—"}</dd></div>
              <div><dt>Kích thước</dt><dd>{details.size ? details.size.map((value) => value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })).join(" × ") + " m" : "Không có hình học"}</dd></div>
              <div><dt>GlobalId</dt><dd className={styles.globalId}><code>{details.globalId ?? "—"}</code>{details.globalId && <button type="button" onClick={() => void copyGlobalId()} aria-label="Sao chép GlobalId"><Copy size={13} />{copied ? "Đã chép" : ""}</button>}</dd></div>
              <div><dt>Express ID</dt><dd>#{details.expressID}</dd></div>
            </dl>
            <div className={styles.propActions}>
              <button type="button" onClick={() => viewerRef.current?.focusSelection()}><Focus size={14} /> Focus</button>
              <button type="button" onClick={() => toggleCategory(details.category)}><EyeOff size={14} /> Ẩn loại này</button>
              <button type="button" onClick={() => select(null)}><X size={14} /> Bỏ chọn</button>
            </div>
          </> : <p className={styles.empty}>Bấm vào một phần tử trong mô hình để xem tên, loại, tầng, kích thước và GlobalId.</p>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><Sparkles size={17} /><div><p>Kết quả quét · gợi ý scenario</p><h2>Thoát nạn cơ bản</h2></div></div>
          {scan ? <>
            <div className={styles.inventory}>
              {inventoryRows.map(({ kind, label, icon: Icon }) => <button type="button" key={kind} onClick={() => cycleKind(kind)} disabled={!scan.inventory[kind]} title="Bấm nhiều lần để duyệt từng phần tử">
                <Icon size={16} /><span>{label}</span><strong>{scan.inventory[kind]}</strong>
              </button>)}
            </div>
            {scan.suggestion.readyForReview
              ? <p className={styles.ready}><CheckCircle2 size={16} /> Đủ điểm neo (không gian, cầu thang, cửa) để soạn kịch bản. Cửa thoát vẫn phải được xác nhận trong trình soạn.</p>
              : <p className={styles.warning}><AlertTriangle size={16} /> Cần kiểm tra hoặc chọn bổ sung: {scan.suggestion.missingAnchorKinds.map((kind) => anchorLabels[kind]).join(", ")}.</p>}
          </> : <p className={styles.empty}>Scenario cần một không gian nguồn cháy, cầu thang và cửa/lối thoát. Mỗi điểm vẫn phải do người quản lý xác nhận.</p>}
        </section>

        {embedded && <section className={`${styles.panel} ${styles.nextStep}`}>
          <div className={styles.panelHeading}><ArrowRight size={17} /><div><p>Bước tiếp theo</p><h2>Đưa vào bài tập huấn</h2></div></div>
          <ol>
            <li>Tải IFC lên một công trình để hệ thống dựng hình học và kiểm tra QA.</li>
            <li>Mở trình soạn kịch bản: xác nhận cửa thoát, đặt điểm xuất phát, nguồn cháy và thiết bị.</li>
            <li>Chạy thử, gửi duyệt rồi phát hành để học viên quét QR.</li>
          </ol>
          <Link className={styles.nextLink} href={routes.workspaceBuildings}>Mở danh sách công trình <ArrowRight size={15} /></Link>
        </section>}
      </aside>
    </div>
  </section>;
}
