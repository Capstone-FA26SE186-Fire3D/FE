import type { Metadata } from "next";
import { PublicPage } from "@/features/organization/components/public-page";

export const metadata: Metadata = { title: "Về chúng tôi" };
export default function AboutPage() { return <PublicPage kind="about" />; }
