import { BuildingsWorkspace } from "@/features/buildings/components/buildings-workspace";

export const metadata = { title: "Công trình của tổ chức" };

export default async function OrganizationBuildingsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <BuildingsWorkspace organizationId={organizationId} />;
}
