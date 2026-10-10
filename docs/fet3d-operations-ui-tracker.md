# FET3D — Organization & PlatformAdmin UI: tracker

Theo dõi từng màn hình: **Đã tích hợp** (gọi API thật, có test với mock), **Chờ BE** (thiết kế sẵn, khóa tính năng), **Prototype** (dữ liệu mẫu, chỉ môi trường phát triển; production không có nút giả thành công hay số liệu mẫu).

Nguồn kiểm tra BE: `main` @ `b6a7d74` (đọc source; chưa kiểm chứng deployment). Bằng chứng mock (Playwright route) và kiểm thử API thật được ghi riêng — mock không phải bằng chứng tích hợp.

## Issue BE đã mở (2026-10-10)

| # | Nội dung | Loại | Chặn FE |
|---|---|---|---|
| [#51](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/51) | Publish gate luôn 503 `PUBLISH_GATE_UNAVAILABLE` | P1 | Phát hành, `/trainings` rỗng |
| [#52](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/52) | API đọc hàng chờ/chi tiết content review | P1 | Màn Duyệt kịch bản (Admin), xem lại kết quả duyệt (Org) |
| [#53](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/53) | API tìm lại draft, readiness, release | P1 | Tiếp tục công việc sau đăng nhập lại |
| [#54](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/54) | Contract dữ liệu editor 3D (floors, mapping, transform, goal/NPC/blocked) | P1 | Lưu goal/NPC/blocked element/thiết bị |
| [#55](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/55) | Playtest handoff: status, recovery, opaque code | P1 | Nút Playtest / QR |
| [#56](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/56) | Billing v7 + quota AI trả trước | P1 | Upgrade, learner capacity, quota AI, top-up |
| [#57](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/57) | Learn CMS + Organization Library | P2 | CMS bài Learn, thư viện template/rubric/thiết bị |
| [#58](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/58) | AI Organization, learner analytics | P2 | Biểu đồ plays/completion, usage AI |
| [#59](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/59) | Lệch nhẹ: CORS expose, Retry-After 429, analytics key, OpenAPI, duration 6/12 | Lệch contract | — (có workaround) |
| [#60](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/60) | Response organization/account thiếu field, chưa có PATCH organization | Lệch contract | Hồ sơ tổ chức trong Admin |
| [#61](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/61) | Docs mâu thuẫn với source | Docs | — |

Còn mở từ trước: [#40](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/40) (Google onboarding đã có API, nên đóng), [#46](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/46).

## Quy ước tích hợp (từ source BE)

- Lỗi: ProblemDetails (`title`, `status`, extension `code`, `errors` = map field → string[]); riêng `POST /api/scenario-drafts/{id}/validate` trả `issues[{code,path,message}]`. FE parse cả hai (`src/api/errors.ts`).
- Phân trang có 3 envelope: `{items,totalCount,page,pageSize}` (building, org, account, scenario, revision), `{items,total,page,pageSize}` (support, billing), audit thêm `from`/`to`.
- ETag theo từng resource: `"N"` (auth/me, org profile, annotations), `"access-N"`, `"support-N"`, `"billing-<guid>-<rev>"`, draft `"<xmin>"`; Building không có ETag. 412 → giữ nội dung đang nhập, tải bản mới để đối chiếu, không ghi đè.
- `Idempotency-Key` bắt buộc ở: IFC upload initiate, scenario create/draft/snapshot/package-build, billing/PayOS, support create/message, playtest. Một key cho mỗi ý định, giữ nguyên khi retry cùng payload; khác payload → `409 IDEMPOTENCY_KEY_CONFLICT`.
- 202 ≠ hoàn tất (process, retry, package-build, payos/create). Job `Succeeded` ≠ QA `Passed` (đọc `validationRun`). Release `Built` ≠ `Published`. `Paid` ≠ provisioned (poll `provisioningStatus`).
- PlatformAdmin liệt kê/tạo/sửa/lưu trữ Building qua tham số `organizationId`.

## Trạng thái màn hình

Cập nhật bảng này khi hoàn thành từng đợt.

| Khu vực | Màn hình | Trạng thái | Ghi chú / điều kiện mở |
|---|---|---|---|
| Org | Danh sách công trình | Đã tích hợp (mock test) | Bảng/thẻ, URL filter, tạo/sửa/lưu trữ |
| Admin | Tài khoản | Đã tích hợp (mock test) | URL filter/pagination, tạo, khóa/mở |
| Foundation | Theme sáng/tối/hệ thống, shell, primitives | Đã tích hợp | Token chỉ áp dụng khu vận hành |
| Admin | Duyệt kịch bản `/admin/reviews` | Chờ BE + Prototype (dev) | Production chỉ nêu blocker/điều kiện mở/contract. Mở khi BE có GET hàng chờ + chi tiết (trạng thái, hash, readiness, nội dung, rubric, lý do) và test cách ly tenant ([BE#52](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/52)); phát hành còn chờ [BE#51](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/51). Client `approve`/`reject` (Idempotency-Key, `{contentHash,rubricHash,reason?}`) đã viết theo controller, chưa gắn vào UI thật. Không cho nhập tay versionId/hash. |
| Admin | Learn CMS `/admin/learn` | Chờ BE + Prototype (dev) | Mở khi BE có CRUD bài/phiên bản, publish/hide/show/delete/restore với ETag + Idempotency-Key, media descriptor theo allowlist YouTube/Facebook/TikTok, đọc công khai chỉ Published ([BE#57](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/57)). Route trong `features/admin-learn/api.ts` là ĐỀ XUẤT, không phải contract. |
| Admin | Thư viện tổ chức `/admin/library` | Chờ BE + Prototype (dev) | Mở khi chốt route + schema (Docs mới có bảng, chưa có route) rồi BE triển khai ([BE#57](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/57)). Metadata thiết bị mới không tự thêm capability runtime. Chưa có client HTTP vì chưa có route. |

### Quy ước prototype (dev)

- Cờ: `isPrototypeEnabled()` (`src/features/dev-prototype/flag.ts`) = `process.env.NODE_ENV !== "production"`. Các module nạp prototype qua `dynamic()` sau điều kiện NODE_ENV viết trực tiếp để bundler loại nhánh khỏi production.
- Mọi prototype có banner "Dữ liệu mẫu · chỉ môi trường phát triển", dữ liệu cục bộ (`sample-store.ts`), không gọi API thật; đặt lại khi tải lại trang. Đây không phải bằng chứng tích hợp.
- Kiểm tra: `tests/e2e/ops-pending-modules.spec.ts` (chạy trên bản production: không banner, không nút "Duyệt", bundle không chứa chuỗi dữ liệu mẫu) và `ops-pending-modules-dev.spec.ts` (chạy trên `pnpm dev`, đặt `PLAYWRIGHT_DEV_URL`).

## Hạng mục tương lai

- **Cookie session để gate role phía server.** Token đang ở `sessionStorage` nên việc chặn theo role (`/admin/*`, `/workspace/*`) chỉ xảy ra phía client sau khi tải; khách chưa đủ quyền vẫn nhận được bundle trang. Cần BE phát hành phiên bằng cookie HttpOnly/SameSite để `proxy`/middleware Next kiểm tra role trước khi trả trang. Việc ẩn UI không thay thế kiểm tra quyền ở API (BE đã kiểm tra mỗi lệnh).
- Khi BE#52/#57 xong: bỏ nhánh prototype, thay `PendingModule` bằng màn thật dùng `contentReviewsApi` và `createLearnCmsApi`, đối chiếu route thực tế.
