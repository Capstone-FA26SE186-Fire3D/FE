# Context — FE

## Hiện trạng đã kiểm tra

- Next.js App Router + React + TypeScript strict; [package.json](../package.json) có scripts `dev`, `build`, `start`, `typecheck`, `lint`, `test:e2e` và giữ pnpm 10.28.2.
- Route composition nằm trong [src/app](../src/app); feature code nằm trong [src/features](../src/features); style/token nền nằm trong [src/assets/styles/globals.css](../src/assets/styles/globals.css).
- [RAG client](../src/features/rag/api.ts) hiện vẫn gọi trực tiếp `POST /chat` và `POST /documents` qua `NEXT_PUBLIC_RAG_API_URL`; production contract phải chuyển qua `.NET API`, nơi kiểm tra Firebase identity, tenant scope, quota/consent và idempotency. Không xem prototype direct call là kiến trúc production.
- Prototype hiện có Three.js landing với một `WebGLRenderer`, building/effects/camera/lifecycle tách module. Editor/preview tổ chức là kiến trúc đích chưa được chứng minh đầy đủ trong code; không gọi prototype landing là editor production. ThreeUI chỉ tham khảo; package runtime hiện không còn dependency ThreeUI.
- Có [pnpm-lock.yaml](../pnpm-lock.yaml); dependency thay đổi phải đi cùng lockfile và xác minh lại bằng `pnpm install --frozen-lockfile`.

## Kiến trúc tích hợp đích — 2026-09-17

- FE tiếp tục dùng Next.js App Router/React/TypeScript. Three.js phục vụ landing và editor/preview 3D của OrganizationUser; Unity gameplay đầy đủ không chạy trong web. Editor có floor/layer/object selection, scenario placement, validation, undo/redo, draft/version và timeline preview.
- Đăng nhập production dùng Firebase Authentication với Google Sign-In. FE gửi Firebase ID token tới C#/.NET backend; không tự quyết định role/`organizationId` và không dùng Supabase Auth.
- FE không kết nối trực tiếp Supabase PostgreSQL/`pgvector`, AWS S3 private hoặc FCM Admin. Database, vector retrieval, signed URL và notification orchestration đi qua backend/service được cấp quyền.
- RAG production dùng Python/FastAPI với Supabase PostgreSQL + `pgvector`; LLM chọn một trong OpenAI hoặc Gemini qua provider adapter. UI không phụ thuộc payload riêng của provider.
- Azure đã được chọn cho AI/RAG FastAPI service; compute cho BE, IFC/Blender worker và Unity worker vẫn phải spike/chốt riêng. Không hard-code public backend URL ngoài cấu hình môi trường.
- Client production gọi API qua endpoint Nginx đã chốt; FE không gọi FastAPI trực tiếp. Base URL, TLS và môi trường được lấy từ cấu hình triển khai.
- Khu organization cần UI cho IFC upload/processing issues/preview, scenario editor, AI draft có citation, Building service/payment và AI usage (granted/used/remaining/overage/unit price/period/terms). FE không tự quyết định entitlement, quota, price hay publish.
- OrganizationUser có thể chạy thử draft/version riêng qua Mobile/Unity; FE chỉ tạo playtest request đúng tenant, để backend kiểm tra Trial quota hoặc Building entitlement Active ở bước start, và không đưa playtest vào learner analytics.
- QR landing là cấp Building: resolve → list bài đã publish → chọn bài → prepare/download/verify package → explicit online start → app session. Preparation không cấp quyền; start mới kiểm tra entitlement/QR/package/runtime và tạo launch grant. Hết hạn vẫn xem landing/status nhưng không tạo phiên mới; không hứa giữ deep link xuyên cài nếu chưa kiểm chứng.
- AI Trainee ở web/mobile ngoài gameplay; không được đọc corpus riêng của organization. RAG UI hiện vẫn prototype/demo và chưa chứng minh production integration.
- AI/RAG service chạy riêng trên Azure; Container Apps là phương án triển khai đề xuất. FE chỉ hiển thị response type/status, citations/source version, BIM anchors và usage kỹ thuật do backend trả. FE không tự tính overage/đơn giá hoặc retry thành request mới khi chưa tra cứu `GET /api/ai/requests/{requestId}`.
- Draft scenario từ AI có trạng thái `NeedsUserEdit`; câu trả lời kiến thức của Trainee/OrganizationUser là `KnowledgeAnswer` độc lập với citation nguồn chung. UI hiển thị source/scope, BIM anchors khi có, request/usage và trạng thái `InsufficientEvidence`/`RejectedBySafetyGate`.

## Chạy và kiểm tra

Từ gốc FE, sau khi dependencies sẵn sàng theo [README](../README.md):
- `pnpm typecheck`: kiểm tra TypeScript strict.
- `pnpm lint`: kiểm tra source app bằng ESLint; thư mục skill/vendor `.agents`, `.codex`, `dist` được bỏ qua.
- `pnpm build`: build production Next.js, không phải UI/e2e test.
- `pnpm dev` hoặc `pnpm start`: dùng khi cần kiểm tra giao diện. Với thay đổi RAG UI, kiểm tra upload, chat, loading, error và sources trên môi trường test phù hợp.
- `pnpm test:e2e`: smoke test Playwright trong `tests/e2e`; cần Chromium runtime cục bộ.
- Build có thể cập nhật file sinh TypeScript; kiểm tra git diff, không commit artifact ngoài phạm vi và không tự bỏ thay đổi của người dùng.
- Ghi bằng chứng build/UI check của từng task trong handoff local hoặc PR; context này không phải báo cáo kiểm thử.

## Thiết kế liên quan

