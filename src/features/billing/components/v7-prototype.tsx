"use client";

import { Gauge, Layers, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/panel";
import "../billing.css";

/**
 * Prototype for Docs v7 commercial features (no API yet, BE#56). Local sample data only, rendered when
 * NODE_ENV !== "production" by `V7PendingBlock`. Nothing here calls the network or claims a result.
 */
const SAMPLE = {
  packageName: "Gói mẫu v7 · 12 tháng",
  learnerLimit: 60,
  seatsUsed: 34,
  aiGranted: 10000,
  aiReserved: 250,
  aiUsed: 3720,
  endsAt: "31/12/2026",
  upgradeTargets: ["Gói mẫu v7 · 12 tháng · 100 học viên", "Gói mẫu v7 · 12 tháng · 200 học viên"],
  topUpPacks: [2000, 5000, 10000],
};

export function V7Prototype() {
  const [preview, setPreview] = useState<"upgrade" | "topup" | null>(null);
  const [target, setTarget] = useState(SAMPLE.upgradeTargets[0]);
  const [pack, setPack] = useState(SAMPLE.topUpPacks[0]);
  const remaining = SAMPLE.aiGranted - SAMPLE.aiReserved - SAMPLE.aiUsed;
  const seatPercent = Math.round((SAMPLE.seatsUsed / SAMPLE.learnerLimit) * 100);

  return <div className="bill-proto" data-testid="v7-prototype">
    <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: 0 }}>
      <span className="ops-proto">Dữ liệu mẫu</span>
      <span className="bill-dim">Giao diện thiết kế cho Docs v7, không gọi API, không phải bằng chứng tích hợp, không có trong bản production.</span>
    </p>
    <div className="bill-stats">
      <Stat label="Gói hiện có (mẫu)" value={SAMPLE.packageName} hint={`Kỳ đến ${SAMPLE.endsAt}`} />
      <Stat label="Suất học viên (mẫu)" value={`${SAMPLE.seatsUsed}/${SAMPLE.learnerLimit}`} hint="Đếm Trainee duy nhất ở lần bắt đầu online đầu tiên" />
      <Stat label="Quota AI còn lại (mẫu)" value={remaining.toLocaleString("vi-VN")} hint="Đơn vị quota do chính sách BE quy định" />
    </div>

    <div className="ops-stack">
      <div className="bill-row"><span className="ops-field-label"><Users size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Suất học viên theo kỳ</span><span className="bill-dim">{seatPercent}% đã dùng</span></div>
      <div className="bill-meter" role="img" aria-label={`Đã dùng ${SAMPLE.seatsUsed} trên ${SAMPLE.learnerLimit} suất (dữ liệu mẫu)`}><span style={{ width: `${seatPercent}%` }} /></div>
      <div className="bill-row"><span className="ops-field-label"><Gauge size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Quota AI dùng chung của tổ chức (trả trước)</span><span className="bill-dim">Đã cấp {SAMPLE.aiGranted.toLocaleString("vi-VN")} · giữ chỗ {SAMPLE.aiReserved} · đã dùng {SAMPLE.aiUsed.toLocaleString("vi-VN")}</span></div>
      <div className="bill-meter" role="img" aria-label="Mức dùng quota AI (dữ liệu mẫu)"><span style={{ width: `${Math.round(((SAMPLE.aiUsed + SAMPLE.aiReserved) / SAMPLE.aiGranted) * 100)}%` }} /></div>
      <p className="bill-muted">Hết quota thì phải thanh toán top-up trước khi dùng tiếp: không tính vượt mức, không nợ, không kỳ thanh toán AI trả sau.</p>
    </div>

    <div className="ops-grid ops-grid-2">
      <div className="ops-stack">
        <p className="ops-field-label"><Layers size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Nâng cấp gói (Upgrade)</p>
        <label className="ops-field"><span className="ops-field-hint">Gói đích (mẫu)</span>
          <select className="ops-input" value={target} onChange={(event) => setTarget(event.target.value)}>{SAMPLE.upgradeTargets.map((item) => <option key={item}>{item}</option>)}</select></label>
        <Button variant="secondary" onClick={() => setPreview(preview === "upgrade" ? null : "upgrade")}>Xem trước luồng nâng cấp</Button>
      </div>
      <div className="ops-stack">
        <p className="ops-field-label"><Sparkles size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Mua thêm quota AI (top-up)</p>
        <label className="ops-field"><span className="ops-field-hint">Gói top-up (mẫu)</span>
          <select className="ops-input" value={pack} onChange={(event) => setPack(Number(event.target.value))}>{SAMPLE.topUpPacks.map((item) => <option key={item} value={item}>{item.toLocaleString("vi-VN")} đơn vị</option>)}</select></label>
        <Button variant="secondary" onClick={() => setPreview(preview === "topup" ? null : "topup")}>Xem trước luồng top-up</Button>
      </div>
    </div>

    {preview === "upgrade" && <Alert tone="info" title="Luồng nâng cấp dự kiến (mô phỏng, chưa gọi API)">Dòng báo giá hành động <code>Upgrade</code> kèm <code>upgradeEntitlementId</code> → PlatformAdmin phát hành → tổ chức chấp nhận → PayOS → kích hoạt. Nâng cấp giữ nguyên kỳ và các suất đã dùng; giá nâng cấp do BE tính và trả trong snapshot, FE không tự tính. Đang chọn: {target}.</Alert>}
    {preview === "topup" && <Alert tone="info" title="Luồng top-up dự kiến (mô phỏng, chưa gọi API)">Báo giá và thanh toán riêng cho quota AI, không gia hạn dịch vụ Building; sau khi PayOS xác nhận, grant quota được cấp một lần (replay không cấp lại). Đang chọn: {pack.toLocaleString("vi-VN")} đơn vị.</Alert>}
  </div>;
}
