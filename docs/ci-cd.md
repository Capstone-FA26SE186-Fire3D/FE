# GitHub Actions → Vercel

Repo FE độc lập: chạy ở gốc repository, không đặt working-directory/Root Directory thành `FE`.

## Luồng đã cấu hình

| Sự kiện | Kiểm tra | Deploy |
| --- | --- | --- |
| PR vào develop/main | Frozen install, lint, build, typecheck, 3 smoke tests | Không |
| Push vào develop | Cùng CI trên commit đã merge | Vercel Preview |
| Push vào main | Cùng CI trên commit đã merge | Vercel Production |
| Run workflow trên develop/main | Chạy lại CI | Deploy nếu commit vẫn là đầu nhánh |

`.github/workflows/ci.yml` là workflow dùng lại. `pull-request.yml` gọi nó trên PR, `deploy.yml` gọi nó trước job deploy với `needs: ci`. PR không nhận Vercel secrets. Node 22 và pnpm 10.28.2 được dùng cho cả hai job. Vercel CLI được pin 59.25.4; cập nhật có review khi cần.

CI build trước typecheck để sinh route types của Next.js trên runner sạch. Smoke tests gồm hai test brand/logo và một test RAG mock. Test đăng nhập demo cũ trong `smoke.spec.ts` không nằm trong gate vì không còn phù hợp màn hình Firebase trên main. Đây chưa phải full E2E, kiểm thử Firebase/backend thật hoặc nghiệm thu WebGL/performance.

Mỗi branch được serialize toàn bộ CI + deploy; không hủy production đang chạy. Workflow kiểm tra đầu nhánh trước build deploy để bỏ qua run cũ. Một push mới xuất hiện sau bước kiểm tra vẫn có thể khiến bản đang chạy hoàn thành trước rồi được thay bằng bản mới sau.

## 1. Chuẩn bị Vercel

Trong project FE đã kết nối GitHub:

- Framework: Next.js; Root Directory: gốc repo (`.` hoặc để trống).
- Node.js Version: **22.x** để khớp Actions.
- Production Branch: **main**.
- Install Command: `pnpm install --frozen-lockfile`; Build Command: `pnpm build`; Output Directory: mặc định Next.js.
- Env ứng dụng phải được gán cho **Preview** và **Production** theo nhu cầu, không chỉ Development. Nếu có override Preview theo branch, cấu hình branch `develop`.
- Với phiên bản Firebase trên main, cấu hình các `NEXT_PUBLIC_FIREBASE_*` và API URL theo `.env.example` của bản đó. Không cần sao chép chúng sang GitHub: `vercel pull` lấy cấu hình môi trường tương ứng. `NEXT_PUBLIC_*` là giá trị public được nhúng vào bundle; không đặt backend secrets ở đây.
- Kiểm tra Firebase Authorized domains và backend CORS cho domain production/preview thực sự sử dụng; không mở wildcard tùy tiện chỉ để test.

`vercel.json` đặt `git.deploymentEnabled: false`, tắt deploy tự động qua Git cho commit chứa cấu hình này. Deploy bằng CLI trong Actions vẫn chạy. Nhánh cũ chưa có file này vẫn có thể được Git integration deploy tự động; gate chưa bao phủ toàn repo cho đến khi cấu hình đã vào các nhánh liên quan.

Nếu bật Skew Protection, cần cấu hình custom deployment ID theo tài liệu Vercel cho prebuilt deployments trước khi coi tính năng đó hoạt động. Workflow hiện không thiết lập Skew Protection.

## 2. GitHub Secrets và Variables

Repo FE → **Settings → Secrets and variables → Actions**.

Trong tab **Secrets**, chọn **New repository secret**:

| Tên | Giá trị |
| --- | --- |
| `VERCEL_TOKEN` | Token tạo ở Vercel Account Settings → Tokens, có quyền trên team chứa project |

Trong tab **Variables**, chọn **New repository variable**:

| Tên | Giá trị |
| --- | --- |
| `VERCEL_ORG_ID` | Team/account ID sở hữu project |
| `VERCEL_PROJECT_ID` | Project ID của FE |

Project ID ở Vercel Project Settings; Team ID ở Team Settings. Có thể lấy chính xác cả hai bằng cách chạy `pnpm dlx vercel@59.25.4 link` trong checkout local và xem trường `orgId`, `projectId` của `.vercel/project.json`. Chọn project đã tồn tại, không tạo project mới. `.vercel/` đã được ignore. Không gửi token qua chat hoặc commit token.

