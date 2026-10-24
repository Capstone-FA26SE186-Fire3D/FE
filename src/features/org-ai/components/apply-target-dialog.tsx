"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { routes } from "@/configs/routes";
import { buildingsApi } from "@/features/buildings/api";

import { aiErrorText } from "../labels";
import type { AiRequest } from "../types";
import styles from "../org-ai.module.css";
import { AI_PROPOSAL_PARAM } from "../proposal-param";

/** Query parameter the scenario editor reads to offer a stored AI proposal (the id, never the content). */
export { AI_PROPOSAL_PARAM };

/**
 * Step 1 of "Áp dụng vào bản nháp": pick the Building and scenario whose editor will open. Nothing is written here and the
 * proposal is not copied: the editor loads it again from the server by request id, shows a preview, and only an explicit
 * confirmation there changes the open draft (one undoable step, still unsaved).
 */
export function ApplyTargetDialog({ accessToken, request, onClose }: { accessToken: string; request: AiRequest | null; onClose: () => void }) {
  const router = useRouter();
  const [buildingId, setBuildingId] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const buildings = useAsyncData("org-ai:apply:buildings", (signal) => buildingsApi.list(accessToken, { isActive: true, page: 1, pageSize: 100 }, signal), request !== null);
  const buildingItems = buildings.data?.items ?? [];
  const selectedBuilding = buildingId || buildingItems[0]?.id || "";
  const scenarios = useAsyncData(`org-ai:apply:scenarios:${selectedBuilding}`, (signal) => buildingsApi.listScenarios(accessToken, selectedBuilding, 1, 100, signal), request !== null && Boolean(selectedBuilding));
  const scenarioItems = scenarios.data?.items ?? [];
  const selectedScenario = scenarioItems.some((item) => item.id === scenarioId) ? scenarioId : scenarioItems[0]?.id ?? "";

  const open = () => {
    if (!request || !selectedBuilding || !selectedScenario) return;
    router.push(`${routes.workspaceBuildings}/${selectedBuilding}/scenarios/${selectedScenario}?${AI_PROPOSAL_PARAM}=${encodeURIComponent(request.requestId)}`);
  };

  return <Modal open={request !== null} onOpenChange={(value) => { if (!value) onClose(); }} className={styles.wideModal}
    title="Áp dụng đề xuất vào bản nháp" description="Chọn kịch bản để mở trình soạn thảo. Bạn sẽ xem trước và xác nhận từng thay đổi trước khi chúng vào bản nháp."
    footer={<><Button type="button" variant="quiet" onClick={onClose}>Hủy</Button><Button type="button" onClick={open} disabled={!selectedBuilding || !selectedScenario} data-testid="ai-open-editor"><ExternalLink size={16} aria-hidden="true" />Mở trình soạn thảo</Button></>}>
    <div className={styles.stack}>
      <Alert tone="info" title="Chưa có gì được lưu">AI không tự sửa kịch bản. Sau khi áp dụng, thay đổi vẫn ở trạng thái chưa lưu và hoàn tác được; bạn lưu và phát hành theo quy trình thường.</Alert>
      {buildings.loading && !buildings.data && <SkeletonRows rows={1} label="Đang tải công trình…" />}
      {buildings.error !== undefined && <Alert tone="danger" title="Không tải được công trình" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={buildings.reload}>Thử lại</Button>}>{aiErrorText(buildings.error)}</Alert>}
      {buildings.data && buildingItems.length === 0 && <Alert tone="warning" title="Chưa có công trình đang hoạt động">Tạo công trình và kịch bản trước khi áp dụng đề xuất.</Alert>}
      {buildingItems.length > 0 && <Field label="Công trình">
        {(props) => <Select {...props} value={selectedBuilding} onChange={(event) => { setBuildingId(event.target.value); setScenarioId(""); }}>{buildingItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
      </Field>}
      {selectedBuilding && scenarios.loading && !scenarios.data && <SkeletonRows rows={1} label="Đang tải kịch bản…" />}
      {scenarios.error !== undefined && <Alert tone="danger" title="Không tải được kịch bản" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={scenarios.reload}>Thử lại</Button>}>{aiErrorText(scenarios.error)}</Alert>}
      {scenarios.data && scenarioItems.length === 0 && <Alert tone="warning" title="Công trình này chưa có kịch bản">Tạo một kịch bản ở trang công trình rồi quay lại. Đề xuất vẫn được giữ trong lịch sử.</Alert>}
      {scenarioItems.length > 0 && <Field label="Kịch bản" hint="Ở bước sau bạn chọn hoặc tạo bản nháp fet3d.editor/1 của kịch bản này.">
        {(props) => <Select {...props} value={selectedScenario} onChange={(event) => setScenarioId(event.target.value)}>{scenarioItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
      </Field>}
    </div>
  </Modal>;
}
