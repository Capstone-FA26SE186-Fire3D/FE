# Context — FE

## Contract sản phẩm hiện hành — Docs v7

Nguồn chuẩn: [v7 contract](../../Docs/schema_v7_contract.md) và [requirements](../../Docs/fire_evacuation_requirements.md). Các đoạn contract cũ bên dưới đã được hiệu chỉnh theo v7; đây là thiết kế đích, không phải bằng chứng implementation hoặc deployment đã đạt.

- Tách Organization console (Building/IFC, scenario, analytics, billing) khỏi Learn public; PlatformAdmin quản lý hệ thống, Learn và Organization Library. Library gồm template/rubric mẫu/metadata thiết bị hỗ trợ, không tự chia sẻ IFC/scenario riêng sang Learn.
- Organization được tự soạn hoặc dùng template tùy chọn. UI gửi từng scenario/rubric version cho PlatformAdmin review, hiển thị lý do từ chối; submit đóng băng hash, sửa tạo version và duyệt lại. IFC QA/ConfirmForTraining không thay duyệt nội dung. Metadata thiết bị mới không tự bổ sung capability runtime.
- Building Private mặc định; code tạo grant gắn account + `access_revision`. Đổi/thu hồi code hoặc visibility vô hiệu grant cũ; Public yêu cầu Trainee đăng nhập. QR không cấp quyền. API kiểm access trước list/package/prepare và recheck approval/publish, entitlement, runtime, learner seat tại online start.
- Billing UI là gói Building 6/12 tháng (game, learner limit, AI quota), số Trainee khác nhau/kỳ và nâng cấp/gia hạn; chỉ start lần đầu tính suất, không tính login/list/prepare/playtest. Upgrade giữ kỳ/suất đã dùng, renewal kỳ mới. Quota AI Organization trả trước pooled, hết thì thanh toán top-up trước khi dùng tiếp; không overage, consent overage hoặc AI billing period trả sau. Trainee quota ngày riêng.
- Learn Article/Tip/Video Published mở cho khách, bookmark/AI yêu cầu đăng nhập; khác Learn mode Unity. Trainee tự chọn Learn/Guided Drill/Assessment, không prerequisite/sprint, retry không giới hạn, không certificate. Kết quả do server trả `Passed|NotPassed|Incomplete|NotAssessed`, tách khỏi session completion; AI bị chặn trong Assessment.
- Scenario RAG chỉ `name`, `objectives`, `instructions` approved/published và còn quyền/service; không draft/rubric/đáp án/IFC private. Hỏi Learn phải pin cả `learn_post_id` và published `learn_version_id`; Hidden chỉ có thể RAG theo quyền backend, không public. Sau mất quyền chỉ còn Common và giải thích kết quả cá nhân đã lưu, không retrieval Building mới.
- Auth theo [BE authentication](../../BE/docs/authentication.md): form → request OTP → verify OTP nhận registrationToken → register tạo account → login riêng nhận JWT. Firebase chỉ Google; Google mới nhận proof OnboardingRequired, completion trả 201 Authenticated kèm phiên BE. Proof có displayName nullable và chỉ giữ trong bộ nhớ; completion đã dùng hoặc mất response cần người dùng xác minh Google rồi exchange lại. Hồ sơ có giao diện liên kết Google tường minh (`POST /api/me/link-google`: mật khẩu hiện tại + Firebase idToken; thành công thu hồi mọi phiên nên buộc đăng nhập lại) và đặt mật khẩu local lần đầu cho tài khoản Google-only (`POST /api/me/password`); idToken/mật khẩu không được lưu hay ghi log. Source/test/deployment và nghiệm thu Firebase thật là các bằng chứng riêng.
- Giá, lượng/đơn vị quota, expiry/rollover, chính sách giá nâng cấp và ngưỡng rubric chưa chốt; UI hiển thị cấu hình/snapshot backend, không hard-code quyết định sản phẩm.

## Hiện trạng đã kiểm tra

