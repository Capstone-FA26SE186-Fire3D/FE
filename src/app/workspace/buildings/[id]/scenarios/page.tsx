import { BuildingDetailWorkspace } from "@/features/buildings/components/building-detail-workspace";

export const metadata = { title: "Kịch bản của công trình" };

/** Kept so existing links do not 404: it opens the building detail on the scenarios tab. */
// The page only hands the ids to client code (all data is fetched in the browser), so each URL is rendered once and
// then served from the CDN instead of running a server function on every visit.
export function generateStaticParams() {
  return [];
}

export default async function BuildingScenariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BuildingDetailWorkspace buildingId={id} defaultTab="scenarios" />;
}
