"use client";

import { AlertTriangle, Box, BrickWall, CheckCircle2, DoorOpen, Layers3, RotateCcw, Sparkles, Upload, Waypoints } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LoadedIfcModel } from "../ifc-loader";
import type { IfcElementKind, IfcSceneScan, ScenarioAnchorKind } from "../types";
import { IfcViewer, type IfcViewerHandle } from "./ifc-viewer";
import styles from "./ifc-scan.module.css";

const inventoryRows: { kind: IfcElementKind; label: string; icon: typeof BrickWall }[] = [
  { kind: "storey", label: "Tầng", icon: Layers3 },
  { kind: "wall", label: "Tường", icon: BrickWall },
  { kind: "exit", label: "Cửa / lối ra", icon: DoorOpen },
  { kind: "stair", label: "Cầu thang", icon: Waypoints },
  { kind: "room", label: "Không gian", icon: Box },
];

const anchorLabels: Record<ScenarioAnchorKind, string> = { room: "không gian nguồn cháy", stair: "cầu thang", exit: "cửa / lối thoát" };

function safeErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Không thể đọc tệp IFC này.";
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
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<IfcViewerHandle>(null);

  useEffect(() => () => { model?.dispose(); }, [model]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setError(null);
    setSelectedExpressID(null);
    if (!file.name.toLowerCase().endsWith(".ifc") || file.size === 0) {
      setProgress(null);
      setError("Hãy chọn một tệp IFC (.ifc) không rỗng.");
      return;
    }

    try {
      setProgress({ completed: 0, total: 1 });
      const { loadIfcFile } = await import("../ifc-loader");
      const loaded = await loadIfcFile(file, setProgress);
      setModel(loaded);
      setScan(loaded.scan);
    } catch (loadError) {
      setProgress(null);
      setError(safeErrorMessage(loadError));
    }
  }

  const percent = progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const selectedElement = scan?.elements.find((element) => element.expressID === selectedExpressID) ?? null;

  return <section className={`${styles.workspace} ${embedded ? styles.embedded : ""}`}>
    <header className={styles.hero}>
      <p className="kicker"><span className="kicker-line" /> {eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>

    <div className={styles.layout}>
      <div className={styles.viewerPanel}>
        <IfcViewer ref={viewerRef} model={model} selectedExpressID={selectedExpressID} />
        <div className={styles.viewerToolbar}>
          <label className={styles.uploadButton}>
            <Upload size={17} />
            <span>Chọn tệp IFC</span>
            <input aria-label="Chọn tệp IFC" type="file" accept=".ifc" onChange={handleFileChange} />
          </label>
          <Button variant="quiet" type="button" onClick={() => viewerRef.current?.resetView()} disabled={!model}>
            <RotateCcw size={16} /> Đặt lại góc nhìn
          </Button>
        </div>
        <p className={styles.localNote}><CheckCircle2 size={15} /> File chỉ được xử lý trong trình duyệt này.</p>
        {progress && <div className={styles.progress} role="status" aria-live="polite"><span>Đang dựng hình học IFC</span><strong>{percent}%</strong><i><b style={{ width: `${percent}%` }} /></i></div>}
        {error && <p className={styles.error} role="alert"><AlertTriangle size={16} /> {error}</p>}
      </div>

      <aside className={styles.sidebar} aria-live="polite">
        <section className={styles.panel}>
          <div className={styles.panelHeading}><Layers3 size={18} /><div><p>01 / Kết quả quét</p><h2>{scan ? scan.fileName : "Chưa có mô hình"}</h2></div></div>
          {scan ? <>
            <p className={styles.schema}>Schema {scan.schema} · {scan.elements.length} phần tử đã nhận diện</p>
            <div className={styles.inventory}>
              {inventoryRows.map(({ kind, label, icon: Icon }) => <button type="button" key={kind} onClick={() => setSelectedExpressID(scan.elements.find((element) => element.kind === kind)?.expressID ?? null)} disabled={!scan.inventory[kind]}>
                <Icon size={16} /><span>{label}</span><strong>{scan.inventory[kind]}</strong>
              </button>)}
            </div>
          </> : <p className={styles.empty}>Chọn một tệp IFC để xem cấu trúc mô hình và các điểm neo có thể dùng cho scenario.</p>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><Sparkles size={18} /><div><p>02 / Gợi ý scenario</p><h2>Thoát nạn cơ bản</h2></div></div>
          {scan ? <>
            {scan.suggestion.readyForReview ? <p className={styles.ready}><CheckCircle2 size={16} /> Đủ điểm neo để đưa vào bước người dùng duyệt scenario.</p> : <p className={styles.warning}><AlertTriangle size={16} /> Cần kiểm tra hoặc chọn bổ sung: {scan.suggestion.missingAnchorKinds.map((kind) => anchorLabels[kind]).join(", ")}.</p>}
            <div className={styles.anchors}>
              {scan.suggestion.anchors.map((anchor) => <button type="button" key={anchor.expressID} onClick={() => setSelectedExpressID(anchor.expressID)}>#{anchor.expressID} · {anchorLabels[anchor.kind as ScenarioAnchorKind]}</button>)}
            </div>
          </> : <p className={styles.empty}>Scenario sẽ cần một không gian nguồn cháy, cầu thang và cửa/lối thoát. Mỗi điểm vẫn phải do người quản lý xác nhận.</p>}
        </section>

        {selectedElement && <section className={styles.selection}><p>Đang chọn IFC #{selectedElement.expressID}</p><strong>{selectedElement.typeName}</strong><span>{selectedElement.bounds ? "Đã focus trong mô hình" : "Không có hình học hiển thị để focus"}</span></section>}
      </aside>
    </div>
  </section>;
}
