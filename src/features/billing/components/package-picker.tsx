"use client";

import { useMemo } from "react";
import { formatNumber, formatVnd } from "../format";
import type { ServicePackage } from "../types";
import "../billing.css";

/** Packages an organization may choose: active and complete v7 (the BE decides `isPurchasable`; legacy packages never are). */
export function sellablePackages(packages: ServicePackage[] | undefined) {
  return [...(packages ?? [])]
    .filter((item) => item.isActive && item.isPurchasable !== false)
    .sort((a, b) => a.durationMonths - b.durationMonths || a.code.localeCompare(b.code));
}

/**
 * Package cards grouped by term (6 / 12 months). Price, term, learner capacity and AI quota are shown exactly as
 * the catalog snapshot returns them: nothing is hard-coded and no total is computed here (the quotation prices it).
 */
export function PackagePicker({ packages, value, onChange, disabled, isOptionDisabled, name = "service-package", legend = "Gói dịch vụ" }: {
  packages: ServicePackage[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Returns a reason when this package cannot be chosen in the current context (shown, option disabled). */
  isOptionDisabled?: (item: ServicePackage) => string | null;
  name?: string;
  legend?: string;
}) {
  const groups = useMemo(() => {
    const map = new Map<number, ServicePackage[]>();
    for (const item of packages) map.set(item.durationMonths, [...(map.get(item.durationMonths) ?? []), item]);
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [packages]);

  return <fieldset className="bill-package-groups" disabled={disabled}>
    <legend className="ops-field-label" style={{ marginBottom: 8 }}>{legend}</legend>
    {groups.map(([months, items]) => <div key={months} className="bill-package-group" role="group" aria-label={`Gói ${months} tháng`}>
      <p className="bill-dim" style={{ margin: "0 0 8px" }}>Gói {months} tháng</p>
      <div className="bill-packages">
        {items.map((item) => {
          const reason = isOptionDisabled?.(item) ?? null;
          return <label key={item.id} className="bill-package" aria-disabled={reason ? true : undefined} data-testid="package-option">
            <input type="radio" name={name} value={item.id} checked={value === item.id} disabled={Boolean(reason)} onChange={() => onChange(item.id)} />
            <strong>{item.name}</strong>
            <span className="bill-price">{formatVnd(item.unitPrice)}<small> / tháng / công trình</small></span>
            <small>Thời hạn {item.durationMonths} tháng · mã {item.code}</small>
            <small>{item.learnerLimit != null ? `${formatNumber(item.learnerLimit)} học viên mỗi kỳ` : "Chưa nêu số học viên"}</small>
            {item.aiQuotaUnits != null && item.aiQuotaUnits > 0 && <small>Hạn mức AI trả trước: {formatNumber(item.aiQuotaUnits)} đơn vị</small>}
            {item.description && <small>{item.description}</small>}
            {reason && <small style={{ color: "var(--warning)" }}>{reason}</small>}
          </label>;
        })}
      </div>
    </div>)}
  </fieldset>;
}
