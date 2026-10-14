# FET3D — Organization & PlatformAdmin UI: tracker

Theo dõi từng màn hình: **Đã tích hợp** (gọi API thật, có test với mock), **Chờ BE** (thiết kế sẵn, khóa tính năng), **Prototype** (dữ liệu mẫu, chỉ môi trường phát triển; production không có nút giả thành công hay số liệu mẫu).

Nguồn kiểm tra BE: `main` @ `1eaf988` (14/10/2026; OpenAPI đang triển khai và `/health/version` trả cùng commit). Các nội dung ghi `b6a7d74` bên dưới là trạng thái lúc đối chiếu ban đầu (10/10). Bằng chứng mock (Playwright route) và kiểm thử API thật được ghi riêng — mock không phải bằng chứng tích hợp.

**Ba mức trạng thái cho mỗi tính năng** (một dòng có thể ở các mức khác nhau; không gộp):
1. **Contract** — BE đã có endpoint/DTO trong OpenAPI hoặc source (chưa chứng minh chạy đúng).
2. **FE đã tích hợp** — FE gọi đúng contract và có test với mock cùng contract.
3. **Đã kiểm chứng API thật** — đã chạy với deployment bằng tài khoản/dữ liệu test, ghi ngày và phạm vi.

Backlog đợt tích hợp 14/10/2026: issue tổng [FE#62](https://github.com/Capstone-FA26SE186-Fire3D/FE/issues/62) (F1–F14 = [#48](https://github.com/Capstone-FA26SE186-Fire3D/FE/issues/48)–[#61](https://github.com/Capstone-FA26SE186-Fire3D/FE/issues/61)); issue BE mới [#77](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/77) (AI Trainee), [#78](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/78) (lịch sử/kết quả Trainee), [#79](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/79) (Learn tìm kiếm/lọc), [#80](https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/80) (analytics mở rộng, Phase 2). Bảng coverage FR nằm trong issue tổng.

Riêng BE#59/#66 đã đối chiếu lại source `origin/main` @ `3726c14`: analytics trả `isActive`, gói v7 giới hạn 6/12 tháng, quotation đã kiểm tên/địa chỉ; annotation có cả body `eTag` và header `ETag`. Đây là hiệu chỉnh trạng thái issue theo source, chưa xác nhận deployment hoặc tích hợp toàn bộ API mới.

## Issue BE đã mở (2026-10-10)

> Cập nhật 14/10/2026: các issue #51–#69 dưới đây đã đóng ở BE; deploy `1eaf988`. Contract tương ứng đã có trong OpenAPI nhưng FE chỉ được coi là tích hợp xong khi có test cùng contract và smoke API thật (xem cột trạng thái ở bảng màn hình). Bảng giữ nguyên để truy vết lý do chặn lúc đó.

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
| Org | Phiên bản & readiness của kịch bản (`/workspace/buildings/[id]/scenarios/[scenarioId]/versions`) | Contract: có. FE: đã tích hợp (mock test, F1 [#48](https://github.com/Capstone-FA26SE186-Fire3D/FE/issues/48)). API thật: chưa | Trạng thái duyệt (`reviewStatus/reviewId/rejectReason` trên version + `GET /api/scenario-versions/{id}/review`), readiness (`GET .../readiness`: package job, QA, `confirmationReviewId`, `candidateArtifactId`, `missing`), release (`GET /api/releases?scenarioId=`) và danh sách draft (`GET /api/scenarios/{id}/drafts`) đều lấy từ máy chủ; không còn `sessionStorage` làm nguồn sự thật. Tạo release dùng xác nhận/artifact từ readiness (không nhập UUID). Phát hành gửi `Idempotency-Key` (giữ khi retry), đọc `ReleaseResponse`; 503 `PUBLISH_GATE_UNAVAILABLE` = cổng chưa bật (`Publishing:Enabled`), 409 theo từng điều kiện, release vẫn Built. Lịch sử QA theo revision từ `GET /api/revisions/{id}/validation-runs`. Chưa làm: phiên bản trong một lần nhìn cho Admin (F3), hành trình từng bước (Đợt 3) |
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
| Org | Editor kịch bản 3D `/workspace/buildings/[id]/scenarios/[scenarioId]?draft=` | **Contract**: có (`fet3d.editor/1`: JSON Schema + fixture ở BE `contracts/editor/v1`, OpenAPI `editor-preview`, `revisions/{id}/floors`, `scenario-interactions/catalog`, `scenario-rubrics/catalog`, `scenario-drafts/{id}/validate-state`). **FE đã tích hợp (mock)**: F2 [#49](https://github.com/Capstone-FA26SE186-Fire3D/FE/issues/49) — chế độ theo draft (`schemaVersion`): v1 / `{}` khởi tạo / legacy / không hỗ trợ; ghim Geometry; ma trận column-major + floor-local ↔ GLB; sáu loại object; capability + tham số từ catalog; trường kịch bản v1 + rubric từ catalog; `validate-state` kiểm nội dung chưa lưu (stateHash, đánh dấu cũ); undo/redo, chống mất chỉnh sửa khi lưu/kiểm tra, 412, cleanup WebGL. Playtest: **Chờ BE #55** (khóa). **API thật**: chưa chạy (editor/catalog/floors trên deploy phụ thuộc BE#64 và dữ liệu Geometry `fet3d.editor/1` do worker thật). Mở lại draft theo scenario: F1 (liệt kê `GET /api/scenarios/{id}/drafts`). |

### Editor kịch bản 3D — contract `fet3d.editor/1`, giới hạn và điều kiện

Code: `src/features/scenario-editor/` — `v1/` (module thuần: `matrix`, `geometry`, `catalog`, `state`, `commands`, `issues`, `hash`, `availability`, `carry-over`, `editor-state`, `use-editor-v1`), `store/` (patch/undo-redo, merge 412, dùng chung với legacy), `scene/` (Three.js, chung cho cả hai chế độ), `panels/` (legacy) và `panels/v1/`. Test: `tests/e2e/scenario-editor-v1.spec.ts` (logic thuần, fixture BE trong `tests/fixtures/scenario-editor/v1/`), `scenario-editor-v1-ui.spec.ts` (UI + WebGL, route mock theo contract), `scenario-editor.spec.ts` + `scenario-editor-store.spec.ts` (chế độ legacy). Toàn bộ là **bằng chứng mock**; chưa chạy với BE/worker thật.

**Chế độ theo draft** (quyết định bởi state do server lưu):

| `state` | Chế độ | Hành vi |
|---|---|---|
| `schemaVersion === "fet3d.editor/1"` | v1 | Editor đầy đủ bên dưới. |
| `{}` (draft vừa tạo) | khởi tạo | Chỉ có nút "Khởi tạo bản nháp theo fet3d.editor/1": PUT đầu tiên là `{"schemaVersion","geometry":{artifactId,sha256Hash}}`; khóa nếu Geometry không hợp lệ. |
| không có `schemaVersion` | legacy | Sửa theo cấu trúc cũ (spawn/hazard…), banner "Bản nháp cũ". Không chuyển tọa độ, không ghi cấu trúc v1 lên draft này, không áp `coordinateTransform` lên mô hình. Khi Geometry hợp lệ: "Tạo bản nháp mới theo fet3d.editor/1" (POST draft với Idempotency-Key ổn định theo ý định, rồi PUT tối thiểu; có thể sao chép trường phi không gian đã hợp lệ — mục tiêu học tập, hướng dẫn, rubric `schema_version "1"`, thời gian tối đa, seed, runtime — không bao giờ sao chép vị trí). |
| `schemaVersion` khác | không hỗ trợ | Màn thông báo, không ghi gì. |

**Tọa độ** (`v1/matrix.ts`, đã kiểm bằng fixture BE): ma trận 16 số column-major nhân vector cột (`x' = m0·x + m4·y + m8·z + m12`), mét, Y-up, tay phải; hàng 4 = `0,0,0,1`, phần 3×3 khả nghịch (kiểm như BE). `coordinateTransform` = IFC→GLB: chỉ hiển thị/kiểm tra (IFC (1000, 2000, 3000) → GLB (-9, 3, 3)), không áp lên đối tượng hay mô hình. `floors[].transform` = floor-local→GLB (local (1, 0, 2) trên L2, cao 3,5 m → GLB (1, 3,5, 2)). `placement.position` luôn là floor-local; chọn điểm trên viewport (raycast) → nghịch đảo transform của tầng đang chọn; kéo gizmo cũng đi qua nghịch đảo đó. `placement.rotation` = quaternion đơn vị trong trục GLB (sai số 1e-3): ô nhập độ quanh trục đứng chỉ ghi khi người dùng gõ; không chạm thì quaternion gốc được gửi lại nguyên văn; quaternion nghiêng được báo là "ngoài trục đứng".

**Geometry** (`GET /api/buildings/{id}/editor-preview` cho mô hình + ánh xạ ngữ nghĩa; `GET /api/revisions/{id}/floors` cho pin + tầng khi tạo draft, không cần storage): `Ready` / `NotReady` / `ReprocessRequired`. `ReprocessRequired` (metadata legacy): không có tọa độ/URL, panel hướng dẫn xử lý lại IFC có liên kết tới tab IFC của công trình, khóa tạo draft v1 và đặt đối tượng, không poll. Preview `NotReady` nhưng metadata hợp lệ (chưa xác nhận object S3): vẫn đặt được đối tượng theo tọa độ tầng. Pin của draft khác artifact hiện tại: banner + nút ghim lại (chỉnh sửa có undo, không tự động).

**Sáu loại object** (`Spawn`, `Hazard`, `Goal`, `Npc`, `BlockedElement`, `Equipment`): id duy nhất (pattern của schema), nhãn, tầng, vị trí floor-local, hướng, neo IFC chọn từ `semanticMapping` đúng tầng (bắt buộc với `BlockedElement`; chọn từ danh sách có lọc hoặc dùng phần tử vừa bấm trên mô hình), năng lực `{id,version}` lấy từ catalog theo `objectKinds` (bắt buộc với Hazard/Npc/Equipment), tham số sinh từ schema đóng (number/integer/string/boolean/enum/minimum/maximum/maxLength/required). Đổi tầng giữ tọa độ cục bộ và bỏ neo không cùng tầng trong cùng một bước undo. Đổi năng lực bỏ tham số của năng lực cũ.

**Thay cờ cố định bằng trạng thái thật** (`v1/availability.ts`, tab "Khả dụng"): mỗi loại phụ thuộc Geometry hợp lệ + catalog. Catalog rỗng, runtime chưa công bố năng lực cho loại đó, hoặc Geometry thiếu `semanticMapping` cho cấu kiện bị chặn → hướng dẫn cấu hình, loại đó bị khóa đặt; không seed. Chỉ còn cờ `playtest` ở `config.ts` (chờ BE#55).

**Trường kịch bản v1**: `name`, `runtimeVersion` (chọn từ catalog), `timeLimitSeconds` (1–86400), `randomSeed`, `replanIntervalSeconds` (0–3600), `modePolicy.allowedModes` (Learn|Guided|Assessment; không chọn chế độ nào thì bỏ cả `modePolicy`), `learningObjectives` (≤50, 1–1000 ký tự, duy nhất), `learnerInstructions` (1–10000), `rubric {schema_version, pass_threshold, criteria[]}` với metric/operator lấy từ `GET /api/scenario-rubrics/catalog` (không đặt mặc định ngưỡng/trọng số/tiêu chí). Không chèn mặc định (0, mảng rỗng) mà server không yêu cầu.

**Lưu và kiểm tra** (`v1/use-editor-v1.ts`):
- PUT gửi đúng tài liệu đang sửa; mọi field không hiểu được giữ nguyên tham chiếu (test round trip trên `scenario-state.valid.json`). PUT shape-check của BE vẫn bắt trường chưa đủ (rubric thiếu `pass_threshold`, tiêu chí thiếu trọng số…): editor phản chiếu kiểm tra đó ở trình duyệt và khóa nút Lưu kèm lý do thay vì gửi một body chắc chắn bị 422. Xử lý PUT: 422 `EDITOR_SCHEMA_INVALID` (kèm `issues`, gắn vào đúng đối tượng/field), 422 `EDITOR_SCHEMA_VERSION_UNSUPPORTED`, 400 `EDITOR_JSON_MALFORMED`, 428, 412 (đối chiếu theo field, không ghi đè).
- `POST /api/scenario-drafts/{id}/validate-state` gửi đúng body sẽ PUT (kể cả chưa lưu), không đổi ETag. `stateHash` do BE tính trên **chuỗi JSON đã chuẩn hóa lại bằng System.Text.Json** (mọi ký tự ngoài ASCII cùng dấu nháy kép, `&`, nháy đơn, `+`, `<`, `>`, dấu huyền bị thoát thành `\uXXXX`) — không phải chuỗi thô đã gửi — nên client tái tạo đúng cách serialize đó (`v1/hash.ts`, đã đối chiếu với .NET 10) để biết kết quả thuộc bản nào. Sửa tiếp thì kết quả thành "cũ" và không còn gắn vào đối tượng; hash khác bị từ chối. `POST .../validate` (bản đã lưu) vẫn dùng ở màn phiên bản/snapshot, không dùng trong editor v1.
- Ánh xạ `issues[].path` (JSONPath) → đối tượng/field/tiêu chí rubric (`v1/issues.ts`); bấm một vấn đề chuyển tới đúng đối tượng hoặc nhóm.

**Giới hạn đã biết**: bản nháp chưa đủ theo schema (dòng rubric/mục tiêu để trống) không lưu được cho tới khi sửa; chưa có chọn tuyến thoát hiểm trên mô hình; gizmo trên cảm ứng nhỏ (phone chỉnh bằng form); phần tử neo được chọn từ danh sách hoặc từ phần tử bấm trên mô hình, chưa có chế độ "chọn nhiều". Logic kéo gizmo → floor-local được kiểm qua hook mô phỏng kéo (không đi qua TransformControls thật).

**Signed URL/preview**: `NotReady` (200, `downloadUrl: null`) được poll 5 s, tối đa 24 lần (tạm dừng khi tab ẩn) rồi có nút "Kiểm tra lại"; `ReprocessRequired` không poll. URL ký không cache; `expiresAt` đã qua hoặc storage trả 400/401/403/404/410 thì lấy lại URL, tối đa 2 lần tự động rồi nút tải lại thủ công.

**Giới hạn đo hiệu năng**: headless Chromium dùng SwiftShader (CPU) nên số renders/thời gian khung hình KHÔNG phản ánh GPU thật. Test chỉ chứng minh vòng đời tài nguyên (`renderer.info.memory` về 0 sau unmount, lặp 2 lần, cả hai chế độ), render-on-demand, context loss/restore. Fixture GLB chỉ 144 tam giác; chưa thử mô hình IFC lớn thật, chưa đo bộ nhớ/FPS trên thiết bị tầm trung. **Cần đo trên GPU/thiết bị thật với artifact worker thật trước khi tuyên bố đạt hiệu năng.**

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