- Next.js App Router + React + TypeScript strict, pnpm theo `package.json`; routes ở `src/app`, nghiệp vụ ở `src/features`, API chung ở `src/api`.
- Source `main` đã có Organization/Admin console, Building/IFC, editor `fet3d.editor/1`, review, billing, Learn CMS/public/bookmark, AI Organization/Trainee và training history. Xem [tracker vận hành](../docs/fet3d-operations-ui-tracker.md) để biết bằng chứng và điều kiện từng màn; không suy ra acceptance production từ việc có UI.
- Editor Three.js nằm ở `src/features/scenario-editor`, tách state/command undo-redo khỏi renderer, giữ ETag/If-Match và capability catalog. Three.js landing và editor là hai phạm vi riêng; gameplay Android vẫn thuộc Unity.
- FE đã có `src/features/playtest` và QR/deep link bàn giao Organization playtest; backend cấp quyền, Mobile/Unity chạy thử và đồng bộ. QR Building cho Trainee là luồng riêng.
- `src/features/rag/api.ts` vẫn là legacy direct `/chat`/`/documents` cho demo; `/demo/rag` chỉ bật trong dev. Luồng AI nghiệp vụ đi qua API .NET, không coi direct client legacy là kiến trúc production.
- Token được lưu bằng cookie first-party `fire3d_session` do JavaScript quản lý, dùng chung giữa các tab; fallback `localStorage` khi cookie không ghi được hoặc payload quá lớn, và đọc `sessionStorage` cũ để tương thích. Đây không phải cookie HttpOnly hay phiên xác thực phía server. Client gửi Bearer token tới .NET; backend vẫn quyết định authorization. Xem `src/features/auth/session-store.ts` và `auth-session.tsx`. Firebase thật, workspace bootstrap và E2E Android/provider cần nghiệm thu riêng.
- Khi đổi dependency phải cập nhật lockfile; lệnh kiểm tra lấy từ `package.json`. Context này mô tả source, không báo build/test mới đã chạy.

## Kiến trúc tích hợp đích — 2026-09-17

