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
| Org | Chi tiết công trình: Tổng quan, sửa nhanh | Đã tích hợp (mock test) | `/workspace/buildings/[id]?tab=&revision=`; admin mở cùng trang (PUT kèm `organizationId` của công trình) |
| Org | Chi tiết công trình: IFC & xử lý | Đã tích hợp (mock test) | Stepper upload (Idempotency-Key, SHA-256 chunked, XHR progress, retry giữ key, URL ký hết hạn), polling job 3s, QA tách khỏi job Succeeded, issues theo mức độ, logs/artifacts/BIM facts, annotations dạng danh sách (If-Match, 412 giữ nội dung), preview GLB (NotReady, URL hết hạn, WebGL lost, theme), confirm-for-training (chỉ sẵn sàng kỹ thuật). Chưa thử với API thật |
| Org | Chi tiết công trình: Kịch bản | Đã tích hợp (mock test) | Danh sách + tạo (Idempotency-Key) + link tới editor `/scenarios/[scenarioId]` (editor do agent khác); `/scenarios` mở tab này |
| Org | Chi tiết công trình: Quyền tham gia | Đã tích hợp (mock test) | `access` GET/PATCH + rotate/revoke, If-Match `"access-N"`, mã mới hiện một lần, Modal xác nhận tác động, 412 |
| Org | Chi tiết công trình: Dịch vụ | Placeholder | `building-services-tab.tsx` là bản tạm, agent billing thay thế |
| Admin | Công trình theo tổ chức | Đã tích hợp (mock test) | `/admin/organizations/[organizationId]/buildings` và `/workspace/buildings?org=`; `organizationId` ở query (list/update/archive) và body (create); OrganizationUser không gửi |
| Org | Phiên bản & readiness của kịch bản (`/workspace/buildings/[id]/scenarios/[scenarioId]/versions`) | Đã tích hợp một phần (mock test) | Snapshot (Idempotency-Key + If-Match, 412 giữ nội dung), package build + polling 3s, QA/issue Error/Critical + confirm-for-training, gửi duyệt, release Built, Phát hành hiện 503 `PUBLISH_GATE_UNAVAILABLE` (BE#51). Trạng thái duyệt/release/xác nhận sau reload **Chưa có dữ liệu (chờ BE)** (BE#52, BE#53): chỉ nhớ theo tab (sessionStorage), không suy đoán. Status job/QA suy từ SQL, chưa có enum công bố |
| Org | Dịch vụ & thanh toán (`/workspace/billing`, tab Dịch vụ của công trình) | Đã tích hợp (mock test) | Báo giá 1..n Building theo snapshot BE, accept (If-Match, 409 sau hạn), PayOS create/cancel (Idempotency-Key), poll `paymentStatus` rồi `provisioningStatus` từng Building, entitlement `isEffective`, nhắc hết hạn 5 ngày, yêu cầu liên hệ số lượng lớn. `/workspace/billing/return` chỉ điều hướng; cần cấu hình `PayOS__ReturnUrl/CancelUrl` trỏ tới đó. Chưa kiểm chứng với PayOS/BE thật |
| Org | Nâng cấp gói, suất học viên, quota AI pooled, top-up | Chờ BE (#56) (+ Prototype) | Production chỉ khối "Chờ BE"; dev có banner "Dữ liệu mẫu", không gọi API |
| Admin | Thương mại (`/admin/commerce?tab=`) | Đã tích hợp (mock test) | Gói (tạo/sửa If-Match, 412), giảm giá, báo giá (phát hành với thuế/điều khoản/hạn), tra cứu thanh toán theo checkoutId + reconcile, danh sách yêu cầu doanh nghiệp |
| Admin | Xử lý yêu cầu liên hệ doanh nghiệp, danh sách thanh toán | Chờ BE (#56) | BE chỉ có GET danh sách enterprise request; không có API đổi trạng thái/chuyển thành báo giá, không có API liệt kê payment cho Admin |
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
| Admin | Tổng quan vận hành `/admin/overview` | Đã tích hợp (mock test) | Chỉ `/api/admin/analytics/operations` (tài khoản, công trình, IFC, ticket); `from`/`to` ≤ 90 ngày trong URL; parse cả `{key,count}` và `{isActive,count}` (BE#59). Lượt chơi/hoàn thành/doanh thu/AI: thẻ "Chờ BE" (BE#58). Đích mặc định của PlatformAdmin |
| Admin | Hỗ trợ & audit `/admin/support` | Đã tích hợp (mock test) | Tab Ticket (filter/phân trang URL, drawer chi tiết, phân công/trạng thái PATCH `If-Match "support-N"`, 412 giữ lựa chọn, tin nhắn Idempotency-Key), Phản hồi (đổi trạng thái), Nhật ký audit (7 bộ lọc, mặc định 30 ngày, chặn > 90 ngày ở UI, chỉ metadata). Chờ BE: người tạo/tổ chức của ticket & feedback, tên người dùng, đính kèm, thông báo, diff audit |
| Org | Hỗ trợ & phản hồi `/workspace/support` | Đã tích hợp (mock test) | Tạo ticket (Idempotency-Key giữ khi retry), danh sách, lịch sử trao đổi, tin nhắn, feedback; chỉ OrganizationUser (creator-owned) |
| Admin | Tổ chức `/admin/organizations` | Đã tích hợp (mock test) | Bảng + drawer chi tiết/tạo, filter/phân trang URL, khóa/mở có xác nhận, link tạo owner và `/admin/organizations/{id}/buildings` (trang do task khác). Chờ BE: địa chỉ/SĐT, sửa hồ sơ từ admin (BE#60) |
| Org | Hồ sơ `/workspace/profile` (+ `/account` dùng chung) | Đã tích hợp (mock test) | Field/Alert/toast, ETag `"N"`, 412 giữ nội dung + tải bản mới, lỗi field từ API; `/account` bọc `PublicOpsScope` (tối cố định) |
