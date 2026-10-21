# Fire3D Web

Web FET3D dùng Next.js App Router: landing/editor Three.js, khu Organization/PlatformAdmin, auth, Learn, billing, AI, lịch sử và playtest handoff. Gameplay Android chạy trong Mobile/Unity. [Tracker](docs/fet3d-operations-ui-tracker.md) phân biệt contract, FE integration và kiểm chứng API thật.

## Chạy local

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Mở [http://localhost:5173](http://localhost:5173). RAG demo đọc `NEXT_PUBLIC_RAG_API_URL` từ `.env.local`; xem `.env.example` để bắt đầu.

## Xác thực

Web gọi .NET API qua `NEXT_PUBLIC_API_BASE_URL` (rỗng nghĩa là cùng origin); không còn adapter đăng nhập mock. Biến `NEXT_PUBLIC_AUTH_MODE` trong `.env.example` là cấu hình legacy, source auth hiện không đọc nó. Không dùng biến này để bật tài khoản mẫu.

Local registration đi qua form → request/verify OTP → register → login riêng. Google dùng Firebase Web Authentication rồi exchange với .NET; source đã có onboarding, liên kết Google và đặt mật khẩu local đầu tiên. Cấu hình Firebase công khai theo `.env.example`; không đặt backend/provider secret vào `NEXT_PUBLIC_*`.

Token được lưu bằng cookie first-party `fire3d_session` do JavaScript quản lý, dùng chung giữa các tab; fallback `localStorage` khi cookie không ghi được hoặc payload quá lớn, và đọc `sessionStorage` cũ để tương thích. Đây không phải cookie HttpOnly hay phiên xác thực phía server. Client gửi Bearer token tới .NET; backend vẫn quyết định authorization. Xem `src/features/auth/session-store.ts` và `auth-session.tsx`.

Để thử API từ localhost khi deployment chỉ cho phép CORS origin cố định, chạy `next dev` với `FET3D_DEV_API_PROXY` là base URL backend đã được team cấp và `NEXT_PUBLIC_API_BASE_URL=` (rỗng). Xem `next.config.ts`. PlatformAdmin đầu tiên do backend/database owner khởi tạo.

AI nghiệp vụ gọi .NET; RAG v2/FastAPI là service nội bộ được backend cấp quyền. `/demo/rag` và `NEXT_PUBLIC_RAG_API_URL` chỉ phục vụ demo legacy trong development; production trả 404 cho route này.

## Kiểm tra

CI/CD và thiết lập GitHub/Vercel: [hướng dẫn triển khai](docs/ci-cd.md).

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
```

Landing dùng một WebGL renderer, world/depth render target và scene volume riêng được composite theo depth. Khi WebGL lỗi hoặc người dùng bật reduced motion, UI vẫn giữ nội dung, lựa chọn và điều hướng bằng fallback tĩnh.

Prototype có chữ sơn chọn nhánh, điện thoại với màn hình sống, mặt cắt ba tầng và orbit bằng kéo/Arrow/Home. Nhánh tổ chức sạm dần ở 65–105 giây rồi sụp từng khu ở 110–143 giây; rời nhánh sẽ reset. Đây là hoạt cảnh minh họa, không phải mô phỏng kết cấu/cháy có kiểm định. Xem [trạng thái kiểm chứng](docs/landing-completion-plan.md) và [bài học kỹ thuật](.codex/lessons.md); chất lượng visual/hiệu năng chưa được nghiệm thu đầy đủ.

Bài lưu, AI và lịch sử/kết quả trong Góc học tập dùng API backend; dữ liệu mock trong Playwright chỉ là fixture kiểm thử. Kiểm thử API/provider/thiết bị thật được ghi riêng, không suy từ UI hoặc build pass.

## Package manager

Use pnpm 10.28.2 (pinned in `package.json`). With Corepack installed, run `corepack enable` and `corepack prepare pnpm@10.28.2 --activate` once, then verify `pnpm --version`.

- Install dependencies: `pnpm install --frozen-lockfile`.
- Add dependencies: `pnpm add <package>` or `pnpm add -D <package>`.
- Build: `pnpm build`.
- Commit `pnpm-lock.yaml` with dependency changes. Use pnpm for this repository; do not generate npm/yarn lockfiles.

## Codex cho thành viên team

Sau khi checkout nhánh có bộ hướng dẫn, mở repo bằng Codex và yêu cầu:

> Đọc AGENTS.md và .codex/bootstrap.md, khởi tạo các file Codex còn thiếu; giữ nguyên file đã có, gồm bộ ở workspace cha nếu đúng cấu trúc Fire3D.

- Git pull chỉ tải hướng dẫn, không tự chạy Codex. [Quy trình bootstrap](.codex/bootstrap.md) tạo local notes bị ignore; chỉ dựng bộ workspace cha khi nhận diện đủ AI/BE/Docs/FE/Mobile và được phép ghi.
- Nếu chỉ clone repo này, Codex tạo phần local của repo, không ghi vào thư mục cha. Không ghi trong Plan Mode.
- File cá nhân không được push; quy tắc và kiến thức team nằm trong bộ hướng dẫn được track.