Không đặt hai ID chỉ trong Secrets: workflow đọc chúng qua `vars`. Không cần tạo GitHub PAT; bước kiểm tra commit dùng `github.token` có sẵn, quyền `contents: read`.

## 3. GitHub Environments

Repo → **Settings → Environments**, tạo:

- `preview`: chỉ cho branch `develop` deploy.
- `production`: chỉ cho branch `main` deploy.

Có thể bật Required reviewers cho production nếu plan/repo hỗ trợ và team muốn thêm một bước duyệt trước khi publish. Khi bật, job Deploy sẽ chờ người được chỉ định approve. Nếu đã dùng repository Secrets/Variables ở trên thì không cần nhập lại theo environment.

## 4. Bật Actions và bảo vệ nhánh

Repo → **Settings → Actions → General**: cho phép Actions và các action `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `pnpm/action-setup`. Workflow chỉ yêu cầu quyền đọc repository, không cần quyền ghi code hay tạo PR.

Push nhánh task, mở PR vào develop và đợi **Pull request CI** chạy lần đầu. Sau đó vào **Settings → Rules → Rulesets** (hoặc Branch protection rules nếu repo dùng giao diện đó), tạo rule cho `develop` và `main`:

1. Bật Require a pull request before merging; yêu cầu 1 approval nếu team có người review khác tác giả.
2. Bật Require status checks to pass. Chọn check **CI / Quality checks** của GitHub Actions xuất hiện trong PR; lấy đúng tên GitHub hiển thị sau lần chạy đầu.
3. Bật Require branches to be up to date before merging.
4. Chặn force pushes và xóa branch; hạn chế bypass theo quyền team.

Không yêu cầu check `Deploy` hoặc check Git integration `Vercel` trên PR: thiết kế này chỉ deploy sau merge. Không bật merge queue với cấu hình hiện tại; nếu dùng queue phải bổ sung event `merge_group` cho CI.

## 5. Đưa cấu hình lên và kiểm tra lần đầu

Tạo secrets, variables và environments trước khi merge để lần deploy đầu không lỗi thiếu cấu hình.

```bash
git add .github/workflows/ci.yml .github/workflows/pull-request.yml .github/workflows/deploy.yml vercel.json .gitignore docs/ci-cd.md README.md
git commit -m "ci: add GitHub Actions and Vercel deployment gates"
git push -u origin chore/github-vercel-cicd
```

Mở PR `chore/github-vercel-cicd → develop`. Sau CI/review và merge, xem **Actions → Deploy Vercel**: CI phải đạt trước Deploy. URL bản Preview nằm trong Summary và GitHub Environment `preview`. Mở URL để kiểm tra Learn, layout và các flow API/Firebase phù hợp env thật. Preview có thể yêu cầu đăng nhập Vercel nếu bật Deployment Protection.

Trước PR phát hành `develop → main`, đối chiếu lại lịch sử: thời điểm thiết kế, main có 16 commit chưa có trên origin/develop. Đưa thay đổi main về develop qua PR đồng bộ và chạy CI/kiểm tra tích hợp trước khi phát hành. Không reset/force-push để ép hai nhánh giống nhau. Chưa sửa các source khác để xử lý chênh lệch này.

Sau merge PR phát hành, CI kiểm tra commit trên main, rồi build lại bằng env Production và deploy. Không promote bundle Preview vì các `NEXT_PUBLIC_*` đã được nhúng theo môi trường lúc build.

## Chẩn đoán và phục hồi

- CI lỗi: xem step đầu tiên lỗi; trace Playwright ở Artifacts nếu test tạo trace. Không bỏ required check chỉ để merge.
- Deploy lỗi thiếu biến: kiểm tra đúng Secrets/Variables và chính tả ba tên trên.
- Deploy Unauthorized/Project not found: kiểm tra scope của token, org ID và project ID cùng một team/project.
- Build trên Vercel lỗi nhưng CI đạt: đối chiếu Node version, install/build overrides và env Preview/Production. CI mock không chứng minh API production hoạt động.
- Thay env trên Vercel: chạy lại workflow trên đầu develop/main để build lại. Không rerun commit cũ để rollback: workflow sẽ bỏ qua commit không còn là đầu nhánh.
- Production có regression: dùng rollback của Vercel về deployment tốt đã biết khi được người phụ trách cho phép, đồng thời sửa/revert qua PR để Git phản ánh bản đúng. Rollback không tự đảo thay đổi API/database.

## Tài liệu chính thức

- [GitHub Actions với Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)
- [Tắt Git auto-deploy](https://vercel.com/docs/project-configuration/git-configuration)
- [Skew Protection và prebuilt](https://vercel.com/docs/skew-protection)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
