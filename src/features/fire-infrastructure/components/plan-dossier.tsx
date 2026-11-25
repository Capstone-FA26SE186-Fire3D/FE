"use client";

import { useAsyncData } from "@/api/use-async-data";
import { DetailList } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { capabilityLabel } from "@/configs/capability-labels";
import { buildingTypeLabel, riskGroupInfo } from "@/features/buildings/data/building-types";
import { audienceLabel, workingHoursLabel } from "@/features/scenario-editor/v1/contract";

import { INFRASTRUCTURE_STATUS } from "../api";
import { coverageGap, planDossierApi, REVIEW_STATUS, type DossierItem } from "../plan-dossier";

/** Compact bullet list inside a detail row. */
const LIST = { margin: 0, paddingLeft: 18 } as const;
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("vi-VN") : "—");
const text = (value: string | null | undefined) => (value?.trim() ? value : "Chưa có");
const itemName = (item: DossierItem, index: number) => item.label?.trim() || capabilityLabel(item.capability?.id) || `Mục ${index + 1}`;

function ItemList({ items, empty }: { items: DossierItem[]; empty: string }) {
  if (items.length === 0) return <span className="ops-muted">{empty}</span>;
  return <ul style={LIST}>{items.map((item, index) => <li key={item.id ?? index}>{itemName(item, index)}{item.placement?.floorId ? ` (tầng ${item.placement.floorId})` : ""}</li>)}</ul>;
}

/**
 * "Hồ sơ phương án" of a Building (BE#215, FR-PLAN-12): the sections of Mẫu PC06 filled from the locked fire infrastructure,
 * the facility sheet and the situations. A reference view: the plan signed by the head of the facility stays the legal document.
 * shortcut: sections do not open the 3D model yet; add the links when the preview can focus an item by id.
 */
