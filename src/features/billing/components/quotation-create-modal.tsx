"use client";

import { FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/api";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { buildingsApi } from "@/features/buildings/api";
import { billingApi } from "../api";
import { hasPaidHistory } from "../entitlements";
import { billingErrorText } from "../errors";
import { formatNumber } from "../format";
import type { Entitlement, Quotation, QuotationDraftInput, QuotationItemInput, WithEtag } from "../types";
import { PackagePicker, sellablePackages } from "./package-picker";
import "../billing.css";

export type CreateMode = "service" | "upgrade" | "topup";

const MAX_LINES = 100;
const NONE: string[] = [];
type AddressState = "checking" | "ok" | "missing" | "error";
type UpgradeState = { state: "loading" | "ok" | "none" | "error"; entitlementId?: string; effectiveLimit?: number | null };

const titles: Record<CreateMode, string> = { service: "Mua mới hoặc gia hạn", upgrade: "Nâng cấp số học viên", topup: "Mua thêm quota AI (top-up)" };
const descriptions: Record<CreateMode, string> = {
  service: "Chọn công trình và gói 6 hoặc 12 tháng. Giá, giảm giá và kỳ dịch vụ do hệ thống tính ở báo giá; gia hạn mở kỳ mới.",
  upgrade: "Tăng số học viên của kỳ đang hiệu lực. Kỳ và các suất đã dùng được giữ; phí nâng cấp một lần do PlatformAdmin ấn định ở báo giá.",
  topup: "Quota AI trả trước dùng chung cho tổ chức. Hết quota thì phải mua thêm trước khi dùng tiếp; không tính vượt mức, không nợ.",
};

/**
 * One modal (Figma "Tạo báo giá", every create form is a Modal) for every quotation an organization can start: New/Renewal
 * (1..100 Buildings), Upgrade (Buildings with a current paid period) and AI quota top-up. It only sends the intent; the BE
 * prices every line and returns the snapshot.
 */
export function QuotationCreateModal({ open, onOpenChange, accessToken, mode, onModeChange, lockedBuildingId, preselect = NONE, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  mode: CreateMode;
  onModeChange: (mode: CreateMode) => void;
  /** Building detail: only this Building can be chosen. */
  lockedBuildingId?: string;
  preselect?: string[];
  onCreated: (quotation: WithEtag<Quotation>) => void;
}) {
  const toast = useToast();
  const createKey = useIdempotencyKey();
  const lock = useRef(false);

  const buildings = useAsyncData("billing:buildings", (signal) => buildingsApi.list(accessToken, { isActive: true, page: 1, pageSize: 100 }, signal), open && mode !== "topup");
  const packages = useAsyncData("billing:packages", (signal) => billingApi.listPackages(accessToken, signal), open && mode !== "topup");
  const entitlements = useAsyncData("billing:entitlements:all", (signal) => billingApi.listEntitlements(accessToken, { pageSize: 100 }, signal), open && mode !== "topup");

  const [chosen, setChosen] = useState<{ ids: string[]; seeded: boolean }>({ ids: [], seeded: false });
  const [packageId, setPackageId] = useState("");
  const [topUpUnits, setTopUpUnits] = useState("");
  const [addresses, setAddresses] = useState<Record<string, AddressState>>({});
  const [upgrades, setUpgrades] = useState<Record<string, UpgradeState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);

  const picked = useMemo(() => (chosen.seeded ? chosen.ids : lockedBuildingId ? [lockedBuildingId] : preselect), [chosen, lockedBuildingId, preselect]);
  const buildingItems = useMemo(() => (buildings.data?.items ?? []).filter((item) => !lockedBuildingId || item.id === lockedBuildingId), [buildings.data, lockedBuildingId]);
  const byBuilding = useMemo(() => {
    const map = new Map<string, Entitlement[]>();
    for (const item of entitlements.data?.items ?? []) map.set(item.buildingId, [...(map.get(item.buildingId) ?? []), item]);
    return map;
  }, [entitlements.data]);
  const sellable = useMemo(() => sellablePackages(packages.data), [packages.data]);

  const checkAddress = useCallback(async (id: string) => {
    setAddresses((state) => ({ ...state, [id]: "checking" }));
    try {
      const detail = await buildingsApi.get(accessToken, id);
      setAddresses((state) => ({ ...state, [id]: detail.location?.address?.trim() && detail.name.trim() ? "ok" : "missing" }));
    } catch {
      setAddresses((state) => ({ ...state, [id]: "error" }));
    }
  }, [accessToken]);

  const checkUpgrade = useCallback(async (id: string) => {
    setUpgrades((state) => ({ ...state, [id]: { state: "loading" } }));
    try {
      const view = await billingApi.getBuildingServiceEntitlement(accessToken, id);
      setUpgrades((state) => ({ ...state, [id]: view.current?.isEffective ? { state: "ok", entitlementId: view.current.entitlementId, effectiveLimit: view.current.effectiveLearnerLimit } : { state: "none" } }));
    } catch {
      setUpgrades((state) => ({ ...state, [id]: { state: "error" } }));
    }
  }, [accessToken]);

  // Verify name/address (and upgrade eligibility) of Buildings that are pre-selected when the modal opens.
  const known = useRef({ addresses, upgrades });
  useEffect(() => { known.current = { addresses, upgrades }; });
  const pickedKey = picked.join(",");
  useEffect(() => {
    if (!open || mode === "topup" || !pickedKey) return;
    const timer = window.setTimeout(() => {
      for (const id of pickedKey.split(",")) {
        if (!known.current.addresses[id]) void checkAddress(id);
        if (mode === "upgrade" && !known.current.upgrades[id]) void checkUpgrade(id);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, mode, pickedKey, checkAddress, checkUpgrade]);

  const setPicked = (ids: string[]) => setChosen({ ids, seeded: true });
  const toggle = (id: string) => {
    setError(null);
    if (picked.includes(id)) { setPicked(picked.filter((item) => item !== id)); return; }
    if (picked.length >= MAX_LINES) return;
    setPicked([...picked, id]);
    if (!addresses[id] || addresses[id] === "error") void checkAddress(id);
    if (mode === "upgrade" && (!upgrades[id] || upgrades[id].state === "error")) void checkUpgrade(id);
  };

  const missing = picked.filter((id) => addresses[id] === "missing");
  const checking = picked.some((id) => addresses[id] === "checking" || (mode === "upgrade" && upgrades[id]?.state === "loading"));
  const noUpgrade = mode === "upgrade" ? picked.filter((id) => upgrades[id]?.state === "none" || upgrades[id]?.state === "error") : [];
  const highestCurrent = mode === "upgrade" ? Math.max(0, ...picked.map((id) => upgrades[id]?.effectiveLimit ?? 0)) : 0;

  const topUpValue = topUpUnits.trim();
  const topUpInvalid = topUpValue !== "" && (!/^\d+$/.test(topUpValue) || Number(topUpValue) < 1 || Number(topUpValue) > 2_147_483_647);
  const canSubmit = !submitting && (mode === "topup"
    ? !topUpInvalid
    : picked.length > 0 && Boolean(packageId) && missing.length === 0 && noUpgrade.length === 0 && !checking);

  const reset = () => { setChosen({ ids: [], seeded: false }); setPackageId(""); setTopUpUnits(""); setError(null); };

  const submit = async () => {
    if (lock.current || !canSubmit) return;
    lock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let payload: QuotationItemInput[] | QuotationDraftInput;
      if (mode === "topup") payload = { purpose: "AIQuotaTopUp", topUp: { requestedQuotaUnits: topUpValue ? Number(topUpValue) : null } };
      else if (mode === "upgrade") payload = [...picked].sort().map((buildingId) => ({ buildingId, servicePackageId: packageId, purchaseAction: "Upgrade" as const, upgradeEntitlementId: upgrades[buildingId]?.entitlementId }));
      else payload = [...picked].sort().map((buildingId) => ({ buildingId, servicePackageId: packageId, purchaseAction: hasPaidHistory(byBuilding.get(buildingId) ?? []) ? ("Renewal" as const) : ("New" as const) }));
      // Same payload => same key, so a double click or a retry after a timeout replays one quotation.
      const result = await billingApi.createQuotation(accessToken, payload, createKey.keyFor(payload));
      createKey.done();
      reset();
      onOpenChange(false);
      onCreated(result);
      toast.notify({ tone: "success", title: "Đã tạo báo giá nháp", description: "Giá do hệ thống tính. PlatformAdmin cần phát hành báo giá trước khi bạn chấp nhận." });
    } catch (cause) {
      setError({ message: billingErrorText(cause), details: cause instanceof ApiError ? cause.fieldErrors.map((item) => item.message) : [] });
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };

  const modes: Array<{ id: CreateMode; label: string }> = [{ id: "service", label: "Mua mới / gia hạn" }, { id: "upgrade", label: "Nâng cấp" }, { id: "topup", label: "Quota AI" }];
  const submitLabel = mode === "topup" ? "Tạo báo giá top-up" : `Tạo báo giá (${picked.length})`;

  return <Modal open={open} onOpenChange={(next) => { if (!next && submitting) return; onOpenChange(next); }} size="lg" title={lockedBuildingId ? titles[mode] : "Tạo báo giá"} description={descriptions[mode]} data-testid="quotation-create"
    footer={<><Button variant="quiet" onClick={() => onOpenChange(false)} disabled={submitting}>Hủy</Button><Button onClick={() => void submit()} disabled={!canSubmit}>{submitting ? "Đang tạo…" : submitLabel}</Button></>}>
    <div className="ops-stack">
      {!lockedBuildingId && <div role="radiogroup" aria-label="Loại báo giá" className="bill-segment">
        {modes.map((item) => <button key={item.id} type="button" role="radio" aria-checked={mode === item.id} data-active={mode === item.id} onClick={() => { setError(null); setPackageId(""); onModeChange(item.id); }}>{item.label}</button>)}
      </div>}

      {mode === "topup" ? <fieldset className="ops-fieldset"><legend>Quota AI trả trước</legend>
        <Field label="Số lượng muốn mua" hint="Có thể để trống. Đơn vị do chính sách quota quy định; PlatformAdmin chốt số lượng, giá, khoảng hiệu lực, thuế và điều khoản khi phát hành." error={topUpInvalid ? "Nhập số nguyên dương hoặc để trống." : undefined}>{(p) => <Input {...p} inputMode="numeric" value={topUpUnits} onChange={(event) => { setTopUpUnits(event.target.value); setError(null); }} />}</Field>
        <p className="bill-muted">Top-up chỉ cấp quota cho tổ chức, không gia hạn hay nâng cấp công trình. Chưa phát sinh thanh toán cho tới khi bạn chấp nhận báo giá đã phát hành.</p>
      </fieldset> : <>
        <fieldset className="ops-fieldset"><legend>1. Công trình</legend>
          {buildings.loading && !buildings.data && <SkeletonRows rows={3} label="Đang tải công trình…" />}
          {buildings.error !== undefined && <Alert tone="danger" title="Không tải được công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={buildings.reload}>Thử lại</Button>}>{billingErrorText(buildings.error)}</Alert>}
          {buildings.data && buildingItems.length === 0 && <EmptyState icon={FileText} title="Chưa có công trình" description="Tạo công trình (tên và địa chỉ) trước khi mua dịch vụ." />}
          {buildingItems.length > 0 && <div className="bill-picker" role="group" aria-label="Chọn công trình">
            {buildingItems.map((building) => {
              const state = addresses[building.id];
              const up = upgrades[building.id];
              const checked = picked.includes(building.id);
              const action = hasPaidHistory(byBuilding.get(building.id) ?? []) ? "Gia hạn" : "Mua mới";
              return <label key={building.id} aria-disabled={!checked && picked.length >= MAX_LINES}>
                <input type="checkbox" checked={checked} onChange={() => toggle(building.id)} disabled={lockedBuildingId ? true : !checked && picked.length >= MAX_LINES} />
                <span><strong>{building.name}</strong> <span className="bill-dim">· {mode === "upgrade" ? "Nâng cấp" : action}</span>
                  {checked && state === "checking" && <small className="bill-dim" style={{ display: "block" }}>Đang kiểm tra địa chỉ…</small>}
                  {checked && state === "missing" && <small style={{ display: "block", color: "var(--warning)" }}>Thiếu tên hoặc địa chỉ. Bổ sung trong thông tin công trình trước khi mua.</small>}
                  {checked && state === "error" && <small style={{ display: "block", color: "var(--danger)" }}>Không kiểm tra được địa chỉ. Bỏ chọn rồi chọn lại.</small>}
                  {checked && mode === "upgrade" && up?.state === "loading" && <small className="bill-dim" style={{ display: "block" }}>Đang đọc kỳ dịch vụ hiện tại…</small>}
                  {checked && mode === "upgrade" && up?.state === "ok" && <small className="bill-dim" style={{ display: "block" }}>Mức hiện tại: {up.effectiveLimit == null ? "không giới hạn" : `${formatNumber(up.effectiveLimit)} học viên`}</small>}
                  {checked && mode === "upgrade" && up?.state === "none" && <small style={{ display: "block", color: "var(--warning)" }}>Không có kỳ đang hiệu lực để nâng cấp. Hãy mua hoặc gia hạn trước.</small>}
                  {checked && mode === "upgrade" && up?.state === "error" && <small style={{ display: "block", color: "var(--danger)" }}>Không đọc được kỳ dịch vụ. Bỏ chọn rồi chọn lại.</small>}
                </span>
              </label>;
            })}
          </div>}
          {!lockedBuildingId && <p className="bill-dim" style={{ margin: 0 }}>Tối đa {MAX_LINES} công trình mỗi báo giá; nhiều hơn dùng tab “Số lượng lớn”.{mode === "upgrade" ? " Dòng nâng cấp không trộn với mua mới hoặc gia hạn." : ""}</p>}
        </fieldset>
        <fieldset className="ops-fieldset"><legend>2. Gói</legend>
          {packages.error !== undefined && <Alert tone="danger" title="Không tải được gói" action={<Button size="sm" variant="secondary" className="mt-3" onClick={packages.reload}>Thử lại</Button>}>{billingErrorText(packages.error)}</Alert>}
          {packages.loading && !packages.data && <SkeletonRows rows={2} label="Đang tải gói…" />}
          {packages.data && sellable.length === 0 && <EmptyState icon={FileText} title="Chưa có gói đang bán" description="PlatformAdmin cần tạo và bật gói 6/12 tháng (đủ số học viên và quota) trong khu Thương mại. Tổ chức không tự cấu hình giá hay quota." />}
          {sellable.length > 0 && <PackagePicker packages={sellable} value={packageId} onChange={(id) => { setPackageId(id); setError(null); }} legend={mode === "upgrade" ? "Gói đích" : "Gói dịch vụ"}
            isOptionDisabled={mode === "upgrade" ? (item) => (item.learnerLimit != null && highestCurrent > 0 && item.learnerLimit <= highestCurrent ? `Không cao hơn mức hiện tại (${formatNumber(highestCurrent)} học viên).` : null) : undefined} />}
          {mode === "service" && <p className="bill-muted">Công trình đã có lịch sử thanh toán sẽ được báo giá là gia hạn kỳ mới; chưa có thì là mua mới. Hệ thống kiểm lại khi tạo.</p>}
        </fieldset>
      </>}
      {error && <Alert tone="danger" title="Chưa tạo được báo giá">{error.message}{error.details.length > 0 && <>{" "}{error.details.join(" ")}</>}</Alert>}
    </div>
  </Modal>;
}
