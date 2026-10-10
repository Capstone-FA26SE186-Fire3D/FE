"use client";

import dynamic from "next/dynamic";
import { PendingModule } from "@/components/ops/pending-module";
import { routes } from "@/configs/routes";

// The literal NODE_ENV check lets the bundler drop this branch (and the prototype chunk with its sample data) from production.
const ReviewsPrototype = process.env.NODE_ENV !== "production"
  ? dynamic(() => import("./reviews-prototype").then((module) => module.ReviewsPrototype))
  : null;

export function ReviewsModule() {
  return <PendingModule
    title="Duyệt kịch bản"
    description="PlatformAdmin duyệt nội dung và rubric của từng phiên bản kịch bản trước khi tổ chức được phát hành."
    breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Duyệt kịch bản" }]}
    blockers={[
      "Backend chưa có API đọc hàng chờ duyệt hay chi tiết bản duyệt, nên quản trị viên không thể tìm bản đang chờ.",
      "Lệnh duyệt/từ chối đã có nhưng cần versionId và đúng hash lúc nộp; không có nguồn đáng tin để lấy chúng ngoài API đọc. Vì vậy màn này không cho nhập tay versionId hay hash.",
    ]}
    openWhen="Backend bổ sung GET danh sách (lọc trạng thái, tổ chức, phân trang) và GET chi tiết gồm trạng thái, contentHash, rubricHash, người nộp/duyệt, lý do từ chối, readiness, nội dung và rubric cần duyệt; có kiểm thử cách ly tenant và Docs API được cập nhật."
    issues={[
      { label: "BE#52 — API đọc hàng chờ và chi tiết duyệt nội dung (chặn màn này)", href: "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/52" },
      { label: "BE#51 — Publish gate luôn 503 PUBLISH_GATE_UNAVAILABLE (phát hành cần duyệt nội dung và readiness)", href: "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/51" },
    ]}
    contract={[
      { label: "POST /api/admin/scenario-versions/{id}/approve", status: "available", detail: "Body { contentHash, rubricHash, reason? }, bắt buộc Idempotency-Key. Client đã viết, chưa gắn vào giao diện thật." },
      { label: "POST /api/admin/scenario-versions/{id}/reject", status: "available", detail: "Cùng body; reason 1–4000 ký tự là bắt buộc. Mã lỗi: CONTENT_REVIEW_NOT_PENDING, CONTENT_HASH_MISMATCH, IDEMPOTENCY_KEY_CONFLICT." },
      { label: "GET /api/admin/scenario-reviews", status: "missing", detail: "Hàng chờ có bộ lọc trạng thái/tổ chức và phân trang (BE#52)." },
      { label: "GET chi tiết bản duyệt", status: "missing", detail: "Nội dung, rubric, hash, readiness, lý do từ chối (BE#52)." },
    ]}
    design={{
      title: "Khi mở, màn này sẽ có",
      items: [
        "Hàng chờ dạng bảng, lọc theo trạng thái duyệt và tổ chức, phân trang trong URL.",
        "Màn xem chi tiết: nội dung kịch bản, rubric, hash đóng băng và readiness kỹ thuật ở các thẻ riêng.",
        "Duyệt hoặc từ chối đúng hash đã nộp; từ chối bắt buộc lý do; thử lại dùng cùng Idempotency-Key.",
        "Tách bạch Duyệt nội dung (PlatformAdmin) với Readiness kỹ thuật (IFC QA, xác nhận huấn luyện).",
      ],
    }}
    prototype={ReviewsPrototype ? <ReviewsPrototype /> : undefined}
  />;
}
