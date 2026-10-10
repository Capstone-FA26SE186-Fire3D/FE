import { Alert } from "@/components/ui/alert";

/** Placeholder: replaced by the real services/billing tab. Kept minimal so only this file changes on merge. */
export function BuildingServicesTab({ buildingId }: { buildingId: string }) {
  return <div data-building-id={buildingId}>
    <Alert tone="info" title="Đang phát triển">Quản lý gói dịch vụ, thời hạn và số học viên của công trình sẽ có tại đây.</Alert>
  </div>;
}
