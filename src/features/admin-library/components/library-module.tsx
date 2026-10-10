"use client";

import dynamic from "next/dynamic";
import { PendingModule } from "@/components/ops/pending-module";
import { routes } from "@/configs/routes";

// The literal NODE_ENV check lets the bundler drop this branch (and the prototype chunk with its sample data) from production.
const LibraryPrototype = process.env.NODE_ENV !== "production"
  ? dynamic(() => import("./library-prototype").then((module) => module.LibraryPrototype))
  : null;

export function LibraryModule() {
  return <PendingModule
    title="Thư viện tổ chức"
    description="PlatformAdmin duy trì template kịch bản, rubric mẫu và metadata thiết bị hỗ trợ; tổ chức dùng chúng khi soạn bài. Tách khỏi Learn công khai."
    breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Thư viện tổ chức" }]}
    blockers={[
      "Docs mới định nghĩa bảng (organization_library_items/versions), chưa định nghĩa route Library; backend chưa có entity, controller hay migration.",
      "GET /api/scenario-interactions/catalog chỉ trả capability runtime, không phải Library, nên không thể dùng thay.",
    ]}
    openWhen="Chốt route + schema: Docs xác định đường dẫn và hợp đồng cho danh sách, phiên bản, xuất bản, ngừng dùng và quyền (PlatformAdmin ghi, OrganizationUser đọc); sau đó backend triển khai và kiểm thử. Metadata thiết bị mới không được tự thêm capability runtime."
    issues={[{ label: "BE#57 — Learn CMS và Organization Library (route Library chưa chốt)", href: "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/57" }]}
    contract={[
      { label: "Route và schema Library", status: "undecided", detail: "Chưa có trong Docs: cần chốt đường dẫn, DTO và quyền trước khi viết API." },
      { label: "Danh mục capability runtime", status: "available", detail: "GET /api/scenario-interactions/catalog đã có; dùng để giới hạn capability thiết bị được gắn." },
      { label: "Template, rubric mẫu, thiết bị theo phiên bản", status: "missing", detail: "Danh sách, tạo mục, tạo/xuất bản phiên bản, ngừng dùng (BE#57)." },
    ]}
    design={{
      title: "Khi mở, màn này sẽ có",
      items: [
        "Ba nhóm: template kịch bản, rubric mẫu, thiết bị hỗ trợ; mỗi mục có lịch sử phiên bản.",
        "Phiên bản đã xuất bản bất biến; cập nhật mẫu không sửa kịch bản đã phát hành.",
        "Không xóa vĩnh viễn: mục được ngừng dùng và giữ lịch sử.",
        "Thiết bị chỉ gắn capability runtime đã hỗ trợ; thiết bị mới cần phát triển Unity.",
      ],
    }}
    prototype={LibraryPrototype ? <LibraryPrototype /> : undefined}
  />;
}
