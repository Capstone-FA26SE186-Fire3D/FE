# GitHub Actions + Vercel Git Integration

Repo FE độc lập: Root Directory trên Vercel là gốc repository (`.` hoặc để trống).

## Luồng

| Sự kiện | GitHub Actions | Vercel Git Integration |
| --- | --- | --- |
| PR vào `develop` hoặc `main` | Lint, build, typecheck, 3 smoke tests | Tạo Preview và ghi deployment check trên PR |
| Push/merge vào `develop` | Chạy CI trên commit đã merge | Tạo Preview deployment |
| Push/merge vào `main` | Chạy CI trên commit đã merge | Deploy Production |

GitHub Actions chỉ kiểm tra code. Vercel đã liên kết repository nên tự tạo Preview/Production từ Git; workflow không cần gọi Vercel CLI hay dùng Vercel token. Git check Vercel trên PR có thể được bật làm required check nếu team muốn preview phải sẵn sàng trước khi merge; CI vẫn là check chất lượng code chính.

CI chạy Node 22 và pnpm 10.28.2 theo frozen lockfile. Build chạy trước typecheck để Next.js tạo route types. Smoke tests gồm hai test brand/logo và một test RAG mock. Test đăng nhập demo cũ trong `smoke.spec.ts` không khớp Firebase login hiện tại nên chưa nằm trong CI gate. Đây chưa phải full E2E hoặc kiểm thử API/Firebase production.

## Vercel

Vào project FET3D → **Settings → Git**:

- Repository phải là GitHub repo FE.
- Production Branch: `main`.
- Preview deployments: bật cho pull requests và nhánh `develop`.
- Root Directory: gốc repo (`.`/để trống), không nhập `FE` vì đây là repo FE riêng.

Vào **Settings → Build and Deployment** kiểm tra:

- Framework Preset: Next.js.
- Node.js Version: 22.x.
- Install Command: `pnpm install --frozen-lockfile`.
- Build Command: `pnpm build`.
- Output Directory: mặc định Next.js.

Giữ các env ứng dụng ở Vercel và gán đúng **Preview**/**Production**. Nếu có preview override theo Git branch, thêm `develop`. Các `NEXT_PUBLIC_*` được nhúng vào browser bundle khi build; không đặt backend secret trong những biến đó. Kiểm tra Firebase Authorized Domains và backend CORS có domain thực tế của Preview/Production.

`vercel.json` giữ cấu hình Next.js, install và build command; không disable Git deployments. Không cần tạo `VERCEL_TOKEN`, `VERCEL_ORG_ID` hoặc `VERCEL_PROJECT_ID` trong GitHub vì không còn workflow dùng CLI.

## GitHub checks và bảo vệ nhánh

Repo → **Settings → Actions → General**: cho phép GitHub Actions chạy các action trong workflow (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `pnpm/action-setup`).

Sau khi workflow đầu tiên chạy, vào **Settings → Rules → Rulesets** hoặc Branch protection rules, áp dụng cho `develop` và `main`:

1. Yêu cầu pull request trước khi merge và tối thiểu một approval nếu có reviewer khác.
2. Yêu cầu status check `CI / Quality checks` — chọn tên xuất hiện thực tế trong PR.
3. Có thể yêu cầu deployment check của Vercel trên PR nếu muốn chờ Preview thành công.
4. Bật yêu cầu branch up-to-date; chặn force-push và xóa nhánh.

Không bắt buộc deploy check trên push vào branch: đó là sự kiện sau merge, không thể dùng để quyết định merge PR vừa xảy ra. Tắt bypass nếu phù hợp quyền quản trị của repo.

GitHub Environments không bắt buộc cho luồng này. Nếu muốn gắn review approval thủ công trước production, có thể tạo environment `production`, nhưng Vercel Git Integration vẫn xử lý deployment theo project/branch settings và không lấy credentials từ environment đó.

## Kiểm tra lần đầu

Push nhánh task và mở PR vào `develop`; Actions chạy CI và Vercel tạo Preview từ commit PR. Xem status checks, đọc Preview URL trong Vercel/GitHub, kiểm tra UI và các flow cần API/Firebase thật. Sau khi PR merge vào `develop`, Vercel tạo Preview tích hợp. Chỉ mở PR `develop → main` sau khi tích hợp đạt; merge vào `main` tạo Production deployment.

Trước khi phát hành, đồng bộ các commit đã có trên `main` trở lại `develop` qua PR. Lúc thiết kế workflow, `main` hơn `origin/develop` 16 commit; không reset/force-push để đưa nhánh về cùng trạng thái.

## Tài liệu

- [Vercel Git deployments](https://vercel.com/docs/git)
- [Cấu hình nhánh deploy Vercel](https://vercel.com/docs/project-configuration/git-configuration)
- [GitHub status checks và branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
