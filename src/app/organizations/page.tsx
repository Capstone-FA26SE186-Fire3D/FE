import type { Metadata } from "next";
import { OrganizationPage } from "@/features/organization/components/organization-page";

export const metadata: Metadata = { title: "Dành cho tổ chức" };
export default function OrganizationsPage() { return <OrganizationPage />; }
