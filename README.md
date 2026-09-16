# Fire3D Web

Website trải nghiệm Fire3D: landing POV dùng Three.js, thư viện Learn, các màn hình mẫu cho đăng nhập/Góc học tập và RAG demo.

## Chạy local

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Mở [http://localhost:5173](http://localhost:5173). RAG demo đọc `NEXT_PUBLIC_RAG_API_URL` từ `.env.local`; xem `.env.example` để bắt đầu.

## Kiểm tra

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
```

Landing dùng một WebGL renderer, world/depth render target và scene volume riêng được composite theo depth. Khi WebGL lỗi hoặc người dùng bật reduced motion, UI vẫn giữ nội dung, lựa chọn và điều hướng bằng fallback tĩnh.

Prototype có chữ sơn chọn nhánh, điện thoại với màn hình sống, mặt cắt ba tầng và orbit bằng kéo/Arrow/Home. Nhánh tổ chức sạm dần ở 65–105 giây rồi sụp từng khu ở 110–143 giây; rời nhánh sẽ reset. Đây là hoạt cảnh minh họa, không phải mô phỏng kết cấu/cháy có kiểm định. Xem [trạng thái kiểm chứng](docs/landing-completion-plan.md) và [bài học kỹ thuật](.codex/lessons.md); chất lượng visual/hiệu năng chưa được nghiệm thu đầy đủ.

Toàn bộ tài khoản, bài lưu và hội thoại trong các màn hình mẫu là dữ liệu minh họa lưu trong `sessionStorage`, không phải tài khoản production.

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
