import type { Metadata } from "next";
import { PublicPage } from "@/features/organization/components/public-page";

export const metadata: Metadata = { title: "Ứng dụng FET3D cho Android" };
export default function DownloadPage() { return <PublicPage kind="download" />; }
