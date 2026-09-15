# Context — FE

## Hiện trạng đã kiểm tra

- React + TypeScript + Vite; [package.json](../package.json) có scripts `dev`, `build`, không có script test/lint.
- [Điểm vào](../src/main.tsx), [App](../src/app/App.tsx), [CSS](../src/styles/global.css).
- [RAG client](../src/features/rag/api.ts) gọi trực tiếp `POST /chat` và `POST /documents` qua `VITE_RAG_API_URL`. Không mặc định client đã kết nối backend nghiệp vụ .NET.
- Có [pnpm-lock.yaml](../pnpm-lock.yaml); không tự nâng dependencies `latest` hoặc tái tạo lockfile trong task tài liệu.
- Chưa có design system được xác minh; không tự ghi màu/font/thư viện dự kiến thành quy định đã chốt.

## Chạy và kiểm tra

Từ gốc FE, sau khi dependencies sẵn sàng theo [README](../README.md):
- `pnpm build`: TypeScript build + Vite build, không phải UI/e2e test.
- `pnpm dev`: dùng khi cần kiểm tra giao diện. Với thay đổi RAG UI, kiểm tra upload, chat, loading, error và sources trên môi trường test phù hợp.
- Chưa có script test/lint trong package.json; không ghi `pnpm test` là yêu cầu hiện có.
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
- “Mở trên điện thoại” hiển thị QR active của hoạt động tập huấn. Ứng dụng Android cài một lần, resolve QR rồi tải/verify content package và mở Unity; web không suy đoán trạng thái cài app.
- Hướng thực thi và giới hạn nằm trong [Docs/fire3d-web-ux-design.md](../../Docs/fire3d-web-ux-design.md). FE hiện vẫn React/TypeScript/Vite và RAG thử nghiệm; đặc tả đích của Docs là web Next.js. Không xem landing, Learn hoặc AI cộng đồng là đã triển khai.
