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
