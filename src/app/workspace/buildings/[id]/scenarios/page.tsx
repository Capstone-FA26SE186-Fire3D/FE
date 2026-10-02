import { ScenarioWorkspace } from "@/features/scenarios/components/scenario-workspace";

export default async function ScenarioWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ScenarioWorkspace buildingId={id} />;
}
