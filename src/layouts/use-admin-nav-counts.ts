"use client";

import { useAsyncData } from "@/api/use-async-data";
import { REVIEW_QUEUE_TAG, reviewsApi } from "@/features/admin-reviews/api";
import { supportApi } from "@/features/support/api";

/**
 * Sidebar badges for PlatformAdmin (Figma 05b: "Duyệt kịch bản 3", "Hỗ trợ & audit 5"): pending reviews and open tickets,
 * read as totals with pageSize 1. A failed read just hides the badge; the pages themselves re-read their lists.
 */
export function useAdminNavCounts(accessToken: string | null, enabled: boolean): Record<string, number | undefined> {
  const counts = useAsyncData(
    "admin-nav-counts",
    async (signal) => {
      const [reviews, tickets] = await Promise.all([
        // Both kinds waiting (tình huống + hạ tầng PCCC), the same source as the two tabs of Theo dõi thẩm định.
        reviewsApi.assignments(accessToken as string, { status: "Submitted", page: 1, pageSize: 1 }, signal).catch(() => null),
        supportApi.listTickets("admin", accessToken as string, { status: "Open", page: 1, pageSize: 1 }, signal).catch(() => null),
      ]);
      return { "/admin/reviews": reviews?.totalCount, "/admin/support": tickets?.total } as Record<string, number | undefined>;
    },
    enabled && Boolean(accessToken),
    { keepPrevious: true, tags: [REVIEW_QUEUE_TAG] },
  );
  return counts.data ?? {};
}
