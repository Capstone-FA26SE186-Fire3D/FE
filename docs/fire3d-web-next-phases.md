# Fire3D Web — phần việc tiếp theo

Đối chiếu source ngày 21/10/2026. Roadmap phase cũ đã được thay bằng trạng thái hiện hành; không dùng các blocker API tháng 9 để khóa capability đã có source. [Tracker vận hành](fet3d-operations-ui-tracker.md) ghi bằng chứng từng màn; [backlog tổng](https://github.com/Capstone-FA26SE186-Fire3D/Docs/issues/37) liên kết các phần việc triển khai và nghiệm thu liên repo. Trạng thái issue phải được kiểm tra lại trước task mới.

## Source hiện có

| Vai trò | Luồng đã có FE/API client | Cần nghiệm thu riêng |
| --- | --- | --- |
| OrganizationUser | Building/IFC, editor v1, version/readiness/review/release, billing/quota, Library, AI, QR và playtest handoff | IFC/artifact thật, publish gates, payment/provisioning và Mobile/Unity playtest |
| Trainee | Auth/profile, Learn public/bookmark, AI theo Learn/Training/Result, lịch sử/kết quả, QR landing | Firebase/provider thật, phân quyền/quota, dữ liệu kết quả và Android handoff |
| PlatformAdmin | Account/organization, review, Learn CMS, Library, analytics, billing, AI policies/sources, support/audit | Tenant/role isolation và vận hành trên deployment thật |

## Ưu tiên tiếp theo

1. Kiểm tra workspace bootstrap/loading và phục hồi phiên; FE dùng shared cookie store đọc được bằng JavaScript, chưa có server-validated HttpOnly session. Cookie hiện tại không tạo role gate phía server.
2. Nghiệm thu lát dọc IFC → QA → editor → snapshot/package → readiness → duyệt đúng hash → publish → QR/start → result. Mỗi bước cần bằng chứng đúng revision/version/artifact; job Succeeded không tự đồng nghĩa QA Passed.
3. Kiểm tra quota AI trả trước, request timeout/reconcile và citation/scope trên .NET + RAG v2 + pgvector/provider thật; AI Trainee bị chặn trong Assessment. Backend quyết định quota và giá.
4. Kiểm tra PayOS webhook, provisioning, nâng cấp/gia hạn và learner seats trên môi trường được cấp phép; return URL không cấp entitlement.
5. Kiểm tra responsive/accessibility, WebGL fallback/reduced motion và hiệu năng; Mobile/Unity benchmark và lifecycle trên thiết bị là bằng chứng riêng.

## Quy tắc thực hiện

- FE chỉ gọi .NET cho nghiệp vụ; không kết nối trực tiếp FastAPI, Redis, Supabase hoặc worker. `/demo/rag` chỉ development.
- Mọi thao tác ghi giữ idempotency key khi retry cùng payload, xử lý ProblemDetails/Retry-After/ETag và giữ nội dung khi 412; timeout không tự đồng nghĩa thất bại.
- Kiểm tra hẹp theo thay đổi, sau đó lint/build/typecheck và E2E liên quan khi sửa ứng dụng. Chỉ sửa Markdown thì kiểm nội dung, liên kết và diff; CI hiện hành vẫn chạy theo cấu hình repository.
- Task từ origin/develop đã fetch → PR develop → kiểm tra tích hợp → PR main khi được yêu cầu phát hành. Không đặt giá/quota/rubric chưa chốt hoặc suy nghiệm thu từ mock tests.
