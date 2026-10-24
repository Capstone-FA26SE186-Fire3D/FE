import { VersionsWorkspace } from "@/features/scenarios/components/versions/versions-workspace";

// The page only hands the ids to client code (all data is fetched in the browser), so each URL is rendered once and
// then served from the CDN instead of running a server function on every visit.
export function generateStaticParams() {
  return [];
}

export default async function ScenarioVersionsPage({ params }: { params: Promise<{ id: string; scenarioId: string }> }) {
  const { id, scenarioId } = await params;
  return <VersionsWorkspace buildingId={id} scenarioId={scenarioId} />;
}
