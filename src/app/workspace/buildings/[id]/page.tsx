import { BuildingDetailWorkspace } from "@/features/buildings/components/building-detail-workspace";

export default async function BuildingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BuildingDetailWorkspace buildingId={id} />;
}
