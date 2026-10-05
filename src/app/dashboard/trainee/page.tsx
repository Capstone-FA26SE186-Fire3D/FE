import { redirect } from "next/navigation";

export const metadata = { title: "Không gian học tập" };

export default function TraineeDashboardPage() {
  redirect("/learning-hub");
}
