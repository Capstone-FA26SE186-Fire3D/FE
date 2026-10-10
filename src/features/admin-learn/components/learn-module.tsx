"use client";

import dynamic from "next/dynamic";
import { PendingModule } from "@/components/ops/pending-module";
import { routes } from "@/configs/routes";

// The literal NODE_ENV check lets the bundler drop this branch (and the prototype chunk with its sample data) from production.
const LearnPrototype = process.env.NODE_ENV !== "production"
  ? dynamic(() => import("./learn-prototype").then((module) => module.LearnPrototype))
  : null;

export function LearnModule() {
  return <PendingModule
    title="Learn CMS"
    description="PlatformAdmin soạn và quản lý bài viết, mẹo và video công khai theo tình huống. Learn không có bước duyệt riêng."
    breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Learn CMS" }]}
    blockers={[
      "Backend chưa có entity, controller hay migration cho bài Learn, phiên bản, tình huống và bookmark.",
      "Chưa có cách xác thực media theo danh sách cho phép (YouTube, Facebook, TikTok) và chưa có cổng publish/hide/show/delete/restore kèm ETag, Idempotency-Key.",
    ]}
    openWhen="Backend cung cấp CRUD bài/phiên bản Draft–Published, các lệnh xuất bản, ẩn, hiện, xóa mềm, khôi phục với ETag và Idempotency-Key, media descriptor đã được validate theo allowlist, đọc công khai chỉ trả bài Published; có kiểm thử quyền Admin/Org/khách và RAG chỉ nhận Published hoặc Hidden hợp lệ."
    issues={[{ label: "BE#57 — Learn CMS và Organization Library", href: "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/57" }]}
    contract={[
      { label: "Bài, phiên bản, tình huống", status: "missing", detail: "Danh sách, chi tiết, tạo (slug, kind Article/Tip/Video), sửa Draft, tạo Draft mới (BE#57)." },
      { label: "Lệnh vòng đời", status: "missing", detail: "Publish, hide, show, delete, restore; ETag/If-Match và Idempotency-Key. Route chưa được định nghĩa trong Docs." },
      { label: "Media descriptor", status: "missing", detail: "Provider YouTube/Facebook/TikTok, URL chuẩn hóa, tóm tắt dự phòng; không iframe, HTML hay script tùy ý." },
      { label: "Nguồn Common", status: "undecided", detail: "Draft có thể trích nguồn chưa duyệt; publish/show yêu cầu nguồn Approved. API danh mục nguồn chưa rõ." },
    ]}
    design={{
      title: "Khi mở, màn này sẽ có",
      items: [
        "Danh sách bài lọc theo loại, trạng thái, từ khóa; phân trang trong URL.",
        "Trình soạn theo thẻ: thông tin, khối nội dung, phân loại và nguồn, phiên bản, xuất bản.",
        "Video chỉ lưu provider và đường dẫn chuẩn hóa kèm tóm tắt dự phòng, không nhúng.",
        "412 giữ nội dung đang nhập và cho đối chiếu với bản mới; thử lại dùng cùng Idempotency-Key.",
      ],
    }}
    prototype={LearnPrototype ? <LearnPrototype /> : undefined}
  />;
}
