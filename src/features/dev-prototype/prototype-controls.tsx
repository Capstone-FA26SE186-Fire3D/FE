"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { sampleModeLabels, type SampleMode } from "./use-sample-query";

/** Toolbar that lets a reviewer force loading/empty/error states and reset the sample store. */
export function PrototypeControls({ mode, onModeChange, onReset, children }: { mode: SampleMode; onModeChange: (mode: SampleMode) => void; onReset: () => void; children?: ReactNode }) {
  return <div className="ops-toolbar" role="group" aria-label="Điều khiển dữ liệu mẫu" style={{ margin: "12px 0 16px" }}>
    <label className="ops-field-hint" htmlFor="sample-mode">Mô phỏng</label>
    <Select id="sample-mode" style={{ width: 230 }} value={mode} onChange={(event) => onModeChange(event.target.value as SampleMode)}>
      {(Object.keys(sampleModeLabels) as SampleMode[]).map((value) => <option key={value} value={value}>{sampleModeLabels[value]}</option>)}
    </Select>
    {children}
    <Button type="button" size="sm" variant="quiet" onClick={onReset}><RotateCcw size={14} aria-hidden="true" />Đặt lại dữ liệu mẫu</Button>
  </div>;
}
