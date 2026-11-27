import { ExpertReviewPage } from "@/features/expert-reviews/components/expert-review-page";

export const metadata = { title: "Thẩm định" };

// Only the id goes to client code (all data is fetched in the browser), like the building detail page.
export function generateStaticParams() {
  return [];
}

export default async function ExpertReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExpertReviewPage reviewId={id} />;
}
