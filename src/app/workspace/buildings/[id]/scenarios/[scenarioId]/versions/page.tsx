import { VersionsWorkspace } from "@/features/scenarios/components/versions/versions-workspace";

export default async function ScenarioVersionsPage({ params }: { params: Promise<{ id: string; scenarioId: string }> }) {
  const { id, scenarioId } = await params;
  return <VersionsWorkspace buildingId={id} scenarioId={scenarioId} />;
}