- FE tiếp tục dùng Next.js App Router/React/TypeScript. Three.js phục vụ landing và editor/preview 3D của OrganizationUser; Unity gameplay đầy đủ không chạy trong web. Editor có floor/layer/object selection, scenario placement, validation, undo/redo, draft/version và timeline preview.
- Đăng nhập production dùng email/password qua .NET hoặc Google Sign-In qua Firebase. FE gửi credential/token tới backend theo contract; không tự quyết định role/`organizationId` và không dùng Supabase Auth.
- FE không kết nối trực tiếp Supabase PostgreSQL/`pgvector`, AWS S3 private hoặc FCM Admin. Database, vector retrieval, signed URL và notification orchestration đi qua backend/service được cấp quyền.
- AI đã có RAG v2 (`rag-api/app/v2`, PgVectorIndex/MemoryIndex, request recovery và provider adapters); ChromaDB/direct chat là legacy. Production dùng Python/FastAPI với Supabase PostgreSQL + `pgvector`; LLM chọn một trong OpenAI hoặc Gemini qua provider adapter. UI không phụ thuộc payload riêng của provider.
- Azure đã được chọn cho AI/RAG FastAPI service; compute cho BE và IFC/Blender worker còn cần xác minh; Unity build worker đã chọn Azure VM Windows do BE vận hành. Không hard-code public backend URL ngoài cấu hình môi trường.
- Kiến trúc ingress đích là OneShield/OnePortal (iNET) → Nginx; chưa suy ra edge đã triển khai từ cấu hình client; FE không gọi FastAPI trực tiếp. Base URL, TLS, edge policy và môi trường được lấy từ cấu hình triển khai; FE không phụ thuộc vào header edge để quyết định quyền.
- IFC (17/10/2026): màn "Thiết bị phát hiện từ IFC" (xác nhận/đổi loại/loại bỏ, `If-Match`), bước chọn cửa thoát khi `exitConfirmationRequired` (IFC_EXIT_UNKNOWN phương án B), mã QA tiếng Việt ở `features/buildings/qa-codes.ts`, đánh dấu `ifcGlobalIds` trong preview qua `semanticMapping`. AI tổ chức kiểm `/api/ai/organization/limits` trước khi gửi; bộ lọc đọc từ URL phải qua danh sách v7 (`urlFilter`).
- Khu organization cần UI cho IFC upload/processing issues/preview, scenario editor, AI draft có citation, Building service/payment và AI usage (granted/reserved/used/remaining, top-up trả trước, validity và payment history). FE không tự quyết định entitlement, quota, price hay publish.
- OrganizationUser có thể chạy thử draft/version riêng qua Mobile/Unity; FE chỉ tạo playtest request đúng tenant, để backend kiểm tra Trial quota hoặc Building entitlement Active ở bước start, và không đưa playtest vào learner analytics.
- Web desktop không chạy full gameplay. Khi OrganizationUser bấm **Playtest**, FE gọi contract mục tiêu `POST /api/scenarios/{scenarioId}/playtests`, sau đó hiển thị trạng thái và một QR/deep link handoff ngắn hạn cho Mobile. QR/deep link chỉ mang mã opaque/one-time reference, không chứa credential, package hoặc quyền nghiệp vụ; FE không dùng QR Building của Trainee cho luồng này.
- Mobile redeem handoff bằng session của OrganizationUser (yêu cầu đăng nhập nếu chưa có), gọi `POST /api/playtests/{playtestId}/start`; backend kiểm tra tenant, Trial/entitlement, package hash và runtime compatibility rồi cấp launch grant. Mobile chỉ cần màn hình xác nhận tối giản, mở Unity qua native bridge, đồng bộ event/result về backend; FE theo dõi trạng thái/result qua API. Nếu chưa có Mobile thì web chỉ preview/editor, không giả lập gameplay.
- FE, BE và Mobile đã có source cho editor/playtest/handoff; APK tích hợp runtime đã được build. Nghiệm thu E2E với package thật và thiết bị là bước riêng; không suy ra từ mock tests.
- QR landing là cấp Building: resolve → list bài đã publish → chọn bài → prepare/download/verify package → explicit online start → app session. Preparation không cấp quyền; start mới recheck access, approval/publish, entitlement, learner seat và package/runtime và tạo launch grant. Hết hạn vẫn xem landing/status nhưng không tạo phiên mới; không hứa giữ deep link xuyên cài nếu chưa kiểm chứng.
- AI Trainee ở web/mobile ngoài Assessment; chỉ đọc Learn/Common, giải thích kết quả cá nhân và snapshot scenario learner-safe được backend cấp quyền, không đọc kho nội bộ organization. Từ 17/10/2026 Góc học tập có Hỏi đáp AI Trainee thật qua `/api/ai/trainee/*` (hạn mức ngày, ngữ cảnh Learn/Training/Result, `resultWithheld`); chưa nghiệm thu với provider thật.
- AI/RAG service chạy riêng trên Azure; Tài liệu AI hiện hướng dẫn App Service code deploy; nghiệm thu hạ tầng/provider là bước riêng. FE chỉ hiển thị response type/status, citations/source version, BIM anchors và usage kỹ thuật do backend trả. FE không tự tính quota/đơn giá hoặc retry thành request mới khi chưa tra cứu `GET /api/ai/requests/{requestId}`.
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
- Thiết kế sản phẩm: “Mở trên điện thoại” dùng Building QR ổn định, sau đó chọn Training. Source đã có QR/deep link và Mobile có APK tích hợp Unity; khả năng phân phối APK/deep link trên thiết bị cần kiểm riêng. Android cài một lần, resolve Building → list → tải/verify package rồi mở Unity; web không suy đoán trạng thái cài app.

## Cập nhật prototype từ phản hồi