Khi Docs có cạnh repo, đọc requirements/features/workflows phù hợp. UI mẫu hiện tại không đồng nghĩa đã có đủ luồng PlatformAdmin/OrganizationUser/Trainee. Khi checkout độc lập, báo thiếu tài liệu nếu task cần; không tự tạo quyết định sản phẩm.

## Quyết định web UX đã thống nhất — 2026-09-15

- Landing là một website chung, mở trực tiếp cho khách; không có màn hình bắt chọn vai trò. Menu theo nhu cầu: Khám phá, Dành cho tổ chức, Learn, Về chúng tôi; bên phải có Đăng nhập và Tải ứng dụng.
- Landing dùng Three.js cho một hành trình góc nhìn thứ nhất trong công trình đang cháy. Cuộn xuống tiến, cuộn lên lùi theo đường camera; khói và lửa bám vào nguồn trong kiến trúc, có lớp gần/xa, che khuất và ánh sáng phản chiếu. Cảnh giữ mức căng vừa để vẫn đọc được không gian.
- Cuối hành trình có hai ngã rẽ theo nhu cầu: người muốn tập huấn đi đến cảnh thu vào điện thoại rồi đăng nhập/Góc học tập; người muốn tổ chức tập huấn đi theo camera nâng ra mặt cắt tòa nhà rồi chuyển mượt sang Dành cho tổ chức.
- Nhận diện định hướng: nền than chì `#141719`, bề mặt `#202629`, chữ `#F3F5F4`, chữ phụ `#B8C1C4`, ember cam `#EE8654`; headline “Làm quen hôm nay. Chủ động ngày mai.”. Font mặc định đề xuất là Be Vietnam Pro (self-host WOFF2, có fallback system-ui); các thông số phải được kiểm tra lại trên bản dựng.
- Learn web là nội dung đọc/tìm kiếm công khai có nguồn; hỏi AI, hỏi về bài đang đọc và lưu bài yêu cầu đăng nhập. Góc học tập chứa AI, bài lưu, lịch sử và kết quả cá nhân. Learn web được phân biệt với mode Learn chạy trong Unity.
- Thiết kế sản phẩm: “Mở trên điện thoại” dùng Building QR ổn định, sau đó chọn Training. Prototype hiện chưa có QR/APK phát hành, không dựng chức năng giả. Android cài một lần, resolve Building → list → tải/verify package rồi mở Unity; web không suy đoán trạng thái cài app.

## Cập nhật prototype từ phản hồi

- Junction là chữ sơn trên tường + vùng bấm trong suốt; chọn nhánh chỉ chuyển cảnh, Tiếp tục mới đổi route. Điện thoại 3D có màn hình render target sống.
- Mặt cắt giữ tầng/cầu thang liên tục, ẩn vỏ ngoài. Orbit nhận focus khi click/kéo, hỗ trợ Arrow/Home, không hiện outline theo yêu cầu. Footer riêng landing đã bỏ.
- Cháy lan phòng/hành lang/cầu thang/mặt ngoài/mái; smoke volume có depth occlusion và fade biên. NPC có đường đi/khớp/phản ứng dựng sẵn, không solver sơ tán.
- Nhánh tổ chức: sạm65–105s, sụp từng khu110–143s theo đồng hồ nhánh; rời nhánh reset. Collapse là hoạt cảnh minh họa, không phân tích kết cấu. reveal sở hữu visibility, damage không được bật shell đã ẩn.
- Auth/Learn/hub dùng sessionStorage có kiểm tra dữ liệu; bài lưu và chat là demo. `/demo/rag` giữ contract AI thử nghiệm.
- Bài học ổn định ở [lessons](lessons.md); kiểm chứng/giới hạn ở [ledger](../docs/landing-completion-plan.md). Không coi build pass là nghiệm thu visual/hiệu năng.
- Hướng thực thi và giới hạn nằm trong [Docs/fire3d-web-ux-design.md](../../Docs/fire3d-web-ux-design.md). Landing, Learn và AI cộng đồng là prototype web; không xem chúng là pipeline production hay chứng nhận an toàn.
- Cấu trúc source hiện tại là feature-first App Router: `assets`, `components/ui`, `configs`, `features/<feature>/{components,scene,types}`, `layouts`, `store`, `utils`, cùng các route trong `app`. Không tạo `pages/` hoặc root `App.tsx`; route/layout chỉ composition, không chứa logic Three.js hoặc truy vấn dài.

## Contract cập nhật — 2026-09-18

- FE gọi `.NET API` cho AI production; không gọi FastAPI trực tiếp trong flow production. FE hiển thị request status/citations/usage kỹ thuật và tra cứu request khi timeout, không tự tính overage hoặc billing.
- Editor/playtest và session UI phải hiển thị lỗi package compatibility khi manifest thiếu metadata hoặc runtime catalog không hỗ trợ. Retry cùng idempotency payload được replay; payload khác phải báo conflict.
- Processing/billing status trong UI dùng trạng thái backend có mã ổn định (`Busy`, `AlreadyCompleted`, `NotClaimable`, `StaleAttempt`, `Conflict`), không suy diễn từ chuỗi lỗi SQL.

## Contract hardening — 2026-09-18

- UI period AI chỉ hiển thị snapshot đã chốt; late/uncertain usage là adjustment riêng, không tự tính lại theo policy mới. FE không tự gắn quotation/payment hoặc đổi status.
- Package/artifact pinned không cho phép editor/publish flow thay tại chỗ; package compatibility phải fail-closed khi capability có phần tử sai kiểu/rỗng hoặc provenance/hash thiếu.
- Processing UI hiển thị mã kết quả worker ổn định (`Claimed`, `Busy`, `AlreadyCompleted`, `NotClaimable`, `Conflict`, `StaleAttempt`) và dùng idempotency/reconcile; không suy diễn từ lỗi text.
