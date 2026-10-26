"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { messageOf } from "@/api/describe-error";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { routes } from "@/configs/routes";
import { buildingsApi } from "@/features/buildings/api";
import { kindLabel, type LibraryItem } from "../types";
import { LIBRARY_USE_PARAM, libraryUseValue } from "../use-param";

/**
 * "Dùng làm mẫu": pick the Building and scenario whose editor opens on this sample's preview (Library tab). Nothing is written
 * here; the editor reads the published version again, shows what would change and applies only after a confirmation.
 */
export function UseSampleDialog({ accessToken, item, onClose }: { accessToken: string; item: LibraryItem; onClose: () => void }) {
  const router = useRouter();
  const [buildingId, setBuildingId] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const buildings = useAsyncData("library-use:buildings", (signal) => buildingsApi.list(accessToken, { isActive: true, page: 1, pageSize: 100 }, signal));
  const buildingItems = buildings.data?.items ?? [];
  const selectedBuilding = buildingId || buildingItems[0]?.id || "";
  const scenarios = useAsyncData(`library-use:scenarios:${selectedBuilding}`, (signal) => buildingsApi.listScenarios(accessToken, selectedBuilding, 1, 100, signal), Boolean(selectedBuilding));
  const scenarioItems = scenarios.data?.items ?? [];
  const selectedScenario = scenarioItems.some((entry) => entry.id === scenarioId) ? scenarioId : scenarioItems[0]?.id ?? "";

  const open = () => {
    if (!selectedBuilding || !selectedScenario) return;
    router.push(`${routes.workspaceBuildings}/${selectedBuilding}/scenarios/${selectedScenario}?${LIBRARY_USE_PARAM}=${encodeURIComponent(libraryUseValue(item.kind, item.id))}`);
  };

  return <Modal open onOpenChange={(value) => { if (!value) onClose(); }} size="lg" data-testid="use-sample-dialog"
    title="Dùng mẫu cho kịch bản nào?" description={`${kindLabel[item.kind]} · ${item.latestPublished?.name ?? item.code}. Chọn kịch bản để mở trình soạn thảo ngay tại mẫu này.`}
    footer={<><Button type="button" variant="quiet" onClick={onClose}>Hủy</Button><Button type="button" onClick={open} disabled={!selectedBuilding || !selectedScenario} data-testid="use-sample-open"><ExternalLink size={16} aria-hidden="true" />Mở trình soạn thảo</Button></>}>
    <div className="ops-stack">
      <Alert tone="info" title="Chưa có gì thay đổi">Trình soạn mở ở thẻ Thư viện với mẫu này. Bạn xem trước từng phần, chọn giữ hay thay rồi mới áp dụng vào bản nháp; vẫn hoàn tác được.</Alert>
      {buildings.loading && !buildings.data && <SkeletonRows rows={1} label="Đang tải công trình…" />}
      {buildings.error !== undefined && <Alert tone="danger" title="Không tải được công trình" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={buildings.reload}>Thử lại</Button>}>{messageOf(buildings.error, "Vui lòng thử lại.")}</Alert>}
      {buildings.data && buildingItems.length === 0 && <Alert tone="warning" title="Chưa có công trình đang hoạt động">Tạo công trình và kịch bản trước rồi quay lại dùng mẫu.</Alert>}
      {buildingItems.length > 0 && <Field label="Công trình">
        {(props) => <Select {...props} value={selectedBuilding} onChange={(event) => { setBuildingId(event.target.value); setScenarioId(""); }} data-testid="use-sample-building">{buildingItems.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</Select>}
      </Field>}
      {selectedBuilding && scenarios.loading && !scenarios.data && <SkeletonRows rows={1} label="Đang tải kịch bản…" />}
      {scenarios.error !== undefined && <Alert tone="danger" title="Không tải được kịch bản" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={scenarios.reload}>Thử lại</Button>}>{messageOf(scenarios.error, "Vui lòng thử lại.")}</Alert>}
      {scenarios.data && scenarioItems.length === 0 && <Alert tone="warning" title="Công trình này chưa có kịch bản">Tạo một kịch bản ở trang công trình rồi quay lại.</Alert>}
      {scenarioItems.length > 0 && <Field label="Kịch bản" hint="Ở bước sau bạn chọn hoặc tạo bản nháp của kịch bản này.">
        {(props) => <Select {...props} value={selectedScenario} onChange={(event) => setScenarioId(event.target.value)} data-testid="use-sample-scenario">{scenarioItems.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</Select>}
      </Field>}
    </div>
  </Modal>;
}