- Junction là chữ sơn trên tường + vùng bấm trong suốt; chọn nhánh chỉ chuyển cảnh, Tiếp tục mới đổi route. Điện thoại 3D có màn hình render target sống.
- Mặt cắt giữ tầng/cầu thang liên tục, ẩn vỏ ngoài. Orbit nhận focus khi click/kéo, hỗ trợ Arrow/Home, không hiện outline theo yêu cầu. Footer riêng landing đã bỏ.
- Cháy lan phòng/hành lang/cầu thang/mặt ngoài/mái; smoke volume có depth occlusion và fade biên. NPC có đường đi/khớp/phản ứng dựng sẵn, không solver sơ tán.
- Nhánh tổ chức: sạm65–105s, sụp từng khu110–143s theo đồng hồ nhánh; rời nhánh reset. Collapse là hoạt cảnh minh họa, không phân tích kết cấu. reveal sở hữu visibility, damage không được bật shell đã ẩn.
- Phiên đăng nhập dùng shared cookie store và fallback theo phần hiện trạng ở trên. Góc học tập: "Bài đã lưu" là API bookmark thật; "Hỏi đáp" (AI Trainee, BE#77) và "Lịch sử" (BE#78/#96, bộ lọc Building từ `/api/training/buildings`) là view thật; `CapabilityUnavailable` giữ lại cho capability bị chặn sau này. Không còn demo-session/demo-answer. `/demo/rag` chỉ có ở server phát triển (production build trả 404, `notFound()`), không liên kết từ khu production; spec prototype chạy với `PLAYWRIGHT_SERVER_MODE=dev`.
- Bài học ổn định ở [lessons](lessons.md); kiểm chứng/giới hạn ở [ledger](../docs/landing-completion-plan.md). Không coi build pass là nghiệm thu visual/hiệu năng.
- Hướng thực thi và giới hạn nằm trong [Docs/fire3d-web-ux-design.md](../../Docs/fire3d-web-ux-design.md). Landing là trải nghiệm giới thiệu; Learn/AI có API integration riêng. Không coi UI hoặc mock acceptance là bằng chứng toàn pipeline production.
- Cấu trúc source hiện tại là feature-first App Router: `assets`, `components/ui`, `configs`, `features/<feature>/{components,scene,types}`, `layouts`, `store`, `utils`, cùng các route trong `app`. Không tạo `pages/` hoặc root `App.tsx`; route/layout chỉ composition, không chứa logic Three.js hoặc truy vấn dài.

## Contract cập nhật — 2026-09-18

- FE gọi `.NET API` cho AI production; không gọi FastAPI trực tiếp trong flow production. FE hiển thị request status/citations/usage kỹ thuật và tra cứu request khi timeout, không tự tính quota hoặc billing.
- Editor/playtest và session UI phải hiển thị lỗi package compatibility khi manifest thiếu metadata hoặc runtime catalog không hỗ trợ. Retry cùng idempotency payload được replay; payload khác phải báo conflict.
- Processing/billing status trong UI dùng trạng thái backend có mã ổn định (`Busy`, `AlreadyCompleted`, `NotClaimable`, `StaleAttempt`, `Conflict`), không suy diễn từ chuỗi lỗi SQL.

## Contract hardening — 2026-09-18

- UI AI hiển thị số dư/grant/usage và lịch sử mua quota trả trước từ backend. Usage chưa chắc xử lý theo request status/reconcile, không có UI hóa đơn AI cuối kỳ; FE không tự gắn payment/grant hoặc đổi status.
- Package/artifact pinned không cho phép editor/publish flow thay tại chỗ; package compatibility phải fail-closed khi capability có phần tử sai kiểu/rỗng hoặc provenance/hash thiếu.
- Processing UI hiển thị mã kết quả worker ổn định (`Claimed`, `Busy`, `AlreadyCompleted`, `NotClaimable`, `Conflict`, `StaleAttempt`) và dùng idempotency/reconcile; không suy diễn từ lỗi text.

## Redis boundary — 2026-09-19

- FE chỉ gọi API qua OneShield/OnePortal → Nginx/.NET; không kết nối Redis, không đọc stream và không giữ Redis credential. Backend là authority cho auth, entitlement, quota, billing và publish.
- UI xử lý trạng thái chờ/chậm khi cache fallback hoặc event processing chưa hoàn tất; retry dùng idempotency key và không tự coi request timeout là thất bại.
- Danh mục/package metadata/list/dashboard có thể được backend cache-aside, nhưng response phải vẫn kiểm tra tenant/scope và không dùng cache cũ để vượt revoke hoặc start gate.
- FE không suy diễn completion hoặc business success từ Redis delivery/ACK; chỉ hiển thị trạng thái API (`pending`/`retry`/`conflict`) và gửi lại cùng idempotency key khi backend yêu cầu.

## Learn blog boundary — 2026-09-19

- FE mục tiêu có public Learn reader/search/filter theo situation và kind `Article`/`Tip`/`Video`, cùng PlatformAdmin CMS cho Draft/Published và trạng thái bài Unpublished/Published/Hidden/Deleted; hỗ trợ publish ngay, hide/show/delete/restore và ETag/idempotency. Hidden không public nhưng RAG hợp lệ; Deleted bị loại. Learn CMS (/admin/learn), Learn công khai và bookmark Trainee đã nối API thật từ 2026-10 (bằng chứng mock; xem tracker); hỏi đáp và lịch sử Góc học tập cũng đã có API client thật; provider/deployment acceptance theo tracker.
- Renderer chỉ nhận media descriptor đã backend validate; hỗ trợ YouTube/Facebook/TikTok theo provider allowlist, có fallback summary/link khi không embed được. Không render iframe/HTML/script tùy ý.
- Admin UI gửi ETag/revision và idempotency cho version/publish/hide/show/delete/restore; public UI không nhận Draft/Hidden/Deleted. Trainee bookmark qua `.NET API` và gửi `postId`/`versionId` khi hỏi AI; FE không tự quyết định source scope, RAG eligibility, cache invalidation hoặc quota.

- Hồ sơ mục tiêu cho phép đổi username/tên hiển thị/avatar/mật khẩu; username unique lowercase. Trainee nhập username ngay ở local registration hoặc Google onboarding; FE không hiển thị username gate ở session start. Account cũ thiếu username được nhắc hoàn thiện qua profile. Avatar upload qua S3 intent/complete/delete, không lưu signed URL.

## FET3D onboarding and commercial UI — 2026-09-19

- Google onboarding đã có source/API: Google mới hiển thị onboarding chọn Trainee hoặc OrganizationUser sau khi backend xác minh Firebase; account đã link đăng nhập theo role cũ. FE không tự cho chọn PlatformAdmin hoặc organization có sẵn.
- Organization UI quản lý nhiều Building, bắt buộc tên/địa chỉ trước checkout, chọn một/nhiều Building và thời hạn, hiển thị giá gốc/discount/tổng tiền theo quotation snapshot. Gói số lượng lớn dùng form liên hệ, chưa tạo payment.
- Billing UI hiển thị entitlement từng Building, kỳ hết hạn và danh sách nhắc trước 5 ngày; gia hạn chọn lọc. FE chỉ gọi API, không tự tính entitlement/discount cuối cùng hoặc kết nối Redis.

## Final review corrections — 2026-09-19

- Local email/password and Google sessions are both valid for QR/onboarding; Google is not a mandatory login path. FE sends the backend-owned session/exchange result and never chooses tenant or PlatformAdmin.
- Profile/reset UI must represent server-side family revocation and ETag conflicts. Learn publish/hide/show/delete/restore retries use durable idempotency; FE does not infer success from stale cache or Redis ACK.
- BuildingService quotation scope is represented by quotation lines; the removed header fields `building_id`, `service_package_id` and `service_duration_months` must not be added back to client forms or response types.

## Recovery and billing correction — 2026-09-19

- FE calls API gates for session events/results, processing status and AI billing; it does not infer completion, payment or entitlement from Redis/cache. Retry sends the stable idempotency key/hash and handles Conflict/StaleAttempt/NeedsReconcile explicitly.

## Khu vận hành Organization + PlatformAdmin — 2026-10-10

Đã phát hành (FE PR #41, #43). Trạng thái từng màn hình, issue BE liên quan và điều kiện mở tính năng nằm ở [docs/fet3d-operations-ui-tracker.md](../docs/fet3d-operations-ui-tracker.md); đó là nguồn trạng thái, file này chỉ giữ kiến trúc ổn định.

- **Shell và theme:** `src/layouts/operations-shell.tsx` dùng chung cho `/workspace/*` và `/admin/*` (`areaId` "organization"|"admin"; nav và role ở `src/layouts/nav-config.ts`). Theme Sáng/Tối/Theo hệ thống lưu ở trình duyệt; token chỉ nằm trong `.ops-theme` (`src/assets/styles/ops.css`), landing/Learn/auth giữ token tối toàn cục. Màu mới dùng token và kiểm tương phản ≥ 4.5:1 ở cả hai theme.
- **Role gate hiện là phía client**. Shared cookie store hiện tại đọc được bằng JavaScript; chưa có server-validated HttpOnly session hoặc role gate phía server. BE thực thi authorization cho từng API.
- **Thành phần dùng chung:** `src/components/ui/*` (Field, Table/Pagination, Tabs, Modal/Drawer trên Radix, Toast, Skeleton, EmptyState, Alert, StatusBadge). Màn hình mới tái dùng, không thêm thư viện UI khác. Lucide là bộ icon duy nhất của khu này; motion chỉ cho chuyển động ngắn và tôn trọng reduced motion.
- **Tầng API:** `src/api` — lỗi có kiểu (`ApiError.code`, `fieldErrors` từ ProblemDetails `errors` hoặc `{code,path,message}`), `Retry-After`, `idempotencyKey`/`ifMatch` trong `apiClient.request`, `useIdempotencyKey` (giữ key khi retry cùng payload, đổi khi payload đổi), `usePolling` (3s, backoff, Retry-After, dừng khi ẩn tab/hoàn tất), `useUrlParams`/`useUrlSearch` (filter và phân trang nằm trong URL).
- **Hợp đồng API đã xác minh bằng API thật:** API trả vai trò dạng tên (`PlatformAdmin|OrganizationUser|Trainee`) và từ chối số trong request (`allowIntegerValues:false`); dùng `features/auth/roles.ts`. Lỗi là ProblemDetails (`code`, `errors` map); `validate` của scenario trả `issues[{code,path,message}]`. Ba envelope phân trang khác nhau (`totalCount` cho building/org/account/scenario/revision, `total` cho support/billing). ETag theo từng resource (`"N"`, `"access-N"`, `"support-N"`, `"billing-…"`, draft `"<xmin>"`; Building có ETag cho PUT/DELETE và dùng If-Match). Idempotency-Key bắt buộc ở IFC initiate/process, scenario create/draft/snapshot/package-build/submit, billing/PayOS, support create/message, playtest. CORS chỉ expose `ETag` và `Retry-After`.
- **Trạng thái nghiệp vụ không được gộp:** job `Succeeded` ≠ QA `Passed`; release `Built` ≠ `Published`; `Paid` ≠ provisioned; technical readiness ≠ duyệt nội dung. Giao diện luôn hiển thị từng trạng thái riêng.
- **Prototype vận hành đã gỡ:** `PendingModule` và `src/features/dev-prototype` không còn trong source. Review, Learn CMS và Library dùng API. UI chỉ hiển thị thành công theo trạng thái server; `/demo/rag` là demo legacy riêng, chỉ development.
- **Editor kịch bản 3D** (`src/features/scenario-editor`): state thuần + command stack undo/redo tách khỏi renderer Three.js; lưu bằng `If-Match` ETag draft, 412 giữ nội dung và cho đối chiếu từng field; field draft chưa hỗ trợ được giữ nguyên khi ghi. Editor theo contract `fet3d.editor/1` của BE (`contracts/editor/v1`): chế độ theo `state.schemaVersion` (v1 / `{}` khởi tạo / legacy giữ nguyên, không chuyển tọa độ); module thuần ở `src/features/scenario-editor/v1/` (ma trận column-major, floor-local↔GLB, validate-state + `stateHash` theo serialize của System.Text.Json); sáu loại object và năng lực lấy từ catalog thật, không có cờ khóa (playtest đã có module/API riêng, nghiệm thu theo tracker). Chưa kiểm với artifact worker thật.
- **Thử với API thật từ localhost:** API chỉ cho CORS từ origin triển khai. Đặt `FET3D_DEV_API_PROXY=https://api.fet3d.io.vn` và `NEXT_PUBLIC_API_BASE_URL=` (rỗng) khi chạy `next dev`; `/api/*` được rewrite phía server. Production không đổi. Người dùng tự nhập mật khẩu; không lưu credential.

## IFC ingestion, hiển thị và tương tác — 2026-10-15

Nguồn: [IFC ingestion, hiển thị và tương tác](../../Docs/ifc_ingestion_visual_interaction.md) (Docs PR #15/#16). Tài liệu gồm thiết kế và bằng chứng spike cục bộ trên 32 file IFC công khai. Source hiện đã có IFC worker (`AI/ifc-worker`), API/gate xử lý ở BE và Unity build worker; nghiệm thu từng bước với IFC thật, QA và Android vẫn phải kiểm tra riêng. Mục 4 (nhiều IFC cho một revision), ngân sách tam giác và preset vật liệu còn chờ team chốt.

Quy tắc chung đã chốt với nhóm: chỉ nhận IFC (RVT tự xuất IFC ở ngoài); **IFC có thiết bị PCCC/nguồn nước thì pipeline tự tạo, không có thì OrganizationUser đặt trong editor**; mô hình 3D thiết bị luôn lấy từ thư viện dùng chung (có thể tạo bằng công cụ AI như Tripo rồi dọn lưới), không lấy từ IFC; IFC hầu như không mang màu/texture dùng được nên vật liệu lấy từ thư viện PBR CC0 theo preset.

Phụ trách: Phạm Gia Bảo (FE) và Nguyễn Phúc Lộc (FE). Việc liên quan repo này:

- Màn hình upload: checklist xuất IFC từ Revit/ArchiCAD (mục 3), thông báo rõ khi tải `.rvt`/`.pln`/`.skp`.
- Hiển thị issue QA theo mã ở mục 5.9 kèm hành động người dùng.
- Màn hình **"Thiết bị phát hiện được"**: xác nhận, sửa loại hoặc bỏ ứng viên từ IFC theo `confidence`.
- Editor kịch bản (`src/features/scenario-editor`): đặt thiết bị PCCC và vật dụng (catalog đợt 1 ở mục 6.1, sprinkler mục 6.3) bám bề mặt, chỉ thêm vật lên artifact, không sửa tường/cửa/sàn; dòng thời gian sự kiện (đầu báo kích hoạt/vô hiệu, mất điện, cầu thang bị khói chặn); cảnh báo thiếu nguồn nước/báo cháy (mục 9). Editor `fet3d.editor/1` đã có object `Equipment` với capability từ `GET /api/scenario-interactions/catalog`: `catalogKey` trong Docs chính là capability id; ứng viên từ IFC hiện như `Equipment` chờ xác nhận.
- Chọn preset phong cách công trình và đổi vật liệu theo nhóm (mục 5.5).

## Unity runtime và pipeline bake — 2026-10-17

Quyết định của trưởng nhóm, đã vào Docs (PR #21–#24) và issue:
- Unity runtime đã chạy trong Editor 6000.6.6f1: mô phỏng lửa/khói/nhiệt + NPC bằng **Entities**, camera third-person, tương tác theo ngữ cảnh, HUD, telemetry, nạp AssetBundle. APK demo build được (IL2CPP/ARM64). Runtime đã có trên `main` của Unity; phiên bản tích hợp Mobile hiện là `2.0.2`. Source/build không thay cho nghiệm thu gameplay trên thiết bị.
- **Ưu tiên hình ảnh:** Unity build worker chạy batch trên **Azure VM Windows do BE vận hành** (BE#110). Worker import GLB, gán material theo `libraryKey`, bake lightmap + light/reflection probe cho 2 bộ ánh sáng (bình thường, mất điện), xuất AssetBundle theo tầng + `manifest.json` (`fet3d.package/1`, SHA-256 từng file). Không dùng Addressables.
- Texture PBR chỉ nằm trong project Unity (bundle `fet3d-materials` cài sẵn trong app). GLB chỉ mang `libraryKey`; BE và worker không lưu file ảnh.
- `IFC_EXIT_UNKNOWN` = phương án B, chỉ dùng `door.exit` (BE#100).
- Event Unity gửi (BE#101): `eventId` là GUID, `schemaVersion` = `"1"` (chuỗi), `objectId` = id object trong `fet3d.editor/1`; core `Moved`/`HazardExposure` mỗi 5 giây; Unity không chấm Đạt/Chưa đạt.

Việc của repo FE (editor `fet3d.editor/1`):
- Unity đã hỗ trợ và đề xuất thêm vào catalog (BE#101): `fire.source` (`intensity` 0–10, `activationSeconds`), `smoke.source`, `event.power_outage` (`atSeconds`), `event.alarm` (`atSeconds`, `fails`), `npc.guide` (`behaviour` calm/panic, `mobilityImpaired`). Editor nên cho đặt các object này khi catalog đã đăng ký.
- `placement.position.y` được Unity hiểu là **độ cao tính từ mặt sàn** của `placement.floorId`, không phải tọa độ tuyệt đối.
- Preview web có thể hiện màu đơn hoặc tự đóng gói cùng bộ texture CC0; Unity không đọc material từ FE.
- Bước "Chọn cửa thoát" (`door.exit`) và màn thiết bị IFC-04: FE#49, BE#100.
