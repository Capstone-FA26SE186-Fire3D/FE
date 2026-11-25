import { InfrastructureEditor } from "@/features/fire-infrastructure/components/infrastructure-editor";

export const metadata = { title: "Hạ tầng PCCC" };

// Like the scenario editor: the page only hands the ids to client code, so each URL is rendered once and served from the CDN.
export function generateStaticParams() {
  return [];
}

export default async function InfrastructureEditorPage({ params }: { params: Promise<{ id: string; infrastructureId: string }> }) {
  const { id, infrastructureId } = await params;
  return <InfrastructureEditor buildingId={id} infrastructureId={infrastructureId} />;
}
