import { BuildingsWorkspace } from "@/features/buildings/components/buildings-workspace";

export const metadata = { title: "Công trình của tổ chức" };

// The page only hands the ids to client code (all data is fetched in the browser), so each URL is rendered once and
// then served from the CDN instead of running a server function on every visit.
export function generateStaticParams() {
  return [];
}

export default async function OrganizationBuildingsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <BuildingsWorkspace organizationId={organizationId} />;
}
