import { ScenarioEditor } from "@/features/scenario-editor/panels/scenario-editor";

export default async function ScenarioEditorPage({ params }: { params: Promise<{ id: string; scenarioId: string }> }) {
  const { id, scenarioId } = await params;
  return <ScenarioEditor buildingId={id} scenarioId={scenarioId} />;
}
