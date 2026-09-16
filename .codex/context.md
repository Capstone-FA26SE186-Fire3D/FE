# Context — FE

## Hiện trạng đã kiểm tra

- Next.js App Router + React + TypeScript strict; [package.json](../package.json) có scripts `dev`, `build`, `start`, `typecheck`, `lint`, `test:e2e` và giữ pnpm 10.28.2.
- Route composition nằm trong [src/app](../src/app); feature code nằm trong [src/features](../src/features); style/token nền nằm trong [src/assets/styles/globals.css](../src/assets/styles/globals.css).
- [RAG client](../src/features/rag/api.ts) vẫn gọi trực tiếp `POST /chat` và `POST /documents` qua `NEXT_PUBLIC_RAG_API_URL`. Không mặc định client đã kết nối backend nghiệp vụ .NET.
- Three.js landing dùng một `WebGLRenderer` trong [features/landing](../src/features/landing), với building/effects/camera/lifecycle tách module. ThreeUI chỉ tham khảo; package runtime hiện không còn dependency ThreeUI.
- Có [pnpm-lock.yaml](../pnpm-lock.yaml); dependency thay đổi phải đi cùng lockfile và xác minh lại bằng `pnpm install --frozen-lockfile`.

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
- Thiết kế sản phẩm: “Mở trên điện thoại” hiển thị QR active. Prototype hiện chưa có QR/APK phát hành, không dựng chức năng giả. Android cài một lần, resolve QR rồi tải/verify package và mở Unity; web không suy đoán trạng thái cài app.

## Cập nhật prototype từ phản hồi

- Junction là chữ sơn trên tường + vùng bấm trong suốt; chọn nhánh chỉ chuyển cảnh, Tiếp tục mới đổi route. Điện thoại 3D có màn hình render target sống.
- Mặt cắt giữ tầng/cầu thang liên tục, ẩn vỏ ngoài. Orbit nhận focus khi click/kéo, hỗ trợ Arrow/Home, không hiện outline theo yêu cầu. Footer riêng landing đã bỏ.
- Cháy lan phòng/hành lang/cầu thang/mặt ngoài/mái; smoke volume có depth occlusion và fade biên. NPC có đường đi/khớp/phản ứng dựng sẵn, không solver sơ tán.
- Nhánh tổ chức: sạm65–105s, sụp từng khu110–143s theo đồng hồ nhánh; rời nhánh reset. Collapse là hoạt cảnh minh họa, không phân tích kết cấu. reveal sở hữu visibility, damage không được bật shell đã ẩn.
- Auth/Learn/hub dùng sessionStorage có kiểm tra dữ liệu; bài lưu và chat là demo. `/demo/rag` giữ contract AI thử nghiệm.
- Bài học ổn định ở [lessons](lessons.md); kiểm chứng/giới hạn ở [ledger](../docs/landing-completion-plan.md). Không coi build pass là nghiệm thu visual/hiệu năng.
- Hướng thực thi và giới hạn nằm trong [Docs/fire3d-web-ux-design.md](../../Docs/fire3d-web-ux-design.md). Landing, Learn và AI cộng đồng là prototype web; không xem chúng là pipeline production hay chứng nhận an toàn.
- Cấu trúc source hiện tại là feature-first App Router: `assets`, `components/ui`, `configs`, `features/<feature>/{components,scene,types}`, `layouts`, `store`, `utils`, cùng các route trong `app`. Không tạo `pages/` hoặc root `App.tsx`; route/layout chỉ composition, không chứa logic Three.js hoặc truy vấn dài.
