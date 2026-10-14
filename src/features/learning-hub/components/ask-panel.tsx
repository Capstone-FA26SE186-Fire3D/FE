"use client";

import { MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useAsyncData } from "@/api/use-async-data";
import { routes } from "@/configs/routes";
import { learnApi } from "@/features/learn/api";
import { isPostSlug } from "@/features/learn/slug";
import { CapabilityUnavailable, type NextStep } from "./capability-unavailable";

/**
 * "Hỏi đáp" for the Trainee. The server has no Trainee AI yet (BE#77), so this only explains that and keeps the article
 * the learner came from (`?article=`) as context. When the contract lands, this is where the composer, the answer with
 * citations and the daily quota mount; the context below is already what the request needs (post id + published version).
 */
export function AskPanel({ articleParam }: { articleParam: string | null }) {
  const slug = articleParam && isPostSlug(articleParam) ? articleParam : null;
  const article = useAsyncData(`hub:ask-context:${slug}`, (signal) => learnApi.post(slug ?? "", signal), !!slug);
  const loaded = slug && article.data?.slug === slug ? article.data : null;
  const unknownArticle = !!articleParam && (!slug || (article.error !== undefined && !loaded));

  const steps: NextStep[] = [
    ...(loaded ? [{ label: "Đọc lại bài này", href: `${routes.learn}/${loaded.slug}` }] : []),
    { label: loaded ? "Chọn bài khác trong Learn" : "Đọc bài trong Learn", href: routes.learn },
    { label: "Xem bài đã lưu", href: "/learning-hub?view=saved" },
    { label: "Xem trang ứng dụng", href: routes.download },
  ];

  return <CapabilityUnavailable
    icon={MessageCircleQuestion}
    title="Hỏi đáp AI cho học viên chưa khả dụng"
    reason="AI cho Trainee đang chờ hệ thống: hỏi đáp theo bài đọc cần quyền và hạn mức riêng cho học viên mà máy chủ chưa mở. Chưa có câu hỏi nào được gửi và không có câu trả lời nào được tạo cho bạn."
    context={loaded
      ? <>Bạn đang mở từ bài <Link href={`${routes.learn}/${loaded.slug}`}>{loaded.version.title}</Link>. Khi hỏi đáp mở, câu hỏi sẽ theo đúng bài và phiên bản bài đã đăng.</>
      : slug && !unknownArticle ? <span role="status">Đang mở thông tin bài…</span>
      : unknownArticle ? <span role="status">Không tìm thấy bài bạn mở từ Learn. Bài có thể đã bị ẩn hoặc gỡ.</span>
      : undefined}
    steps={steps}
  />;
}