export function PlanDossierView({ accessToken, buildingId }: { accessToken: string; buildingId: string }) {
  const query = useAsyncData(`plan-dossier:${buildingId}`, (signal) => planDossierApi.get(accessToken, buildingId, signal), Boolean(accessToken));
  if (query.loading && !query.data) return <div role="status" aria-label="Đang tải hồ sơ phương án"><SkeletonDetail rows={6} /></div>;
  if (!query.data) return <Alert tone="danger" title="Không tải được hồ sơ phương án" action={<Button size="sm" variant="secondary" className="mt-3" onClick={query.reload}>Thử lại</Button>} />;

  const d = query.data;
  const risk = riskGroupInfo(d.hazard.riskGroup);
  const gap = coverageGap(d.coverage);
  const force = d.facility.onSiteForce;

  return <div className="ops-stack" data-testid="plan-dossier">
    <Alert tone="info" title="Bản tham khảo">Trang này sắp xếp dữ liệu của công trình theo thứ tự Mẫu PC06 để tiện đối chiếu. Đây không phải phương án đã được người đứng đầu cơ sở phê duyệt, và số liệu luyện tập trên mô phỏng không thay buổi thực tập phương án.</Alert>

    <Panel title="Thông tin chung" description={`Phương án năm ${d.header.year}`}>
      <DetailList columns={2} items={[
        { label: "Tên cơ sở", value: <strong>{d.header.name}</strong> },
        { label: "Địa chỉ", value: text(d.header.address) },
        { label: "Điện thoại", value: text(d.header.phone) },
        { label: "Bản PC06 đã ký", value: d.signedPlanDocumentId ? "Đã tải lên" : "Chưa tải lên" },
      ]} />
    </Panel>

    <Panel title="I. Sơ đồ mặt bằng và lối thoát nạn" data-testid="dossier-site">
      {d.siteLayout
        ? <DetailList columns={2} items={[
          { label: "Hạ tầng PCCC", value: `Phiên bản ${d.siteLayout.infrastructureVersion} (đã khoá)` },
          { label: "Lối thoát nạn", value: <ItemList items={d.siteLayout.exits} empty="Chưa có" /> },
          { label: "Điểm tập kết", value: <ItemList items={d.siteLayout.assemblyPoints} empty="Chưa có" /> },
        ]} />
        : <Alert tone="warning" title="Công trình chưa có Hạ tầng PCCC đạt thẩm định">Lập hạ tầng ở mục Hạ tầng PCCC và gửi Chuyên viên PCCC thẩm định; khi đạt, các mục I, II và IV sẽ có dữ liệu.</Alert>}
    </Panel>

    <Panel title="II. Thông tin cơ sở, lực lượng và phương tiện tại chỗ">
      <DetailList columns={2} items={[
        { label: "Người đứng đầu cơ sở", value: `${text(d.facility.facilityHeadName)}${d.facility.facilityHeadPhone ? ` · ${d.facility.facilityHeadPhone}` : ""}` },
        { label: "Lực lượng tại chỗ", value: force ? `${force.teamSize} người${force.leaderName ? `, đội trưởng ${force.leaderName}` : ""}${force.leaderPhone ? ` · ${force.leaderPhone}` : ""} (${[force.availableInHours && "trong giờ", force.availableOffHours && "ngoài giờ"].filter(Boolean).join(", ") || "chưa ghi thời gian có mặt"})` : "Chưa có" },
        { label: "Danh bạ khẩn cấp", value: d.facility.emergencyContacts.length ? <ul style={LIST}>{d.facility.emergencyContacts.map((contact, index) => <li key={index}>{contact.name} · {contact.phone}{contact.role ? ` (${contact.role})` : ""}</li>)}</ul> : "Chưa có" },
        { label: "Phương tiện, thiết bị", value: d.facility.equipment.length ? <ul style={LIST}>{d.facility.equipment.map((item) => <li key={item.catalogKey}>{capabilityLabel(item.catalogKey)}: {item.count}</li>)}</ul> : "Chưa có" },
        { label: "Nguồn nước", value: <ItemList items={d.facility.waterSources} empty="Chưa có" /> },
      ]} />
    </Panel>

    <Panel title="III. Đặc điểm nguy hiểm cháy, nổ">
      <DetailList columns={2} items={[
        { label: "Loại công trình", value: buildingTypeLabel(d.hazard.buildingType) || "Chưa chọn" },
        { label: "Nhóm nguy cơ", value: risk ? <StatusBadge tone={risk.tone}>{risk.label}</StatusBadge> : "Chưa xác định" },
        { label: "Số tầng", value: String(d.hazard.totalFloors) },
        { label: "Diện tích sàn", value: d.hazard.floorAreaSquareMeters != null ? `${d.hazard.floorAreaSquareMeters.toLocaleString("vi-VN")} m²` : "Chưa có" },
      ]} />
    </Panel>

    <Panel title="IV. Tình huống giả định" description="Phiên bản mới nhất của từng tình huống trên hạ tầng đã khoá." data-testid="dossier-scenarios">
      {gap && <Alert tone="warning" title="Chưa đủ điều kiện phát hành">{gap}</Alert>}
      {d.scenarios.length === 0
        ? <p className="ops-muted">Chưa có tình huống nào trên hạ tầng này.</p>
        : <div className="ops-table-wrap"><table className="ops-table">
          <caption className="ops-sr-only">Tình huống giả định của phương án</caption>
          <thead><tr><th>Số</th><th>Tình huống</th><th>Đối tượng</th><th>Thời gian</th><th>Giả định</th><th>Thẩm định</th></tr></thead>
          <tbody>{d.scenarios.map((scenario) => {
            const status = REVIEW_STATUS[scenario.reviewStatus] ?? REVIEW_STATUS.NotSubmitted;
            const a = scenario.assumption;
            return <tr key={scenario.scenarioVersionId} data-testid="dossier-scenario">
              <td>{scenario.number}</td>
              <td>{scenario.scenarioName} <span className="ops-muted">(phiên bản {scenario.versionNumber})</span></td>
              <td>{audienceLabel(scenario.audience) ?? "—"}</td>
              <td>{workingHoursLabel(scenario.workingHours) ?? "—"}</td>
              <td>{a ? [a.time, a.location, a.cause, typeof a.peoplePresent === "number" ? `${a.peoplePresent} người có mặt` : null].filter(Boolean).join("; ") : "—"}</td>
              <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge>{scenario.reviewedAt ? ` ${day(scenario.reviewedAt)}` : ""}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </Panel>

    <Panel title="V. Bổ sung, chỉnh lý" description="Các phiên bản Hạ tầng PCCC của bản IFC đang dùng.">
      {d.history.length === 0
        ? <p className="ops-muted">Chưa có phiên bản hạ tầng nào.</p>
        : <ul style={LIST}>{d.history.map((version) => {
          const status = INFRASTRUCTURE_STATUS[version.status] ?? INFRASTRUCTURE_STATUS.Draft;
          return <li key={version.id}>Phiên bản {version.version}: <StatusBadge tone={status.tone}>{status.label}</StatusBadge> · gửi {day(version.submittedAt)} · có kết quả {day(version.decidedAt)}</li>;
        })}</ul>}
    </Panel>
    <p className="ops-field-hint">Mục VI (theo dõi luyện tập) xem ở Báo cáo, tab Nhật ký luyện tập.</p>
  </div>;
}
