import { BuildingDetailWorkspace } from "@/features/buildings/components/building-detail-workspace";

export const metadata = { title: "Kịch bản của công trình" };

/** Kept so existing links do not 404: it opens the building detail on the scenarios tab. */
export default async function BuildingScenariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BuildingDetailWorkspace buildingId={id} defaultTab="scenarios" />;
}
