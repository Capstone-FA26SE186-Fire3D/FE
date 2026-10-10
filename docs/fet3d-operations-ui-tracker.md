# FET3D — Organization & PlatformAdmin UI: tracker

Theo dõi từng màn hình: **Đã tích hợp** (gọi API thật, có test với mock), **Chờ BE** (thiết kế sẵn, khóa tính năng), **Prototype** (dữ liệu mẫu, chỉ môi trường phát triển; production không có nút giả thành công hay số liệu mẫu).

Nguồn kiểm tra BE: `main` @ `b6a7d74` (đọc source; chưa kiểm chứng deployment). Bằng chứng mock (Playwright route) và kiểm thử API thật được ghi riêng — mock không phải bằng chứng tích hợp.

Riêng BE#59/#66 đã đối chiếu lại source `origin/main` @ `3726c14`: analytics trả `isActive`, gói v7 giới hạn 6/12 tháng, quotation đã kiểm tên/địa chỉ; annotation có cả body `eTag` và header `ETag`. Đây là hiệu chỉnh trạng thái issue theo source, chưa xác nhận deployment hoặc tích hợp toàn bộ API mới.

## Issue BE đã mở (2026-10-10)

| # | Nội dung | Loại | Chặn FE |
|---|---|---|---|
| [#51](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/51) | Publish gate luôn 503 `PUBLISH_GATE_UNAVAILABLE` | P1 | Phát hành, `/trainings` rỗng |
| [#52](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/52) | API đọc hàng chờ/chi tiết content review | P1 | Màn Duyệt kịch bản (Admin), xem lại kết quả duyệt (Org) |
| [#53](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/53) | API tìm lại draft, readiness, release | P1 | Tiếp tục công việc sau đăng nhập lại |
| [#54](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/54) | Contract dữ liệu editor 3D (floors, mapping, transform, goal/NPC/blocked) | P1 | Lưu goal/NPC/blocked element/thiết bị |
| [#55](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/55) | Playtest handoff: status, recovery, opaque code | P1 | Nút Playtest / QR |
| [#56](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/56) | Billing v7 + quota AI trả trước | P1 | Upgrade, learner capacity, quota AI, top-up |
| [#57](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/57) | Learn CMS + Organization Library | P2 | CMS bài Learn, thư viện template/rubric/thiết bị |
| [#58](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/58) | AI Organization, learner analytics | P2 | Biểu đồ plays/completion, usage AI |
| [#59](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/59) | CORS expose, Retry-After administration 429, OpenAPI hash, bảng lỗi draft và điều kiện quotation; analytics/duration đã sửa trong source | Lệch contract/docs | — (có workaround; deployment chưa kiểm lại) |
| [#60](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/60) | Response organization/account thiếu field, chưa có PATCH organization | Lệch contract | Hồ sơ tổ chức trong Admin |
| [#61](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/61) | Docs mâu thuẫn với source | Docs | — |

| [#64](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/64) | Nhiều endpoint trả 500 trên deploy (tạo/đọc công trình, revisions, scenarios, billing, catalog) | Bug | Chi tiết công trình, tạo công trình, billing, editor trên API thật |
| [#65](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/65) | OpenAPI thiếu enum job/QA, Idempotency-Key bắt buộc, vị trí requestId | Docs/contract | — (FE đang suy từ SQL) |
| [#66](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/66) | API gộp job+QA, run lịch sử, validate dry-run và contract draft khởi tạo; annotation ETag đã có | Enhancement | Cải thiện polling/dry-run; không chặn lưu rồi validate an toàn |
| [#67](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/67) | Ticket/feedback thiếu người tạo & tổ chức; audit chỉ GUID | Enhancement | Hộp thư Admin hiển thị ai/tổ chức nào gửi |
| [#68](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/68) | Billing v6.7: hủy báo giá, danh sách payment, nhắc hết hạn, enterprise request | Enhancement | Thương mại (Admin) |
| [#69](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/69) | Learn/Library: danh mục nguồn/tình huống, rubric schema_version | Enhancement | Learn CMS prototype |

Còn mở từ trước: [#40](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/40) (Google onboarding đã có API, nên đóng), [#46](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/46).

## Quy ước tích hợp (từ source BE)

- Lỗi: ProblemDetails (`title`, `status`, extension `code`, `errors` = map field → string[]); riêng `POST /api/scenario-drafts/{id}/validate` trả `issues[{code,path,message}]`. FE parse cả hai (`src/api/errors.ts`).
- Phân trang có 3 envelope: `{items,totalCount,page,pageSize}` (building, org, account, scenario, revision), `{items,total,page,pageSize}` (support, billing), audit thêm `from`/`to`.
- ETag theo từng resource: `"N"` (auth/me, org profile, annotations), `"access-N"`, `"support-N"`, `"billing-<guid>-<rev>"`, draft `"<xmin>"`; Building không có ETag. 412 → giữ nội dung đang nhập, tải bản mới để đối chiếu, không ghi đè.
- Annotation chỉ mở form từ snapshot đúng revision; đổi revision tải lại cả form. Nội dung nhập/xóa trong lúc PUT chờ vẫn được đánh dấu chưa lưu và lần lưu tiếp dùng version BE vừa trả.
- `Idempotency-Key` bắt buộc ở: IFC upload initiate, scenario create/draft/snapshot/package-build, billing/PayOS, support create/message, playtest. Một key cho mỗi ý định, giữ nguyên khi retry cùng payload; khác payload → `409 IDEMPOTENCY_KEY_CONFLICT`.
- 202 ≠ hoàn tất (process, retry, package-build, payos/create). Job `Succeeded` ≠ QA `Passed` (đọc `validationRun`). Release `Built` ≠ `Published`. `Paid` ≠ provisioned (poll `provisioningStatus`).
- PlatformAdmin liệt kê/tạo/sửa/lưu trữ Building qua tham số `organizationId`.

## Trạng thái màn hình

Cập nhật bảng này khi hoàn thành từng đợt.

| Khu vực | Màn hình | Trạng thái | Ghi chú / điều kiện mở |
|---|---|---|---|
| Org | Danh sách công trình | Đã tích hợp (mock test) | Bảng/thẻ, URL filter, tạo/sửa/lưu trữ |
| Admin | Tài khoản | Đã tích hợp (mock test) | URL filter/pagination, tạo, khóa/mở |
| Foundation | Theme sáng/tối/hệ thống, shell, primitives | Đã tích hợp | Token chỉ áp dụng khu vận hành |
| Org | Chi tiết công trình: Tổng quan, sửa nhanh | Đã tích hợp (mock test) | `/workspace/buildings/[id]?tab=&revision=`; admin mở cùng trang (PUT kèm `organizationId` của công trình) |
| Org | Chi tiết công trình: IFC & xử lý | Đã tích hợp (mock test) | Stepper upload (Idempotency-Key, SHA-256 chunked, XHR progress, retry giữ key, URL ký hết hạn), polling job 3s, QA tách khỏi job Succeeded, issues theo mức độ, logs/artifacts/BIM facts, annotations dạng danh sách (If-Match, 412 giữ nội dung), preview GLB (NotReady, URL hết hạn, WebGL lost, theme), confirm-for-training (chỉ sẵn sàng kỹ thuật). Chưa thử với API thật |
| Org | Chi tiết công trình: Kịch bản | Đã tích hợp (mock test) | Danh sách + tạo (Idempotency-Key) + link tới editor `/scenarios/[scenarioId]` (editor do agent khác); `/scenarios` mở tab này |
| Org | Chi tiết công trình: Quyền tham gia | Đã tích hợp (mock test) | `access` GET/PATCH + rotate/revoke, If-Match `"access-N"`, mã mới hiện một lần, Modal xác nhận tác động, 412 |
| Org | Chi tiết công trình: Dịch vụ | Placeholder | `building-services-tab.tsx` là bản tạm, agent billing thay thế |
| Admin | Công trình theo tổ chức | Đã tích hợp (mock test) | `/admin/organizations/[organizationId]/buildings` và `/workspace/buildings?org=`; `organizationId` ở query (list/update/archive) và body (create); OrganizationUser không gửi |
| Org | Phiên bản & readiness của kịch bản (`/workspace/buildings/[id]/scenarios/[scenarioId]/versions`) | Đã tích hợp một phần (mock test) | Snapshot (Idempotency-Key + If-Match, 412 giữ nội dung), package build + polling 3s, QA/issue Error/Critical + confirm-for-training, gửi duyệt, release Built, Phát hành hiện 503 `PUBLISH_GATE_UNAVAILABLE` (BE#51). Trạng thái duyệt/release/xác nhận sau reload **Chưa có dữ liệu (chờ BE)** (BE#52, BE#53): chỉ nhớ theo tab (sessionStorage), không suy đoán. Status job/QA suy từ SQL, chưa có enum công bố |
| Org | Dịch vụ & thanh toán (`/workspace/billing`, tab Dịch vụ của công trình) | Đã tích hợp (mock test) | Báo giá 1..n Building theo snapshot BE, accept (If-Match, 409 sau hạn), PayOS create/cancel (Idempotency-Key), poll `paymentStatus` rồi `provisioningStatus` từng Building, entitlement `isEffective`, nhắc hết hạn 5 ngày, yêu cầu liên hệ số lượng lớn. `/workspace/billing/return` chỉ điều hướng; cần cấu hình `PayOS__ReturnUrl/CancelUrl` trỏ tới đó. Chưa kiểm chứng với PayOS/BE thật |
| Org | Nâng cấp gói, suất học viên, quota AI pooled, top-up | Chờ BE (#56) (+ Prototype) | Production chỉ khối "Chờ BE"; dev có banner "Dữ liệu mẫu", không gọi API |
| Admin | Thương mại (`/admin/commerce?tab=`) | Đã tích hợp (mock test) | Gói (tạo/sửa If-Match, 412), giảm giá, báo giá (phát hành với thuế/điều khoản/hạn), tra cứu thanh toán theo checkoutId + reconcile, danh sách yêu cầu doanh nghiệp |
| Admin | Xử lý yêu cầu liên hệ doanh nghiệp, danh sách thanh toán | Chờ BE (#56) | BE chỉ có GET danh sách enterprise request; không có API đổi trạng thái/chuyển thành báo giá, không có API liệt kê payment cho Admin |
| Admin | Duyệt kịch bản `/admin/reviews` | Chờ BE + Prototype (dev) | Production chỉ nêu blocker/điều kiện mở/contract. Mở khi BE có GET hàng chờ + chi tiết (trạng thái, hash, readiness, nội dung, rubric, lý do) và test cách ly tenant ([BE#52](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/52)); phát hành còn chờ [BE#51](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/51). Client `approve`/`reject` (Idempotency-Key, `{contentHash,rubricHash,reason?}`) đã viết theo controller, chưa gắn vào UI thật. Không cho nhập tay versionId/hash. |
| Admin | Learn CMS `/admin/learn` | Chờ BE + Prototype (dev) | Mở khi BE có CRUD bài/phiên bản, publish/hide/show/delete/restore với ETag + Idempotency-Key, media descriptor theo allowlist YouTube/Facebook/TikTok, đọc công khai chỉ Published ([BE#57](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/57)). Route trong `features/admin-learn/api.ts` là ĐỀ XUẤT, không phải contract. |
| Admin | Thư viện tổ chức `/admin/library` | Chờ BE + Prototype (dev) | Mở khi chốt route + schema (Docs mới có bảng, chưa có route) rồi BE triển khai ([BE#57](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/57)). Metadata thiết bị mới không tự thêm capability runtime. Chưa có client HTTP vì chưa có route. |

### Quy ước prototype (dev)

- Cờ: `isPrototypeEnabled()` (`src/features/dev-prototype/flag.ts`) = `process.env.NODE_ENV !== "production"`. Các module nạp prototype qua `dynamic()` sau điều kiện NODE_ENV viết trực tiếp để bundler loại nhánh khỏi production.
- Mọi prototype có banner "Dữ liệu mẫu · chỉ môi trường phát triển", dữ liệu cục bộ (`sample-store.ts`), không gọi API thật; đặt lại khi tải lại trang. Đây không phải bằng chứng tích hợp.
- Kiểm tra: `tests/e2e/ops-pending-modules.spec.ts` (chạy trên bản production: không banner, không nút "Duyệt", bundle không chứa chuỗi dữ liệu mẫu) và `ops-pending-modules-dev.spec.ts` (chạy trên `pnpm dev`, đặt `PLAYWRIGHT_DEV_URL`).

## Hạng mục tương lai

- **Cookie session để gate role phía server.** Token đang ở `sessionStorage` nên việc chặn theo role (`/admin/*`, `/workspace/*`) chỉ xảy ra phía client sau khi tải; khách chưa đủ quyền vẫn nhận được bundle trang. Cần BE phát hành phiên bằng cookie HttpOnly/SameSite để `proxy`/middleware Next kiểm tra role trước khi trả trang. Việc ẩn UI không thay thế kiểm tra quyền ở API (BE đã kiểm tra mỗi lệnh).
- Khi BE#52/#57 xong: bỏ nhánh prototype, thay `PendingModule` bằng màn thật dùng `contentReviewsApi` và `createLearnCmsApi`, đối chiếu route thực tế.
| Admin | Tổng quan vận hành `/admin/overview` | Đã tích hợp (mock test) | Chỉ `/api/admin/analytics/operations` (tài khoản, công trình, IFC, ticket); `from`/`to` ≤ 90 ngày trong URL; parse cả `{key,count}` và `{isActive,count}` (BE#59). Lượt chơi/hoàn thành/doanh thu/AI: thẻ "Chờ BE" (BE#58). Đích mặc định của PlatformAdmin |
| Admin | Hỗ trợ & audit `/admin/support` | Đã tích hợp (mock test) | Tab Ticket (filter/phân trang URL, drawer chi tiết, phân công/trạng thái PATCH `If-Match "support-N"`, 412 giữ lựa chọn, tin nhắn Idempotency-Key), Phản hồi (đổi trạng thái), Nhật ký audit (7 bộ lọc, mặc định 30 ngày, chặn > 90 ngày ở UI, chỉ metadata). Chờ BE: người tạo/tổ chức của ticket & feedback, tên người dùng, đính kèm, thông báo, diff audit |
| Org | Hỗ trợ & phản hồi `/workspace/support` | Đã tích hợp (mock test) | Tạo ticket (Idempotency-Key giữ khi retry), danh sách, lịch sử trao đổi, tin nhắn, feedback; chỉ OrganizationUser (creator-owned) |
| Admin | Tổ chức `/admin/organizations` | Đã tích hợp (mock test) | Bảng + drawer chi tiết/tạo, filter/phân trang URL, khóa/mở có xác nhận, link tạo owner và `/admin/organizations/{id}/buildings` (trang do task khác). Chờ BE: địa chỉ/SĐT, sửa hồ sơ từ admin (BE#60) |
| Org | Hồ sơ `/workspace/profile` (+ `/account` dùng chung) | Đã tích hợp (mock test) | Field/Alert/toast, ETag `"N"`, 412 giữ nội dung + tải bản mới, lỗi field từ API; `/account` bọc `PublicOpsScope` (tối cố định) |
| Org | Editor kịch bản 3D `/workspace/buildings/[id]/scenarios/[scenarioId]?draft=` | Đã tích hợp một phần (mock test) | Spawn/hazard (kể cả `activationTime`), mục tiêu/hướng dẫn/rubric/chấm điểm/tuyến/runtime, undo/redo, lưu `If-Match`, 412 đối chiếu theo field, validate. Goal/NPC/blocked element/thiết bị: **Chờ BE #54** (khóa). Playtest: **Chờ BE #55** (khóa). Mở lại draft theo scenario: **Chờ BE #53** (hiện dùng `?draft=` hoặc tạo mới) |

### Editor kịch bản 3D — giả định, giới hạn và điều kiện mở khóa

Code: `src/features/scenario-editor/` (`store/` thuần, `scene/` Three.js, `panels/` UI). Test: `tests/e2e/scenario-editor-store.spec.ts` (logic thuần), `tests/e2e/scenario-editor.spec.ts` (UI + WebGL, route mock). Toàn bộ là **bằng chứng mock**; chưa chạy với BE/worker thật.

**Giả định có chủ đích (chưa có trong BE, phải xác nhận ở BE#54)** — gom ở `scene/coordinate.ts`, `scene/preview-model.ts` và `store/model.ts`:
- `coordinateTransform`: 16 số, **column-major** (translation ở phần tử 12–14), áp lên root của GLB, affine (hàng cuối 0,0,0,1). Không affine/suy biến/thiếu thì báo lý do và KHÔNG áp dụng; tỉ lệ lệch 1 rất lớn thì cảnh báo nghi sai đơn vị. Đã kiểm bằng fixture tự dựng, chưa với artifact thật.
- Vị trí spawn/hazard: mét, trục Y hướng lên, cùng không gian với GLB sau transform; `rotation` = **độ** quanh trục đứng.
- `floors`: `[ {id|guid, name|label, elevation|level|z (m)} ]`; chọn tầng cắt mô hình từ cao độ tầng đến cao độ tầng kế. Cao độ nằm ngoài khung mô hình thì không cắt và có ghi chú. Thiếu/không nhận ra thì danh sách tầng trống, không bịa.
- `semanticMapping`: đoán hai dạng `{ nhóm: [tên node glTF] }` hoặc `{ tên node: nhóm }`; lớp chỉ hiện khi tìm thấy node trùng tên trong GLB.
- BE bỏ field ngoài DTO khi PUT (`ScenarioDraftStateDto`): editor giữ mọi field lạ trong bộ nhớ và gửi lại nguyên tham chiếu, nhưng **không lưu bền được field ngoài DTO** (cả top-level lẫn bên trong spawn/hazard). `goals/npcs/blockedElements/modePolicy/safetyThresholds` (JSON thô trong DTO) được bảo toàn nguyên vẹn, không diễn giải.
- Draft mới tạo có `state = {}`; DTO có thành viên không-nullable nên khi lưu bổ sung `spawnPoints/hazards = []`, `evacuationRoutes = []` và số chấm điểm chưa nhập = 0 (validate báo `TIME_LIMIT_INVALID`…). Không đặt sẵn ngưỡng đạt, trọng số hay chính sách chấm.
- Validate của BE kiểm bản **đã lưu**: nút Kiểm tra lưu trước khi gọi (nhãn "Lưu và kiểm tra" khi có thay đổi). Validate client chỉ phản chiếu `ScenarioDraftStructuralValidator`; neo đối tượng/năng lực runtime chỉ BE kiểm được.
- Kết quả validate gắn snapshot và ETag đã xác nhận, không gắn draft mới nhập trong lúc chờ. Sửa trong lúc lưu/kiểm tra làm kết quả trở thành cũ; version hoặc draftId không khớp bị từ chối. Đổi draft/rời editor hủy request đang chờ. Dry-run ở BE#66 là cải tiến riêng, không phải điều kiện cho cơ chế này.

**Khóa theo cờ** (`src/features/scenario-editor/config.ts`, mặc định `false`; chỉ bật khi BE công bố schema có phiên bản + validator):

| Cờ | Điều kiện mở | Issue |
|---|---|---|
| `goals`, `npcs`, `blockedElements` | Schema JSON có version cho từng loại, mã lỗi cho field lạ (bảo toàn hay từ chối), validator trả `{code,path,message}` | BE#54 |
| `devices` | Catalog `scenario-interactions/catalog` có schema tham số thiết bị | BE#54 |
| `playtest` | `GET /api/playtests/{id}`, cấp lại grant khi hết hạn, mã opaque cho QR/deep link | BE#55 |

**Signed URL/preview**: `NotReady` (200, `downloadUrl: null`) được poll 5 s, tối đa 24 lần (tạm dừng khi tab ẩn) rồi có nút "Kiểm tra lại". URL ký không cache; `expiresAt` đã qua hoặc storage trả 400/401/403/404/410 thì lấy lại URL, tối đa 2 lần tự động rồi nút tải lại thủ công.

**Giới hạn đo hiệu năng**: headless Chromium dùng SwiftShader (CPU) nên số renders/thời gian khung hình KHÔNG phản ánh GPU thật. Test chỉ chứng minh vòng đời tài nguyên (`renderer.info.memory` về 0 sau unmount, lặp 2 lần), render-on-demand, context loss/restore. Cảnh báo driver `GPU stall due to ReadPixels` xuất hiện khi chụp ảnh và bị lọc khỏi kiểm tra console. Fixture GLB chỉ 144 tam giác; chưa thử mô hình IFC lớn thật, chưa đo bộ nhớ/FPS trên thiết bị tầm trung. Cần đo với artifact worker thật trước khi tuyên bố đạt hiệu năng.

**Chưa làm**: chọn phần tử IFC để gán `objectAnchors` từ viewport (cần ánh xạ node glTF ↔ IFC GUID từ BE#54; hiện nhập tay), tuyến thoát hiểm vẽ trên mô hình (BE chỉ lưu danh sách chuỗi), gizmo trên cảm ứng nhỏ (phone chỉnh bằng form).

## Kiểm thử với API thật (2026-10-10)

Đã chạy giao diện (dev server + proxy `FET3D_DEV_API_PROXY=https://api.fet3d.io.vn`, `NEXT_PUBLIC_API_BASE_URL=` rỗng) với PlatformAdmin thật. Chỉ đọc, ngoại trừ các lần thử tạo công trình (thất bại 500, không tạo gì).

| Màn hình | Kết quả với API thật |
|---|---|
| Tài khoản | Chạy. Phát hiện/sửa: API trả role dạng tên (`"OrganizationUser"`), FE chỉ hiểu số → mọi vai trò hiện "Không xác định"; tạo tài khoản phải gửi role bằng tên (API từ chối số, `allowIntegerValues:false`). |
| Tổng quan | Chạy, số liệu khớp (12 tài khoản = 1+6+5; 2 công trình). |
| Tổ chức, Hỗ trợ, Audit | Chạy (danh sách rỗng/đọc được). |
| Công trình theo tổ chức | Danh sách và `access` chạy; tạo công trình, chi tiết, revisions, scenarios trả 500 → BE#64. |
| Thương mại, editor catalog | 500 → BE#64. |
| Chưa kiểm | IFC upload, editor, thanh toán PayOS, review/release (bị chặn bởi BE#64 hoặc chưa an toàn để chạy trên dữ liệu thật). |

## Cách chạy test

- `pnpm build` phải chạy với `NEXT_PUBLIC_API_BASE_URL=` (rỗng) để mock Playwright cùng origin. Nếu `.env` trỏ tới API thật, trình duyệt coi mock là khác origin và giấu header `ETag`/`Retry-After` → các test 412/Retry-After sẽ lỗi.
- Playwright: `PLAYWRIGHT_BASE_URL=http://localhost:<cổng> pnpm exec playwright test` sau khi `next start` bản build đó. Spec `*-dev.spec.ts` (prototype) chỉ chạy khi đặt `PLAYWRIGHT_DEV_URL`.
- Mock không phải bằng chứng tích hợp; bảng trên là bằng chứng API thật.
