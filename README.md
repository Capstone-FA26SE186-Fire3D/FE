# React web
Copy `.env.example` to `.env`, then run `pnpm install --frozen-lockfile` and `pnpm dev`.

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
