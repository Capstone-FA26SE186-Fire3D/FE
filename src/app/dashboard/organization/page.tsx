import { redirect } from "next/navigation";

export const metadata = { title: "Không gian tổ chức" };

export default function OrganizationDashboardPage() {
  redirect("/workspace/buildings");
}
