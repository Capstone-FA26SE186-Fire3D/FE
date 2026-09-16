import type { Metadata } from "next";
import { PublicPage } from "@/features/organization/components/public-page";

export const metadata: Metadata = { title: "Tải ứng dụng" };
export default function DownloadPage() { return <PublicPage kind="download" />; }
