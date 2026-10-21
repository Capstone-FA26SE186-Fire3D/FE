import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingLab } from "@/features/landing-lab/landing-lab";

export const metadata: Metadata = { title: "Landing lab · bản thử 3D" };

/*
 * Developer measurement page for the circular glass landing prototype (glass, smoke, real characters, landscape phone).
 * Like /demo/rag it answers 404 in a production build.
 */
export default function LandingLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LandingLab />;
}
