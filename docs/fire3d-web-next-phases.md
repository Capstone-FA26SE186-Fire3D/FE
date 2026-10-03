# Fire3D Web — roadmap các phase tiếp theo

## Mục tiêu

Hoàn thiện `web-react` theo tài liệu sản phẩm, theo lát dọc cho ba vai trò:

| Vai trò | Có thể nối API hiện có | Chờ backend production hoàn thiện |
| --- | --- | --- |
| Tổ chức | Dashboard operations, Building/IFC revision, scenario draft, support | Readiness, release, QR, billing, playtest thật |
| Học viên | Hồ sơ, nội dung Learn công khai, support | Bookmark/server history, QR/session, kết quả, AI |
| Platform Admin | Account/organization, support, feedback, audit, operations | Learn CMS, quyền và tenant hardening đầy đủ |

Phạm vi roadmap này là Web. Mobile Expo và Unity nhận handoff sau khi contract release, QR và session ổn định.

## Nguyên tắc tích hợp

- Web chỉ gọi .NET API; không gọi FastAPI RAG, Redis, Supabase hay worker trực tiếp.
- Chức năng chưa có API production hoặc backend gate sẽ được ẩn, không làm mock như tính năng sẵn sàng dùng.
- Không kết luận công trình đạt PCCC từ client. IFC/validation/provenance chỉ phản ánh trạng thái server trả về; đề xuất PCCC luôn cần chuyên gia thẩm định.
- Mọi thao tác ghi phải hiển thị loading, lỗi `ProblemDetails`, trạng thái rỗng và xử lý xung đột ETag/`409` rõ ràng.
- Mỗi phase làm trên branch riêng từ `origin/develop`, qua PR vào `develop`; không tự phát hành `main`.

## Phase 0 — Chuẩn bị tích hợp

1. Đưa branch dashboard/password visibility hiện tại qua PR vào `develop` trước khi bắt đầu lát mới.
2. Chuẩn hóa role guard, điều hướng sau đăng nhập, loading/empty/error state và mapping lỗi API dùng chung.
3. Rà soát menu theo role để chỉ dẫn đến capability có API thật; giữ Platform Admin tách khỏi dashboard Tổ chức/Học viên.

**Nghiệm thu:** role không được phép nhận `403` hoặc bị điều hướng an toàn; không có nút Publish, QR, Billing, Playtest hay AI hoạt động khi gate BE chưa sẵn sàng.

## Phase 1 — Hoàn thiện phần API Web đang có

### Tổ chức

1. Thay dashboard tĩnh bằng operations analytics của tổ chức.
2. Hoàn thiện luồng Building → IFC revision → processing/provenance → preview → scenario draft.
3. Nâng scenario editor từ dữ liệu thô sang form dựa trên interaction catalog; giữ autosave, ETag conflict, validation cấu trúc và snapshot/version history.
4. Không gắn nhãn validation cấu trúc là geometry validation, PCCC certification hoặc publish readiness.

### Học viên

1. Giữ Learn công khai và hồ sơ tài khoản.
2. Không dùng bookmark, chat, lịch sử hoặc kết quả lưu local-demo như dữ liệu tài khoản thật.
3. Chỉ đưa support/ticket vào dashboard nếu response API đã có tenant-safe contract.

### Platform Admin

1. Nối feedback, support ticket/message/status, audit log và operations analytics vào API admin hiện có.
2. Giữ account/organization management tách vai trò và kiểm tra quyền ở server.

**Nghiệm thu:** có kiểm thử cho đăng nhập từng role, Building/IFC/scenario save-conflict, admin support/audit và truy cập sai role.

## Phase 2 — Contract BE cần có trước khi mở capability lớn

Backend cần hoàn tất, kiểm thử và ghi Swagger/API docs cho các dependency sau:

1. Schema đích, actor/tenant authorization và Google onboarding/link.
2. IFC outbox/worker receipt/provenance; readiness phải gắn đúng cặp `revision + scenario version`.
3. Entitlement theo Building, payment/webhook và release publish gate.
4. QR Building, Training preparation/start, launch grant và đồng bộ kết quả Unity.
5. Learn CMS/bookmark và AI request/quota/citation.

Khi mỗi contract được chốt, FE thêm DTO/client đã type-safe, UI state và test contract tương ứng. Không giả định endpoint từ route prototype hoặc từ worker nội bộ.

## Phase 3 — Mở đầy đủ luồng Organization và Trainee

### Tổ chức

1. Review readiness theo revision-version.
2. Tạo/revoke release, xem package provenance và QR Building.
3. Quản lý entitlement/billing theo từng Building.
4. Playtest với trạng thái server, quyền tenant và entitlement thật.

### Học viên

1. Quét hoặc nhập QR Building, xem training đã publish và preparation state.
2. Nhận launch grant/deep-link Unity; Web không tự mô phỏng gameplay Unity.
3. Xem lịch sử, kết quả cá nhân và trạng thái đồng bộ sau khi session API có dữ liệu chuẩn.

### Platform Admin

1. Quản trị Learn CMS sau khi API CMS có lifecycle Published/Hidden/Deleted.
2. Theo dõi analytics tenant-safe, audit và hỗ trợ vận hành.

**Nghiệm thu:** publish, QR, session, entitlement và result chỉ hiển thị success khi backend trả bằng chứng gate/provenance tương ứng.

## Phase 4 — AI/RAG

Chỉ thực hiện sau BIM, training và release:

1. Tích hợp qua `/api/ai/...` do .NET sở hữu authorization, tenant scope, quota, billing và audit.
2. AI cho Tổ chức trả giải thích/citation hoặc scenario draft `NeedsUserEdit`; không tự sửa editor, publish hoặc thay đổi scoring.
3. AI cho Học viên trả kiến thức/debrief có citation; không thay thế hướng dẫn khẩn cấp thực tế.
4. Client gửi idempotency key và tra cứu request status khi timeout trước khi retry.

## Kiểm thử bắt buộc

- Unit/component: role guard, mapping `ProblemDetails`, ETag conflict và capability ẩn.
- Playwright: login/redirect từng role, Building/IFC/scenario, admin support/audit, quyền sai role.
- Contract/integration staging theo từng capability: IFC provenance, tenant isolation, release/QR/session/billing sau khi BE mở gate.
- Mỗi phase chạy `pnpm typecheck`, lint, build và nhóm E2E liên quan. Build không phải bằng chứng email, worker, payment, PCCC hay provider production hoạt động.

## Quyết định đã chốt

- Ưu tiên Web trước, làm lát dọc Organization và Trainee song song theo dependency, sau đó Platform Admin.
- Capability chưa có API production sẽ bị ẩn hoàn toàn.
- AI/RAG để giai đoạn sau cùng.
- Tài liệu không tự phát hành `main`; commit, push và PR chỉ thực hiện khi được yêu cầu.
