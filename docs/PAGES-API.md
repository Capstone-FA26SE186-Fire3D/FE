# FET3D Web – Tài liệu trang, logic xử lý & API

> Mô tả code `web-react` sau khi pull `origin/main` (`4cb3498`), ngày 28/10/2026.
> Backend đối chiếu: `BE/Fire3D` (controllers trong `Fire3D.API/Controllers`).

## Mục lục

1. [Public / Auth / Learn](#nhóm-public--auth--learn): `/`, `/about`, `/download`, `/privacy`, `/organizations`, `/login`, `/forgot-password`, `/reset-password`, `/account`, `/qr/[token]`, `/learn`, `/learn/[slug]`, `/learning-hub`, `/dashboard/trainee`, `/dashboard/organization`, cùng lớp API chung
2. [Quản trị (Admin)](#nhóm-quản-trị-admin): `/admin/overview`, `/admin/accounts`, `/admin/organizations` (+ analytics, buildings), `/admin/reviews`, `/admin/learn`, `/admin/library`, `/admin/support`, `/admin/ai`
3. [Workspace – Tòa nhà & Kịch bản](#nhóm-workspace--tòa-nhà--kịch-bản): `/workspace/buildings`, `/workspace/buildings/[id]`, `.../scenarios`, `.../scenarios/[scenarioId]`, `.../versions`
4. [Workspace – Thanh toán, Báo cáo, Thư viện, Hỗ trợ, AI](#nhóm-workspace--thanh-toán-báo-cáo-thư-viện-hỗ-trợ-ai): `/workspace/billing` (+ `/return`), `/admin/commerce`, `/workspace/analytics`, `/workspace/library`, `/workspace/support`, `/workspace/ai`, `/workspace/profile`, `/demo/rag`
5. [IFC – Quét mô hình & Thư viện đồ](#nhóm-ifc--quét-mô-hình--thư-viện-đồ): `/workspace/ifc`, `/demo/ifc`, các tab IFC của tòa nhà, các cách quét IFC, danh mục lớp IFC/thiết bị, mã lỗi QA, thư viện đồ
6. [Type API đã bổ sung & việc còn tồn đọng](#type-api-đã-bổ-sung--việc-còn-tồn-đọng)

---

## Nhóm: Public / Auth / Learn

> Phạm vi: các trang public, xác thực, Learn, Learning Hub và QR landing của `web-react` (Next.js App Router), đối chiếu với BE `Fire3D.API`.
> Đường dẫn FE tính từ `web-react/src`. BE controller tính từ `Fire3D/Fire3D.API/Controllers`. Rà lại trên code sau khi pull `origin/main` (merge PR #190).
> Ký hiệu vai trò: `0 = PlatformAdmin`, `1 = OrganizationUser`, `2 = Trainee` (`features/auth/types.ts` → `UserRole`).

### Lớp API chung

**File:** `api/client.ts`, `api/errors.ts`, `api/types/common.ts`, `api/idempotency.ts`, `api/pagination.ts`, `api/use-async-data.ts`, `api/use-polling.ts`, `api/describe-error.ts`, `api/index.ts`.

- **`apiClient.request<T>` / `requestWithMeta<T>`** (`api/client.ts`)
  - URL = `env.apiBaseUrl` + path. `query` nhận giá trị mảng (lặp key, ví dụ `kind=Tip&kind=Video`) và bỏ qua `null`/`undefined`.
  - Header mặc định `Accept: application/json`. `json` → `Content-Type: application/json` + `JSON.stringify`. Không được truyền cả `body` lẫn `json` (ném `TypeError`).
  - Method: lấy `options.method`, nếu không có thì là `POST` khi có body, ngược lại là `GET`.
  - `idempotencyKey` → header `Idempotency-Key`. `ifMatch` → header `If-Match`.
  - Đọc body: 204/205 hoặc `content-length: 0` → `undefined`. JSON hỏng → trả text, để lỗi vẫn có status và message.
  - `!response.ok` → ném `ApiError(message, status, payload, retryAfterSeconds, code, fieldErrors, headers)`. `requestWithMeta` trả thêm `headers` và `status`, dùng để lấy `ETag`.
  - **Không tự gắn token.** Mỗi feature tự thêm `Authorization: Bearer <accessToken>`: auth dùng `bearer()`, learn dùng `auth()`, qr-landing dùng `headers()`, training-history dùng `auth()`. Client cũng không tự refresh khi gặp 401.
- **`ApiError`** (`api/types/common.ts`): có các getter `isPreconditionFailed` (412), `isRateLimited` (429/503) và `fieldMessage(path)` (so khớp không phân biệt hoa thường, bỏ tiền tố `$.`).
- **`errors.ts`**:
  - `parseFieldErrors` đọc `errors` dạng mảng `[{code,path,message}]` hoặc map ProblemDetails `{field: [msg]}`.
  - `parseErrorCode` đọc `code`, `errorCode` hoặc `error_code`.
  - `parseErrorMessage` đọc `message`, `title` hoặc `detail`.
  - `parseRetryAfter` nhận số giây hoặc HTTP-date.
- **`describe-error.ts`** → `describeApiError(error, fallback)`: chuyển lỗi thành câu tiếng Việt theo status: 401, 403, 404, 412, 428, 429/503 (kèm Retry-After), 5xx, `TypeError` (mất mạng).
- **`idempotency.ts`**:
  - `stableStringify`: JSON với key đã sắp xếp.
  - `newIdempotencyKey`: dùng `crypto.randomUUID`.
  - `useIdempotencyKey()`: `keyFor(payload)` giữ nguyên key khi payload không đổi (để retry phát lại đúng thao tác cũ). `done()` reset sau khi thành công.
- **`pagination.ts`** → `normalizePage(raw)`: chuẩn hóa cả 2 envelope `{items,totalCount,page,pageSize}` và `{items,total,…}` về `PageResponse<T>`.
- **`use-async-data.ts`** → `useAsyncData(key, load, enabled, {keepPrevious, scope, keepWhenDenied})`:
  - Đổi `key` → abort request cũ và bỏ qua response trễ.
  - `keepPrevious` (mặc định `true`) giữ data cũ trong lúc tải trang hoặc filter mới. Data bị bỏ khi lỗi 401/403/404 hoặc khi `scope` (tenant/user) đổi.
  - `keepPrevious:false` dành cho view chi tiết của một resource.
  - Trả về `{data, error, loading, reload}`.
- **`use-polling.ts`** → `usePolling({fetcher, isDone, intervalMs=3000, maxBackoffMs=30000, resetKey})`:
  - Chỉ poll khi tab đang hiển thị và gọi lại ngay khi tab hiện lại.
  - Backoff ×2 khi lỗi, có tôn trọng `Retry-After`.
  - Dừng khi `isDone`. Dừng hẳn (`halted`) khi gặp 401/403, `refresh()` để chạy lại.
  - Trong nhóm trang này không dùng trực tiếp. Learning Hub/Lịch sử tự `reload` theo `setInterval` 15 s, còn AI bubble thuộc `org-ai`.

**Phiên đăng nhập / token** (`features/auth/auth-session.tsx`, `session-store.ts`, `token-expiry.ts`, `redirect.ts`, `roles.ts`):

- **Provider:** `AuthSessionProvider` bọc toàn app trong `app/layout.tsx`. Context gồm `accessToken`, `user`, `ready`, `pending`, `isAuthenticated`, `login`, `loginWithGoogle`, `completeGoogleOnboarding`, `logout`, `endSession`, `register`, `requestPasswordReset`, `resetPassword`, `updateUser`.
- **Lưu token:**
  - `{accessToken, refreshToken}` lưu trong cookie first-party `fire3d_session` (`Max-Age` 7 ngày, `SameSite=Lax`, `Secure` khi chạy HTTPS).
  - Payload quá ~3800 byte thì lưu vào `localStorage` (`fire3d-auth-tokens`). Bản legacy trong `sessionStorage` bị xóa.
  - Đồng bộ đa tab qua `BroadcastChannel("fire3d-auth")`: `session` hoặc `logout`.
- **Khôi phục khi mở app:**
  - `readTokens()` → `GET /api/auth/me`.
  - Nếu 401: `withRefreshLock` (Web Locks `fire3d-auth-refresh`) → `POST /api/auth/refresh`. Nếu trong lúc chờ lock tab khác đã xoay token thì dùng token mới đó.
  - Refresh thất bại → `clearSession()` + `forgetAccountBoundData()` (xóa command keys và pending checkout).
  - Xong thì `ready = true`.
- **Gia hạn chủ động:**
  - Đọc `exp` của JWT (`accessTokenExpiry`) và refresh trước hạn 60 s (`REFRESH_LEAD_MS`), chạy một luồng duy nhất.
  - Refresh bị từ chối (400/401/403) → đăng xuất cục bộ. Lỗi tạm thời → thử lại sau 30 s.
  - Tính lại lịch khi tab hiện lại.
- **Đăng xuất:** `logout()` xóa session cục bộ trước, `router.replace("/")`, sau đó gọi `POST /api/auth/logout` và bỏ qua lỗi. `endSession()` chỉ xóa cục bộ, dùng khi gặp 401 ở QR landing hoặc khi Google link yêu cầu đăng nhập lại.
- **Role guard / redirect:**
  - **Không có `middleware.ts`.** Mọi guard nằm ở client component: kiểm tra `ready`, `isAuthenticated`, `user.role` rồi hiển thị CTA đăng nhập hoặc thông báo theo vai trò.
  - `dashboardRouteFor(role)`: 0 → `/admin/overview`, 1 → `/workspace/buildings`, 2 → `/learning-hub`.
  - `postLoginRoute(user, next)`: chỉ nhận `next` có trong whitelist (`validatedNext`: learn/[slug], qr/[token] đúng format, admin/workspace routes…) và hợp với role (`canOpenRoleRoute`). Nếu không hợp lệ thì về dashboard của role.
  - `app/robots.ts` chặn index `/workspace`, `/admin`, `/account`, `/qr`, `/dashboard`.
- **Chuẩn hóa role/gender:** `normalizeUser` (trong `auth/api.ts`) và `normalizeRole` (trong `roles.ts`) nhận cả tên enum (`"Trainee"`…) lẫn số.

---

### `/` (Trang chủ / Landing)

**File:** `app/page.tsx` → `features/landing/components/landing-content.tsx` → `landing-experience.tsx`, `building-scene.tsx`, `orbit-surface.tsx`, `features/landing/scene/*` (three.js runtime).

**Quyền truy cập:** Public.

**Logic xử lý:**
- Trang landing có cuộn theo "beats": phần intro và 3 bước (làm quen không gian → thử quyết định → xem lại kết quả).
- Cảnh 3D tòa nhà cháy chạy theo cuộn trang. Các module scene lo phần kỹ thuật: `quality`/`budget` (hạ chất lượng theo thiết bị), `fire-*`, `smoke`, `occupants`/`characters`, `journey-camera`.
- `handoff.ts` (`setSceneHandoff`/`takeSceneHandoff`) chuyển ảnh chụp cảnh sang hero của `/organizations`. Chỉ giữ trong bộ nhớ, không gửi API.
- Không có state server và không có xử lý lỗi API.

**API gọi:** Không có.

### `/about`

**File:** `app/about/page.tsx` → `features/organization/components/public-page.tsx` (`PublicPage kind="about"`).

**Quyền truy cập:** Public.

**Logic xử lý:** Nội dung tĩnh: hero, các `InfoCard` và CTA về `/`. Metadata title "Về chúng tôi".

**API gọi:** Không có.

### `/download`

**File:** `app/download/page.tsx` → `PublicPage kind="download"` → `DownloadPage`.

**Quyền truy cập:** Public.

**Logic xử lý:** Hiển thị cố định "Chưa khả dụng" (chưa có APK/QR active). Có ghi chú không tạo QR giả. Là trang đích của các CTA "Luyện tập trên ứng dụng" và "Mở trên điện thoại".

**API gọi:** Không có.

### `/privacy` (mới sau khi pull)

**File:** `app/privacy/page.tsx` (+ `privacy.module.css`).

**Quyền truy cập:** Public.

**Logic xử lý:** Trang chính sách quyền riêng tư tĩnh (website + app Android), ngày cập nhật cố định `27/10/2026`. Dùng `SiteHeader`/`SiteFooter`.

**API gọi:** Không có.

> Lưu ý: `/privacy` chưa nằm trong whitelist `next` của `features/auth/redirect.ts` (`validatedNext`). Vì vậy `/login?next=/privacy` sẽ về dashboard. Hiện chưa có luồng nào tạo link như vậy.

### `/organizations` (trang giới thiệu cho tổ chức)

**File:** `app/organizations/page.tsx` → `features/organization/components/organization-page.tsx`, `organization-hero.tsx`, `public.module.css`.

**Quyền truy cập:** Public.

**Logic xử lý:**
- Hero dùng ảnh mặc định `/assets/landing-cutaway.webp`. Nếu `takeSceneHandoff()` có ảnh từ landing thì thay ảnh đó (trong `setTimeout(0)` ở `useEffect`).
- Danh sách 6 bước quy trình (IFC → revision → scenario → release/QR → Android → kết quả), là nội dung tĩnh.

**API gọi:** Không có.

### `/login`

**File:** `app/login/page.tsx` → `features/auth/components/login-shell.tsx` (khung 2 cột, `ThemeScope`, `ThemeToggle`) + `login-form.tsx` (bọc trong `Suspense` vì dùng `useSearchParams`).

**Quyền truy cập:** Public. Nếu đã đăng nhập (`ready && isAuthenticated`) thì `router.replace(postLoginRoute(user, ?next))` ngay.

**Logic xử lý:**
- **Tab "Đăng nhập":** `login(email.trim(), password)` → `saveSession` → redirect theo `postLoginRoute`. Lỗi → `toFieldErrors` (map `errors` ProblemDetails theo field, key viết thường) + message.
- **Tab "Tạo tài khoản"** (2 bước):
  1. Chọn loại tài khoản: `trainee` (username, pattern `[a-z0-9._-]{3,30}`) hoặc `organization` (tên, địa chỉ, SĐT `\+?[0-9]{6,15}`), cùng email, mật khẩu (≥6), xác nhận mật khẩu.
  2. "Gửi mã OTP" → `requestRegistrationOtp`. "Gửi lại" → `resendVerification`.
  3. Nhập OTP 6 số → `verifyRegistrationOtp` → nhận `registrationToken`.
  4. `register(...)`, sau đó tự `login`. Nếu đăng nhập tự động lỗi thì chuyển về tab login kèm thông báo.
  - Lỗi `EMAIL_EXISTS` → hiện khối "Email đã có tài khoản".
  - Đổi email → hủy OTP đang có.
- **Google:**
  - `loginWithGoogle()` (Firebase popup → idToken) → `POST /api/auth/login-firebase`.
  - `Authenticated` → lưu session và redirect.
  - `OnboardingRequired` → chuyển sang form hoàn thiện. Có hẹn giờ hết hạn theo `onboarding.expiresAt`. Submit → `completeGoogleOnboarding`.
  - `ACCOUNT_LINK_REQUIRED` (trong body hoặc ở payload lỗi 409) → yêu cầu đăng nhập bằng email.
  - Rate limit 429 / `ONBOARDING_RETRY_REQUIRED` → khóa nút và đếm ngược theo `Retry-After`.
  - Thông báo lỗi lấy từ `google-errors.ts`.
- `?notice=google-linked|password-set` → hiện thông báo "mọi phiên đã bị thu hồi".
- Các ref `googleRequestRef` chống bấm 2 lần.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | `features/auth/api.ts:authApi.login` (qua `auth-session.login`) | `{email, password}` | `TokenResponse` (chuẩn hóa từ `ApiTokenResponse`) | `AuthController.Login` → `LoginResponse` |
| POST | `/api/auth/login-firebase` | `authApi.loginFirebase` | body là chuỗi JSON `firebaseIdToken` | `GoogleLoginResult` (raw `GoogleExchangeResponse<ApiTokenResponse>`) | `AuthController.LoginFirebase` → `GoogleExchangeResponse` |
| POST | `/api/auth/google/onboarding/complete` | `authApi.completeGoogleOnboarding` | `GoogleOnboardingInput` `{onboardingToken, accountType, username \| organizationName/Address/PhoneNumber}` | `TokenResponse` | `GoogleOnboardingController.Complete` (201, `GoogleExchangeResponse`) |
| POST | `/api/auth/registration/request-otp` | `authApi.requestRegistrationOtp` | `{email}` | `void` (202) | `AuthController.RequestRegistrationOtp` |
| POST | `/api/auth/resend-verification` | `authApi.resendVerification` | `{email}` | `void` (202) | `AuthController.ResendVerification` |
| POST | `/api/auth/registration/verify-otp` | `authApi.verifyRegistrationOtp` | `{email, otp}` | `RegistrationOtpVerification` | `AuthController.VerifyRegistrationOtp` → `RegistrationOtpVerificationResponse` |
| POST | `/api/auth/register/trainee` | `authApi.register` (accountType trainee) | `{email,password,confirmPassword,fullName?,username,registrationToken}` | `AuthUser` | `AuthController.RegisterTrainee` (201 `AccountResponse`) |
| POST | `/api/auth/register/organization` | `authApi.register` (accountType organization) | `{email,password,confirmPassword,fullName?,organizationName,organizationAddress,organizationPhoneNumber,registrationToken}` | `AuthUser` | `AuthController.RegisterOrganization` (201 `AccountResponse`) |
| GET | `/api/auth/me` | `authApi.me` (restore session / adopt tab) | Bearer | `AuthUser` | `AuthController.Me` → `AccountResponse` |
| POST | `/api/auth/refresh` | `authApi.refresh` (restore + gia hạn) | `{refreshToken}` | `TokenResponse` | `AuthController.Refresh` → `TokenResponse` |
| POST | `/api/auth/logout` | `authApi.logout` | Bearer | `void` (204) | `AuthController.Logout` |

### `/forgot-password`

**File:** `app/forgot-password/page.tsx` → `features/auth/components/forgot-password-form.tsx`.

**Quyền truy cập:** Public.

**Logic xử lý:**
- Validate bằng HTML (`required`, `type=email`).
- Submit → `requestPasswordReset(email)`. Khi đang gửi, `pending` khóa nút.
- Thành công luôn hiện cùng một thông báo, không tiết lộ email có tồn tại hay không (BE trả 202 cho mọi trường hợp).
- Lỗi → `toMessage` (lấy message của `ApiError`).

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| POST | `/api/auth/forgot-password` | `authApi.forgotPassword` (qua `auth-session.requestPasswordReset`) | `{email}` | `ForgotPasswordAccepted \| undefined` (202 `{message}`) | `AuthController.ForgotPassword` |

### `/reset-password`

**File:** `app/reset-password/page.tsx` → `features/auth/components/reset-password-form.tsx` (bọc trong `Suspense`).

**Quyền truy cập:** Public, cần `?token=` trong URL.

**Logic xử lý:**
- Thiếu token → báo "Liên kết… không hợp lệ" và không gọi API.
- Mật khẩu mới `minLength=8` (HTML).
- Submit → `resetPassword(token, newPassword)`. Thành công hiện thông báo, không tự redirect.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| POST | `/api/auth/reset-password` | `authApi.resetPassword` (qua `auth-session.resetPassword`) | `{token, newPassword}` (BE `ResetPasswordRequest.Token` là `Guid`) | `void` (204) | `AuthController.ResetPassword` |

### `/account`

**File:** `app/account/page.tsx` → `features/account/components/public-ops-scope.tsx` (`ThemeScope forcedMode="dark"` + `ToastProvider`) → `account-profile.tsx`, `google-link-panel.tsx`. Component `AccountProfile` cũng được dùng lại trong `/learning-hub?view=profile`.

**Quyền truy cập:** Đăng nhập, mọi role. Chưa `ready` → skeleton. Chưa đăng nhập → panel "Bạn cần đăng nhập" kèm link `/login`.

**Logic xử lý:**
- **Tải hồ sơ:** `loadProfile` gọi `meWithMeta` để lấy `ETag` (fallback `"<profileRevision>"`). Nếu `role === 1` thì tải thêm `organizationsApi.getMine` (ETag riêng). Form bị khóa cho tới lần tải đầu tiên.
- **Lưu hồ sơ** (`PATCH /api/auth/me`, `If-Match`):
  - Lỗi 412 → `problem.stale`, nút "Tải bản mới nhất" gọi `loadProfile(true)`. `keepEdits` giữ phần người dùng đã sửa.
  - Lỗi field được map vào các field `fullName/username/dob/gender/phoneNumber`.
- **Hồ sơ tổ chức** (chỉ role 1): `PATCH /api/organizations/me` với `If-Match`.
- **Avatar:**
  - Chỉ nhận JPEG/PNG/WebP ≤ 5 MiB.
  - Luồng tải lên 3 bước: `upload-intent` → `PUT` lên presigned URL (fetch trực tiếp, không qua apiClient) → `complete` (`If-Match`).
  - Xóa avatar: `DELETE /api/me/avatar` (`If-Match`).
- **Đổi mật khẩu:** kiểm tra mật khẩu mới ≥6 và khớp ô xác nhận → `change-password` → `logout()` + `router.replace("/login")`.
- **Google link panel:**
  - Firebase popup lấy idToken.
  - `link-google` (kèm mật khẩu hiện tại) hoặc `me/password` (đặt mật khẩu local lần đầu).
  - Nếu `requiresLogin`, hoặc sau khi đặt mật khẩu: `endSession()` → `/login?notice=google-linked|password-set`.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/auth/me` | `authApi.meWithMeta` | Bearer | `ApiResponse<AuthUser>` (+ETag) | `AuthController.Me` |
| PATCH | `/api/auth/me` | `authApi.updateProfile` | `UpdateProfileInput` `{fullName, username?, dob, gender, phoneNumber}` + `If-Match` | `ApiResponse<AuthUser>` | `AuthController.UpdateMe` → `AccountResponse` |
| POST | `/api/me/avatar/upload-intent` | `authApi.uploadAvatar` (bước 1) | `{contentType, contentLength}` | `AvatarUploadIntent` | `AvatarController.CreateUploadIntent` → `AvatarUploadIntentResponse` |
| PUT | `<uploadUrl>` (S3 presigned) | `auth/api.ts:putAvatarObject` | file (raw) | — | (storage, không phải BE) |
| POST | `/api/me/avatar/complete` | `authApi.uploadAvatar` (bước 3) | `{uploadId}` + `If-Match` | `ApiResponse<AvatarResponse>` | `AvatarController.Complete` → `AvatarResponse` |
| DELETE | `/api/me/avatar` | `authApi.deleteAvatar` | `If-Match` | `void` (204) | `AvatarController.Delete` |
| POST | `/api/auth/change-password` | `authApi.changePassword` | `{currentPassword, newPassword}` | `void` (204) | `AuthController.ChangePassword` |
| POST | `/api/me/link-google` | `authApi.linkGoogle` | `{idToken, currentPassword}` | `GoogleLinkResult` | `GoogleLinkController.Link` → `GoogleLinkResponse` |
| POST | `/api/me/password` | `authApi.setLocalPassword` | `{idToken, newPassword}` | `void` (204) | `GooglePasswordController.Set` |
| GET | `/api/organizations/me` | `features/organizations/api.ts:organizationsApi.getMine` | Bearer | `ApiResponse<OrganizationProfile>` | `OrganizationProfileController.Get` |
| PATCH | `/api/organizations/me` | `organizationsApi.updateMine` | `{name, address, phoneNumber}` + `If-Match` | `ApiResponse<OrganizationProfile>` | `OrganizationProfileController.Update` |
| POST | `/api/auth/logout` | `authApi.logout` (sau khi đổi mật khẩu) | Bearer | `void` | `AuthController.Logout` |

### `/qr/[token]`

**File:** `app/qr/[token]/page.tsx` (metadata `robots: noindex`, `referrer: no-referrer`) → `features/qr-landing/components/qr-landing-shell.tsx` (ThemeScope, topbar riêng, không có site nav) → `qr-landing.tsx`, `participation-form.tsx`, `training-list.tsx`, `mobile-guide.tsx`. Kiểm tra token ở `features/qr-landing/token.ts`.

**Quyền truy cập:** Ai cũng mở được trang. Dữ liệu cần đăng nhập (BE: `Trainee`, `OrganizationUser`, `PlatformAdmin`). Chỉ Trainee mới nhập được mã tham gia.

**Logic xử lý:**
- **Kiểm tra token:** `isQrToken` (`/^[A-Za-z0-9_-]{32,128}$/`). Token sai format → "Liên kết QR không hợp lệ", không gọi API. Token chỉ đặt trong path, không lưu storage, không ghi vào log.
- **Chưa đăng nhập**, hoặc phiên hết hạn (401 → `endSession()` để `/login` không bị đẩy ngược lại) → CTA `/login?next=/qr/<token>` + `MobileGuide`.
- **Resolve:** `useAsyncData("qr:resolve:<token>")`. Xử lý lỗi theo status:
  - 404/410 → "Không tìm thấy công trình".
  - 403 → báo không có quyền.
  - 429/503/5xx/mạng → Alert kèm nút Thử lại.
  - Có data cũ mà refresh lỗi → cảnh báo "Trạng thái có thể đã cũ".
- **Đã resolve:** hiển thị tên công trình, badge Riêng tư/Công khai và "đã có quyền / cần mã tham gia".
  - `hasAccess` → `TrainingList`. Role khác Trainee là `staff` và thấy thêm trạng thái bài và release.
  - Chưa có quyền, là Trainee → `ParticipationForm`.
  - Chưa có quyền, role khác → EmptyState.
- **ParticipationForm:**
  - Validate mã 8–128 ký tự, không có khoảng trắng.
  - `400 PARTICIPATION_CODE_INVALID` → báo lỗi ở field. 401 → mất phiên. 403/404 → message.
  - 429/503 → đếm ngược `Retry-After` (mặc định 30 s / 10 s).
  - Thành công → xóa mã, `onVerified` → `reload` resolve.
- **TrainingList:** 401 → `onSessionLost`. 403 → nút "Kiểm tra lại quyền" (reload resolve). Danh sách rỗng → EmptyState. Trang chỉ đọc, không có nút bắt đầu phiên.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/qr/{qrToken}` | `features/qr-landing/api.ts:qrLandingApi.resolve` | Bearer | `QrResolution` | `TrainingSessionsController.Resolve` → `BuildingQrResolution` |
| GET | `/api/qr/{qrToken}/trainings` | `qrLandingApi.trainings` | Bearer | `QrTraining[]` | `TrainingSessionsController.Trainings` → `List<TrainingDto>` |
| POST | `/api/buildings/{id}/participation/verify` | `qrLandingApi.verifyParticipation` | `{code}` | `ParticipationVerified` | `BuildingAccessController.Verify` → `BuildingAccessResponse` |

### `/learn`

**File:** `app/learn/page.tsx` (`generateMetadata`: URL có search/filter/page thì `noindex`) → `features/learn/components/learn-browser.tsx`, gồm `learn-search-box.tsx`, `learn-filters.tsx` (`LearnFilterPanel`, `LearnActiveFilters`), `featured-posts.tsx`, `post-card.tsx`, `save-post-button.tsx`, `bookmarks-context.tsx`, `learn-pagination.tsx`. Hook dùng chung: `use-learn-query.ts`, `query.ts`, `parse.ts`.

**Quyền truy cập:** Public. Lưu bài chỉ dành cho Trainee đã đăng nhập.

**Logic xử lý:**
- **State nằm trên URL** (`search`, `kind` lặp, `situation` lặp, `page`). `useLearnQuery.update` đổi filter thì về page 1. Dùng `latest` ref để 2 click liên tiếp không ghi đè nhau.
- **Search box:** debounce 300 ms (`router.replace`). Enter thì `push`. Từ khóa 1 ký tự chưa gửi. Tối đa 100 ký tự.
- **Filter:** tối đa 10 tình huống. Slug lạ trên URL vẫn hiện thành chip.
- **Tải data:** `useAsyncData("learn:situations")` và `useAsyncData(learnQueryKey(...))`. Query mới abort query cũ.
- **Lỗi:**
  - 400 VALIDATION_ERROR → `describeFilterError` chỉ ra field bị từ chối, nút "Đặt lại tham số lỗi".
  - Lỗi khác → `describeReadError`, nút Thử lại.
- **Các trạng thái:** đang tải (skeleton), rỗng, không khớp filter, page vượt quá tổng số trang.
- **Bookmark:**
  - `LearnBookmarksProvider` (chỉ khi role 2) tải tối đa 10×100 bookmark để biết bài nào đã lưu.
  - `SavePostButton`: khách → `/login?next=/learn/<slug>`. Role khác → nút bị disable kèm giải thích. Lỗi 404/401/403 có message riêng.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/learn/situations` | `features/learn/api.ts:learnApi.situations` | — | `PublicSituation[]` | `ContentController.Situations` → `List<LearnSituationView>` |
| GET | `/api/learn/posts` | `learnApi.posts` | query `search?, situation[]?, kind[]?, page, pageSize` | `PageOf<PublicPostSummary>` | `ContentController.Posts` → `LearnPostPage` |
| GET | `/api/learn/bookmarks` | `learnApi.bookmarks` (`bookmarks-context`) | Bearer, query `page, pageSize` (+ `kind[]?`, `search?` hỗ trợ mới) | `BookmarkPage` | `ContentController.Bookmarks` → `LearnBookmarkPage` |
| PUT | `/api/learn/bookmarks/{postId}` | `learnApi.bookmark` | Bearer | `BookmarkState` | `ContentController.Bookmark` → `LearnBookmarkState` |
| DELETE | `/api/learn/bookmarks/{postId}` | `learnApi.unbookmark` | Bearer | `BookmarkState` | `ContentController.Unbookmark` → `LearnBookmarkState` |

### `/learn/[slug]`

**File:** `app/learn/[slug]/page.tsx`:
- `generateMetadata` → `features/learn/server-metadata.ts:postMetadata`: fetch server-side `no-store`, timeout 4 s. Base URL không tuyệt đối thì dùng fallback `noindex`.
- `isPostSlug` sai → `notFound()`.

Component: `features/learn/components/article-reader.tsx`, `block-renderer.tsx` (+ `blocks.ts`, `rich-text.ts`, `rich-text.tsx`, `video-embed.tsx`, `safe-url.ts`), `article-actions.tsx`, `learn-ai.tsx` (`LearnAiScope`, `AskAboutArticle`), `related-posts.tsx`.

**Quyền truy cập:** Public. Nút "Hỏi Trợ lý AI về bài này" chỉ bật cho Trainee (`bubble.enabled`).

**Logic xử lý:**
- **Tải bài:** `useAsyncData("learn:post:<slug>")`.
  - 404 → "Không tìm thấy bài". 410 `LEARN_POST_UNAVAILABLE` → "tạm thời không hiển thị". Hai trường hợp này không có nút retry.
  - Body sai cấu trúc → `ApiError 502 LEARN_POST_MALFORMED`.
- **Cập nhật meta:** `useDocumentMeta` đặt `document.title` và meta description theo bài.
- **Hiển thị nội dung:**
  - `parseBlocks` chỉ giữ heading/paragraph/list/callout/image/video hợp lệ, render dạng text (không dùng HTML thô).
  - URL ảnh và video được lọc qua `safe-url`.
  - Hiện chip tình huống (link về `/learn?situation=`) và danh sách nguồn tham khảo.
- **Liên quan:** `RelatedPosts` lấy tối đa 4 bài cùng tình huống đầu tiên, bỏ bài hiện tại. Lỗi thì ẩn.
- **AI bubble** (`org-ai/floating`): chỉ bật cho Trainee. Mở bubble với ngữ cảnh `{article: slug}`.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/learn/posts/{slug}` | `learnApi.post` (+ `server-metadata.ts:postMetadata` đọc raw) | — | `PublicPost` | `ContentController.Post` → `LearnPostView` |
| GET | `/api/learn/posts` | `learnApi.posts` (`related-posts`) | `situation=<slug>&page=1&pageSize=4` | `PageOf<PublicPostSummary>` | `ContentController.Posts` |
| GET/PUT/DELETE | `/api/learn/bookmarks[/{postId}]` | `learnApi.bookmarks/bookmark/unbookmark` | như `/learn` | `BookmarkPage` / `BookmarkState` | `ContentController.*` |
| GET/POST | `/api/ai/trainee/quota`, `/api/ai/trainee/answer`, `/api/ai/trainee/requests/{id}` | `features/org-ai/api.ts:traineeAiApi.*` (AI bubble, ngoài scope) | `TraineeAiRequest` + `Idempotency-Key` | `TraineeAiQuota`, `AiRequest` | `OrganizationAiController.Quota/Answer/Get` |

### `/learning-hub`

**File:** `app/learning-hub/page.tsx` (Suspense + `LoadingBlock`) → `features/learning-hub/components/hub-view.tsx`. View con: `overview.tsx` (+ `intro-tour.tsx`, `state-card.tsx`), `saved-posts.tsx`, `trainee-ai.tsx`, `history-panel.tsx` → `features/training-history/components/*`, `TraineeSupport` (`features/support`), `AccountProfile`. Các panel đều nằm trong `ThemeScope` + `ToastProvider` + `AiBubbleProvider audience="trainee"`.

**Quyền truy cập:**
- Phải đăng nhập. Chưa đăng nhập → thẻ "Đăng nhập" với `next=/learning-hub?<query hiện tại>`.
- Các view dữ liệu (Tổng quan, Trợ lý AI, Lịch sử) chỉ dành cho Trainee (role 2). Role 1/0 thấy Alert và link về `/workspace/*` hoặc `/admin/*`.
- Saved posts gặp 403 thì hiện "dành cho học viên".

**Logic xử lý:**
- **Chọn view:**
  - `?view=overview|saved|questions|history|support|profile`.
  - Không có `view` nhưng có `article`/`session`/`training` → `questions`. Không có gì → `overview`.
  - Sidebar có menu mobile (Esc để đóng và trả focus), có tabbar khi chạy trên điện thoại và nút đăng xuất.
- **Overview:**
  - Intro tour, trạng thái lưu ở `localStorage` `fire3d-trainee-intro`.
  - 3 bài đã lưu, có `scope=userId`.
  - Ô "Hỏi AI": mở bubble, hoặc nếu không có bubble thì `push ?view=questions&q=`, tối đa 2000 ký tự.
  - 3 kết quả luyện tập gần nhất.
- **Saved:**
  - Danh sách phân trang 12/trang, page lưu trên URL.
  - Bài không còn public (`available:false`) vẫn hiện để có thể bỏ lưu.
  - Bỏ lưu bài cuối cùng của một trang > 1 → lùi về trang trước.
- **Trợ lý AI:**
  - Hội thoại diễn ra ở bubble nổi. Trang này hiện quota và lịch sử câu hỏi (lọc theo `status`, phân trang).
  - `?request=` mở drawer chi tiết.
  - Link có `article`/`session`/`training`/`q` → `bubble.openWith(...)`.
  - Quota và danh sách tải lại khi bubble báo `settledCount` thay đổi.
- **Lịch sử:**
  - Filter trên URL: `status`, `mode`, `building` (UUID), `from`/`to` (ngày local, `to` được đổi thành exclusive).
  - Khoảng ngày sai → không gọi API.
  - Phiên `Launching/Running/AwaitingSync` → reload mỗi 15 s khi tab đang hiển thị và không mở drawer.
  - `?session=` mở `ResultDrawer`:
    - Nếu row có sẵn trong danh sách thì không gọi `state`. Nếu không thì gọi `state` để biết `hasResult`.
    - Chỉ gọi `result` khi có kết quả. `409 RESULT_NOT_READY` hiển thị như một trạng thái, không phải lỗi.
  - Option filter công trình tải qua `GET /api/training/buildings` (tối đa 10×100).
  - Lỗi được map qua `training-history/errors.ts:describeFailure`.
- **Hỗ trợ / Hồ sơ:** xem `features/support` và mục `/account` ở trên.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/learn/bookmarks` | `learnApi.bookmarks` (`overview.tsx`, `saved-posts.tsx`) | `page, pageSize` | `BookmarkPage` | `ContentController.Bookmarks` |
| DELETE | `/api/learn/bookmarks/{postId}` | `learnApi.unbookmark` (`saved-posts.tsx`) | Bearer | `BookmarkState` | `ContentController.Unbookmark` |
| GET | `/api/training/sessions` | `features/training-history/api.ts:trainingHistoryApi.list` | `status?, mode?, buildingId?, from?, to?, page, pageSize` | `PageResponse<HistoryItem>` | `TrainingSessionsController.List` → `TrainingHistoryPage` |
| GET | `/api/training/buildings` | `trainingHistoryApi.buildings` (`hooks.ts:useHistoryBuildings`) | `page, pageSize=100` | `PageResponse<HistoryBuilding>` | `TrainingSessionsController.Buildings` → `TrainingBuildingPage` |
| GET | `/api/training/sessions/{id}` | `trainingHistoryApi.state` (`hooks.ts:useSessionDetail`) | Bearer | `SessionState` (tập con) | `TrainingSessionsController.Get` → `TrainingSessionView` |
| GET | `/api/training/sessions/{id}/result` | `trainingHistoryApi.result` | Bearer | `ResultLoad` (`TrainingResult` \| not-ready) | `TrainingSessionsController.Result` → `TrainingResultView` |
| GET | `/api/ai/trainee/quota` | `traineeAiApi.quota` (`trainee-ai.tsx`) — ngoài scope | Bearer | `TraineeAiQuota` | `OrganizationAiController.Quota` |
| GET | `/api/ai/trainee/requests` | `traineeAiApi.listRequests` — ngoài scope | `page, pageSize, status?` | `AiRequestPage` | `OrganizationAiController.List` |
| GET/POST | `/api/ai/trainee/requests/{id}`, `/api/ai/trainee/answer` | `traineeAiApi.getRequest/submit` (bubble, drawer) — ngoài scope | `TraineeAiRequest` + `Idempotency-Key` | `AiRequest` | `OrganizationAiController.Get/Answer` |
| GET/POST | `/api/support/tickets…`, `/api/feedback` | `features/support/api.ts` (`TraineeSupport`) — ngoài scope | — | `Ticket`, `SupportPage<…>` | `SupportController` |
| GET/PATCH, POST… | `/api/auth/me`, `/api/me/*` | như `/account` | | | |

### `/dashboard/trainee`

**File:** `app/dashboard/trainee/page.tsx`.

**Quyền truy cập:** Public (redirect phía server).

**Logic xử lý:** `redirect("/learning-hub")`. Route này vẫn có trong whitelist `next` và guard role 2 của `canOpenRoleRoute`.

**API gọi:** Không có.

### `/dashboard/organization`

**File:** `app/dashboard/organization/page.tsx`.

**Quyền truy cập:** Public (redirect phía server). Guard thực sự nằm ở `/workspace/*`.

**Logic xử lý:** `redirect("/workspace/buildings")`.

**API gọi:** Không có.

### Root `layout.tsx` và `features/theme`

**File:** `app/layout.tsx`, `features/theme/theme-scope.tsx`, `features/theme/topbar-slot.tsx`.

**Quyền truy cập:** —

**Logic xử lý:**
- Root layout: `<html lang="vi">`, font Be Vietnam Pro, `globals.css`, metadata mặc định (template `%s — FET3D`), bọc `AuthSessionProvider`.
- `ThemeScope`:
  - Theme `light/dark/system` lưu trong `localStorage` `fire3d-ops-theme`. Chế độ `system` do CSS (`prefers-color-scheme`) xử lý.
  - `forcedMode` dùng để ép theme, ví dụ dark trên trang public.
  - Cung cấp `PortalContext` để dialog và toast kế thừa token theme.

**API gọi:** Không có.

---

### Kiểm tra type API

| Endpoint | Type FE | Trạng thái | Ghi chú |
|---|---|---|---|
| POST `/api/auth/login`, `/api/auth/refresh` | `TokenResponse` (+ `ApiTokenResponse` nội bộ) | Đủ | BE chỉ trả `accessToken, refreshToken, user`. `accessTokenExpiresAt/refreshTokenExpiresAt` là field FE thừa, đã ghi chú là không thuộc contract (hạn token lấy từ `exp` của JWT). |
| GET/PATCH `/api/auth/me`, register/* | `AuthUser` | Đã bổ sung | Thêm các field optional `isActive, lastLoginAt, createdAt, updatedAt, emailVerifiedAt, registrationExpiresAt` theo `AccountResponse`. Role/gender vẫn được chuẩn hóa từ tên enum. |
| POST `/api/auth/login-firebase`, `/google/onboarding/complete` | `GoogleExchangeResponse<TAuth>` (mới, trong `auth/types.ts`), `GoogleLoginResult` | Đã bổ sung | Trước đây là type inline `FirebaseLoginResponse` và thiếu `onboardingToken`, `expiresAt` (bản legacy). Nay là type dùng chung, `api.ts` dùng `GoogleExchangeResponse<ApiTokenResponse>`. |
| POST `/api/auth/forgot-password` | `ForgotPasswordAccepted` (mới) | Đã bổ sung | BE trả 202 `{message}`. Trước đây FE khai `void`. |
| POST `/api/auth/registration/request-otp`, `/resend-verification`, `/reset-password`, `/change-password`, `/logout`, `/api/me/password` | `void` | Đủ | BE trả 202/204 không có body. |
| POST `/api/auth/registration/verify-otp` | `RegistrationOtpVerification` | Đủ | `{registrationToken, expiresAt}`. |
| Body register trainee/organization | `RegisterInput` | Đủ (một phần) | BE nhận thêm các field optional `dob, gender, phoneNumber` (và `username` cho tổ chức) mà UI chưa dùng. |
| Body `/google/onboarding/complete` | `GoogleOnboardingInput` | Đủ (một phần) | BE nhận thêm optional `fullName, dob, gender, phoneNumber`. BE bật `JsonUnmappedMemberHandling.Disallow` nên không được gửi field lạ. |
| `/api/me/avatar/upload-intent`, `/complete`, DELETE | `AvatarUploadIntent`, `AvatarResponse` | Đủ | Khớp `AvatarUploadIntentResponse` và `AvatarResponse`. |
| POST `/api/me/link-google` | `GoogleLinkResult` | Đủ | Khớp `GoogleLinkResponse`, có thêm `etag` lấy từ header. |
| GET `/api/qr/{qrToken}` | `QrResolution` (chuyển sang `qr-landing/types.ts`) | Đã bổ sung | Thêm `serviceStatus` (`QrServiceStatus`), `serviceEndsAt`, `canStartNewSessions` từ `BuildingQrResolution`. UI chưa hiển thị các field này. |
| GET `/api/qr/{qrToken}/trainings` | `QrTraining` | Đủ | Khớp `TrainingDto`. Chuyển sang `types.ts`; `api.ts` re-export để giữ tương thích import. |
| POST `/api/buildings/{id}/participation/verify` | `ParticipationVerified` | Đã bổ sung | Thêm `code?` (cùng DTO `BuildingAccessResponse`; field này chỉ có giá trị khi manager rotate). |
| GET `/api/learn/situations` | `PublicSituation[]` | Đủ | Parse phòng thủ. |
| GET `/api/learn/posts` | `PageOf<PublicPostSummary>` | Đủ | Khớp `LearnPostPage`. |
| GET `/api/learn/posts/{slug}` | `PublicPost`, `PublicVersion` | Đã bổ sung | Post thêm `publicationStatus, publishedVersionId, revision, createdAt, updatedAt`. Version thêm `contentSchemaVersion, contentHash, status, revision`. Còn bỏ qua `createdAt/updatedAt` của version (không dùng). |
| GET `/api/learn/bookmarks` | `BookmarkPage`, `BookmarkCounts`, `LearnBookmarksQuery` (mới) | Đã bổ sung | Trước đây mất `counts {Article,Tip,Video,unavailable}`. Query nay hỗ trợ `kind[]`, `search` như BE. |
| PUT/DELETE `/api/learn/bookmarks/{postId}` | `BookmarkState` (mới) | Đã bổ sung | Trước đây là `unknown` → `void`. Nay parse `{postId, bookmarked}`, nếu body rỗng thì fallback. |
| GET `/api/learn/bookmarks/{postId}` | — | Thiếu (không dùng) | FE chưa gọi. `bookmarks-context` đang tải toàn bộ danh sách (≤1000) chỉ để biết trạng thái; có thể chuyển sang endpoint này. |
| GET `/api/training/sessions` | `HistoryItem`, `PageResponse` | Đủ | Khớp `TrainingHistoryItem`, `TrainingHistoryPage` (`totalCount`). |
| GET `/api/training/buildings` | `HistoryBuilding` | Đủ | `lastSessionAt` ở BE luôn có giá trị, FE cho phép null (an toàn). |
| GET `/api/training/sessions/{id}` | `SessionState` | Đủ (tập con có chủ đích) | Chỉ parse các field cần cho drawer (`id,status,mode,startedAt,endedAt,completion.endReason,hasResult`) trong số nhiều field của `TrainingSessionView`. |
| GET `/api/training/sessions/{id}/result` | `TrainingResult`, `CriterionResult`, `ResultLoad` | Đủ | Khớp `TrainingResultView` (gồm cả `passThresholdPercent`, `label/description` của tiêu chí). |
| `/api/organizations/me` | `OrganizationProfile` (`features/organizations`) | Ngoài scope | Không kiểm tra trong phần này. |
| `/api/ai/trainee/*` | `TraineeAiQuota`, `AiRequest`, `AiRequestPage` (`features/org-ai`) | Ngoài scope | Không kiểm tra trong phần này. |
| `/api/support/*`, `/api/feedback` | `features/support/types.ts` | Ngoài scope | Không kiểm tra trong phần này. |

---

## Nhóm: Quản trị (Admin)

Khung chung cho mọi trang `/admin/*`:

- **File layout**: `src/app/admin/layout.tsx` bọc nội dung trong `<Suspense>` (fallback `LoadingBlock` "Đang mở khu quản trị…") → `OperationsShell areaId="admin"` (`src/layouts/operations-shell.tsx`) → `<div className="adm">` (CSS `features/admin-overview/components/admin-ui.css`). `src/app/admin/loading.tsx` là skeleton (KPI + bảng) khi bundle/dữ liệu đầu đang tải.
- **Guard**: `OperationsShell` đọc `useAuthSession()`: chưa `ready` → "Đang kiểm tra phiên đăng nhập…"; chưa đăng nhập → nút "Đăng nhập" tới `/login?next=<url hiện tại>`; `user.role` không thuộc `adminArea.allowedRoles = [0]` (PlatformAdmin) → màn "Không có quyền truy cập" + link về trang chủ. Mỗi component trang còn tự kiểm tra lại `user.role === 0` và chỉ bật fetch khi có `accessToken`. Phía BE: `AdministrationControllerBase` dùng policy `PlatformAdministration` + rate limit `administration`; các controller khác dùng `[Authorize(Roles="PlatformAdmin")]` hoặc cùng policy.
- **Điều hướng**: `adminArea.nav` trong `src/layouts/nav-config.ts`, nhóm "Vận hành" (Tổng quan, Tài khoản, Tổ chức), "Nội dung" (Duyệt kịch bản, Learn CMS, Thư viện tổ chức, AI & nguồn tri thức), "Kinh doanh" (Thương mại, Hỗ trợ & audit). Route lấy từ `src/configs/routes.ts` (`routes.adminOverview` … `routes.adminAi`).
- **HTTP**: mọi lời gọi qua `apiClient` (`src/api/client.ts`) với header `Authorization: Bearer <accessToken>`; lỗi thành `ApiError` (status, `code`, `fieldErrors`, `retryAfterSeconds`, `headers`). Dữ liệu đọc dùng `useAsyncData(key, loader, enabled)`; trạng thái lọc/trang nằm trên URL qua `useUrlParams` / `useUrlSearch`.

---

### /admin/overview

**File**: `src/app/admin/overview/page.tsx` → `features/admin-overview/components/admin-overview.tsx` (`AdminOverview`), các ô KPI trong `admin-kit.tsx`, định dạng số trong `format.ts`; phần báo cáo theo kỳ dùng `features/analytics/components/analytics-workspace.tsx` (`variant="platform"`).

**Quyền truy cập**: PlatformAdmin (role 0). Các truy vấn chỉ bật khi `ready && user.role === 0 && accessToken`.

**Logic xử lý**:
- Hàng "Việc cần xử lý" (`ActionTile`, mỗi ô là link): đếm tổng bằng cách gọi danh sách với `pageSize=1` rồi chỉ đọc `totalCount`/`total` (hook `useTotal`): bản duyệt `Submitted` → `/admin/reviews`; ticket `Open` (kèm số `Urgent`) → `/admin/support`; checkout PayOS `NeedsReconcile` → `/admin/commerce?tab=payments`; bài Learn `Unpublished` → `/admin/learn`. Đọc lỗi thì hiện "—" (không đoán số 0).
- KPI hệ thống: tổ chức/tài khoản lấy từ báo cáo vận hành mà `AnalyticsWorkspace` đã tải (callback `onOperations`, không gọi lại API); nếu sau 4 giây vẫn chưa có thì bỏ skeleton, hiện "—". "Lượt chơi 30 ngày" từ báo cáo training mặc định (`groupBy=day`, sparkline theo `cohorts[].plays`); "Thanh toán 30 ngày" từ báo cáo doanh thu (tổng `transactions`, sparkline theo `byDay`).
- Phần "Báo cáo theo kỳ" (`AnalyticsWorkspace`): khoảng thời gian `from`/`to` (UTC, tối đa 90 ngày, nút nhanh 7/30/90 ngày) nằm trên URL, kiểm tra hợp lệ trước khi gọi API; tab `operations | training | revenue` lưu ở `?tab=`; nút "Tải lại"; tab training của platform tải thêm danh sách tổ chức để hiện tên; có xuất CSV báo cáo training.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/admin/scenario-reviews` | `features/admin-reviews/api.ts:reviewsApi.list` | `status=Submitted&page=1&pageSize=1` | `ReviewPage` (`PageResponse<ReviewSummary>`) | `ScenarioReviewQueriesController.List` |
| GET | `/api/admin/support/tickets` | `features/support/api.ts:supportApi.listTickets("admin")` | `status=Open[&priority=Urgent]&page=1&pageSize=1` | `SupportPage<Ticket>` | `SupportController.AdminTickets` |
| GET | `/api/admin/payments/payos/checkouts` | `features/billing/api.ts:billingApi.listLedger("checkouts")` | `status=NeedsReconcile&page=1&pageSize=1` | `PageResponse<PayosLedgerItem>` | `PayosController.AdminCheckouts` |
| GET | `/api/admin/learn/posts` | `features/admin-learn/api.ts:learnAdminApi.listPosts` | `status=Unpublished&page=1&pageSize=1` | `Page<AdminPost>` (parse) | `ContentController.AdminPosts` |
| GET | `/api/admin/analytics/operations` | `features/analytics/api.ts:analyticsApi.operations({kind:"platform"})` | `from?`, `to?` | `OperationsReport` (parse) | `OperationsAnalyticsController.Platform` |
| GET | `/api/admin/analytics/training` | `analyticsApi.training({kind:"platform"})` | `from?`, `to?`, `groupBy?` | `TrainingReport` (parse) | `LearnerAnalyticsController.PlatformTraining` |
| GET | `/api/admin/analytics/training/export` | `analyticsApi.exportTraining` | như trên | `string` (CSV) | `LearnerAnalyticsController.ExportPlatform` |
| GET | `/api/admin/analytics/revenue` | `analyticsApi.revenue` | `from?`, `to?` | `RevenueReport` (parse) | `LearnerAnalyticsController.Revenue` |
| GET | `/api/organizations` | `features/accounts/api.ts:accountsApi.organizations` | `page=1&pageSize=100&isActive=true` | `PageResponse<Organization>` | `OrganizationsController.List` |

---

### /admin/accounts

**File**: `src/app/admin/accounts/page.tsx` (server component, đọc `searchParams.organizationId` làm `initialOrganizationId`) → `features/accounts/components/accounts-admin.tsx` (`AccountsAdmin`); API `features/accounts/api.ts`, type `features/accounts/types.ts`.

**Quyền truy cập**: PlatformAdmin. Component tự chặn `user.role !== 0` ("Không có quyền truy cập").

**Logic xử lý**:
- `DataTable` có ô tìm kiếm (`?q=`, debounce qua `useUrlSearch`), filter chip Vai trò (`?role=0|1|2`), Trạng thái (`?status=true|false`), tổ chức (`?organizationId=`, mặc định lấy từ query trang); phân trang `?page=` với `PAGE_SIZE = 20`. Mỗi bộ lọc là một phần key của `useAsyncData`, nên đổi lọc là tải lại.
- Bấm một dòng → `accountsApi.get` (chống bấm kép bằng `opening`) → Drawer chi tiết (phải hoặc dưới tùy màn hình): vai trò, username, trạng thái, tổ chức (tra tên trong danh sách tổ chức đã tải, không còn thì hiện "Tổ chức không còn tồn tại"), lần đăng nhập gần nhất. Lỗi → toast.
- "Tạo tài khoản" (Modal): validate phía client (`createErrors`: email đúng dạng, mật khẩu 12–128 ký tự, vai trò OrganizationUser bắt buộc chọn tổ chức qua Combobox). Gửi `role` theo tên API (`roleToApiName`); `organizationId` chỉ gửi khi role = 1. Lỗi 409 → "Email này đã được sử dụng."; `fieldErrors` gắn vào từng trường; form giữ nguyên nội dung khi lỗi. Thành công → toast + `list.reload()`.
- Khóa/Kích hoạt: `ConfirmDialog` → `PATCH status`; thành công thì cập nhật Drawer đang mở bằng bản ghi server trả về và tải lại danh sách (không cập nhật lạc quan).

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/accounts` | `accounts/api.ts:accountsApi.list` | query `AccountFilters` {`search?`, `isActive?`, `role?`, `organizationId?`, `page`, `pageSize`, `sort?`} | `PageResponse<ManagedAccount>` (role được chuẩn hóa) | `AccountsController.List` |
| GET | `/api/accounts/{id}` | `accountsApi.get` | — | `ManagedAccount` (header `ETag`) | `AccountsController.Get` |
| POST | `/api/accounts` | `accountsApi.create` | `CreateAccountInput` {email, password, fullName, role (tên), organizationId, username?} | `CreatedAccount` (BE `AccountResponse`, 201) | `AccountsController.Create` |
| PATCH | `/api/accounts/{id}/status` | `accountsApi.setStatus` | `{ isActive }` | `ManagedAccount` | `AccountsController.SetActive` |
| GET | `/api/organizations` | `accountsApi.organizations` | `page=1&pageSize=100&isActive=true` | `PageResponse<Organization>` | `OrganizationsController.List` |

---

### /admin/organizations

**File**: `src/app/admin/organizations/page.tsx` → `features/organizations/components/organizations-admin.tsx` (`OrganizationsAdmin`) + `organization-detail.tsx` (`OrganizationDetail`, trong Drawer); API `features/organizations/api.ts`, type `features/organizations/types.ts`. (`organization-profile.tsx` là trang hồ sơ của tổ chức, không thuộc khu admin.)

**Quyền truy cập**: PlatformAdmin.

**Logic xử lý**:
- `DataTable`: tìm theo tên/slug (`?q=`), lọc trạng thái (`?status=`), phân trang 20/trang; cột Công trình / Tài khoản hiển thị `buildingCount`/`accountCount` (BE luôn trả). Menu từng dòng: Tạo owner (link `/admin/accounts?organizationId=`), Công trình (`/admin/organizations/{id}/buildings`), Khóa/Mở.
- Mở chi tiết bằng `?organization=<id>` (giữ `page`) → Drawer với `OrganizationDetail`: `getDetail` dùng `requestWithMeta` để lấy `ETag` (dự phòng `"profileRevision"` khi proxy ẩn header), AbortController khi đổi id. Sửa hồ sơ: chỉ gửi trường đã thay đổi (`AdminUpdateOrganizationInput`), validate tên 1–200, địa chỉ 1–500, SĐT không được để trống (API không cho xóa trắng); `If-Match` bắt buộc. Xử lý lỗi: 412 → giữ nội dung đang nhập, hiện cảnh báo + nút "Tải bản mới để đối chiếu"; 428 → yêu cầu tải lại; 409 → lỗi số điện thoại trùng; 404 → tổ chức không còn; `fieldErrors` → gắn trường. `inFlight` ref chống gửi đôi. Có link "Xem báo cáo" tới trang analytics của tổ chức.
- Tạo tổ chức (Modal): slug tự sinh từ tên (`slugify`, bỏ dấu tiếng Việt) cho tới khi người dùng tự sửa; validate tên 1–200, slug `^[a-z0-9]+(-[a-z0-9]+)*$` ≤100. 409 → slug trùng (kể cả tổ chức đã xóa). Thành công → toast, tải lại, mở luôn Drawer tổ chức mới.
- Khóa/Mở: `ConfirmDialog` báo rõ hậu quả (thu hồi phiên của OrganizationUser) → `PATCH status` → tải lại danh sách và remount Drawer (`detailVersion`).

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/organizations` | `organizations/api.ts:organizationsApi.list` | `OrganizationFilters` {`search?`, `isActive?`, `page`, `pageSize`, `sort?`} | `PageResponse<AdminOrganization>` | `OrganizationsController.List` |
| POST | `/api/organizations` | `organizationsApi.create` | `CreateOrganizationInput` {name, slug} | `AdminOrganization` (201) | `OrganizationsController.Create` |
| GET | `/api/organizations/{id}` | `organizationsApi.getDetail` (`requestWithMeta`) / `organizationsApi.get` | — | `OrganizationDetail` (= `AdminOrganization`) + `ETag` | `OrganizationsController.Get` |
| PATCH | `/api/organizations/{id}` | `organizationsApi.update` | header `If-Match`; body `AdminUpdateOrganizationInput` {name?, address?, phoneNumber?} | `OrganizationDetail` + `ETag` | `OrganizationsController.Update` |
| PATCH | `/api/organizations/{id}/status` | `organizationsApi.setStatus` | `{ isActive }` | `AdminOrganization` | `OrganizationsController.SetActive` |

---

### /admin/organizations/[organizationId]/analytics

**File**: `src/app/admin/organizations/[organizationId]/analytics/page.tsx` (server component, `await params`) → `features/analytics/components/analytics-workspace.tsx` với `variant="admin-organization"`.

**Quyền truy cập**: PlatformAdmin (`ROLE["admin-organization"] = 0`); chỉ gọi API khi có `organizationId`.

**Logic xử lý**: hai tab `training` (mặc định) và `operations`; khoảng thời gian trên URL như trang tổng quan; tên và trạng thái tổ chức lấy từ trường `organization` trong chính báo cáo (tổ chức đã vô hiệu hóa vẫn đọc được số liệu); breadcrumb Quản trị → Tổ chức → Báo cáo. Không có bộ lọc công trình/kịch bản (chỉ variant `organization` có). `useAsyncData(..., { keepWhenDenied: true })` giữ dữ liệu cũ khi bị từ chối.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/admin/organizations/{organizationId}/analytics/training` | `analytics/api.ts:analyticsApi.training({kind:"admin-organization"})` | `from?`, `to?`, `groupBy?` | `TrainingReport` (parse) | `LearnerAnalyticsController.OrganizationTraining` |
| GET | `/api/admin/organizations/{organizationId}/analytics/training/export` | `analyticsApi.exportTraining` | như trên | `string` (CSV) | `LearnerAnalyticsController.ExportOrganizationAdmin` |
| GET | `/api/admin/organizations/{organizationId}/analytics/operations` | `analyticsApi.operations({kind:"admin-organization"})` | `from?`, `to?` | `OperationsReport` (parse) | `OperationsAnalyticsController.AdminOrganization` |

---

### /admin/organizations/[organizationId]/buildings

**File**: `src/app/admin/organizations/[organizationId]/buildings/page.tsx` → `features/buildings/components/buildings-workspace.tsx` (`BuildingsWorkspace organizationId={...}`).

**Quyền truy cập**: PlatformAdmin (component dùng chung với OrganizationUser; khi `role === 0` thì `scopedOrgId` lấy từ prop và được gửi lên API). Khung admin chặn các role khác.

**Logic xử lý**: danh sách công trình của tổ chức (tìm `?q=`, trạng thái `active|archived|all`, kiểu xem `table|cards`, phân trang); tên tổ chức tải bằng `organizationsApi.get`. Tạo công trình dùng `Idempotency-Key` (`useIdempotencyKey`), sửa bằng `PUT` + `If-Match` (412 → hiện bản mới của server để áp dụng tiếp), lưu trữ (archive) bằng `DELETE` + `If-Match`; `submitting` ref chống gửi đôi; validate form bằng `validateBuildingForm`.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/buildings` | `buildings/api.ts:buildingsApi.list` | `page`, `pageSize`, `search?`, `isActive?`, `organizationId` | `BuildingPage` | `BuildingsController.ListBuildings` |
| GET | `/api/buildings/{id}` | `buildingsApi.getVersioned` | — | `Building` + `ETag` | `BuildingsController.GetBuilding` |
| POST | `/api/buildings` | `buildingsApi.create` | `BuildingInput` + `organizationId`; `Idempotency-Key` | `Building` + `ETag` | `BuildingsController.CreateBuilding` |
| PUT | `/api/buildings/{id}?organizationId=` | `buildingsApi.update` | `BuildingInput`; `If-Match` | `Building` + `ETag` | `BuildingsController.UpdateBuilding` |
| DELETE | `/api/buildings/{id}?organizationId=` | `buildingsApi.archive` | `If-Match` | `BuildingSummary` + `ETag` | `BuildingsController.DeleteBuilding` |
| GET | `/api/organizations/{id}` | `organizations/api.ts:organizationsApi.get` | — | `AdminOrganization` | `OrganizationsController.Get` |

---

### /admin/reviews

**File**: `src/app/admin/reviews/page.tsx` → `features/admin-reviews/components/reviews-module.tsx` (`ReviewsModule`), `review-detail.tsx` (`ReviewDrawer`), `decision-dialog.tsx`, `review-content.tsx`, `review-parts.tsx`; API/xử lý lỗi `features/admin-reviews/api.ts`; type `types.ts`; nhãn `format.ts`.

**Quyền truy cập**: PlatformAdmin (BE `[Authorize(Roles="PlatformAdmin")]`; 401/403/404 được dịch thành thông báo riêng và ẩn nút thử lại).

**Logic xử lý**:
- 3 KPI (Chờ duyệt / Đã duyệt / Từ chối) đếm bằng `list` với `pageSize=1`.
- Hàng chờ: `FilterChips` trạng thái (`?status=`; không có hoặc giá trị lạ → `Submitted`; `all` bỏ lọc) và tổ chức (`?organizationId=`, tổ chức không có trong danh sách vẫn được giữ làm option); phân trang 20/trang; trang > 1 mà rỗng → nút "Về trang 1".
- `?review=<id>` mở `ReviewDrawer`: tải chi tiết (nội dung đóng băng, rubric, mục tiêu học, readiness kỹ thuật, hash). Nút Duyệt/Từ chối chỉ bật khi `status === "Submitted"`, dữ liệu không đang tải và không lỗi. Người gửi / người quyết định hiển thị tên do API trả (`submittedByName`/`decidedByName`), kèm id ở `title`.
- `DecisionDialog`: hash và version id luôn lấy từ chi tiết server trả (không cho nhập). Từ chối bắt buộc lý do 1–4000 ký tự (`validateReason`). Một `Idempotency-Key` cho mỗi ý định (payload chuẩn hóa: hash viết thường, lý do đã trim); lỗi mạng/429/5xx → `retry` (giữ key, gửi lại an toàn); 409 (`CONTENT_REVIEW_NOT_PENDING`, `CONTENT_HASH_MISMATCH`, `IDEMPOTENCY_KEY_CONFLICT`, `SCENARIO_SNAPSHOT_REQUIRED`)/401/403/404 → `reload` (đóng dialog, tải lại chi tiết và hàng chờ); 400 → `fix` (gắn lỗi vào ô lý do). Sau khi quyết định thành công: toast, tải lại chi tiết và danh sách.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/admin/scenario-reviews` | `admin-reviews/api.ts:reviewsApi.list` | `ReviewListQuery` {status?, organizationId?, page, pageSize ≤100} | `ReviewPage` | `ScenarioReviewQueriesController.List` |
| GET | `/api/admin/scenario-reviews/{reviewId}` | `reviewsApi.detail` | — | `ReviewDetail` | `ScenarioReviewQueriesController.Detail` |
| POST | `/api/admin/scenario-versions/{versionId}/approve` | `reviewsApi.decide("approve")` | `ContentReviewDecisionRequest` {contentHash, rubricHash}; `Idempotency-Key` | `ContentReviewDecision` | `ScenarioContentReviewsController.Approve` |
| POST | `/api/admin/scenario-versions/{versionId}/reject` | `reviewsApi.decide("reject")` | {contentHash, rubricHash, reason}; `Idempotency-Key` | `ContentReviewDecision` | `ScenarioContentReviewsController.Reject` |
| GET | `/api/organizations` | `organizations/api.ts:organizationsApi.list` | `page=1&pageSize=100&isActive=true` | `PageResponse<AdminOrganization>` | `OrganizationsController.List` |

---

### /admin/learn

**File**: `src/app/admin/learn/page.tsx` → `features/admin-learn/components/learn-cms.tsx` (`LearnCms`); danh sách `posts-tab.tsx` (+ `quick-edit-pane.tsx`), trình soạn `post-editor.tsx` (+ `publish-panel.tsx`, `learn-blocks.tsx`, `rich-text-input.tsx`, `doc-toolbar.tsx`, `image-upload.tsx`, `reader-preview.tsx`, `situation-picker.tsx`, `source-picker.tsx`), tạo bài `new-post.tsx`, tình huống `situations-tab.tsx`; logic `api.ts`, `load-post.ts`, `content.ts`, `blocks.ts`, `errors.ts`, `status.ts`, `use-media-checks.ts`, `use-source-flags.ts`.

**Quyền truy cập**: PlatformAdmin (`user.role !== 0 || !accessToken` → "Không có quyền truy cập"); BE policy `PlatformAdministration`.

**Logic xử lý**:
- Trạng thái trên URL: `?section=posts|situations`, `?post=<uuid>|new`, `&version=<uuid>`, `&tab=`, `?quick=<id>` (Drawer sửa nhanh) và bộ lọc. Đổi section thì xóa tham số của section cũ. `post` không phải UUID → báo lỗi đường dẫn.
- Bài viết: `DataTable` lọc trạng thái (`?status=` theo `POST_STATUSES`) phía server; tìm kiếm và lọc loại chỉ áp dụng trên trang đã tải (API không hỗ trợ). Bấm dòng → Drawer sửa nhanh (`loadPostWithVersion`: lấy bài, chọn version theo URL → Draft mới nhất → version mới nhất). Menu dòng có xuất bản và các thao tác vòng đời.
- Soạn bài: form so với "dấu vân tay" (`fingerprint`) để biết đã sửa chưa; kiểm tra nội dung phía client (`checkContent`), video kiểm tra allowlist qua `validateMedia`, nguồn trích dẫn kiểm tra cờ `canUseInDraft`/`canPublishReference` (`useSourceFlags`); lỗi 422 `CONTENT_INVALID` hiện `issues[]` theo đường dẫn JSON. Lưu Draft bằng `PUT` + `If-Match` (version ETag) + `Idempotency-Key` (`commandKey(intent)` để thử lại an toàn); 412 → tải bản mới, nếu form chưa sửa thì áp luôn, nếu đã sửa thì hiện so sánh khác biệt và cho chọn "lấy bản server" hoặc "giữ của tôi". Xuất bản (version ETag) → nhận lại bài; hide/show/delete/restore dùng ETag của bài. Có xác nhận khi rời trang lúc chưa lưu. Ảnh bìa/ảnh khối tải qua upload-intent → PUT presigned URL → complete.
- Tình huống: danh sách tìm `?q=`, lọc `?active=`, tạo mới (slug, tên, mô tả) có `Idempotency-Key`.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/admin/learn/posts` | `admin-learn/api.ts:learnAdminApi.listPosts` | `status?`, `page`, `pageSize` | `Page<AdminPost>` (parse, có `latest`) | `ContentController.AdminPosts` |
| GET | `/api/admin/learn/posts/{id}` | `learnAdminApi.getPost` | — | `WithEtag<AdminPost>` | `ContentController.AdminPost` |
| POST | `/api/admin/learn/posts` | `learnAdminApi.createPost` | `CreatePostInput` {slug, publish, version}; `Idempotency-Key` | `WithEtag<AdminPost>` (201) | `ContentController.CreatePost` |
| GET | `/api/admin/learn/versions/{id}` | `learnAdminApi.getVersion` | — | `WithEtag<AdminVersion>` | `ContentController.Version` |
| POST | `/api/admin/learn/posts/{id}/versions` | `learnAdminApi.createVersion` | `VersionInput`; `Idempotency-Key` | `WithEtag<AdminVersion>` | `ContentController.CreateVersion` |
| PUT | `/api/admin/learn/versions/{id}` | `learnAdminApi.updateVersion` | `VersionInput`; `If-Match`; `Idempotency-Key` | `WithEtag<AdminVersion>` | `ContentController.UpdateVersion` |
| POST | `/api/admin/learn/versions/{id}/publish` | `learnAdminApi.publishVersion` | `If-Match` (version); `Idempotency-Key` | `WithEtag<AdminPost>` | `ContentController.Publish` |
| POST | `/api/admin/learn/posts/{id}/{hide\|show\|delete\|restore}` | `learnAdminApi.lifecycle` | `If-Match` (post); `Idempotency-Key` | `WithEtag<AdminPost>` | `ContentController.Lifecycle` |
| GET | `/api/admin/learn/situations` | `learnAdminApi.listSituations` | `search?`, `isActive?`, `page`, `pageSize` | `Page<AdminSituation>` | `ContentController.AdminSituations` |
| POST | `/api/admin/learn/situations` | `learnAdminApi.createSituation` | `CreateSituationInput` {slug, name, description?}; `Idempotency-Key` | `AdminSituation` | `ContentController.CreateSituation` |
| POST | `/api/admin/learn/media/validate` | `learnAdminApi.validateMedia` | `{ url }` | `MediaDescriptor` | `ContentController.ValidateMedia` |
| POST | `/api/admin/learn/media/images/upload-intent` | `learnAdminApi.uploadImage` (bước 1) | {fileName, contentType, sizeBytes, sha256}; `Idempotency-Key` | `{uploadId, uploadUrl, headers, expiresAt}` (parse nội bộ) | `LearnMediaController.CreateUploadIntent` |
| POST | `/api/admin/learn/media/images/{uploadId}/complete` | `learnAdminApi.uploadImage` (bước 3) | — | `LearnImage` | `LearnMediaController.Complete` |
| GET | `/api/admin/knowledge-sources` | `learnAdminApi.listSources` | `visibility=Common`, `status?`, `search?`, `page`, `pageSize` | `Page<KnowledgeSource>` | `OrganizationAiController.KnowledgeSources` |
| GET | `/api/admin/knowledge-sources/{id}` | `learnAdminApi.getSource` | — | `KnowledgeSource` | `OrganizationAiController.KnowledgeSource` |

---

### /admin/library

**File**: `src/app/admin/library/page.tsx` → `features/admin-library/components/library-admin.tsx` (`LibraryAdmin`), `items-list.tsx`, `item-detail.tsx`, `version-editor.tsx`, `payload-fields.tsx`, `new-item-modal.tsx`. API và type dùng chung từ `features/library` (`api.ts:libraryAdminApi`, `types.ts`, `payload.ts`, `errors.ts`) — thư mục `admin-library` không có `api.ts`/`types.ts` riêng.

**Quyền truy cập**: PlatformAdmin.

**Logic xử lý**:
- URL: `?kind=`, `?page=`, `?state=`, `?item=<uuid>`, `&version=<uuid|new>`. Danh sách lọc loại phía server; bộ lọc trạng thái (đang dùng / ngừng dùng / chưa xuất bản) chỉ lọc trang đang tải và có ghi chú rõ.
- Thêm mục (Modal): kind + code, `Idempotency-Key`; 409 `LIBRARY_CODE_EXISTS`. Thành công → mở luôn mục mới.
- Chi tiết mục: bật/tắt `isActive` bằng `PATCH` + `If-Match`. Trình soạn phiên bản: form theo từng kind (template kịch bản, rubric mẫu cần catalog rubric, thiết bị, preset…), kiểm tra `checkForm` phía client, 422 `CONTENT_INVALID` → `issues[]` gắn vào trường; lưu Draft bằng `PUT` + `If-Match`, 412 → so sánh với bản server (`describeDifferences`); xuất bản bằng `If-Match` rồi đọc lại mục (revision của mục cũng tăng).

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/admin/library/items` | `features/library/api.ts:libraryAdminApi.listItems` | `kind?`, `search?`, `page`, `pageSize` | `Page<LibraryItem>` (parse) | `ContentController.AdminItems` |
| GET | `/api/admin/library/items/{id}` | `libraryAdminApi.getItem` | — | `WithEtag<LibraryItem>` | `ContentController.AdminItem` |
| POST | `/api/admin/library/items` | `libraryAdminApi.createItem` | {kind, code}; `Idempotency-Key` | `WithEtag<LibraryItem>` | `ContentController.CreateItem` |
| PATCH | `/api/admin/library/items/{id}` | `libraryAdminApi.updateItem` | {isActive}; `If-Match`; `Idempotency-Key` | `WithEtag<LibraryItem>` | `ContentController.UpdateItem` |
| GET | `/api/admin/library/versions/{id}` | `libraryAdminApi.getVersion` | — | `WithEtag<LibraryVersion>` | `ContentController.AdminVersion` |
| POST | `/api/admin/library/items/{id}/versions` | `libraryAdminApi.createVersion` | `VersionInput` {name, payload, requiredCapabilities}; `Idempotency-Key` | `WithEtag<LibraryVersion>` | `ContentController.CreateLibraryVersion` |
| PUT | `/api/admin/library/versions/{id}` | `libraryAdminApi.updateVersion` | `VersionInput`; `If-Match`; `Idempotency-Key` | `WithEtag<LibraryVersion>` | `ContentController.UpdateLibraryVersion` |
| POST | `/api/admin/library/versions/{id}/publish` | `libraryAdminApi.publishVersion` | `If-Match`; `Idempotency-Key` | `WithEtag<LibraryVersion>` | `ContentController.PublishLibraryVersion` |
| GET | `/api/scenario-rubrics/catalog` | `features/scenario-editor/api.ts:scenarioEditorApi.rubricCatalog` | — | `RubricCatalog` | `ScenarioRubricsController.Catalog` |

---

### /admin/support

**File**: `src/app/admin/support/page.tsx` → `features/support/components/admin-support.tsx` (`AdminSupport`) với các tab `admin-tickets-tab.tsx` (+ `admin-ticket-panel.tsx`, `ticket-thread.tsx`), `admin-feedback-tab.tsx`, `audit-log-tab.tsx` (+ `audit-detail.tsx`); API `features/support/api.ts`.

**Quyền truy cập**: PlatformAdmin (`user.role !== 0 || !accessToken` → chặn).

**Logic xử lý**: tab `tickets | feedback | audit` ở `?tab=`; đổi tab thì xóa toàn bộ tham số riêng của tab (`TAB_PARAMS`). Ticket: lọc trạng thái/độ ưu tiên/người phụ trách (danh sách admin đang hoạt động)/tổ chức, phân trang; panel cập nhật ticket bằng `PATCH` + `If-Match`, trả lời bằng `Idempotency-Key`; luồng tin nhắn tải theo trang. Phản hồi: lọc trạng thái/tổ chức, đổi trạng thái bằng `If-Match`. Audit: lọc actor, action, target, correlationId, khoảng thời gian; xem chi tiết một bản ghi.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/admin/support/tickets` | `support/api.ts:supportApi.listTickets("admin")` | `page`, `pageSize`, `status?`, `priority?`, `assignedTo?`, `organizationId?` | `SupportPage<Ticket>` | `SupportController.AdminTickets` |
| GET | `/api/admin/support/tickets/{id}` | `supportApi.getTicket("admin")` | `page`, `pageSize` (tin nhắn) | `TicketWithEtag` | `SupportController.AdminTicket` |
| POST | `/api/admin/support/tickets/{id}/messages` | `supportApi.addMessage("admin")` | `{ message }`; `Idempotency-Key` | `SupportMessage` | `SupportController.AdminMessage` |
| PATCH | `/api/admin/support/tickets/{id}` | `supportApi.updateTicket` | `AdminTicketUpdate`; `If-Match` | `TicketWithEtag` | `SupportController.AdminUpdate` |
| GET | `/api/admin/feedback` | `supportApi.listFeedback("admin")` | `page`, `pageSize`, `status?`, `organizationId?` | `SupportPage<Feedback>` | `SupportController.AdminFeedback` |
| GET | `/api/admin/feedback/{id}` | `supportApi.getFeedback` | — | `FeedbackWithEtag` | `SupportController.AdminFeedbackDetail` |
| PATCH | `/api/admin/feedback/{id}/status` | `supportApi.updateFeedbackStatus` | `{ status }`; `If-Match` | `FeedbackWithEtag` | `SupportController.AdminUpdateFeedback` |
| GET | `/api/admin/audit-logs` | `supportApi.listAuditLogs` | `AuditFilters` | `AuditPage` | `AuditLogsController.List` |
| GET | `/api/admin/audit-logs/{id}` | `supportApi.getAuditLog` | — | `AuditDetail` | `AuditLogsController.Get` |
| GET | `/api/accounts` | `accounts/api.ts:accountsApi.list` | `role=0&isActive=true&page=1&pageSize=100` | `PageResponse<ManagedAccount>` | `AccountsController.List` |
| GET | `/api/organizations` | `accountsApi.organizations` | `page=1&pageSize=100&isActive=true` | `PageResponse<Organization>` | `OrganizationsController.List` |

---

### /admin/ai

**File**: `src/app/admin/ai/page.tsx` → `features/org-ai/components/admin-ai.tsx` (`AdminAi`) với các tab `admin-requests-tab.tsx`, `admin-policies-tab.tsx`, `admin-sources-tab.tsx`; API `features/org-ai/api.ts:adminAiApi`.

**Quyền truy cập**: PlatformAdmin.

**Logic xử lý**: tab `requests | policies | sources` ở `?tab=`, chỉ mount tab đang mở; đổi tab xóa `TAB_PARAMS`. Yêu cầu AI: lọc trạng thái/operation/audience/tổ chức, đối soát (reconcile) có `Idempotency-Key`. Chính sách: lọc theo operation, tạo chính sách (validate phía client, `Idempotency-Key`), kết thúc chính sách. Nguồn tri thức: lọc visibility/trạng thái/tìm kiếm, tạo nguồn, mở chi tiết (`?source=`) và duyệt/ngừng (approve/retire) bằng `If-Match`.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/admin/ai/requests` | `org-ai/api.ts:adminAiApi.listRequests` | `page`, `pageSize`, `status?`, `operation?`, `audience?`, `organizationId?` | `AiRequestPage` | `OrganizationAiController.Requests` |
| POST | `/api/admin/ai/requests/{requestId}/reconcile` | `adminAiApi.reconcile` | `Idempotency-Key` | `AiRequest` | `OrganizationAiController.Reconcile` |
| GET | `/api/admin/ai/policies` | `adminAiApi.listPolicies` | `page`, `pageSize`, `operation?` | `AiPolicyPage` | `OrganizationAiController.Policies` |
| POST | `/api/admin/ai/policies` | `adminAiApi.createPolicy` | `CreateAiPolicyInput`; `Idempotency-Key` | `AiPolicy` | `OrganizationAiController.CreatePolicy` |
| POST | `/api/admin/ai/policies/{id}/end` | `adminAiApi.endPolicy` | `{ effectiveUntil }`; `Idempotency-Key` | `AiPolicy` | `OrganizationAiController.EndPolicy` |
| GET | `/api/admin/knowledge-sources` | `adminAiApi.listKnowledgeSources` | `page`, `pageSize`, `visibility?`, `status?`, `search?` | `KnowledgeSourcePage` | `OrganizationAiController.KnowledgeSources` |
| GET | `/api/admin/knowledge-sources/{id}` | `adminAiApi.getKnowledgeSource` | — | `WithEtag<KnowledgeSource>` | `OrganizationAiController.KnowledgeSource` |
| POST | `/api/admin/knowledge-sources` | `adminAiApi.createKnowledgeSource` | `CreateKnowledgeSourceInput`; `Idempotency-Key` | `KnowledgeSource` | `OrganizationAiController.CreateKnowledgeSource` |
| POST | `/api/admin/knowledge-sources/{id}/{approve\|retire}` | `adminAiApi.changeKnowledgeSource` | `If-Match` | `WithEtag<KnowledgeSource>` | `OrganizationAiController.ChangeKnowledgeSource` |
| GET | `/api/organizations` | `accounts/api.ts:accountsApi.organizations` | `page=1&pageSize=100&isActive=true` | `PageResponse<Organization>` | `OrganizationsController.List` |

---

### Kiểm tra type API

Phạm vi sửa: chỉ các feature `accounts`, `organizations`, `admin-reviews`, `admin-learn` (`admin-overview`, `admin-library` không có type riêng). Các endpoint thuộc feature khác (analytics, support, org-ai, billing, buildings, library) chỉ được ghi chú, không sửa.

| Endpoint | Type FE | Trạng thái | Ghi chú |
|---|---|---|---|
| GET `/api/accounts` | `PageResponse<ManagedAccount>`, `AccountFilters` | Đã bổ sung | Thêm `phoneNumber`, `avatarUrl`, `profileRevision` (BE `ManagedAccountResponse`) và `sort` vào filter. `role` chuẩn hóa từ tên enum. |
| GET `/api/accounts/{id}` | `ManagedAccount` | Đã bổ sung | Như trên; `avatarUrl` là signed URL 5 phút ở chi tiết, null trong danh sách. |
| POST `/api/accounts` | `CreateAccountInput` → `CreatedAccount` | Đã bổ sung | Trước đây response là `unknown`. Thêm `CreatedAccount` (= BE `AccountResponse`, role chuẩn hóa); request thêm `username?`, `fullName` cho phép null. |
| PATCH `/api/accounts/{id}/status` | `ManagedAccount` | Đủ | Body `{isActive}` khớp `SetActiveRequest`. |
| GET `/api/organizations` | `PageResponse<AdminOrganization>` / `PageResponse<Organization>` (accounts) | Đã bổ sung | Thêm `AdminOrganization` (address, phoneNumber, profileRevision, buildingCount, accountCount — BE luôn trả); `Organization` trong accounts có các trường này ở dạng optional; filter thêm `sort`. |
| POST `/api/organizations` | `CreateOrganizationInput` → `AdminOrganization` | Đã bổ sung | Trước đây response chỉ là `Organization` rút gọn. |
| GET `/api/organizations/{id}` | `OrganizationDetail` (= `AdminOrganization`) | Đã bổ sung | Trước đây các trường là optional "cho bản deploy cũ"; nay bắt buộc theo `OrganizationResponse`. |
| PATCH `/api/organizations/{id}` | `AdminUpdateOrganizationInput` → `OrganizationDetail` | Đủ | Chỉ gửi trường đã đổi (BE từ chối null/rỗng); `If-Match` bắt buộc. |
| PATCH `/api/organizations/{id}/status` | `AdminOrganization` | Đã bổ sung | Trước đây là `Organization`. |
| GET `/api/admin/scenario-reviews` | `ReviewPage` / `ReviewSummary` | Đã bổ sung | Thêm `submittedByName`, `decidedByName`: BE trả về (SQL `scenario_review_summary` trong migration `20261014132000_AddContentContractGaps`, bản thay thế `ScenarioReviewReads`). Đã nối vào `AccountRef` trong drawer. |
| GET `/api/admin/scenario-reviews/{id}` | `ReviewDetail` | Đủ | `content`/`rubric`/`learningObjectives` là `unknown` vì BE trả `JsonNode`; `review-content.tsx` tự đọc an toàn. |
| POST `/api/admin/scenario-versions/{id}/approve\|reject` | `ContentReviewDecisionRequest` → `ContentReviewDecision` | Đủ | Khớp `ContentReviewResponse` (code, reviewId, status, contentHash, rubricHash). |
| GET `/api/admin/learn/posts` | `Page<AdminPost>` | Đã bổ sung | Thêm `AdminPostListInfo` (`latest`: title, kind, latestVersionId/Number/Status, draftVersionId/Number, versionCount theo BE `LearnPostAdminRow`) và parse trong `parsePost`. Lưu ý: UI `posts-tab.tsx` (upstream) chưa dùng `latest` — vẫn hiện "Chưa có bản xuất bản", và e2e `tests/e2e/learn-cms.spec.ts` đang khẳng định điều đó (BE#154 thực tế đã có title). |
| GET/POST `/api/admin/learn/posts/{id}`, `/publish`, lifecycle | `WithEtag<AdminPost>` | Đủ | Parse an toàn qua `parsePost`; `latest` = null ở các response này. |
| GET/POST/PUT `/api/admin/learn/versions…` | `AdminVersion`, `VersionInput` | Đủ | Khớp `LearnVersionView` / `LearnVersionInput`. |
| GET/POST `/api/admin/learn/situations` | `Page<AdminSituation>`, `CreateSituationInput` | Đã bổ sung | Tách type request `CreateSituationInput` (trước là kiểu inline). `PATCH /api/admin/learn/situations/{id}` (BE có) chưa có hàm FE. |
| POST `/api/admin/learn/media/validate` | `MediaDescriptor` | Đủ | |
| POST `/api/admin/learn/media/images/{uploadId}/complete` | `LearnImage` | Đã bổ sung | Thêm `contentType`, `sizeBytes` (BE trả {imageId, url, width, height, contentType, sizeBytes}). Response upload-intent vẫn parse nội bộ, không có type riêng. |
| GET `/api/admin/knowledge-sources` (Learn editor) | `Page<KnowledgeSource>` (admin-learn) | Đã bổ sung | Thêm `organizationId`, `sourceHash`, `approvedAt`, `createdAt` theo `KnowledgeSourceView`. |
| GET `/api/admin/analytics/*`, `/api/admin/organizations/{id}/analytics/*` | `OperationsReport`, `TrainingReport`, `RevenueReport` (analytics) | Đủ | Đọc `unknown` rồi parse (`features/analytics/parse.ts`); không thuộc phạm vi sửa. |
| `/api/admin/library/*` | `LibraryItem`, `LibraryVersion`, `VersionInput` (library) | Thiếu | Parse đủ trường response; nhưng `listItems` không gửi được `isActive` mà BE `AdminItems` hỗ trợ (nên bộ lọc trạng thái phải lọc phía client). Feature `library` do agent khác phụ trách. |
| `/api/admin/support/*`, `/api/admin/feedback/*`, `/api/admin/audit-logs*` | type trong `features/support` | Đủ | Không thuộc phạm vi sửa; không kiểm tra chi tiết. |
| `/api/admin/ai/*`, `/api/admin/knowledge-sources*` (trang AI) | type trong `features/org-ai` | Đủ | Không thuộc phạm vi sửa; không kiểm tra chi tiết. |
| `/api/admin/payments/payos/checkouts` | `PageResponse<PayosLedgerItem>` (billing) | Đủ | Agent billing phụ trách. |
| `/api/buildings*` (admin scope) | type trong `features/buildings` | Đủ | Không thuộc phạm vi sửa. |

Đề xuất ngoài phạm vi (không sửa): `src/api/types/common.ts` không cần thay đổi; `PageResponse<T>` khớp BE `PageResponse<T>` (items, totalCount, page, pageSize). Các endpoint Learn/Library dùng dạng `{items,total,page,pageSize}` riêng (`Page<T>` trong từng feature); nếu muốn gom thì có thể thêm `TotalPage<T>` vào `common.ts`.

---

## Nhóm: Workspace – Tòa nhà & Kịch bản

Quy ước chung cho cả nhóm:
- Mọi request đi qua `apiClient` (`src/api/client.ts`) với header `Authorization: Bearer <accessToken>`. `apiClient.requestWithMeta` được dùng khi cần đọc header phản hồi (ETag).
- **Idempotency-Key**: lấy từ `useIdempotencyKey()` (`src/api/idempotency`). `keyFor(payload)` trả về cùng một key khi payload không đổi, nên bấm hai lần hoặc gửi lại sau khi mất phản hồi sẽ phát lại kết quả đầu tiên. `done()` được gọi sau khi thành công, hoặc khi BE trả `IDEMPOTENCY_KEY_CONFLICT`.
- **If-Match/ETag**: BE trả 428 khi thiếu If-Match và 412 khi phiên bản đã đổi. FE luôn giữ lại nội dung người dùng đã nhập, rồi hiển thị bản mới để người dùng đối chiếu.
- **Polling**: `usePolling` (`src/api/use-polling.ts`) chạy mỗi 3 giây khi tab trình duyệt đang hiển thị. Khi lỗi, khoảng chờ nhân đôi (backoff), tối đa 30 giây, và tôn trọng `Retry-After`.
- Role: `0` = PlatformAdmin, `1` = OrganizationUser.

---

### Layout `/workspace/*`

**File**: `src/app/workspace/layout.tsx`, dùng `OperationsShell` (`src/layouts/operations-shell.tsx`, cấu hình `organizationArea` trong `src/layouts/nav-config.ts`). Layout bọc thêm `AiBubbleProvider` + `AiBubble` (trợ lý AI nổi, thuộc phần org-ai) và `Suspense` với fallback `LoadingBlock`.

**Quyền truy cập**: kiểm tra phía client (không dùng middleware).
- Đang đọc phiên đăng nhập: hiển thị "Đang kiểm tra phiên đăng nhập…".
- Chưa đăng nhập: hiển thị nút "Đăng nhập", dẫn tới `/login?next=<path+query>`.
- `allowedRoles: [0, 1]` (PlatformAdmin, OrganizationUser). Trainee bị chặn bằng màn hình "Không có quyền truy cập", có link về `routes.learningHub`.

**Logic xử lý**: sidebar thu gọn được (lưu trong localStorage `fire3d-ops-sidebar`), drawer trên mobile, topbar có ThemeToggle và link `/workspace/profile`. Menu nav gồm: Công trình, Báo cáo, Thư viện mẫu, Dịch vụ & thanh toán, Quét mô hình IFC, Trợ lý AI, Hỗ trợ, Hồ sơ tổ chức.

**API gọi**: không gọi API riêng; chỉ dùng phiên từ `useAuthSession`.

---

### /workspace/buildings

**File**: `src/app/workspace/buildings/page.tsx` → `src/features/buildings/components/buildings-workspace.tsx` (`BuildingsWorkspace`). Các file phụ: `building-form.tsx`, `use-building-step.ts`, `building-journey.ts`.

**Quyền truy cập**:
- OrganizationUser làm việc trong tenant của mình và không bao giờ gửi `organizationId`. Nếu tài khoản role 1 chưa có `organizationId`, trang hiện cảnh báo "Tài khoản chưa thuộc tổ chức nào".
- PlatformAdmin phải chọn tổ chức qua `?org=` (picker gọi `organizationsApi.list`) hoặc qua prop `organizationId`, dùng ở route admin `/admin/organizations/[id]/buildings`. Khi chưa chọn tổ chức, trang hiện EmptyState.

**Logic xử lý**:
- **State trên URL** (`useUrlParams`): `page`, `q` (tìm kiếm có debounce qua `useUrlSearch`), `status` (`active` mặc định | `archived` | `all`, ánh xạ sang `isActive`), `type` (lọc loại công trình **phía client** trên trang hiện tại), `view` (`table` | `cards`). Mỗi trang 20 dòng.
- **Cột "Bước hiện tại" / "Việc tiếp theo"**: `useBuildingStep` tải lazy từng dòng, gọi `listRevisions(…,1,1)` và `listScenarios(…,1,1)` rồi suy ra bước tiếp theo. Link sinh ra có dạng `/workspace/buildings/{id}?tab=…&sub=…&upload=1`.
- **Tạo công trình** (modal + `BuildingForm`):
  - `validateBuildingForm`: tên bắt buộc, tối đa 200 ký tự; `totalFloors` là số nguyên ≥ 1. Tỉnh/quận lấy từ `data/vn-provinces`.
  - `buildingFormToInput` giữ nguyên tọa độ, geojson và liên hệ mà form không sửa.
  - Idempotency-Key = `keyFor({input, organizationId})`. PlatformAdmin gửi `organizationId` trong body.
  - Thành công: chuyển tới `/workspace/buildings/{id}?tab=ifc`.
- **Sửa công trình**:
  - `getVersioned` lấy cả dữ liệu lẫn ETag. PUT gửi If-Match.
  - Nếu không đọc được ETag, FE đọc lại công trình rồi so `sameBuildingVersion`. Nếu dữ liệu đã đổi, FE hiện `BuildingConflictAlert` thay vì ghi đè.
  - 412: `buildingConflict()` lấy `current` + ETag mới từ phản hồi lỗi, cho phép "Dùng bản mới nhất".
- **Lưu trữ** (DELETE, set `isActive=false`, một chiều): danh sách không có ETag, nên FE đọc chi tiết trước. Nếu `updatedAt` đã đổi, FE hiện cảnh báo và yêu cầu xác nhận lại. 412 được xử lý giống như khi sửa.
- **Lỗi**: `describeApiError` / `describeBuildingWriteError`. Khi lỗi, nội dung form vẫn được giữ.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/buildings` | `buildings/api.ts:buildingsApi.list` | query `page,pageSize,search,isActive,organizationId?` | `BuildingPage` (`PageResponse<BuildingSummary>`) | `BuildingsController.ListBuildings` |
| POST | `/api/buildings` | `buildingsApi.create` | body `BuildingInput` (+`organizationId` khi là Admin); header Idempotency-Key | `VersionedBuilding<Building>` (201 + ETag) | `BuildingsController.CreateBuilding` |
| GET | `/api/buildings/{id}` | `buildingsApi.getVersioned` | – | `VersionedBuilding<Building>` | `BuildingsController.GetBuilding` |
| PUT | `/api/buildings/{id}` | `buildingsApi.update` | body `BuildingInput`, If-Match, query `organizationId?` | `VersionedBuilding<Building>` | `BuildingsController.UpdateBuilding` |
| DELETE | `/api/buildings/{id}` | `buildingsApi.archive` | If-Match, query `organizationId?` | `VersionedBuilding<BuildingSummary>` | `BuildingsController.DeleteBuilding` |
| GET | `/api/buildings/{id}/revisions` | `buildingsApi.listRevisions` (qua `useBuildingStep`) | `page=1,pageSize=1` | `RevisionPage` | `BuildingsController.ListRevisions` |
| GET | `/api/buildings/{id}/scenarios` | `buildingsApi.listScenarios` (qua `useBuildingStep`) | `page=1,pageSize=1` | `PageResponse<ScenarioSummary>` | `ScenariosController.ListBuildingScenarios` |
| GET | `/api/organizations`, `/api/organizations/{id}` | `organizationsApi.list/get` (chỉ Admin) | – | (thuộc nhóm Organizations) | `OrganizationsController` |

---

### /workspace/buildings/[id]

**File**: `src/app/workspace/buildings/[id]/page.tsx` (có `generateStaticParams() => []`, render tĩnh rồi phục vụ qua CDN) → `features/buildings/components/building-detail-workspace.tsx` (`BuildingDetailWorkspace`, tab mặc định `journey`).

**Quyền truy cập**: Shell cho phép role 0 và 1. BE kiểm tra tenant (404/403). PlatformAdmin thấy breadcrumb Admin; với Admin, trang không tải chip truy cập và chip dịch vụ, và ẩn nút "Mã QR công trình".

**Tabs & components** (`?tab=`, sub-tab ở `?sub=`, revision đang chọn ở `?revision=`). Alias cũ: `?tab=overview` → `journey`; `?tab=qr` → `access&sub=qr`.

| Tab | Component | Nội dung |
|---|---|---|
| `journey` "Hành trình" | `JourneyOverview` | Thông tin công trình, sửa công trình (PUT + If-Match, cùng logic ETag/412 như danh sách), tiến độ revision/QA, số kịch bản, trạng thái dịch vụ |
| `ifc` "IFC" | Combobox chọn revision, `IfcUploadModal`, SubTabs `progress` (`PipelineProgress`, `ProcessingStatusPanel`, `ConfirmTrainingPanel`) · `preview` (`PreviewPanel`) · `equipment` (`EquipmentPanel`) · `technical` (`RevisionDetailsPanel`) · `annotations` (`AnnotationsPanel`) | Pipeline upload/xử lý/QA: **xem phần IFC**. Trong nhóm này chỉ mô tả Annotations và ConfirmTraining |
| `scenarios` "Kịch bản" | `ScenariosPanel` | Danh sách kịch bản và tạo kịch bản |
| `access` "Truy cập" | SubTabs `rights` → `BuildingAccessPanel`; `qr` → `QrPanel` | Quyền tham gia và mã QR |
| `services` "Dịch vụ" | `BuildingServicesTab` (billing) | Thuộc nhóm Billing |

**Logic xử lý**:
- **Header**: tên, loại · số tầng · địa chỉ. Chip "Công khai/Riêng tư" lấy từ `getAccess`; chip kỳ dịch vụ lấy từ `billingApi.listEntitlements`. Menu "···" có: Sửa thông tin, Tải IFC mới, Tải lại dữ liệu. Tham số `?upload=1` mở modal upload; `?create=1` mở modal tạo kịch bản. Khi đóng modal, tham số được xóa khỏi URL.
- **Revision đang xem**: `?revision=`, mặc định là revision đầu danh sách (pageSize 50).
- **Polling job của revision đang chọn** (`usePolling`, `resetKey=revisionId`):
  - Mỗi lượt gọi `listProcessingJobs` → `getJob` cho job mới nhất.
  - Nếu job đang `Running`, gọi thêm `listProcessingLogs` (tùy chọn).
  - Nếu job `Succeeded`: gọi `getJobQa`, và đọc lại `getRevision` tối đa 20 lần cho tới khi trạng thái revision rời Uploaded/Processing.
  - Khi job kết thúc, danh sách revision được tải lại. Chi tiết: **xem phần IFC**.
- **Danh sách issue** (`listIssues`, pageSize 100) chỉ tải khi tab là `ifc` hoặc `journey`. Key tải lại đổi theo trạng thái job và attempt hiện hành.
- **Annotations** (`AnnotationsPanel`):
  - Danh sách dòng gồm `ifcGlobalId` (bắt buộc, tối đa 300), `label` (bắt buộc, tối đa 220), `note`.
  - Khi lưu, PUT gửi If-Match `"<version>"`.
  - 412: giữ bản nháp của người dùng, tải bản mới (`getAnnotations`) để đối chiếu.
- **ConfirmTrainingPanel**:
  - Chọn một scenario version của công trình. FE gọi `listScenarios` rồi `listScenarioVersions` cho từng kịch bản.
  - FE lấy validation run `Passed` của attempt hiện hành bằng `pickPassedRun`. Nếu job của version khác job đang xem, FE gọi `getJobQa(jobId)` riêng.
  - Sau đó POST `confirm-for-training`. Đây là xác nhận kỹ thuật, không phải duyệt nội dung.
- **BuildingAccessPanel**:
  - Đổi Public/Private, tạo lại hoặc thu hồi mã tham gia. Mỗi thao tác đều có modal xác nhận và gửi If-Match `"access-<accessRevision>"`.
  - Mã mới chỉ có trong phản hồi của rotate và chỉ hiện một lần.
  - 412: đánh dấu dữ liệu đã cũ và yêu cầu tải lại.
- **QrPanel** (mount một lần rồi giữ nguyên để token mới cấp không mất khi chuyển tab):
  - Danh sách mã (pageSize 100); tạo, tạo lại, thu hồi kèm modal giải thích tác động. Nhãn tối đa 255 ký tự; nhãn rỗng khi tạo lại nghĩa là giữ nhãn cũ.
  - Token chỉ hiện một lần. URL landing dựng từ `qrLandingUrl(...)`.
  - 409 `QR_ALREADY_EXISTS` hoặc mã đã thu hồi: tải lại danh sách và hiện thông báo.
  - `TypeError` (mất kết nối): cảnh báo rằng mã có thể đã được tạo.
  - 401/403/404/429/503 có thông điệp riêng.
- **Lỗi tải công trình**: 404 hiện "Không tìm thấy công trình"; lỗi khác hiện Alert kèm nút "Thử lại".

**API gọi** (các endpoint IFC chỉ liệt kê tên; chi tiết: xem phần IFC):

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/buildings/{id}` | `buildingsApi.getVersioned` | – | `VersionedBuilding<Building>` | `BuildingsController.GetBuilding` |
| PUT | `/api/buildings/{id}` | `buildingsApi.update` (JourneyOverview) | `BuildingInput`, If-Match, `organizationId?` (Admin) | `VersionedBuilding<Building>` | `BuildingsController.UpdateBuilding` |
| GET | `/api/buildings/{id}/revisions` | `buildingsApi.listRevisions` | `page=1,pageSize=50` | `RevisionPage` | `BuildingsController.ListRevisions` |
| GET | `/api/revisions/{id}` | `buildingsApi.getRevision` | – | `BuildingRevision` | `RevisionsController.GetRevision` |
| GET | `/api/revisions/{id}/processing-jobs`, `/api/processing-jobs/{id}`, `/qa`, `/api/revisions/{id}/processing-logs`, `/issues`, `/artifacts`, `/bim-facts`, `/equipment-candidates`, PATCH `/equipment-decisions`, POST `/process`, `/retry`, `/upload-url`, `/upload-complete`, GET `/api/buildings/{id}/editor-preview` | `buildingsApi.*` | xem phần IFC | xem phần IFC | `IfcQueriesController`, `IfcCommandsController`, `EquipmentCandidatesController`, `EditorPreviewController` |
| GET | `/api/revisions/{id}/annotations` | `buildingsApi.getAnnotations` | – | `AnnotationSnapshot` | `AnnotationsController.Get` |
| PUT | `/api/revisions/{id}/annotations` | `buildingsApi.saveAnnotations` | body `{items: AnnotationItem[]}`, If-Match `"<version>"` | `AnnotationSnapshot` | `AnnotationsController.Put` |
| POST | `/api/revisions/{id}/confirm-for-training` | `buildingsApi.confirmForTraining` | `ConfirmTrainingInput {scenarioVersionId, validationRunId, annotationSetId?}` | `{ reviewId }` | `IfcCommandsController.ConfirmForTraining` |
| GET | `/api/buildings/{id}/scenarios` | `buildingsApi.listScenarios` | `page,pageSize=20` | `PageResponse<ScenarioSummary>` | `ScenariosController.ListBuildingScenarios` |
| GET | `/api/scenarios/{id}/versions` | `buildingsApi.listScenarioVersions` | `page,pageSize` | `ScenarioVersionPage` (buildings/types) | `ScenariosController.ListScenarioVersions` |
| POST | `/api/scenarios` | `buildingsApi.createScenario` | `{buildingId, name}` + Idempotency-Key | `{ id }` (201) | `ScenariosController.CreateScenario` |
| GET | `/api/buildings/{id}/access` | `buildingsApi.getAccess` | – | `BuildingAccess` | `BuildingAccessController.Get` |
| PATCH | `/api/buildings/{id}/access` | `buildingsApi.updateAccess` | `{visibility}`, If-Match `"access-n"` | `BuildingAccess` | `BuildingAccessController.Update` |
| POST | `/api/buildings/{id}/participation-code/rotate` | `buildingsApi.rotateParticipationCode` | If-Match | `BuildingAccess` (có `code`, chỉ một lần) | `BuildingAccessController.Rotate` |
| DELETE | `/api/buildings/{id}/participation-code` | `buildingsApi.revokeParticipationCode` | If-Match | `BuildingAccess` | `BuildingAccessController.Revoke` |
| GET | `/api/buildings/{id}/qr-codes` | `buildings/qr-api.ts:buildingQrApi.list` | `page=1,pageSize=100` | `BuildingQrPage` | `BuildingQrController.List` (file `TrainingSessionsController.cs`) |
| POST | `/api/buildings/{id}/qr-codes` | `buildingQrApi.create` | `{label}` | `BuildingQrIssued` (201) | `BuildingQrController.Create` |
| POST | `/api/buildings/{id}/qr-codes/{qrId}/rotate` | `buildingQrApi.rotate` | `{label}` | `BuildingQrIssued` | `BuildingQrController.Rotate` |
| POST | `/api/buildings/{id}/qr-codes/{qrId}/revoke` | `buildingQrApi.revoke` | – | `BuildingQrCode` | `BuildingQrController.Revoke` |
| GET | `/api/billing/...entitlements?buildingId=` | `billingApi.listEntitlements` (chip dịch vụ) | `buildingId,pageSize=50` | thuộc nhóm Billing | `BillingController` |

---

### /workspace/buildings/[id]/scenarios

**File**: `src/app/workspace/buildings/[id]/scenarios/page.tsx`. Route này giữ lại để link cũ không bị 404: render `BuildingDetailWorkspace` với `defaultTab="scenarios"`, nên mọi logic và API giống trang chi tiết. Phần riêng là `features/buildings/components/scenarios-panel.tsx`.

**Quyền truy cập**: như trang chi tiết (role 0/1). BE `ScenariosController` yêu cầu `OrganizationUser,PlatformAdmin`.

**Logic xử lý** (`ScenariosPanel`):
- Bảng kịch bản, phân trang 20 dòng (state `scenarioPage` cục bộ).
- Mỗi dòng có `VersionSummary`, gọi `listScenarioVersions(…,1,1)` để hiện "vN · thời gian giới hạn · tổng số phiên bản" hoặc "Chưa có phiên bản (chỉ có bản nháp)".
- Link "Mở trình soạn" dẫn tới `/workspace/buildings/{id}/scenarios/{scenarioId}`.
- **Tạo kịch bản** (Modal, có thể mở bằng `?create=1`):
  - Tên bắt buộc, tối đa 200 ký tự (input `maxLength=220` để còn hiện được lỗi).
  - Idempotency-Key = `keyFor({buildingId, name})`. Cùng tên nghĩa là phát lại kết quả, không tạo bản trùng.
  - Lỗi: giữ tên đã nhập.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/buildings/{id}/scenarios` | `buildingsApi.listScenarios` | `page,pageSize=20` | `PageResponse<ScenarioSummary>` | `ScenariosController.ListBuildingScenarios` |
| GET | `/api/scenarios/{id}/versions` | `buildingsApi.listScenarioVersions` | `page=1,pageSize=1` | `ScenarioVersionPage` | `ScenariosController.ListScenarioVersions` |
| POST | `/api/scenarios` | `buildingsApi.createScenario` | `{buildingId,name}` + Idempotency-Key | `{ id }` | `ScenariosController.CreateScenario` |
| (các API khác) | như `/workspace/buildings/[id]` | | | | |

---

### /workspace/buildings/[id]/scenarios/[scenarioId]

**File**: `src/app/workspace/buildings/[id]/scenarios/[scenarioId]/page.tsx` → `features/scenario-editor/panels/scenario-editor.tsx` (`ScenarioEditor`). Các phần chính:
- `panels/draft-start.tsx`
- `panels/empty-draft.tsx`
- `panels/v1/v1-workspace.tsx` + `v1/use-editor-v1.ts` (editor `fet3d.editor/1`)
- `panels/legacy-host.tsx` → `editor-workspace.tsx` + `use-scenario-editor.ts` (editor cũ)
- `use-draft-probe.ts`, `use-editor-preview.ts`, `v1/use-revision-floors.ts`, `v1/create-draft.ts`

**Quyền truy cập**: Shell cho phép role 0/1. Nếu chưa có `accessToken`, hiện skeleton. Khi đọc draft, 401/403 hiện "Không có quyền mở bản nháp này"; 404/400 hiện "Không tìm thấy bản nháp".

**Logic xử lý**:
- **Không có `?draft=`** → `DraftStart`:
  - Hiện danh sách draft đã lưu (`listDrafts`, pageSize 50) để làm tiếp, và chọn revision IFC (`listRevisions`).
  - Kiểm tra Geometry của revision qua `revisionFloors`. Nút "Tạo bản nháp" chỉ bật khi geometry hợp lệ.
  - `createDraftV1`:
    1. POST `/draft` với Idempotency-Key = `keyFor({scenarioId, revisionId})`.
    2. GET draft (lấy ETag).
    3. Nếu `state` còn là `{}`, PUT state v1 ban đầu (schemaVersion + Geometry pin).
  - Nếu PUT thất bại, draft vẫn tồn tại; editor sẽ đề nghị "Khởi tạo".
  - Sau đó `router.replace('?draft=<id>')`, giữ lại tham số đề xuất AI nếu có.
- **Có `?draft=`** → `useDraftProbe` đọc draft một lần (`getDraft` với ETag từ header, hoặc `"<version>"`), rồi `classifyDraft(state)`:
  - `empty` (`{}`) → `EmptyDraftPanel`: khởi tạo v1 bằng PUT + If-Match. 412 nghĩa là draft đã bị đổi ở nơi khác.
  - `v1` (`schemaVersion: fet3d.editor/1`) → `V1Workspace`:
    - Viewport 3D (`use-editor-preview` gọi `editor-preview` để lấy URL GLB đã ký).
    - Tabs bên phải: Đối tượng · Kịch bản · Thư viện · Kiểm tra (n) · Mô hình · Khả dụng.
    - Tải `getScenario`, `catalog` (runtime capabilities) và `rubricCatalog`; các catalog được parse phòng thủ bằng `parseRuntimeCatalog` / `parseRubricCatalog`.
    - Có Undo/Redo. Ctrl/Cmd+S để lưu; không có autosave, người dùng phải bấm "Lưu".
  - `legacy` (không có schemaVersion) → editor cũ, không bao giờ tự chuyển đổi định dạng. Đề xuất AI không áp dụng được cho draft legacy.
  - `unsupported` → thông báo schemaVersion chưa được hỗ trợ.
- **Lưu (v1)**:
  - Không gửi nếu không có thay đổi hoặc nếu shape không hợp lệ phía client.
  - PUT `/api/scenario-drafts/{id}` gửi If-Match. Phản hồi 204 trả ETag mới trong header. Nếu proxy làm mất header, FE GET lại draft; không bao giờ tự đoán ETag.
  - 412: mở `ConflictDialog`. FE tải bản trên server, `compareDrafts`, người dùng chọn từng trường, `resolveMerge`, rồi kết quả vẫn ở trạng thái **chưa lưu**.
  - 422 `EDITOR_SCHEMA_INVALID` hiện danh sách issue; 422 `EDITOR_SCHEMA_VERSION_UNSUPPORTED` và 400 `EDITOR_JSON_MALFORMED` có thông điệp riêng.
- **Kiểm tra (v1)**: POST `validate-state` là dry-run với body chưa lưu. FE so `stateHash` (SHA-256 của body) với hash tự tính và so `draftId`; nếu không khớp thì bỏ kết quả.
- **Kiểm tra (legacy)**: lưu trước, rồi POST `validate`. FE so `version` với ETag vừa lưu.
- **Nhập thiết bị** (`v1-equipment-import`): đọc `equipment-candidates` của revision (chi tiết: xem phần IFC).
- Từ toolbar có link sang trang Phiên bản (`/versions`).

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/scenarios/{id}` | `scenario-editor/api.ts:scenarioEditorApi.getScenario`; `scenarioVersionsApi.getScenario` (DraftStart) | – | `ScenarioDetail` | `ScenariosController.GetScenario` |
| GET | `/api/scenarios/{id}/drafts` | `scenarios/versions-api.ts:scenarioVersionsApi.listDrafts` | `page=1,pageSize=50` | `DraftPage` (`PageResponse<DraftSummary>`) | `ScenariosController.ListScenarioDrafts` |
| GET | `/api/buildings/{id}/revisions` | `buildingsApi.listRevisions` | `1,50` | `RevisionPage` | `BuildingsController.ListRevisions` |
| POST | `/api/scenarios/{id}/draft` | `scenarioEditorApi.createDraft` | `{revisionId}` + Idempotency-Key | `{ id }` (201) | `ScenariosController.CreateScenarioDraft` |
| GET | `/api/scenario-drafts/{id}` | `scenarioEditorApi.getDraft` | – | `LoadedDraft {draft: DraftResponse, etag}` | `ScenariosController.GetScenarioDraft` |
| PUT | `/api/scenario-drafts/{id}` | `scenarioEditorApi.putDraft` | body JSON state, If-Match | 204 + header ETag → `{etag}` | `ScenariosController.UpdateScenarioDraft` |
| POST | `/api/scenario-drafts/{id}/validate` | `scenarioEditorApi.validate` (legacy) | – | `ValidateResponse` | `ScenariosController.ValidateScenarioDraft` |
| POST | `/api/scenario-drafts/{id}/validate-state` | `scenarioEditorApi.validateState` (v1) | body JSON state | `ValidateStateResponse` | `ScenariosController.ValidateScenarioDraftState` |
| GET | `/api/scenario-interactions/catalog` | `scenarioEditorApi.catalog` | – | `RuntimeCatalogEntry[]` | `ScenarioInteractionsController.GetCatalog` |
| GET | `/api/scenario-rubrics/catalog` | `scenarioEditorApi.rubricCatalog` | – | `RubricCatalog` | `ScenarioRubricsController.Catalog` |
| GET | `/api/buildings/{id}/editor-preview?revisionId=` | `scenarioEditorApi.editorPreview` | `revisionId` | `EditorPreviewV1` | `EditorPreviewController.Get` |
| GET | `/api/revisions/{id}/floors` | `scenarioEditorApi.revisionFloors` | – | `RevisionFloorsResponse` | `RevisionsController.GetFloors` |
| GET | `/api/revisions/{id}/equipment-candidates` | `buildingsApi.getEquipmentCandidates` | – | `VersionedBuilding<EquipmentCandidates>` | `EquipmentCandidatesController` (xem phần IFC) |

---

### /workspace/buildings/[id]/scenarios/[scenarioId]/versions

**File**: `src/app/workspace/buildings/[id]/scenarios/[scenarioId]/versions/page.tsx` → `features/scenarios/components/versions/versions-workspace.tsx` (`VersionsWorkspace` + `Workbench`). Các file phụ:
- Panel: `snapshot-drawer.tsx`, `package-build-panel.tsx`, `readiness-panel.tsx`, `review-panel.tsx`, `release-panel.tsx`, `journey-panel.tsx`, `gate-stepper.tsx`, `version-content.tsx`
- Hook: `use-version-server-state.ts`, `use-version-jobs.ts`
- Logic: `version-readiness.ts`, `journey.ts`
- Playtest: `features/playtest/components/playtest-panel.tsx`, `handoff-card.tsx`, `use-playtest-status.ts`, `use-playtest-package.ts`

**Quyền truy cập**:
- Shell cho phép role 0/1.
- `canAct` (role 0 hoặc 1): dựng gói, xác nhận kỹ thuật, tạo/phát hành/thu hồi release.
- `canSubmit` (chỉ role 1): gửi duyệt (BE: `Submit` yêu cầu `OrganizationUser`).
- `canPlaytest` (chỉ role 1): BE `PlaytestsController` chỉ cho `OrganizationUser`; PlatformAdmin bị 403.

**Logic xử lý**:
- **URL**: `?page`, `?version=` (mặc định là phiên bản đầu danh sách), `?tab=` (`content` "Tổng quan" | `build` "Dựng gói" | `readiness` "Kiểm tra" | `review` "Gửi duyệt" | `release` "Phát hành" | `playtest` "Chạy thử"), `?playtest=<id>`.
- **Nguồn sự thật luôn là server** (`useVersionServerState`): `getVersionReadiness`; `getVersionReview` (chỉ gọi khi `reviewStatus != NotSubmitted`, 404 coi là chưa gửi); `listReleases({scenarioId})`, rồi `pickRelease` (ưu tiên release chưa Revoked), rồi `getRelease`. Sau mỗi lệnh, FE gọi `refresh()`; FE không lưu phản hồi của lệnh làm nguồn sự thật.
- **Gate stepper**: Kết quả kỹ thuật (`technicalGate` dựa trên job, verdict và readiness) → Duyệt nội dung (`approvalGate(reviewStatus, rejectReason)`) → Release (`releaseGate`). `JourneyPanel` gợi ý bước tiếp theo.
- **Snapshot** (`SnapshotDrawer`):
  1. Chọn draft (`listDrafts`) hoặc nhập id.
  2. `getDraft` lấy ETag.
  3. (Tùy chọn) `validateDraft`.
  4. `snapshotDraft` với If-Match = ETag và Idempotency-Key = `keyFor({draftId, eTag})`.
  - 412: tải bản mới và hiện so sánh cũ/mới. 428: thiếu If-Match.
- **Dựng gói** (`PackageBuildPanel`):
  - Kind là `ReleasePackage` hoặc `PlaytestPackage`; `buildTarget` chọn từ `BUILD_TARGETS = ["Android"]`.
  - POST package-builds với Idempotency-Key = `keyFor({versionId, kind, buildTarget})`. Phản hồi 202 `{jobId}` chỉ có nghĩa là đã xếp hàng, chưa phải gói hợp lệ.
  - Retry job Failed: `requestId` = `keyFor({jobId, reason})`, kèm lý do.
  - 409 `PROCESSING_JOB_ACTIVE`, 400 `BUILD_TARGET_UNSUPPORTED`.
- **Polling job** (`useVersionJobs`):
  - Danh sách job lấy từ `listRevisionJobs` (pageSize 100), lọc theo `scenarioVersionId` và kind `*Package`. Job ưu tiên là `readiness.packageJob.jobId`.
  - Poll `getJob` mỗi 3 giây. Khi job `Succeeded`: gọi `getJobQa`, rồi `listRevisionIssues` (nếu đã có run). FE chờ tối đa 5 lượt để có validation run.
  - "Succeeded ≠ Passed": verdict tính bằng `qaVerdict(runs, issues)`.
- **Kiểm tra/Xác nhận kỹ thuật** (`ReadinessPanel`): hiện lịch sử QA (`listValidationRuns`). `confirmForTraining` chỉ được gọi khi verdict là `passed`, có thể kèm `annotationSetId`. Gọi lại với cùng run sẽ trả cùng `reviewId`.
- **Gửi duyệt** (`ReviewPanel`): `submitForReview` với Idempotency-Key = `keyFor({versionId})`. Lỗi `CONTENT_REVIEW_ALREADY_EXISTS` coi như đã gửi và FE tải lại. Panel hiện hash đã đóng băng, người quyết định, lý do từ chối.
- **Release** (`ReleasePanel`):
  - Chỉ cho build khi readiness có `confirmationReviewId` và `candidateArtifactId`. `buildRelease` dùng Idempotency-Key = `keyFor(payload)`; release tạo ra ở trạng thái Built (chưa phát hành).
  - `publishRelease` dùng Idempotency-Key = `keyFor({releaseId})`. Lỗi 503 `PUBLISH_GATE_UNAVAILABLE` hoặc 409 (cổng chặn) hiện `PublishBlocked`; trạng thái release luôn đọc lại từ server.
  - `revokeRelease` cần lý do và trả 204.
  - Panel cũng hiện danh sách trainings của công trình.
- **Playtest** (`PlaytestPanel`):
  - `usePlaytestPackage` poll job `PlaytestPackage` và QA để biết gói chạy thử đã sẵn sàng chưa.
  - `prepare` dùng Idempotency-Key = `keyFor({scenarioId, revisionId, scenarioVersionId})`. Kết quả trả id, ghi vào `?playtest=`.
  - Lỗi `PLAYTEST_PACKAGE_REQUIRED`, `RUNTIME_INCOMPATIBLE`, `DRAFT_SNAPSHOT_REQUIRED` khiến FE tải lại trạng thái gói. Nếu có `Retry-After`, nút bị khóa tới hết thời gian chờ.
  - `usePlaytestStatus` poll `GET /api/playtests/{id}` cho tới Completed/Cancelled; 401/403/404 dừng poll hẳn.
  - `HandoffCard`: `createHandoff` với Idempotency-Key, sinh QR deep link sống 5 phút. `PLAYTEST_HANDOFF_NOT_RECOVERABLE` xóa handoff đang hiện.
  - Hủy playtest: `cancel` với Idempotency-Key. 409 `PLAYTEST_TERMINAL` nghĩa là playtest đã kết thúc; FE đọc lại trạng thái.
  - Web **không** gọi redeem, start, launch-grants, launched, heartbeat, events, complete; các bước này thuộc Mobile.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/scenarios/{id}` | `scenarioVersionsApi.getScenario` | – | `ScenarioDetail` (version-types) | `ScenariosController.GetScenario` |
| GET | `/api/scenarios/{id}/versions` | `scenarioVersionsApi.listVersions` | `page,pageSize=20` | `ScenarioVersionPage` | `ScenariosController.ListScenarioVersions` |
| GET | `/api/scenario-versions/{id}` | `scenarioVersionsApi.getVersion` | – | `ScenarioVersionDetail` | `ScenariosController.GetScenarioVersion` |
| GET | `/api/scenarios/{id}/drafts` | `scenarioVersionsApi.listDrafts` | `1,50` | `DraftPage` | `ScenariosController.ListScenarioDrafts` |
| GET | `/api/scenario-drafts/{id}` | `scenarioVersionsApi.getDraft` | – | `{draft: DraftForSnapshot, eTag}` | `ScenariosController.GetScenarioDraft` |
| POST | `/api/scenario-drafts/{id}/validate` | `scenarioVersionsApi.validateDraft` | – | `DraftValidation` | `ScenariosController.ValidateScenarioDraft` |
| POST | `/api/scenario-drafts/{id}/snapshot` | `scenarioVersionsApi.snapshotDraft` | If-Match + Idempotency-Key | `CreatedResource {id}` (201) | `ScenariosController.SnapshotScenarioDraft` |
| GET | `/api/scenario-versions/{id}/readiness` | `scenarioVersionsApi.getVersionReadiness` | – | `VersionReadiness` | `ScenarioReviewQueriesController.VersionReadiness` |
| GET | `/api/scenario-versions/{id}/review` | `scenarioVersionsApi.getVersionReview` | – | `VersionReview` | `ScenarioReviewQueriesController.Version` |
| GET | `/api/revisions/{id}/validation-runs` | `scenarioVersionsApi.listValidationRuns` | `1,20` | `PageResponse<ValidationRunHistoryItem>` | `IfcQueriesController.ListValidationRuns` |
| GET | `/api/revisions/{id}/processing-jobs` | `scenarioVersionsApi.listRevisionJobs` | `1,100` | `ProcessingJobPage` | `IfcQueriesController.ListJobs` |
| POST | `/api/scenario-versions/{id}/package-builds` | `scenarioVersionsApi.startPackageBuild` | `PackageBuildRequest {kind, buildTarget}` + Idempotency-Key | `PackageBuildAccepted {jobId}` (202) | `ScenarioPackageBuildsController.Build` |
| GET | `/api/processing-jobs/{id}` | `scenarioVersionsApi.getJob` | – | `ProcessingJobDetail` | `IfcQueriesController.GetJob` |
| GET | `/api/processing-jobs/{id}/qa` | `scenarioVersionsApi.getJobQa` | `1,20` | `JobQa` | `IfcQueriesController.GetJobQa` |
| POST | `/api/processing-jobs/{id}/retry` | `scenarioVersionsApi.retryJob` | `RetryJobInput {requestId, reason}` | `RetryJobResult` | `IfcCommandsController.RetryJob` |
| GET | `/api/revisions/{id}/issues` | `scenarioVersionsApi.listRevisionIssues` | `1,100` | `VersionIssuePage` | `IfcQueriesController.ListRevisionIssues` |
| POST | `/api/revisions/{id}/confirm-for-training` | `scenarioVersionsApi.confirmForTraining` | `ConfirmTrainingInput` | `ConfirmTrainingResult {reviewId}` | `IfcCommandsController.ConfirmForTraining` |
| POST | `/api/scenario-versions/{id}/submit` | `scenarioVersionsApi.submitForReview` | Idempotency-Key | `ContentReviewSubmission` (201) | `ScenarioContentReviewsController.Submit` |
| GET | `/api/releases` | `scenarioVersionsApi.listReleases` | `scenarioId,page=1,pageSize=100` | `ReleasePage` | `ReleasesController.ListReleases` |
| POST | `/api/releases` | `scenarioVersionsApi.buildRelease` | `BuildReleaseInput` + Idempotency-Key | `Release` | `ReleasesController.BuildRelease` |
| GET | `/api/releases/{id}` | `scenarioVersionsApi.getRelease` | – | `Release` (có `entitlement`) | `ReleasesController.GetRelease` |
| POST | `/api/releases/{id}/publish` | `scenarioVersionsApi.publishRelease` | Idempotency-Key | `Release` | `ReleasesController.PublishRelease` |
| POST | `/api/releases/{id}/revoke` | `scenarioVersionsApi.revokeRelease` | `{reason}` | `void` (204) | `ReleasesController.RevokeRelease` |
| GET | `/api/buildings/{id}/trainings` | `scenarioVersionsApi.listTrainings` | – | `TrainingItem[]` | `BuildingsController.GetTrainings` |
| POST | `/api/scenarios/{id}/playtests?buildingId=` | `playtest/api.ts:playtestApi.prepare` | `PreparePlaytestInput {revisionId, scenarioVersionId}` + Idempotency-Key | `PlaytestPreparation` (201) | `ScenariosController.PreparePlaytestSession` |
| GET | `/api/playtests/{id}` | `playtestApi.get` | – | `PlaytestStatus` | `PlaytestsController.Get` |
| POST | `/api/playtests/{id}/handoffs` | `playtestApi.createHandoff` | Idempotency-Key | `PlaytestHandoff` (201) | `PlaytestsController.CreateHandoff` |
| POST | `/api/playtests/{id}/cancel` | `playtestApi.cancel` | Idempotency-Key | `PlaytestStatus` | `PlaytestsController.Cancel` |

---

### Kiểm tra type API

So sánh type FE với DTO của BE (`Fire3D.Application`). Các endpoint IFC thuần (upload, process, jobs, logs, artifacts, bim-facts, equipment, editor-preview) do phần IFC kiểm tra.

| Endpoint | Type FE | Trạng thái | Ghi chú |
|---|---|---|---|
| GET/POST/PUT/DELETE `/api/buildings[/{id}]` | `BuildingSummary`, `Building`, `BuildingInput` | Đủ | Khớp `BuildingResponse`/`BuildingSummaryResponse`; `decimal` lat/lng ánh xạ sang `number` |
| GET `/api/buildings/{id}/revisions`, `/api/revisions/{id}` | `BuildingRevision` | Đủ | Khớp `RevisionResponse` |
| GET/PUT `/api/revisions/{id}/annotations` | `AnnotationSnapshot`, `AnnotationItem` | Đủ | BE `Data` là JsonElement; FE định nghĩa là `{items}` (đúng contract `AnnotationData`) |
| GET/PATCH `/api/buildings/{id}/access`, participation-code rotate/DELETE | `BuildingAccess` | Đủ | Khớp `BuildingAccessResponse` |
| GET/POST `/api/buildings/{id}/qr-codes`, rotate, revoke | `BuildingQrPage`, `BuildingQrIssued`, `BuildingQrCode` | Đã bổ sung | Thêm `content?` vào `BuildingQrIssued` (BE `BuildingQrCreated.Content`) |
| GET `/api/buildings/{id}/scenarios` | `ScenarioSummary` | Đủ | |
| POST `/api/scenarios`, `/api/scenarios/{id}/draft`, `/snapshot` | `{ id }` / `CreatedResource` | Đủ | BE trả `new { Id }` |
| GET `/api/scenarios/{id}/versions` (buildings/api) | `ScenarioVersionSummary` (buildings/types) | Đã bổ sung | Thêm `reviewStatus?`, `reviewId?`, `rejectReason?` |
| GET `/api/scenarios/{id}/versions` (versions-api) | `ScenarioVersionSummary` (version-types) | Đủ | |
| GET `/api/scenarios/{id}` (scenario-editor) | `ScenarioDetail` (scenario-editor/api) | Đã bổ sung | Thêm các trường resume `currentDraftId`, `currentDraftVersion`, `draftCount`, `latestVersionId`, `latestVersionNumber` |
| GET `/api/scenarios/{id}` (versions-api) | `ScenarioDetail` (version-types) | Đủ | |
| GET `/api/scenarios/{id}/drafts` | `DraftSummary` | Đã bổ sung | Thêm `stateKind?` (`Uninitialized`, `Versioned`, `Legacy`) |
| GET/PUT `/api/scenario-drafts/{id}` | `DraftResponse`, `DraftForSnapshot` | Đủ | `state` là JsonNode, FE dùng `JsonObject`/`unknown` (đúng, vì là JSON tự do) |
| POST `/api/scenario-drafts/{id}/validate` (editor) | `ValidateResponse` | Đã bổ sung | `issues: unknown` → `DraftValidationIssue[]` (`{code,path,message}`) |
| POST `/api/scenario-drafts/{id}/validate` (versions-api) | `DraftValidation` | Đủ | `issues: ApiFieldError[]`, cùng shape |
| POST `/api/scenario-drafts/{id}/validate-state` | `ValidateStateResponse` | Đã bổ sung | `issues: unknown` → `DraftValidationIssue[]` |
| GET `/api/scenario-versions/{id}` | `ScenarioVersionDetail` | Đủ | Các trường `configuration.*`/`stateSnapshot` là JsonNode, FE để `unknown` có chủ đích |
| GET `/api/scenario-interactions/catalog` | `RuntimeCatalogEntry[]` | Đã bổ sung | `capabilityContracts?: unknown` → `Record<string, unknown> \| null` (BE `JsonObject?`); `capabilities` vẫn là `unknown` (JsonNode) |
| GET `/api/scenario-rubrics/catalog` | `RubricCatalog` (mới) | Đã bổ sung | Trước đây là `request<unknown>`; thêm `RubricCatalog`, `RubricCatalogMetric`, `RubricCriterionShape` |
| GET `/api/revisions/{id}/floors` | `RevisionFloorsResponse` | Đã bổ sung | Thêm `semanticMapping?` |
| GET `/api/buildings/{id}/editor-preview` | `EditorPreview`/`EditorPreviewV1` | Đủ (phần IFC) | `coordinateTransform/floors/semanticMapping` là JsonElement → `unknown` |
| GET `/api/scenario-versions/{id}/readiness` | `VersionReadiness` | Đủ | Khớp `ScenarioVersionReadiness` |
| GET `/api/scenario-versions/{id}/review` | `VersionReview` | Đã bổ sung | `review` thêm `organizationId/Name`, `buildingId/Name`, `scenarioId/Name`, `submittedByName?`, `decidedByName?`; thêm `content`, `rubric`, `learningObjectives`, `learnerInstructions` |
| POST `/api/scenario-versions/{id}/submit` | `ContentReviewSubmission` | Đủ | |
| POST `/api/scenario-versions/{id}/package-builds` | `PackageBuildRequest` / `PackageBuildAccepted` | Đủ | |
| GET `/api/processing-jobs/{id}`, `/qa`, retry; GET `/api/revisions/{id}/validation-runs`, `/issues` | `ProcessingJobDetail`, `JobQa`, `RetryJobResult`, `ValidationRunHistoryItem`, `VersionIssue` | Đủ | |
| POST `/api/revisions/{id}/confirm-for-training` | `ConfirmTrainingInput` / `ConfirmTrainingResult` | Đủ | buildings/api dùng kiểu inline `{reviewId}`, cùng shape |
| GET/POST `/api/releases`, `/{id}`, publish, revoke | `ReleaseSummary`, `Release`, `ReleasePackage`, `ReleaseEntitlement`, `BuildReleaseInput` | Đủ | `BuildReleaseInput` không khai báo các trường override tùy chọn của BE (FE không dùng) |
| GET `/api/buildings/{id}/trainings` | `TrainingItem[]` | Đủ | |
| POST `/api/scenarios/{id}/playtests` | `PreparePlaytestInput` / `PlaytestPreparation` | Đủ | Input bỏ các trường tùy chọn (`scenarioDraftId`, hash, runtime) mà Web không dùng |
| GET `/api/playtests/{id}`, POST `/cancel` | `PlaytestStatus` | Đã bổ sung | `completion: unknown` → `PlaytestCompletionView \| null`; thêm `openHandoffId?`, `rejectedEvents?` (`PlaytestRejectedEvents`); `recovery.canIssueHandoff?` |
| POST `/api/playtests/{id}/handoffs` | `PlaytestHandoff` | Đủ | |
| GET `/api/scenarios/{id}/playtests`, `/playtest-availability` | – | Thiếu (chưa dùng) | BE có `PlaytestPage`, `PlaytestAvailability`; FE chưa gọi. Nên thêm type khi tích hợp |

---

## Nhóm: Workspace – Thanh toán, Báo cáo, Thư viện, Hỗ trợ, AI

> Quy ước chung: mọi trang `/workspace/*` nằm trong `src/app/workspace/layout.tsx` → `OperationsShell areaId="organization"` (`src/layouts/operations-shell.tsx`, `nav-config.ts`): chưa đăng nhập → màn "Đăng nhập" (`/login?next=…`); role không thuộc `allowedRoles: [0, 1]` (0 = PlatformAdmin, 1 = OrganizationUser) → màn "Không có quyền truy cập". `/admin/*` dùng `areaId="admin"` với `allowedRoles: [0]`. Mỗi component còn tự kiểm tra role lần hai. HTTP client: `src/api/client.ts` (`apiClient.request` / `requestWithMeta` – trả kèm `headers`/`status`, hỗ trợ `idempotencyKey` → header `Idempotency-Key`, `ifMatch` → `If-Match`, lỗi ném `ApiError` có `status`, `code`, `fieldErrors`, `retryAfterSeconds`). Token: `Authorization: Bearer <accessToken>` từ `useAuthSession()`.
>
> Controller BE nằm ở `C:\do an\BE\Fire3D\Fire3D.API\Controllers`, DTO ở `Fire3D.Application` (`Billing/BillingContracts.cs`, `Billing/PayosContracts.cs`, `Billing/NotificationContracts.cs`, `Support/SupportContracts.cs`, `Ai/OrganizationAiContracts.cs`, `Reporting/*Contracts.cs`, `Administration/AdministrationContracts.cs`).

### /workspace/billing

**File:** `src/app/workspace/billing/page.tsx` → `src/features/billing/components/billing-workspace.tsx` (`BillingWorkspace`). Thành phần con: `checkout-panel.tsx`, `payment-progress.tsx`, `payment-states.tsx`, `quotation-snapshot.tsx`, `quotation-cancel.tsx`, `quotation-create-modal.tsx`, `service-capacity.tsx`, `ai-quota-view.tsx`, `notifications-panel.tsx` (`NotificationsPanel`, `ReminderBanner`), `enterprise-section.tsx`, `enterprise-common.tsx`, `package-picker.tsx`. Helper: `pending-payment.ts`, `entitlements.ts`, `errors.ts`, `format.ts`.

**Quyền truy cập:** Shell `[0, 1]`. Trong component: `enabled = role 1 || role 0`; chỉ `role === 1` (`canPurchase`) mới được tạo báo giá, chấp nhận, thanh toán, mua top-up, gửi yêu cầu doanh nghiệp. PlatformAdmin chỉ xem. 403 hiển thị "Không có quyền xem báo giá".

**Logic xử lý:**
- **Tab (URL `?tab=`):** `services` (mặc định, Dịch vụ theo công trình) · `quotes` (Báo giá) · `ai` (Quota AI) · `reminders` (Nhắc gia hạn) · `enterprise` (Số lượng lớn). Đổi tab xoá `quotation`, `payment`, `service`, `request` trên URL. Phân trang báo giá qua `useUrlParams({ pageSize: 20 })`.
- **Tóm tắt quota (`QuotaSummary`)**: đọc `getAiQuota` (đơn vị không cộng gộp; thanh đo `granted` vs đã dùng + tạm trừ).
- **Dịch vụ theo công trình:** gộp `buildingsApi.list(isActive)` + `listEntitlements(pageSize 100)` theo `buildingId`, `summarizeEntitlements()` (`entitlements.ts`) cho ra trạng thái `effective | expiring (≤ 5 ngày) | expired | upcoming | none` – hiệu lực **chỉ** theo cờ `isEffective` của server, ngày chỉ dùng cho nhắc; `purchaseAction` = `Renewal` nếu đã có lịch sử trả tiền (không tính Trial), ngược lại `New`. Nút Mua/Gia hạn mở modal tạo báo giá; "Chi tiết" (`?service=<buildingId>`) mở drawer `ServiceCapacity` (`getBuildingServiceEntitlement`: giới hạn học viên hiệu lực, suất đã dùng/còn, lịch sử nâng cấp) với nút "Mua / gia hạn" và "Nâng cấp học viên".
- **Tạo báo giá (`QuotationCreateModal`)**: 3 chế độ `service` (New/Renewal theo từng công trình + gói 6/12 tháng), `upgrade` (cần entitlement trả phí đang chạy, gửi `upgradeEntitlementId`), `topup` (quota AI, `purpose: "AIQuotaTopUp"`, `topUp.requestedQuotaUnits`). Server định giá, trả Draft; một `Idempotency-Key` cho mỗi payload (`useIdempotencyKey`). Tạo xong mở drawer báo giá (`?quotation=<id>`).
- **Chi tiết báo giá (Drawer)**: `getQuotation` (trả kèm ETag; fallback `billingEtag(id, revision)`), `QuotationSnapshot` hiển thị bản chụp (thuế `null` = "ước tính, chưa thuế"), `CheckoutPanel` + `QuotationCancel` (hủy cần lý do, `If-Match` + `Idempotency-Key`; 409 `QUOTATION_ALREADY_PAID` / `QUOTATION_CHECKOUT_UNRESOLVED`).
- **Luồng PayOS (`CheckoutPanel` → `CheckoutFlow`)**:
  1. `Draft` → chờ PlatformAdmin phát hành.
  2. `Issued` → checkbox đồng ý điều khoản → `acceptQuotation` (If-Match). 409 (hết hạn/không còn Issued) hoặc 412 → báo lỗi và reload.
  3. `Accepted` → đọc lịch sử checkout `listQuotationCheckouts` (mới nhất trước; `pickLedgerRow` ưu tiên dòng `Paid`) + checkout đang dở lưu cục bộ → `getCheckout` để khôi phục. Nút "Thanh toán qua PayOS" → `createCheckout` (`Idempotency-Key` theo `quotationId`, 201 có link / 200 replay / 202 đang tạo). Nếu `checkoutStatus === "Creating"` và chưa có URL → **polling** `getCheckout` mỗi 3 s đến khi có `checkoutUrl` hoặc trạng thái kết thúc (`Cancelled/Expired/Failed/Completed/NeedsReconcile`).
  4. Trước khi chuyển hướng: `savePendingCheckout({checkoutId, paymentRequestId, quotationId, returnTo})` → `localStorage` key `fet3d:billing:pending-checkout:v1` (bọc try/catch; `returnTo` chỉ nhận đường dẫn nội bộ bắt đầu bằng `/`, không `//`). Chỉ chuyển tới URL `https:` (`safeCheckoutUrl`) bằng `window.location.assign`.
  5. Hủy thanh toán: modal xác nhận → `cancelPayment` (Idempotency-Key theo `paymentRequestId`). 200 không đồng nghĩa đã hủy: đọc `checkoutStatus` (`Completed` = tiền vào trước; `Cancelled/Expired` → `clearPendingCheckout()`).
  6. Có `paymentRequestId` → `PaymentProgress` **poll** `getPayment` mỗi 4 s (lùi khi lỗi, tôn trọng `Retry-After`, tạm dừng khi tab ẩn – `usePolling`), 15 s khi `Paid` nhưng provisioning `Partial/NeedsReconcile`. `summarizePayment`: chỉ báo thành công khi `paymentStatus = Paid` **và** `provisioningStatus = Succeeded`; hiển thị timeline 3 bước + trạng thái từng dòng provisioning (công trình hoặc top-up AI, `buildingId = null`). Kết thúc → `onSettled` reload báo giá/entitlement.
  7. Báo giá `Cancelled` mà có dòng `Paid` → cảnh báo cần PlatformAdmin đối soát.
- **Quota AI (tab `ai`, `AiQuotaView`)**: số dư theo đơn vị, danh sách grant, lịch sử sử dụng (phân trang), các báo giá top-up; nút "Mua thêm" mở modal chế độ `topup`.
- **Nhắc gia hạn (tab `reminders`)**: `listNotifications` (lọc `unread`), `markNotificationRead` (idempotent); `ReminderBanner` trên đầu trang đếm nhắc chưa đọc; nút "Gia hạn" mở modal với công trình đó.
- **Số lượng lớn (tab `enterprise`)**: form yêu cầu doanh nghiệp (số công trình, thời hạn, liên hệ) → `createEnterpriseRequest` (Idempotency-Key); danh sách + chi tiết (`?request=`) với phản hồi của Admin (append-only) và link báo giá được tạo.
- **Lỗi**: `billingErrorText` / `billingCodeMessage` (`errors.ts`) ánh xạ mã lỗi BE sang tiếng Việt; mọi khối có nút "Thử lại"; khoá `useRef` chống bấm đúp.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/billing/quotations?page&pageSize` | `billing/api.ts:billingApi.listQuotations` | query | `BillingPageResponse<Quotation>` → `PageResponse<Quotation>` | `BillingController.Quotes` |
| GET | `/api/billing/quotations/{id}` | `billingApi.getQuotation` | – | `WithEtag<Quotation>` | `BillingController.Quote` |
| POST | `/api/billing/quotations` | `billingApi.createQuotation` | `QuotationDraftInput` + Idempotency-Key | `WithEtag<Quotation>` | `BillingController.CreateQuote` |
| PATCH | `/api/billing/quotations/{id}` | `billingApi.updateDraft` | `QuotationDraftInput` + If-Match | `WithEtag<Quotation>` | `BillingController.UpdateDraft` |
| POST | `/api/billing/quotations/{id}/accept` | `billingApi.acceptQuotation` | If-Match | `WithEtag<Quotation>` | `BillingController.Accept` |
| POST | `/api/billing/quotations/{id}/cancel` | `billingApi.cancelQuotation(scope="organization")` | `{reason}` + If-Match + Idempotency-Key | `WithEtag<Quotation>` | `BillingController.Cancel` |
| GET | `/api/billing/quotations/{id}/checkouts` | `billingApi.listQuotationCheckouts` | query page/pageSize | `PageResponse<PayosLedgerItem>` | `PayosController.QuotationCheckouts` |
| POST | `/api/payments/payos/create` | `billingApi.createCheckout` | `{quotationId}` + Idempotency-Key | `CheckoutResult {checkout: PayosCheckout, httpStatus}` | `PayosController.Create` |
| GET | `/api/payments/payos/checkouts/{id}` | `billingApi.getCheckout` | – | `PayosCheckout` | `PayosController.Checkout` |
| POST | `/api/payments/payos/requests/{id}/cancel` | `billingApi.cancelPayment` | Idempotency-Key | `CheckoutResult` | `PayosController.Cancel` |
| GET | `/api/payments/payos/requests/{id}` | `billingApi.getPayment` | – | `PayosPayment` | `PayosController.Payment` |
| GET | `/api/billing/entitlements?buildingId&organizationId&page&pageSize` | `billingApi.listEntitlements` | `EntitlementFilters` | `PageResponse<Entitlement>` | `PayosController.Entitlements` |
| GET | `/api/buildings/{id}/service-entitlement` | `billingApi.getBuildingServiceEntitlement` | – | `BuildingServiceEntitlement` | `BillingController.BuildingEntitlement` |
| GET | `/api/billing/service-packages` | `billingApi.listPackages` | – | `ServicePackage[]` | `BillingController.Packages` |
| GET | `/api/organizations/me/ai-quota` | `billingApi.getAiQuota(organizationId undefined)` | – | `AiQuotaBalance` | `BillingController.AiQuota` |
| GET | `/api/organizations/me/ai-quota/grants` | `billingApi.listAiGrants` | page/pageSize | `PageResponse<AiQuotaGrant>` | `BillingController.AiQuotaGrants` |
| GET | `/api/organizations/me/ai-usage` | `billingApi.listAiUsage` | page/pageSize | `PageResponse<AiUsageEntry>` | `BillingController.AiUsage` |
| GET | `/api/organizations/me/notifications?unread&type&page&pageSize` | `billingApi.listNotifications` | `NotificationFilters` | `PageResponse<OrganizationNotification>` | `OrganizationNotificationsController.List` |
| PATCH | `/api/organizations/me/notifications/{id}/read` | `billingApi.markNotificationRead` | – | `OrganizationNotification` | `OrganizationNotificationsController.Read` |
| POST | `/api/billing/enterprise-quote-requests` | `billingApi.createEnterpriseRequest` | `EnterpriseRequestInput` + Idempotency-Key | `EnterpriseRequest` | `BillingController.Enterprise` |
| GET | `/api/billing/enterprise-quote-requests` | `billingApi.listEnterpriseRequests(scope="mine")` | page/pageSize | `PageResponse<EnterpriseRequest>` | `BillingController.EnterpriseRequests` |
| GET | `/api/billing/enterprise-quote-requests/{id}` | `billingApi.getEnterpriseRequest(scope="mine")` | – | `WithEtag<EnterpriseRequest>` | `BillingController.EnterpriseRequest` |
| GET | `/api/billing/enterprise-quote-requests/{id}/responses` | `billingApi.listEnterpriseResponses(scope="mine")` | page/pageSize | `PageResponse<EnterpriseResponse>` | `BillingController.EnterpriseResponses` |
| GET | `/api/buildings?isActive&page&pageSize`, `/api/buildings/{id}` | `buildings/api.ts:buildingsApi.list/get` | query | (types của feature buildings) | `BuildingsController` |

### /workspace/billing/return

**File:** `src/app/workspace/billing/return/page.tsx` → `src/features/billing/components/payment-return.tsx` (`PaymentReturn`).

**Quyền truy cập:** Shell `[0, 1]` (nằm trong `/workspace`). Đây là `returnUrl`/`cancelUrl` cấu hình cho PayOS (`PayOS__ReturnUrl`, `PayOS__CancelUrl`).

**Logic xử lý:** Trang **chỉ điều hướng**, không bao giờ tin query của PayOS (`status=PAID`, `cancel=true`…). Khi mount: `readPendingCheckout()` từ `localStorage` → nếu có, `router.replace(returnTo + ?quotation=<id>&payment=<paymentRequestId>)` để màn billing / tab Dịch vụ của công trình mở lại báo giá và **poll trạng thái thật** (`CheckoutPanel` nhận `resumePaymentId`). Nếu không có (storage bị chặn, máy khác) → cảnh báo "Không tìm thấy giao dịch đang dở" + link `/workspace/billing` (báo giá vẫn tìm lại được qua `listQuotationCheckouts`).

**API gọi:** Không gọi API trực tiếp (chỉ đọc `localStorage` key `fet3d:billing:pending-checkout:v1`).

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| – | – | `billing/pending-payment.ts:readPendingCheckout` | – | `PendingCheckout \| null` | – |

### /admin/commerce

**File:** `src/app/admin/commerce/page.tsx` → `src/features/billing/components/commerce-admin.tsx` (`CommerceAdmin`). Section: `admin-payments.tsx` (`PaymentsSection`), `admin-catalog.tsx` (`PackagesSection`, `DiscountsSection`), `admin-policies.tsx` (`PoliciesSection`), `admin-sales.tsx` (`QuotationsSection`), `admin-enterprise.tsx` (`EnterpriseAdminSection`), `admin-quota.tsx` (`AdminQuotaSection` dùng lại `AiQuotaView` với `organizationId`).

**Quyền truy cập:** Shell admin `[0]`; component kiểm tra lại `user.role === 0` ("Chỉ quản trị FET3D…").

**Logic xử lý:**
- **Tab (URL `?tab=`):** `payments` (mặc định) · `packages` · `policies` · `discounts` · `quotes` · `enterprise` · `quota`. Đổi tab xoá các tham số chọn (quotation/request/checkout/payment/page).
- **KPI đầu trang**: 3 lần `listLedger(pageSize 1)` để lấy `total`: số checkout 30 ngày (`from = now − 30 ngày`, ISO có `Z`), số request `Paid` 30 ngày, số checkout `NeedsReconcile`. Ô tìm nhanh "Mã lượt thanh toán" mở checkout theo id.
- **Thanh toán**: sổ cái `checkouts` / `requests` lọc theo tổ chức, báo giá, trạng thái, `[from,to)`; chi tiết đọc `getCheckout`, `getPayment`, `getQuotation`; nút "Đối soát" → `reconcile` (202, không đổi số tiền/chữ ký).
- **Gói dịch vụ**: tạo/sửa gói v7 (giá/tháng, 6 hoặc 12 tháng, `learnerLimit`, `aiQuotaUnits`, `aiPolicyVersionId`); sửa cần ETag (`getPackage` → `updatePackage` If-Match). Gói legacy/thiếu cấu hình có `isPurchasable = false`.
- **Chính sách quota**: phiên bản bất biến – chỉ tạo mới (`createQuotaPolicy`), không sửa.
- **Giảm giá**: CRUD có ETag; mốc thời gian gửi ISO có timezone.
- **Báo giá**: danh sách mọi tổ chức, phát hành (`issueQuotation` – thuế, điều khoản, `validUntil` tương lai, kỳ từng dòng; dòng Upgrade có `learnerLimit`, `oneTimePrice`, `additionalQuotaUnits`; top-up có `policyVersionId/quotaUnits/amount/startsAt/endsAt`), hủy phía admin, xem lịch sử checkout.
- **Liên hệ doanh nghiệp**: danh sách/chi tiết, đổi trạng thái/giao người (If-Match), trả lời (Idempotency-Key), đóng (lý do + If-Match + Idempotency-Key), tạo báo giá Draft cho tổ chức (`createEnterpriseQuotation`) → yêu cầu chuyển `Quoted`.
- **Quota AI theo tổ chức**: chọn tổ chức (`organizationsApi.list`) → số dư, grant, usage qua route admin.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/admin/payments/payos/checkouts` · `/requests` | `billingApi.listLedger(kind)` | `LedgerFilters` (organizationId, quotationId, status, from, to, page, pageSize) | `PageResponse<PayosLedgerItem>` | `PayosController.AdminCheckouts` / `AdminRequests` |
| POST | `/api/admin/payments/payos/checkouts/{id}/reconcile` | `billingApi.reconcile` | – | `void` (202) | `PayosController.Reconcile` |
| GET | `/api/payments/payos/checkouts/{id}`, `/api/payments/payos/requests/{id}` | `billingApi.getCheckout`, `getPayment` | – | `PayosCheckout`, `PayosPayment` | `PayosController.Checkout`, `Payment` |
| GET | `/api/billing/service-packages`, `/{id}` | `billingApi.listPackages`, `getPackage` | – | `ServicePackage[]`, `WithEtag<ServicePackage>` | `BillingController.Packages`, `Package` |
| POST | `/api/admin/service-packages` | `billingApi.createPackage` | `PackageInput` | `ServicePackage` | `BillingController.CreatePackage` |
| PATCH | `/api/admin/service-packages/{id}` | `billingApi.updatePackage` | `PackageInput` + If-Match | `ServicePackage` | `BillingController.UpdatePackage` |
| GET | `/api/admin/billing/quota-policies` | `billingApi.listQuotaPolicies` | page/pageSize | `PageResponse<QuotaPolicy>` | `BillingController.QuotaPolicies` |
| POST | `/api/admin/billing/quota-policies` | `billingApi.createQuotaPolicy` | `QuotaPolicyInput` | `QuotaPolicy` | `BillingController.CreateQuotaPolicy` |
| GET | `/api/admin/discount-rules`, `/{id}` | `billingApi.listDiscounts`, `getDiscount` | – | `DiscountRule[]`, `WithEtag<DiscountRule>` | `BillingController.Discounts`, `Discount` |
| POST / PATCH | `/api/admin/discount-rules`, `/{id}` | `billingApi.createDiscount`, `updateDiscount` | `DiscountInput` (+ If-Match) | `DiscountRule` | `BillingController.CreateDiscount`, `UpdateDiscount` |
| GET | `/api/billing/quotations`, `/{id}`, `/{id}/checkouts` | `billingApi.listQuotations`, `getQuotation`, `listQuotationCheckouts` | page/pageSize | như trên | `BillingController.Quotes/Quote`, `PayosController.QuotationCheckouts` |
| POST | `/api/admin/quotations/{id}/issue` | `billingApi.issueQuotation` | `IssueQuotationInput` + If-Match | `WithEtag<Quotation>` | `BillingController.Issue` |
| POST | `/api/admin/quotations/{id}/cancel` | `billingApi.cancelQuotation(scope="admin")` | `{reason}` + If-Match + Idempotency-Key | `WithEtag<Quotation>` | `BillingController.AdminCancel` |
| GET | `/api/admin/enterprise-quote-requests`, `/{id}`, `/{id}/responses` | `billingApi.listEnterpriseRequests/getEnterpriseRequest/listEnterpriseResponses(scope="admin")` | page/pageSize | `PageResponse<EnterpriseRequest>`, `WithEtag<EnterpriseRequest>`, `PageResponse<EnterpriseResponse>` | `BillingController.AdminEnterpriseRequests/AdminEnterpriseRequest/AdminEnterpriseResponses` |
| PATCH | `/api/admin/enterprise-quote-requests/{id}` | `billingApi.updateEnterpriseRequest` | `EnterpriseStatusInput` + If-Match | `WithEtag<EnterpriseRequest>` | `BillingController.AdminEnterpriseStatus` |
| POST | `/api/admin/enterprise-quote-requests/{id}/responses` | `billingApi.addEnterpriseResponse` | `{message}` + Idempotency-Key | `EnterpriseResponse` | `BillingController.AdminEnterpriseRespond` |
| POST | `/api/admin/enterprise-quote-requests/{id}/close` | `billingApi.closeEnterpriseRequest` | `{reason}` + If-Match + Idempotency-Key | `WithEtag<EnterpriseRequest>` | `BillingController.AdminEnterpriseClose` |
| POST | `/api/admin/enterprise-quote-requests/{id}/quotations` | `billingApi.createEnterpriseQuotation` | `{items: QuotationItemInput[]}` + Idempotency-Key | `WithEtag<Quotation>` | `BillingController.AdminEnterpriseQuotation` |
| GET | `/api/billing/entitlements` | `billingApi.listEntitlements` | `{organizationId, buildingId}` | `PageResponse<Entitlement>` | `PayosController.Entitlements` |
| GET | `/api/admin/organizations/{orgId}/ai-quota`, `/ai-quota/grants`, `/ai-usage` | `billingApi.getAiQuota/listAiGrants/listAiUsage(organizationId)` | page/pageSize | `AiQuotaBalance`, `PageResponse<AiQuotaGrant>`, `PageResponse<AiUsageEntry>` | `BillingController` (route admin, dòng 201–211) |
| GET | `/api/organizations`, `/api/buildings` | `organizations/api.ts:organizationsApi.list`, `buildingsApi.list` | filters | (feature khác) | `OrganizationsController`, `BuildingsController` |

### /workspace/analytics

**File:** `src/app/workspace/analytics/page.tsx` → `src/features/analytics/components/analytics-workspace.tsx` (`AnalyticsWorkspace variant="organization"`). Thành phần: `range.tsx` (`useAnalyticsRange`, `RangeBar`, `PeriodMeta`, `RangeError`), `report-shell.tsx`, `training-report.tsx`, `operations-report.tsx`, `charts.tsx`; parse: `parse.ts`; helper ngày: `src/utils/date-range.ts`.

**Quyền truy cập:** Shell `[0, 1]`; component yêu cầu đúng `role === 1` (variant `organization`), ngược lại "Báo cáo này dành cho tài khoản tổ chức". (Cùng component được dùng cho `platform` và `admin-organization` với role 0.)

**Logic xử lý:**
- **Tab:** `training` (Huấn luyện, mặc định) · `operations` (Vận hành). Platform có thêm `revenue`. Chỉ tab đang mở mới fetch.
- **Khoảng thời gian (report ranges):** nằm trên URL `?from=YYYY-MM-DD&to=YYYY-MM-DD` (ngày UTC, bao gồm). Preset 7/30/90 ngày; `buildRange()` kiểm tra thiếu một đầu, đảo ngược, > 90 ngày → báo lỗi tại form/`RangeError` và **không gọi API**. Không có range → server mặc định 30 ngày. Gửi `from`/`to` dạng ISO UTC `[from, to)`. `PeriodMeta` hiển thị khoảng và `asOf` do **server** trả về.
- **Tenant** do route + session quyết định (`/api/organizations/me/...`); FE không gửi organizationId cho chính mình. Bộ lọc `buildingId`/`scenarioId`/`groupBy` (day/week/month/building/scenario) tuỳ chọn; có `groupBy` thì server trả `cohorts`. Có export CSV (`exportTraining`, 422 > 10000 dòng, 429 > 10 lần/ngày).
- **Parsing:** response đọc là `unknown` rồi `parseTraining` / `parseOperations` / `parseRevenue` chuẩn hoá phòng thủ: thiếu `plays`/`uniqueTrainees` → ném lỗi (không hiển thị số 0 giả); tỉ lệ/trung bình không có mẫu giữ `null` (khác 0%); `outcomes` luôn đủ 4 khoá; operations chấp nhận tên cũ `ifcJobs` và dạng `{key,count}` cũ của buildings.
- `ReportShell` hiển thị skeleton/lỗi/thử lại; `useAsyncData(..., { keepWhenDenied: true })`.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/organizations/me/analytics/training` | `analytics/api.ts:analyticsApi.training(scope organization)` | `from`, `to`, `buildingId?`, `scenarioId?`, `groupBy?` | `TrainingReport` (qua `parseTraining`) | `LearnerAnalyticsController.Organization` |
| GET | `/api/organizations/me/analytics/training/export` | `analyticsApi.exportTraining` | như trên | `string` (CSV) | `LearnerAnalyticsController.ExportOrganization` |
| GET | `/api/organizations/me/analytics/operations` | `analyticsApi.operations(scope organization)` | `from`, `to` | `OperationsReport` (qua `parseOperations`) | `OperationsAnalyticsController.Organization` |
| GET | `/api/admin/analytics/revenue` | `analyticsApi.revenue` (chỉ variant platform) | `from`, `to` | `RevenueReport` | `LearnerAnalyticsController.Revenue` |

### /workspace/library

**File:** `src/app/workspace/library/page.tsx` → `src/features/library/components/library-browser.tsx` (`LibraryBrowser`, `ItemDrawer`), `version-preview.tsx` (`VersionPreview`). Luồng áp dụng: `src/features/library/apply.ts` + `payload.ts`, dùng trong `features/scenario-editor/panels/v1/v1-library-panel.tsx`.

**Quyền truy cập:** Shell `[0, 1]`; danh sách chỉ fetch khi `role 0 | 1`. 403 → "Không có quyền xem thư viện" (`describeLibraryError`).

**Logic xử lý:**
- Organization chỉ thấy item **đang active và có phiên bản Published**, chỉ phiên bản Published. Lọc theo loại (`?kind=` ∈ `ScenarioTemplate | RubricSample | Equipment | StylePreset | ColorScheme`, SubTabs có đếm). Hai loại style (Bộ vật liệu, Bảng màu) chỉ để xem; chúng được chọn theo bản IFC (`PUT /api/revisions/{id}/style`), nên không có nút "Dùng làm mẫu" và trình soạn kịch bản chỉ đưa ra 3 loại nội dung kịch bản (`SCENARIO_LIBRARY_KINDS`), tìm theo mã/tên (`?q=`) và lọc theo năng lực runtime (`?cap=`, "Không có yêu cầu") – hai bộ lọc sau chạy **phía client trên trang đã tải** (có thông báo "Máy chủ chưa lọc…"). Phân trang 20.
- `?item=<uuid>` (kiểm UUID) mở hộp thoại: `getItem` → `VersionPreview` của `latestPublished` (template: các trường phi không gian + rubric; rubric mẫu: bảng tiêu chí; thiết bị: thuộc tính + cảnh báo "không thêm năng lực runtime"; bộ vật liệu: loại công trình, từ khóa, bảng vật liệu sàn/tường/trần theo loại phòng, bảng màu mặc định; bảng màu: 4 màu `#RRGGBB` có ô màu; `requiredCapabilities`, `payloadHash`). "Dùng làm mẫu" mở `UseSampleDialog` chọn công trình + kịch bản rồi mở editor với `?useSample=<kind>:<itemId>`. 404 → "Mẫu không còn khả dụng".
- **Luồng áp dụng (apply flow)**: trang này chỉ xem. Áp dụng thực hiện trong trình soạn kịch bản: `planApply(version, draft, context)` (thuần, không ghi) tạo các nhóm trường với trạng thái `new | same | different` và hành động `fill | replace | merge | keep` (mặc định `keep` nếu trường đã có nội dung, không ghi đè ngầm); template chỉ điền trường phi không gian của `fet3d.editor/1`, rubric sample điền `rubric` (hợp nhất tiêu chí, cảnh báo metric/schema_version không có trong catalog), equipment chỉ gán `label` và năng lực nếu runtime catalog của bản nháp công bố. `changesFor()` → một lệnh undo được (`setFieldsCommand`). Bản sao: cập nhật mẫu sau này không đổi kịch bản đã soạn.
- Response đọc `unknown` → `parseItem`/`parseVersion` phòng thủ; sai cấu trúc → `ApiError` 502 `LIBRARY_ITEM_MALFORMED` / `LIBRARY_VERSION_MALFORMED`.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/library/items?kind&page&pageSize` | `library/api.ts:libraryApi.listItems` | `{kind?, page, pageSize}` | `Page<LibraryItem>` (qua `parsePage(parseItem)`) | `ContentController` (`LibraryItems`, dòng 237) |
| GET | `/api/library/items/{id}` | `libraryApi.getItem` | – | `LibraryItem` (có `latestPublished`) | `ContentController` (dòng 244) |
| GET | `/api/library/versions/{id}` | `libraryApi.getVersion` (dùng trong editor) | – | `LibraryVersion` | `ContentController` (dòng 250) |

### /workspace/support

**File:** `src/app/workspace/support/page.tsx` → `src/features/support/components/organization-support.tsx` (`OrganizationSupport`, `SupportTabs`, `TicketsTab`, `FeedbackTab`, `UserTicketPanel`, `CreateTicketForm`, `CreateFeedbackForm`), `ticket-thread.tsx` (`useTicketDetail`, `MessageList`, `MessageComposer`, `errorText`), `labels.ts`.

**Quyền truy cập:** Shell `[0, 1]`; component chỉ cho `role === 1`. PlatformAdmin được gợi ý link `/admin/support`, Trainee (role 2) link sang hub học viên.

**Logic xử lý:**
- **Tab:** `tickets` (Yêu cầu hỗ trợ, mặc định) · `feedback` (Phản hồi). URL: `tab`, `status`, `page`, `ticket`.
- **Danh sách ticket**: lọc trạng thái (Open/InProgress/Resolved/Closed), phân trang 20; chỉ ticket do chính người dùng tạo.
- **Tạo ticket**: validate subject 1–255, description 1–10 000; `Idempotency-Key` theo payload (thử lại không tạo trùng); lỗi field từ `ApiError.fieldErrors`. Tạo xong mở drawer ticket mới.
- **Luồng trao đổi (ticket thread)**: `useTicketDetail` tải ticket + **toàn bộ** tin nhắn: trang 1 (pageSize 100), rồi tải tiếp tới khi đủ `messages.total` (tối đa 10 trang); ETag `"support-<revision>"`. Tin nhắn của mình hiển thị "Bạn", của người khác lấy `author.displayName`. Gửi tin: `MessageComposer` (≤ 10 000 ký tự, Idempotency-Key cho mỗi ý định gửi) rồi reload; ticket `Closed` khoá ô nhập.
- **Phản hồi**: danh sách theo trạng thái (Submitted/Reviewed/Closed); form category 1–100, message 1–10 000, rating 1–5 tuỳ chọn, Idempotency-Key.
- **Lỗi** (`errorText`): 401 hết phiên, 403, 404, 429 (dùng `Retry-After`), `TICKET_CLOSED`, `IDEMPOTENCY_KEY_CONFLICT`, 4xx khác dùng message server.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/support/tickets?page&pageSize&status` | `support/api.ts:supportApi.listTickets("user")` | `SupportFilters` | `SupportTicketPage` (có `counts`) | `SupportController.ListTickets` |
| GET | `/api/support/tickets/{id}?page&pageSize` | `supportApi.getTicket("user")` | phân trang tin nhắn | `TicketWithEtag {ticket: Ticket, etag}` | `SupportController.GetTicket` |
| POST | `/api/support/tickets` | `supportApi.createTicket` | `CreateTicketInput` + Idempotency-Key | `Ticket` (201) | `SupportController.CreateTicket` |
| POST | `/api/support/tickets/{id}/messages` | `supportApi.addMessage("user")` | `{message}` + Idempotency-Key | `SupportMessage` (201) | `SupportController.AddMessage` |
| GET | `/api/feedback?page&pageSize&status` | `supportApi.listFeedback("user")` | `SupportFilters` | `SupportPage<Feedback>` | `SupportController.ListFeedback` |
| POST | `/api/feedback` | `supportApi.createFeedback` | `CreateFeedbackInput` + Idempotency-Key | `Feedback` (201) | `SupportController.CreateFeedback` |

### /workspace/ai

**File:** `src/app/workspace/ai/page.tsx` → `src/features/org-ai/components/organization-ai.tsx` (`OrganizationAi`). Tab: `history-tab.tsx` (`HistoryTab variant="history" | "saved"`), `ai-side-rail.tsx` (`AiQuotaCard`). Chi tiết yêu cầu: `request-panel.tsx`, `request-view.tsx`. Áp dụng đề xuất: `apply-target-dialog.tsx` → editor (`ai-proposal-apply.tsx`, `apply-plan.ts`). Chat (hỏi đáp / đề xuất kịch bản) nằm ở bong bóng nổi `src/features/org-ai/floating/*` (`AiBubbleProvider`, `AiChatPanel`, `chat-message.tsx`) dùng hook `use-ai-submit.ts`.

**Quyền truy cập:** Shell `[0, 1]`; component chỉ cho `role === 1` (OrganizationUser). Mọi gọi đi qua .NET API, không gọi FastAPI.

**Logic xử lý:**
- **Tab (URL `?tab=`):** `history` (Lịch sử hội thoại, mặc định – có KPI quota + số yêu cầu `NeedsReconcile`, lọc status/resultType/operation/mine, phân trang) · `saved` (Đề xuất đã lưu = `status=Succeeded`, `operation=ScenarioDraft`, `resultType=ScenarioDraft`) · `quota` (Hạn mức & giới hạn: `getAiQuota` + `limits`). Đổi tab xoá `page, request, status, resultType, operation, mine`. Giá trị lọc trên URL được kiểm whitelist (`urlFilter`, `urlId`) để không gửi giá trị BE trả 400.
- **Gửi câu hỏi / đề xuất (AI ask) – `useAiSubmit`**: (1) đọc `GET /api/ai/organization/limits` trước mỗi lần gửi; `policyActive=false` hoặc `canSubmit=false` (số dư < `estimatedReserve`) → **không gửi** (phase `blocked`); kiểm tra độ dài ≤ `maxInputChars`, số nguồn ≤ `maxSources`. (2) POST với một `Idempotency-Key` cho mỗi payload; timeout 30 s hoặc mất phản hồi → phase `unknown` (không coi là lỗi, không tạo yêu cầu mới); "Thử lại" replay cùng key (bỏ qua bước quota vì có thể đã giữ chỗ); "Xem yêu cầu gần đây" tìm trong `GET /api/ai/requests?mine=true&operation&pageSize=5` các yêu cầu tạo sau thời điểm gửi −60 s và trùng `input.text`. (3) Có `requestId` → `?request=<id>`; câu trả lời muộn của lần thử cũ bị bỏ (`run` token).
- **Theo dõi (`RequestPanel`)**: poll `GET /api/ai/requests/{id}` khi status `Accepted/Processing` (lùi khi lỗi, `Retry-After`, dừng khi tab ẩn); 401/403/404 xoá nội dung đã hiển thị. `RequestView` hiện câu trả lời, trích dẫn (resolve theo nguồn đã ghim), số đơn vị giữ chỗ/đã tính, `InsufficientEvidence`/`RejectedBySafetyGate`.
- **Quota AI**: đơn vị quota do server quy định, không quy đổi; link "Hạn mức AI & nạp thêm" → `/workspace/billing?tab=ai`.
- **Áp dụng đề xuất**: `ApplyTargetDialog` chọn công trình + kịch bản rồi `router.push(/workspace/buildings/{b}/scenarios/{s}?aiRequest=<requestId>)`; editor tải lại đề xuất từ server, xem trước, xác nhận → một bước undo, chưa lưu.
- **Lỗi**: `aiErrorText`, `fieldIssue` (lỗi `$.question`/`$.prompt` từ `issues`), `isUnknownOutcome`.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/ai/organization/sources` | `org-ai/api.ts:orgAiApi.sources` | – | `AiSourceList` | `OrganizationAiController.Sources` |
| GET | `/api/ai/organization/limits` | `orgAiApi.limits` | – | `AiLimits` | `OrganizationAiController.Limits` |
| POST | `/api/ai/organization/answer` | `orgAiApi.submitAnswer` | `AnswerInput {question, sources?}` + Idempotency-Key | `AiRequest` (202) | `OrganizationAiController.Answer` |
| POST | `/api/ai/organization/scenario-draft` | `orgAiApi.submitScenarioDraft` | `ScenarioDraftInput {buildingId, prompt, sources?, revisionId?}` + Idempotency-Key | `AiRequest` (202) | `OrganizationAiController.ScenarioDraft` |
| GET | `/api/ai/requests?status&resultType&operation&mine&page&pageSize` | `orgAiApi.listRequests` | `AiRequestFilters` | `AiRequestPage` | `OrganizationAiController.List` |
| GET | `/api/ai/requests/{requestId}` | `orgAiApi.getRequest` | – | `AiRequest` | `OrganizationAiController.Get` |
| GET | `/api/organizations/me/ai-quota` | `billingApi.getAiQuota` | – | `AiQuotaBalance` | `BillingController.AiQuota` |
| GET | `/api/buildings`, `/api/buildings/{id}/scenarios`, `/api/buildings/{id}/revisions` | `buildingsApi.list/listScenarios/listRevisions` | phân trang | (feature buildings) | `BuildingsController`, `ScenariosController`, `RevisionsController` |

### /workspace/profile

**File:** `src/app/workspace/profile/page.tsx` → `src/features/organizations/components/organization-profile.tsx` (`OrganizationProfile`). (Hồ sơ cá nhân/mật khẩu/avatar ở trang `/account`, không thuộc trang này.)

**Quyền truy cập:** Shell `[0, 1]`; component chỉ cho `role === 1` (`allowed`).

**Logic xử lý:** Tải `GET /api/organizations/me` (kèm header) → form tên (bắt buộc), địa chỉ, số điện thoại; ETag lấy từ header `ETag` hoặc `"<profileRevision>"`. Lưu: `PATCH` với `If-Match`; chuỗi rỗng gửi `null`; nút lưu chỉ bật khi có thay đổi (hoặc đang ở trạng thái stale). 412 → báo dữ liệu đã đổi ở nơi khác, cho tải lại; cập nhật ETag mới từ response.

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/organizations/me` | `organizations/api.ts:organizationsApi.getMine` | – | `ApiResponse<OrganizationProfile>` | `OrganizationProfileController.Get` |
| PATCH | `/api/organizations/me` | `organizationsApi.updateMine` | `UpdateOrganizationProfileInput {name, address, phoneNumber}` + If-Match | `ApiResponse<OrganizationProfile>` | `OrganizationProfileController.Update` |

### /demo/rag

**File:** `src/app/demo/rag/page.tsx` (`RagPage`) → `src/features/rag/components/rag-console.tsx` (`RagConsole`), `src/features/rag/api.ts`.

**Quyền truy cập:** Công khai, không cần đăng nhập, không qua shell. Trong build production (`NODE_ENV === "production"`) trả `notFound()` → 404. Gọi **trực tiếp** FastAPI `env.ragApiUrl` (không qua .NET, không Bearer).

**Logic xử lý:** Chọn file `.txt/.md/.pdf` → `upload` ngay; nhập câu hỏi → `ask`. Một yêu cầu tại một thời điểm (`AbortController` trong `useRef`, huỷ khi unmount). Response `/chat` được kiểm cấu trúc (answer string, mỗi source có `document_name`, `chunk_index`, `content`) – sai → "Phản hồi tài liệu không đúng định dạng". Lỗi: `TypeError` → không kết nối được; `SyntaxError` → dữ liệu không hợp lệ; HTTP lỗi → `detail` của FastAPI (vd. 400 "Upload a document before asking questions.", 503 khi LLM lỗi). Hiển thị câu trả lời + danh sách nguồn (tên tài liệu, chunk).

**API gọi:**

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| POST | `{ragApiUrl}/documents` | `rag/api.ts:upload` | `multipart/form-data` field `file` | `DocumentIngestResponse {document_name, chunks_indexed}` (201) | FastAPI `ai/rag-api/app/legacy/routes.py:ingest_document` (không phải .NET) |
| POST | `{ragApiUrl}/chat` | `rag/api.ts:ask` | `ChatRequest {question, top_k?}` | `ChatResponse {answer, sources: Source[]}` | FastAPI `app/legacy/routes.py:chat` |

### Kiểm tra type API

| Endpoint | Type FE | Trạng thái | Ghi chú |
|---|---|---|---|
| `GET /api/billing/service-packages`, `/{id}`; `POST/PATCH /api/admin/service-packages` | `ServicePackage`, `PackageInput` | Đủ | Khớp `PackageResponse` / `PackageWriteRequest` (v7: learnerLimit, aiQuotaUnits, aiPolicyVersionId, pricingBasis, isPurchasable). |
| `GET/POST /api/admin/billing/quota-policies` | `QuotaPolicy`, `QuotaPolicyInput` | Đủ | Khớp. `GET /api/admin/billing/quota-policies/{id}` có ở BE nhưng FE chưa dùng. |
| `/api/admin/discount-rules*` | `DiscountRule`, `DiscountInput` | Đủ | `discountKind` FE thu hẹp `Percent \| Fixed` (BE là string). |
| `/api/billing/quotations*`, `/api/admin/quotations/{id}/issue\|cancel` | `Quotation`, `QuotationLine`, `TopUpLine`, `QuotationDraftInput`, `IssueQuotationInput`, `IssuePeriodInput`, `IssueTopUpInput` | Đủ | Khớp `QuotationResponse`, `QuotationLineResponse`, `TopUpLineResponse`, `QuotationWriteRequest`, `IssueQuotationRequest`. |
| `/api/billing|admin/enterprise-quote-requests*` | `EnterpriseRequest`, `EnterpriseRequestInput`, `EnterpriseStatusInput`, `EnterpriseResponse` | Đủ | Khớp `EnterpriseQuoteResponse`, `EnterpriseStatusRequest`, `EnterpriseResponseItem`. |
| `POST /api/payments/payos/create`, `GET .../checkouts/{id}`, `POST .../requests/{id}/cancel` | `PayosCheckout`, `CheckoutResult` | Đủ | Khớp `PayosCheckoutResponse`. |
| `GET /api/payments/payos/requests/{id}` | `PayosPayment`, `ProvisioningLine` | Đủ | Khớp `PayosPaymentResponse` / `ProvisioningLineResponse`. |
| `GET /api/admin/payments/payos/{checkouts,requests}`, `/api/billing/quotations/{id}/checkouts` | `PayosLedgerItem`, `LedgerFilters` | Đủ | Khớp `PayosLedgerItem`, `PayosLedgerQuery`. |
| `POST /api/admin/payments/payos/checkouts/{id}/reconcile` | `void` | Đủ | 202 không body. |
| `GET /api/billing/entitlements` | `Entitlement`, `EntitlementFilters` | Đủ | Khớp `EntitlementResponse`. |
| `GET /api/buildings/{id}/service-entitlement` | `BuildingServiceEntitlement`, `ServiceEntitlementView`, `EntitlementUpgrade` | Đủ | Khớp. |
| `/api/organizations/me/ai-quota*`, `/ai-usage` (+ route admin) | `AiQuotaBalance`, `AiQuotaUnitBalance`, `AiQuotaGrant`, `AiUsageEntry` | Đủ | Khớp. |
| `/api/organizations/me/notifications*` | `OrganizationNotification`, `NotificationFilters` | Đủ | Khớp `OrganizationNotificationResponse`, `NotificationQuery`. |
| `GET .../analytics/training` (3 scope) | `TrainingReport`, `TrainingFilters`, `TrainingCohort`, `TrainingDebriefRow`, `AiUsage` | Đã bổ sung | Bổ sung `abandoned`, `awaitingSync`, `debrief[]`, `byOrganization[].organizationName`, `aiUsage.resultTypes`, `aiUsage.byAudience` (BE `TrainingAnalyticsReport` / `AnalyticsAiUsage` có trả). Response đọc `unknown` rồi parse runtime (`parse.ts`). |
| `GET .../analytics/training/export` | `string` (CSV) | Đủ | |
| `GET .../analytics/operations` | `OperationsReport` | Đủ | Hợp nhất `PlatformOperations` / `OrganizationOperations` / `AdminOrganizationOperations`; parse runtime. |
| `GET /api/admin/analytics/revenue` | `RevenueReport` | Đủ | BE trả JSON từ SQL (không có record C#); khớp tài liệu learner-analytics.md. |
| `/api/library/items`, `/items/{id}`, `/versions/{id}` | `LibraryItem`, `LibraryVersion`, `LibraryVersionRef`, `Page<T>` | Đủ | BE trả raw JSON; FE parse phòng thủ (`parseItem`/`parseVersion`). `payload` là `JsonObject`. |
| `/api/library/*`, `/api/admin/library/*` – trường `kind` | `LibraryKind` = `SCENARIO_LIBRARY_KINDS` + `STYLE_LIBRARY_KINDS`; `StylePresetPayload`, `ColorSchemePayload` | Đã bổ sung | BE cho phép 5 loại (CHECK trong `RevisionStyle.sql`, docs/revision-style.md); FE trước chỉ khai 3 nên `parseItem`/`parseVersion` (qua `isKind`) loại bỏ im lặng `StylePreset`/`ColorScheme`. Nay giữ lại, có nhãn/gợi ý, xem trước riêng; payload type re-export từ `features/buildings/ifc-types.ts` (không nhân bản). |
| `GET/POST /api/support/tickets`, `/api/admin/support/tickets` | `SupportTicketPage`, `SupportTicketStatusCounts`, `Ticket`, `CreateTicketInput` | Đã bổ sung | Thêm `counts` (BE `SupportTicketPage`) và `listTickets` trả `SupportTicketPage`; `CreateTicketInput` thêm `feedbackId?`, `sessionId?`. |
| `GET /api/support/tickets/{id}`, `POST .../messages` | `Ticket`, `SupportMessage`, `SupportPerson`, `SupportOrganization` | Đủ | |
| `GET/POST /api/feedback` | `Feedback`, `CreateFeedbackInput` | Đã bổ sung | `CreateFeedbackInput` thêm `sessionId?`. |
| `PATCH /api/admin/support/tickets/{id}`, `PATCH /api/admin/feedback/{id}/status` | `AdminTicketUpdate`, `AdminFeedbackUpdate` | Đã bổ sung | Thêm `reason?` (chỉ ghi audit); `updateFeedbackStatus` nhận `reason?` tuỳ chọn. |
| `GET /api/admin/audit-logs*` | `AuditLog`, `AuditDetail`, `AuditFilters`, `AuditPage` | Đã bổ sung | `AuditLog.actorType?`, `AuditFilters.targetEntity?`. `AuditFieldChange.before/after` để `unknown` (BE `object?`). |
| `GET /api/ai/organization/sources`, `/limits` | `AiSourceList`, `AiLimits`, `AiOperationLimit` | Đủ | |
| `POST /api/ai/organization/answer`, `/scenario-draft` | `AnswerInput`, `ScenarioDraftInput` → `AiRequest` | Đủ | |
| `GET /api/ai/requests`, `/{id}` (+ trainee, admin) | `AiRequest`, `AiRequestPage` | Đã bổ sung | `consumedUnits` → `number \| null` (BE `int?`, SQL trả `null` khi chưa chốt; đã sửa 3 chỗ so sánh `!== undefined` → `!= null`), `completedAt`/`reconcileRequestedAt` → `string \| null`, thêm `technicalUsage?` (admin). `providerResult`/`technicalUsage` giữ `unknown` vì BE là `JsonElement` tuỳ ý. |
| `POST /api/admin/ai/policies/{id}/end` | `EndAiPolicyInput` → `AiPolicy` | Đã bổ sung | Thêm `EndAiPolicyInput` (gắn vào `adminAiApi.endPolicy`) và `AiPolicy.cancelled?`. |
| `GET/POST /api/admin/ai/policies`, `/api/admin/knowledge-sources*`, `/api/ai/trainee/*` | `AiPolicy`, `CreateAiPolicyInput`, `KnowledgeSource*`, `TraineeAiQuota`, `TraineeAnswerInput` | Đủ | |
| `GET/PATCH /api/organizations/me` | `OrganizationProfile`, `UpdateOrganizationProfileInput` | Đủ | Khớp `OrganizationProfileResponse` (feature `organizations`, ngoài phạm vi sửa). |
| FastAPI `POST /chat` | `ChatRequest`, `ChatResponse`, `Source` | Đã bổ sung | `Source` thêm `source_id?`, `version?`; thêm `ChatRequest` (`top_k?`). |
| FastAPI `POST /documents` | `DocumentIngestResponse` | Đã bổ sung | Trước là `unknown`; nay `upload()` trả `Promise<DocumentIngestResponse>`. |
| Phân trang dùng chung | `BillingPageResponse<T>` → `PageResponse<T>` (`src/api/types/common.ts`) | Đủ | Không cần đổi `common.ts`. |

---

## Nhóm: IFC – Quét mô hình & Thư viện đồ

Hệ thống có **hai cách đọc IFC hoàn toàn tách biệt**:

1. **Quét cục bộ trong trình duyệt** (`/workspace/ifc`, `/demo/ifc`): dùng `web-ifc` 0.0.68 (WASM) + three.js. Không gọi API, tệp không rời máy người dùng. Mục đích: xem nhanh mô hình, kiểm tra cấu trúc tầng, đếm điểm neo cho kịch bản thoát nạn.
2. **Xử lý phía máy chủ** (tab **IFC** trong `/workspace/buildings/[id]`): tải tệp lên S3 qua URL ký sẵn → backend tạo processing job `Geometry` → worker (IFC/Blender) dựng GLB + `building_metadata` → kiểm tra QA → revision chuyển `ReadyForScenario`/`NeedsFix` → người dùng xác nhận thiết bị phát hiện từ IFC → xác nhận sẵn sàng huấn luyện. Đây là con đường duy nhất tạo mô hình dùng cho kịch bản.

Vai trò (`UserRole`): `0` = PlatformAdmin, `1` = OrganizationUser, `2` = Trainee.

---

### /workspace/ifc

**File**: `src/app/workspace/ifc/page.tsx` → `src/features/ifc-scan/components/organization-ifc-client.tsx` → (dynamic import, `ssr:false`) `ifc-scan-workspace.tsx` → `ifc-viewer.tsx`; logic: `ifc-loader.ts`, `scan-suggestions.ts`, `dispose.ts`, `types.ts`, `organization-access.ts`. Layout: `src/app/workspace/layout.tsx` (`OperationsShell areaId="organization"`).

**Quyền truy cập**:
- `OperationsShell` khu vực organization cho phép role `[0, 1]` (`layouts/nav-config.ts`); menu “Quét mô hình IFC” ở nhóm “Công cụ”.
- `resolveOrganizationIfcAccess` (`organization-access.ts`): chưa sẵn sàng → `loading`; chưa đăng nhập → `sign-in` (nút đăng nhập với `?next=/workspace/ifc`); role `2` (Trainee) → `denied`; còn lại → `granted`.
- `auth/redirect.ts`: `/workspace/*` là route của role 1; `/workspace/ifc` có trong danh sách `next` hợp lệ.

**Logic xử lý**:
- Render `IfcScanWorkspace embedded` (eyebrow “Công cụ”, tiêu đề “Quét mô hình IFC”). Ở chế độ `embedded` có thêm khung “Bước tiếp theo” hướng dẫn tải IFC lên công trình (link `/workspace/buildings`).
- Chọn tệp bằng input `accept=".ifc"` hoặc kéo-thả; kiểm tra đuôi `.ifc` và `size > 0`.
- `loadIfcFile(file, onProgress)` (import động) → tiến độ 3 pha: `parse` (Đang đọc cấu trúc IFC), `geometry` (Đang dựng mô hình 3D), `edges` (Đang dựng nét viền).
- Kết quả: danh sách tầng, lớp hiển thị theo `IfcCategory`, thuộc tính phần tử được chọn (GlobalId, tên, kiểu, tầng, kích thước), kết quả quét + gợi ý kịch bản “Thoát nạn cơ bản”.
- Công cụ viewer: góc nhìn 3D/trên xuống/mặt đứng, mặt cắt ngang (mặc định cao độ sàn tầng + 1,2 m), X-quang, nét viền, đổi màu theo loại/màu IFC, toàn màn hình, phím `F` (focus) và `Esc` (bỏ chọn).
- Model cũ được `dispose()` khi mở tệp mới hoặc unmount.

**API gọi**: không có (xử lý 100% trong trình duyệt).

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET (static) | `/ifc/web-ifc.wasm` | `IfcAPI.SetWasmPath("/ifc/", true)` + `Init()` | — | WASM binary | (tệp tĩnh `public/ifc`, không phải BE) |

### /demo/ifc

**File**: `src/app/demo/ifc/page.tsx` (bọc `SiteHeader`/`SiteFooter`) → `src/features/ifc-scan/components/ifc-demo-client.tsx` → `IfcScanWorkspace` (không `embedded`).

**Quyền truy cập**: công khai (không cần đăng nhập, không gate role).

**Logic xử lý**: giống `/workspace/ifc` nhưng tiêu đề mặc định “IFC / local prototype”, không có khung “Bước tiếp theo”. Tệp chỉ xử lý trong trình duyệt (“File chỉ được xử lý trong trình duyệt này”).

**API gọi**: không có.

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET (static) | `/ifc/web-ifc.wasm` | `IfcAPI.Init()` | — | WASM | — |

### /workspace/buildings/[id] – các phần IFC

**File**: `src/app/workspace/buildings/[id]/page.tsx` (`generateStaticParams()` trả `[]`, dữ liệu tải ở client) → `src/features/buildings/components/building-detail-workspace.tsx`.
Các thành phần IFC: `ifc-upload-modal.tsx` (thay `ifc-upload-panel.tsx` cũ), `processing-status-panel.tsx`, `pipeline-progress.tsx`, `confirm-training-panel.tsx`, `preview-panel.tsx` + `runtime-preview-viewer.tsx`, `equipment-panel.tsx`, `revision-details-panel.tsx`, `annotations-panel.tsx`, `journey-overview.tsx` (tab Hành trình, bước “IFC”). Logic: `ifc-upload.ts`, `use-ifc-upload-flow.ts`, `sha256.ts`, `use-processing-actions.tsx`, `pipeline.ts`, `qa-codes.ts`, `bim-facts.ts`, `runtime-preview.ts`, `building-journey.ts`, `types.ts`, `ifc-types.ts` (mới).

**Quyền truy cập**: role 0, 1 (OperationsShell). BE: các controller IFC `[Authorize(Roles="OrganizationUser,PlatformAdmin")]`, tenant được kiểm tra qua Building (công trình tổ chức khác → 404). `RevisionsController`, `EditorPreviewController` chỉ `[Authorize]` nhưng handler vẫn kiểm tra tenant.

**Cấu trúc tab** (URL `?tab=`): `journey` (Hành trình), `ifc` (IFC), `scenarios`, `access` (Truy cập: quyền + QR), `services`. Tab **IFC** có sub-tab `?sub=`: `progress` (Tiến trình), `preview` (Xem trước 3D), `equipment` (Thiết bị), `technical` (Kỹ thuật), `annotations` (Ghi chú). `?revision=<id>` chọn revision (mặc định revision đầu danh sách). `?upload=1` mở modal tải IFC. Nút “Tải IFC” mở `IfcUploadModal`.

**Logic xử lý**:
1. **Tải IFC (modal)** – `useIfcUploadFlow` + `uploadIfcRevision`: stepper `Chọn tệp → Kiểm tra → Tải lên → Xác nhận → Xử lý` (chi tiết ở “Các cách quét IFC – B”).
2. **Polling job** (`usePolling` trong detail workspace): `listProcessingJobs` → job mới nhất → `getJob`; nếu `Running` đọc thêm `listProcessingLogs` (bước hiện tại); nếu `Succeeded` đọc `getJobQa` và, khi revision còn `Uploaded/Processing`, đọc lại `getRevision` (tối đa `MAX_SETTLE_POLLS = 20` lần). Dừng khi job kết thúc và revision ổn định. Khi job chuyển sang trạng thái kết thúc → reload danh sách revision.
3. **Issue**: `listIssues(page 1, 100)` khi ở tab `ifc`/`journey`; chỉ issue `isCurrentAttempt` dùng cho verdict.
4. **Tiến trình** (`derivePipelineProgress`): 6 bước `upload → quarantine → geometry → qa → (exit nếu có IFC_EXIT_UNKNOWN) → ready` + “Việc tiếp theo” với các action `upload | process | retry | refresh | issues | exit | author | latest`.
5. **Chạy/chạy lại xử lý** (`useProcessingActions`): `processRevision` (Idempotency-Key) và `retryJob` (chỉ khi job `Failed`, cần lý do 1–1000 ký tự, `requestId` UUID ổn định).
6. **Xác nhận sẵn sàng huấn luyện** (`ConfirmTrainingPanel`): chỉ mở khi verdict QA `passed`, chưa `ConfirmedForTraining` và có phiên bản kịch bản trên revision này. Lấy các scenario → versions có `revisionId` trùng; chọn validation run Passed (`pickPassedRun`) rồi gọi `confirmForTraining`.
7. **Preview 3D** (`PreviewPanel`): poll `getPreview` mỗi 5 s, tối đa 24 lần khi `NotReady`; `ReprocessRequired` → yêu cầu tải IFC mới; `Ready` + `hasRuntimePreview` → `RuntimePreviewViewer` tải GLB bằng `GLTFLoader` từ `downloadUrl` (5 phút), tự xin URL mới 1 lần khi tải lỗi; đánh dấu cấu kiện theo `ifcGlobalIds` qua `semanticMapping` (`ifcGlobalId → nodeId`).
8. **Thiết bị phát hiện từ IFC** (`EquipmentPanel`): đọc candidates (ETag) + runtime catalog (`/api/scenario-interactions/catalog`, lấy capability có `objectKinds` chứa `Equipment`); Xác nhận / Đổi loại / Loại bỏ / “Làm cửa thoát” (`door.exit` cho `IfcDoor`), “Dùng gợi ý” từ revision trước; lưu một lần bằng PATCH + If-Match; 412 → tải lại và giữ lựa chọn chưa lưu.
9. **Kỹ thuật** (`RevisionDetailsPanel`, ChipTabs): `issues` (Vấn đề, lọc mức độ, “Đánh dấu trong preview”, hành động theo `qaGuide`), `logs` (Nhật ký), `artifacts` (Tệp đã xử lý), `facts` (Thông tin BIM, phân trang 20).
10. **Ghi chú** (`AnnotationsPanel`): nhãn/ghi chú theo `ifcGlobalId`, PUT với If-Match `"<version>"`.

**API gọi**:

| Method | Endpoint | Hàm FE | Request | Response type | BE controller |
|---|---|---|---|---|---|
| GET | `/api/buildings/{id}/revisions?page&pageSize` | `buildingsApi.listRevisions` | query | `RevisionPage` = `PageResponse<BuildingRevision>` | `BuildingsController` |
| GET | `/api/revisions/{id}` | `buildingsApi.getRevision` | — | `BuildingRevision` | `RevisionsController.GetRevision` |
| POST | `/api/buildings/{id}/revisions/upload-url` (alias: `/api/buildings/{id}/ifc`) | `buildingsApi.initiateUpload` | `InitiateIfcUploadInput` + header `Idempotency-Key` (bắt buộc) | `InitiatedIfcUpload` (201) | `BuildingsController.GetUploadUrl` / `IfcCommandsController.InitiateUpload` |
| PUT | `uploadUrl` (S3 ký sẵn) | `putIfcObjectWithProgress` (XHR) | body = tệp, `Content-Type: application/octet-stream`, không Authorization | 2xx | S3 (không qua BE) |
| POST | `/api/revisions/{id}/upload-complete` | `buildingsApi.finalizeUpload` | `FinalizeIfcUploadInput` | `void` (204) | `IfcCommandsController.FinalizeUpload` |
| POST | `/api/revisions/{id}/process` | `buildingsApi.processRevision` | header `Idempotency-Key` (bắt buộc), không body | `ProcessRevisionResult` `{jobId}` (202) | `IfcCommandsController.ProcessRevision` |
| GET | `/api/revisions/{id}/processing-jobs?page&pageSize` | `buildingsApi.listProcessingJobs` | query | `ProcessingJobPage` | `IfcQueriesController.ListJobs` |
| GET | `/api/processing-jobs/{jobId}` | `buildingsApi.getJob` | — | `ProcessingJobDetail` | `IfcQueriesController.GetJob` |
| GET | `/api/processing-jobs/{jobId}/qa?page&pageSize` | `buildingsApi.getJobQa` | query | `JobQa` | `IfcQueriesController.GetJobQa` |
| POST | `/api/processing-jobs/{jobId}/retry` | `buildingsApi.retryJob` | `{requestId, reason}` (`RetryJobInput`) | `RetryJobResult` `{jobId, outcome}` (202) | `IfcCommandsController.RetryJob` |
| GET | `/api/revisions/{id}/processing-logs?page&pageSize` | `buildingsApi.listProcessingLogs` | query | `ProcessingLogPage` | `IfcQueriesController.ListProcessingLogs` |
| GET | `/api/revisions/{id}/issues?page&pageSize` | `buildingsApi.listIssues` | query | `RevisionIssuePage` | `IfcQueriesController.ListRevisionIssues` |
| GET | `/api/revisions/{id}/artifacts?page&pageSize` | `buildingsApi.listArtifacts` | query | `RevisionArtifactPage` | `IfcQueriesController.ListRevisionArtifacts` |
| GET | `/api/revisions/{id}/bim-facts?page&pageSize` | `buildingsApi.listBimFacts` | query | `BimFactPage` | `IfcQueriesController.ListBimFacts` |
| GET | `/api/buildings/{id}/editor-preview?revisionId` | `buildingsApi.getPreview` | query | `EditorPreview` | `EditorPreviewController.Get` |
| GET | `/api/revisions/{id}/equipment-candidates` | `buildingsApi.getEquipmentCandidates` | — | `VersionedBuilding<EquipmentCandidates>` (data + ETag) | `EquipmentCandidatesController.Get` |
| PATCH | `/api/revisions/{id}/equipment-decisions` | `buildingsApi.saveEquipmentDecisions` | `{items: EquipmentDecisionInput[]}` + `If-Match` | `VersionedBuilding<EquipmentCandidates>` | `EquipmentCandidatesController.Save` |
| GET | `/api/scenario-interactions/catalog` | `scenarioEditorApi.catalog` | — | `RuntimeCatalogEntry[]` | (ScenarioInteractions controller, ngoài nhóm IFC) |
| GET/PUT | `/api/revisions/{id}/annotations` | `buildingsApi.getAnnotations` / `saveAnnotations` | PUT `{items}` + `If-Match "<version>"` | `AnnotationSnapshot` | (Annotations controller) |
| POST | `/api/revisions/{id}/confirm-for-training` | `buildingsApi.confirmForTraining` | `ConfirmTrainingInput` `{scenarioVersionId, validationRunId, annotationSetId?}` | `{reviewId}` (`ConfirmTrainingResult`) | `IfcCommandsController.ConfirmForTraining` |
| GET | `/api/buildings/{id}/scenarios`, `/api/scenarios/{id}/versions` | `buildingsApi.listScenarios` / `listScenarioVersions` | query | `PageResponse<ScenarioSummary>` / `ScenarioVersionPage` | Scenarios controllers |

---

### Các cách quét IFC

#### A. Quét cục bộ bằng web-ifc trong trình duyệt (`src/features/ifc-scan`)

**1. Chuẩn bị WASM**
- Script `scripts/copy-ifc-wasm.mjs` (chạy bằng `pnpm ifc:wasm`): kiểm tra `node_modules/web-ifc/web-ifc.wasm` tồn tại rồi sao chép sang `public/ifc/web-ifc.wasm`. Script **không** tự chạy trong `dev`/`build` — phải chạy thủ công sau khi cài/cập nhật `web-ifc` (tệp hiện đã có trong `public/ifc`). Chỉ có bản đơn luồng (không copy `web-ifc-mt.wasm`).
- Loader: `new IfcAPI()` → `api.SetWasmPath("/ifc/", true)` (đường dẫn tuyệt đối) → `await api.Init()`.
- Component được nạp bằng `next/dynamic` với `ssr:false`; `ifc-loader` được `import()` động khi mở tệp đầu tiên.

**2. Mở mô hình**
- `api.OpenModel(new Uint8Array(await file.arrayBuffer()), { COORDINATE_TO_ORIGIN: true })` — dời gốc toạ độ về gần (0,0,0) để tránh sai số float. `modelID < 0` → lỗi “Không thể mở tệp IFC này.”
- Schema đọc bằng `api.GetModelSchema()` (hiển thị IFC2X3 / IFC4…).

**3. Cấu trúc không gian & tầng**
- `api.properties.getSpatialStructure(modelID, false)` → cây `{expressID, type, children}`. `collectStoreys` duyệt cây: mỗi nút `IFCBUILDINGSTOREY` là một tầng; mọi phần tử con (trực tiếp hoặc qua decomposition) được gán `storeyOf[expressID] = storeyID`.
- Tên tầng: `GetLine(storey).Name` → `LongName` → “Tầng #id”.
- Cao độ tầng **không lấy từ `Elevation` của IFC** mà tính từ hình học: phân vị 12% của `min.y` các phần tử thuộc tầng (cùng đơn vị/gốc với viewer). Tầng sắp xếp theo cao độ.
- Phần tử nằm ngoài cây không gian (hay gặp khi xuất từ Revit) được gán vào tầng có sàn ngay dưới nó (`level ≤ minY + 0.3 m`).

**4. Hình học → three.js**
- `api.LoadAllGeometry(modelID)` → vector `FlatMesh`. Với mỗi FlatMesh: `GetLineType` + `GetNameFromTypeCode` → tên lớp IFC; `categorizeIfcType` → `IfcCategory`.
- Mỗi `PlacedGeometry`: `api.GetGeometry` → `GetVertexArray` / `GetIndexArray`. Dữ liệu đỉnh xen kẽ 6 số `x,y,z,nx,ny,nz`; `buildIfcGeometry` tách bằng `THREE.InterleavedBuffer(stride 6)` thành `position` (offset 0) và `normal` (offset 3) — sửa lỗi “tam giác vỡ” khi đọc stride 3. Index `Uint32`. Số đỉnh không chia hết 6 → lỗi “Dữ liệu đỉnh IFC không hợp lệ”.
- Mesh: `matrixAutoUpdate=false`, `matrix.fromArray(placed.flatTransformation)`; `userData = {expressID, typeName, category, storeyID, ifcColor:[r,g,b,a], kind}`. Màu IFC (`placed.color`) dùng khi bật chế độ “màu IFC”.
- Mỗi 160 phần tử nhường luồng (`setTimeout 0`) và báo tiến độ.
- Nét viền: nếu tổng tam giác ≤ `EDGE_TRIANGLE_BUDGET = 900 000`, thêm `EdgesGeometry` (ngưỡng 28°) cho mọi mesh trừ `space`, `site`; vượt ngân sách thì bỏ nét viền.
- Bounding box từng expressID lưu để focus, mặt cắt, kích thước.
- Giải phóng binding WASM ngay sau khi dùng (`releaseIfcBinding` gọi `.delete()`).

**5. Thuộc tính đọc (property)** — `getDetails(expressID)` dùng `api.GetLine` lấy thuộc tính trực tiếp của thực thể: `GlobalId`, `Name`, `ObjectType` (hoặc `PredefinedType`), cùng loại IFC, tầng, kích thước (từ bbox). **Không đọc Property Set (`IfcPropertySet`/Pset_*)** ở phía client.

**6. Viewer (`ifc-viewer.tsx`)** — `WebGLRenderer`, `PerspectiveCamera(45°)`, `OrbitControls` (damping 0.09, không xuống dưới mặt đất), lưới nền; vật liệu `MeshStandardMaterial` cache theo màu+độ trong; X-quang giảm opacity; mặt cắt ngang bằng `THREE.Plane((0,-1,0), h)` áp vào mọi vật liệu; chọn phần tử bằng `Raycaster` khi click (không kéo) và bỏ qua điểm trúng nằm trên mặt cắt; preset góc nhìn `iso/top/front`, `focusSelection`, `resetView`.

**7. Tính gợi ý (`scan-suggestions.ts`)**
- `GetAllTypesOfModel` → với mỗi lớp có `classifyIfcType ≠ "other"`, `GetLineIDsWithType` lấy toàn bộ expressID → `IfcScanElement {expressID, typeName, kind, bounds}`.
- `buildSceneScan` đếm `inventory` theo `IfcElementKind` (`storey, wall, exit, stair, room, other`).
- `buildScenarioSuggestion`: template `evacuation-baseline`, cần đủ 3 điểm neo `room` (không gian nguồn cháy), `stair` (cầu thang), `exit` (cửa/lối thoát); trả `anchors` (phần tử đầu tiên mỗi loại), `missingAnchorKinds`, `readyForReview = missing rỗng`. UI nhấn mạnh cửa thoát vẫn phải được xác nhận trong trình soạn.
- Bấm từng dòng inventory để duyệt lần lượt phần tử loại đó (tự focus; `room` tự bật lớp `space`).

**8. Giải phóng (`dispose.ts`)** — `disposeObject3D` duyệt group, dispose mọi geometry/material của `Mesh`/`LineSegments` rồi `clear()`; `dispose()` của model còn `CloseModel` + `api.Dispose()`. Khi lỗi giữa chừng cũng dọn sạch rồi ném lỗi (UI hiển thị thông điệp tiếng Việt + chi tiết kỹ thuật ≤ 200 ký tự).

#### B. Tải IFC lên máy chủ (upload có idempotency)

Flow trong `use-ifc-upload-flow.ts` + `ifc-upload.ts`, mỗi bước lưu vào `IfcUploadSession` để thử lại tiếp tục từ chỗ dừng:

| Bước UI | Stage | Hành động | Ghi chú |
|---|---|---|---|
| Chọn tệp | — | `validateIfcFile`: đuôi `.ifc`, không rỗng; nhãn revision 1–100 ký tự | Đổi tệp → session mới, key mới |
| Kiểm tra | `hash` | `sha256OfFile` — SHA-256 tăng dần theo chunk (`File.slice`), hex thường | Có thanh tiến độ; giữ lại hash khi chỉ đổi nhãn |
| Tải lên | `initiate` | POST `upload-url` `{fileSizeBytes, originalFilename, versionLabel, sha256Hash}` + `Idempotency-Key` sinh từ payload (`keyFor({buildingId,...input})`) | Cùng key + cùng input → cùng revision, URL ký mới; khác input → 409 |
| Tải lên | `upload` | PUT trực tiếp lên `uploadUrl` bằng XHR (có tiến độ, hủy được) | Không gửi Bearer; 400/401/403 → URL hết hạn, initiate lại cùng key |
| Xác nhận | `complete` | POST `upload-complete` `{objectKey, fileSizeBytes, mimeType:"application/octet-stream", sha256Hash, originalFilename}` | 204; BE kiểm tra kích thước/SHA-256 và header `ISO-10303-21;`; gọi lại vẫn 204 |
| Xử lý | — | POST `process` + `Idempotency-Key` `keyFor({revisionId})` | 202 `{jobId}` = đã xếp hàng, chưa xử lý xong |

Phân loại lỗi (`classifyUploadError`): `retryable` (mạng, 408/425/429/5xx, Retry-After), `renewUrl` (URL ký hết hạn → initiate lại **cùng** key), `restart` (intent mất/không hợp lệ → key **mới**). Hủy (AbortController) giữ hash, không lưu gì trên server. `beforeunload` cảnh báo khi đang chạy. BE: upload mặc định tắt (`IfcUpload__Enabled`), `MaxBytes` giới hạn kích thước; intent chưa complete hết hạn sau 60 phút (410).

#### C. Xếp hàng & worker xử lý (server-side)

- `process` tạo processing job `Kind = Geometry` + sự kiện outbox `ProcessingJobRequested` (schema `1`) + audit trong cùng transaction (`docs/ifc-outbox.md`). Cùng key/input → replay; nhiều key đồng thời vẫn chỉ một job logic. Nguồn chưa xác minh → `422 IFC_SOURCE_NOT_VERIFIED`. Job đã chạy xong sẽ không chạy lại (process trả lại job cũ).
- Giao việc có 2 chế độ (`docs/processing-worker.md`, `geometry-worker.md`):
  - **Push**: dispatcher HTTP gửi envelope đến worker (lease 60 s), worker gọi `POST /internal/processing/jobs/{jobId}/claim` (`ProcessingWorkerController`).
  - **Pull** (`GeometryPullEnabled`): worker trên VM gọi `POST /internal/processing/geometry-jobs/lease` (`GeometryWorkerController.Lease`, lease mặc định 600 s) nhận `inputs[0].url` (GET IFC ký 15 phút, kiểm SHA-256), `outputPrefix`.
- Worker (xác thực `X-Worker-Key`, không dùng JWT người dùng): `renew` → `inputs` → `upload-urls` (PUT S3 với checksum SHA-256) → `outputs` (mỗi artifact một lần: `preview_glb` với metadata `fet3d.editor/1`; `building_metadata` với metadata `fet3d.building/1`; kèm `outcome` Passed/Failed và `issues[]`) → `complete {outputHash}` (pull: BE kiểm tra object S3 tồn tại, đúng kích thước & SHA-256) hoặc `fail {reason}`.
- Các bước pipeline worker ghi vào processing-logs (`step`): `Quarantine` (Kiểm tra tệp), `Parse` (Đọc IFC), `CleanGeometry` (Làm sạch mô hình), `Decimate` (Giảm độ chi tiết), `GenNavMesh` (Tạo đường đi), `GenHazardGrid` (Tạo vùng nguy hiểm), `ExportGLB` (Xuất GLB), `PackageBundle` (Đóng gói).
- Khi `complete` được chấp nhận: lưu artifacts + validation run + issues; QA Passed (không có `IFC_EXIT_UNKNOWN`) → revision `ReadyForScenario`; Failed hoặc có `IFC_EXIT_UNKNOWN` → `NeedsFix`; `building_metadata.spaces` (Name/LongName/Category) được upsert vào `bim_facts`.

#### D. Trạng thái & polling

| Thực thể | Giá trị | Nhãn FE |
|---|---|---|
| Revision `status` | `Draft`, `Uploaded`, `Processing`, `NeedsFix`, `ReadyForScenario`, `ConfirmedForTraining`, `Rejected`, `Failed`, `Superseded` | Bản nháp, Đã tải lên, Đang xử lý, Cần sửa mô hình, Sẵn sàng soạn kịch bản, Đã xác nhận dùng cho huấn luyện, Bị từ chối, Xử lý thất bại, Đã được thay thế |
| SourceDocument `quarantineStatus` | `Pending`, `Accepted`, `Rejected` | Pending không chặn xử lý |
| Job `status` | `Queued`, `Running`, `Succeeded`, `Failed`, `Cancelled` | Đang chờ máy xử lý, Đang xử lý, Đã xử lý xong (≠ QA đạt), Xử lý thất bại, Đã hủy |
| Attempt `status` | `Running`, `Succeeded`, `Failed`, `Expired` | — |
| Validation run | `Passed`, `Failed` (`status`/`outcome`) | Đạt / Không đạt |
| Issue `severity` | `Critical`, `Error`, `Warning`, `Info` | Nghiêm trọng, Lỗi, Cảnh báo, Thông tin |
| Editor preview `status` | `Ready`, `NotReady`, `ReprocessRequired` | — |

Verdict QA (`deriveQaVerdict`) chỉ lấy từ validation run của attempt hiện hành + issue hiện hành: không có job → `none`; Queued/Running → `pending`; Failed/Cancelled hoặc lỗi đọc `/qa` → `unavailable`; không có run → `unavailable`; có run Failed hoặc issue Error/Critical → `failed`; tất cả Passed → `passed`. Job `Succeeded` không bao giờ được coi là “đạt”. Thứ tự đọc kết quả run: `outcome` (BE) → `status` → `summary.outcome`.

Polling: job/QA của revision (tới khi job kết thúc + revision ổn định, ≤ 20 lần settle), editor-preview mỗi 5 s × 24 lần.

#### E. Thiết bị phát hiện từ IFC (equipment candidates, IFC-04)

- Nguồn: `building_metadata.interactables[]` của attempt Geometry được chấp nhận (job Succeeded, QA Passed, không có issue Error/Critical). Không có geometry chấp nhận → `409 EQUIPMENT_CANDIDATES_UNAVAILABLE`; không có `building_metadata` → `metadataAvailable:false`.
- Mỗi candidate: `id`, `ifcGlobalId`, `catalogKey`, `source` (`ifc` = tìm thấy phần tử, `inferred` = suy luận, vd. cửa thoát trên tường ngoài), `ifcClass`, `confidence` 0–1 (`needsConfirmation` khi < 0.9), `floorId`, `position [x,y,z]` mét theo hệ tầng, `rotationY` (độ), `bbox [rộng, sâu, cao]`, `decision`, `suggestedDecision` (từ revision trước cùng GlobalId, không tự áp dụng).
- Quyết định: `Confirmed` (giữ catalogKey phát hiện trừ khi gửi key mới), `Retyped` (bắt buộc catalogKey), `Rejected` (không catalogKey). 1–500 item/lần, gộp đè lên quyết định mới nhất, overlay append-only (mỗi lần lưu là một version = ETag). catalogKey phải là capability `Equipment` của runtime đang hoạt động.
- Cửa thoát (`IFC_EXIT_UNKNOWN`, phương án B): khi `exitConfirmationRequired:true`, chọn một candidate `IfcDoor` → `door.exit` (Confirmed/Retyped) → revision `ReadyForScenario` mà không cần tải lại; loại hết các cửa đó → về `NeedsFix`.
- Trình soạn (`scenario-editor/v1/equipment-import.ts`) biến candidate đã Confirmed/Retyped thành đối tượng `Equipment` của `fet3d.editor/1`: `anchorId = ifcGlobalId`, `capability = catalogKey@version runtime`, vị trí từ `floorId/position/rotationY`; không tự điền tham số; bỏ qua khi chưa quyết định, đã loại, đã có, trùng, runtime thiếu capability, GlobalId không có trong `semanticMapping`, thiếu/lệch tầng, vị trí sai, vượt giới hạn.

#### F. BIM facts, artifacts, preview, style

- **BIM facts**: mỗi `IfcSpace` có 3 dòng `Name`, `LongName` (Revit thường đặt tên phòng ở đây), `Category`; phòng không tên & không long name có `qualityFlags:["SPACE_UNNAMED"]` (FE: “Phòng chưa có tên”). Sắp theo `ifcGlobalId` rồi `propertyPath`; lọc `entityType`, `ifcGlobalId`, `qualityFlag`. Endpoint `/bim-facts/elements` gộp theo phòng (FE chưa dùng).
- **Artifacts**: `preview_glb` (GLB + metadata editor), `building_metadata`, (`unity_package` cho job đóng gói); có `sha256Hash`, `isRuntimeReady`, `isCurrentAttempt`.
- **Editor preview**: Ready khi metadata đúng `fet3d.editor/1` và object S3 tồn tại đúng kích thước (HEAD) → URL ký 5 phút + `coordinateTransform`, `floors`, `semanticMapping`; S3 lỗi → `503 PREVIEW_STORAGE_UNAVAILABLE`. `/api/revisions/{id}/floors` trả tầng + mapping không ký URL (dùng trong scenario-editor).
- **Revision style (STYLE-01)**: GET/PUT `/api/revisions/{id}/style` chọn StylePreset + ColorScheme + override vật liệu theo phòng; **FE chưa có màn hình/API cho mục này**; worker chưa đọc lựa chọn.

---

### Danh mục lớp IFC / thiết bị nhận diện

#### 1. Lớp hiển thị phía client (`categorizeIfcType`, so khớp tiền tố tên lớp, không phân biệt hoa thường; thứ tự ưu tiên từ trên xuống)

| Tiền tố lớp IFC | `IfcCategory` | Nhãn | Màu mặc định / độ trong |
|---|---|---|---|
| `IFCCURTAINWALL` | `window` | Cửa sổ / kính | `#8fc8de`, 0.38 |
| `IFCWALL` (gồm `IfcWallStandardCase`) | `wall` | Tường | `#e3ddd3` |
| `IFCSLAB`, `IFCCOVERING` | `slab` | Sàn / trần | `#a9a299` |
| `IFCROOF` | `roof` | Mái | `#9c6a52` |
| `IFCDOOR` | `door` | Cửa đi | `#d9824a` |
| `IFCWINDOW`, `IFCPLATE` | `window` | Cửa sổ / kính | `#8fc8de`, 0.38 |
| `IFCSTAIR` (gồm `IfcStairFlight`), `IFCRAMP` | `stair` | Cầu thang | `#5fb8a2` |
| `IFCRAILING` | `railing` | Lan can | `#8f9aa0` |
| `IFCCOLUMN`, `IFCBEAM`, `IFCMEMBER`, `IFCFOOTING`, `IFCPILE` | `structure` | Cột / dầm | `#c8c0b4` |
| `IFCSPACE` | `space` | Không gian (phòng) — **ẩn mặc định** | `#5fd39a`, 0.16 |
| `IFCFURNISHING`, `IFCFURNITURE` | `furniture` | Nội thất | `#a3937e` |
| `IFCFLOWTERMINAL`, `IFCFIRESUPPRESSION`, `IFCALARM`, `IFCSENSOR`, `IFCSANITARY`, `IFCDISTRIBUTION`, `IFCFLOW` | `equipment` | Thiết bị | `#f0604c` |
| `IFCSITE`, `IFCGEOGRAPHICELEMENT` | `site` | Khu đất / cảnh quan | `#56645a` |
| (còn lại) | `other` | Khác | `#bcb5aa` |

#### 2. Điểm neo kịch bản (`classifyIfcType`, khớp đúng tên)

| Lớp IFC | `IfcElementKind` | Nhãn | Vai trò neo |
|---|---|---|---|
| `IfcBuildingStorey` | `storey` | Tầng | — |
| `IfcWall`, `IfcWallStandardCase` | `wall` | Tường | — |
| `IfcDoor` | `exit` | Cửa / lối ra | bắt buộc (cửa/lối thoát) |
| `IfcStair`, `IfcStairFlight` | `stair` | Cầu thang | bắt buộc |
| `IfcSpace` | `room` | Không gian | bắt buộc (không gian nguồn cháy) |
| khác | `other` | — | không tính |

#### 3. Lớp IFC của candidate thiết bị (nhãn trong `EquipmentPanel`)

| `ifcClass` (tiền tố) | Nhãn |
|---|---|
| `IfcDoor` | Cửa (có nút “Làm cửa thoát”) |
| `IfcWindow` | Cửa sổ |
| `IfcTransportElement` | Thang máy |
| `IfcSanitaryTerminal` | Thiết bị vệ sinh |
| `IfcFlowTerminal` | Thiết bị cấp nước |
| `IfcAlarm` | Thiết bị báo cháy |
| `IfcFireSuppressionTerminal` | Thiết bị chữa cháy |
| `IfcFurnishingElement` | Đồ nội thất |
| khác | Cấu kiện |

#### 4. Danh mục capability (catalogKey) – runtime catalog batch 1 (Unity runtime 2.0.0)

Nguồn: `BE/contracts/editor/v1/fixtures/runtime-catalog.batch1.json`; danh sách thật lấy từ `GET /api/scenario-interactions/catalog`. Chỉ các capability `Equipment` dùng được làm `catalogKey` của candidate (FE: `KNOWN_EQUIPMENT_CATALOG_KEYS` trong `ifc-types.ts`).

| catalogKey | objectKind | Ý nghĩa | Tham số | Hành động | Sự kiện |
|---|---|---|---|---|---|
| `alarm.call_point` | Equipment | Nút báo cháy khẩn cấp | — | press | AlarmRaised |
| `alarm.detector` | Equipment | Đầu báo khói, tự kích hoạt khi khói vượt ngưỡng | smokeThreshold | — | DetectorTriggered |
| `extinguisher.portable` | Equipment | Bình chữa cháy xách tay: nhấc, rút chốt, giữ để phun | agent, dischargeSeconds | pick_up, pull_pin, spray | ExtinguisherUsed, ExtinguishAttemptLargeFire |
| `water.sink` | Equipment | Bồn rửa (nguồn nước làm ướt khăn) | — | wet_item | ItemWetted |
| `water.bath` | Equipment | Bồn tắm (nguồn nước) | — | wet_item | ItemWetted |
| `water.shower` | Equipment | Vòi sen (nguồn nước) | — | wet_item | ItemWetted |
| `item.towel` | Equipment | Khăn: nhấc, làm ướt, che mũi | smokeIntakeMultiplierWhenCovered, dryAfterSeconds | pick_up, cover_nose | NoseCoveredInSmoke |
| `door.standard` | Equipment | Cửa thường (IfcDoor): sờ kiểm tra nhiệt, mở, đóng | — | touch, open, close | CheckedDoorHeat, ClosedDoor |
| `door.fire` | Equipment | Cửa chống cháy | — | touch, open, close | CheckedDoorHeat, ClosedDoor |
| `door.exit` | Equipment | Cửa thoát hiểm (dùng để gỡ `IFC_EXIT_UNKNOWN`) | — | touch, open, close | CheckedDoorHeat, ClosedDoor |
| `transport.elevator` | Equipment | Thang máy — gọi là “bẫy” | — | call | UsedElevator |
| `bait.belongings` | Equipment | Đồ đạc cá nhân — nhặt là “bẫy” | — | pick_up | WentBackForBelongings |
| `suppression.sprinkler` | Equipment | Đầu phun sprinkler tự động | state, activationTemperatureC, coverageRadiusMeters, fireIntensityReduction, activationDelaySeconds | — | SprinklerActivated |
| `exit.stair` | Goal | Cầu thang thoát hiểm (đích) | — | enter | (ExitReached lõi) |
| `exit.final` | Goal | Lối ra cuối cùng ra ngoài | — | enter | (ExitReached lõi) |
| `npc.guide` | Npc | NPC có thể gọi và dẫn ra lối thoát | behaviour, mobilityImpaired | call, lead | NpcGuided |
| `fire.source` | Hazard | Nguồn cháy | intensity, activationSeconds | — | — |
| `smoke.source` | Hazard | Nguồn khói | ratePerSecond, activationSeconds | — | — |
| `event.power_outage` | Hazard | Sự kiện mất điện tại `atSeconds` | atSeconds | — | — |
| `event.alarm` | Hazard | Sự kiện chuông báo (fails = hệ thống hỏng) | atSeconds, fails | — | — |

Ví dụ trong fixture `building-metadata.valid.json`: `equipment.extinguisher` (IfcFlowTerminal, 0.95) và `water.sink` (IfcFurnishingElement, 0.6 → cần xác nhận).

#### 5. Hợp đồng `building_metadata` (`fet3d.building/1`)

| Trường | Kiểu / giới hạn | Ghi chú |
|---|---|---|
| `schemaVersion` | `"fet3d.building/1"` (bắt buộc) | khác → `422 BUILDING_METADATA_VERSION_UNSUPPORTED` |
| `revisionId` | uuid | — |
| `sources[]` | ≤ 20 | role (architecture/mep/plumbing/fire), sha256, schema IFC, app xuất |
| `units` | string | vd `m` |
| `storeys[]` | ≤ 500 | — |
| `spaces[]` | ≤ 20 000 | ifcGlobalId, name, longName, category, storey, bbox → `bim_facts` |
| `portals[]` | ≤ 20 000 | vd `{type:"door", fireExit}` |
| `interactables[]` | ≤ 5 000, kiểm tra từng trường | id `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`, ifcGlobalId 22 ký tự, catalogKey `^[a-z][a-z0-9_.-]{0,99}$`, source `ifc|inferred`, confidence 0–1, position[3], rotationY, bbox[3] > 0 |
| `materials` | object | tên vật liệu IFC → `libraryKey` (vd `floor.tile`) |
| `qaIssues[]` | ≤ 5 000 | — |

---

### Mã lỗi / QA

#### 1. Mã QA của worker (issue `issueCode`, `docs/ifc-qa-codes.md`; nội dung tiếng Việt ở `buildings/qa-codes.ts`)

| Mã | Mức (Docs → API) | Ý nghĩa (VI) | Hướng dẫn FE | Hành động |
|---|---|---|---|---|
| `IFC_NO_BODY_GEOMETRY` | Chặn (tường/sàn/cửa/thang) → Error; Cảnh báo (nội thất) | Cấu kiện không có hình khối 3D | Xuất lại IFC có hình khối 3D cho tường, sàn, cửa, cầu thang | reupload |
| `IFC_BODY_NONSTANDARD_CONTEXT` | Info | Hình khối 3D xuất theo cách không chuẩn (context khác `Model`) | — | — |
| `IFC_NO_SPACES` | Chặn → Error | Mô hình không có phòng (`IfcSpace`) | Bật xuất phòng rồi tải lại | reupload |
| `IFC_SPACE_UNNAMED` | Warning | Phòng chưa có tên | Đặt tên trong mô hình hoặc phân loại trong trình soạn | — |
| `IFC_EXIT_UNKNOWN` | Warning, nhưng revision giữ `NeedsFix` | Chưa xác định cửa thoát ra ngoài | Chọn một cửa làm lối thoát ở mục Thiết bị; không cần tải lại | equipment |
| `IFC_NO_FIRE_EQUIPMENT` | Warning | IFC không có thiết bị báo cháy/chữa cháy | Đặt thiết bị trong trình soạn | editor |
| `IFC_NO_WATER_SOURCE` | Warning | IFC không có nguồn nước | Đặt nguồn nước trong trình soạn nếu cần | editor |
| `IFC_LOW_CONFIDENCE_DEVICE` | Warning | Thiết bị có độ tin cậy thấp (< 0.9) | Xác nhận hoặc loại bỏ | equipment |
| `IFC_UNMAPPED_MATERIAL` | Info | Vật liệu chưa có trong từ điển | Quản trị FET3D bổ sung từ điển; mô hình vẫn dùng được | — |
| `IFC_EXCESSIVE_VOIDS` | Warning | Không cắt được lỗ cửa | Kiểm tra cửa và tường liên quan | — |
| `IFC_NOT_ARCHITECTURAL` | Chặn → Error | Không phải mô hình kiến trúc (không có IfcDoor & IfcSpace) | Tải lên tệp IFC kiến trúc | reupload |
| `IFC_NO_FLOOR_UNDER_SPACE` | Warning | Phòng không có sàn; hệ thống tạo sàn từ đáy phòng | Kiểm tra hoặc xuất IFC kèm sàn | — |
| `IFC_TRIANGLE_BUDGET_EXCEEDED` | Warning | Mô hình quá nặng (vượt ngân sách tam giác) | Xuất lại IFC chi tiết thấp hơn | reupload |
| `IFC_DEFAULT_MASS_PRESENT` | Info | Có khối quy hoạch (đã loại bỏ) | — | — |
| `IFC_UNSUPPORTED_FORMAT` | Chặn (lỗi HTTP, không phải issue) | Tệp không phải IFC | Xuất IFC2X3/IFC4/IFC4X3 rồi tải lại | reupload |

Mã khác: FE hiển thị chung kèm `message` của worker (nếu là tiếng Việt). Issue có `ifcGlobalIds` (≤ 100) để đánh dấu trong preview. Error/Critical chặn confirm-for-training và publish.

#### 2. Quality flag BIM facts

| Flag | Ý nghĩa |
|---|---|
| `SPACE_UNNAMED` | Phòng chưa có tên |
| `MissingValue` | Thiếu giá trị |

#### 3. Mã lỗi HTTP luồng upload/xử lý

| HTTP | Mã | Nơi | Ý nghĩa (VI) | FE xử lý |
|---|---|---|---|---|
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | initiate, process | Thiếu Idempotency-Key | báo lỗi |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` / `IFC_UPLOAD_INPUT_CONFLICT` | initiate | Cùng key nhưng khác input/Building | restart (key mới) |
| 400 | `VALIDATION_ERROR` | mọi | Dữ liệu không hợp lệ (vd thiếu `sha256Hash`, kích thước > MaxBytes) | hiện lỗi trường đầu tiên |
| 503 | `IFC_UPLOAD_DISABLED` | initiate | Tính năng tải IFC đang tắt | retryable |
| 400/422 | `IFC_UNSUPPORTED_FORMAT` | initiate (đuôi) / complete (header STEP) | Tệp không phải IFC | restart |
| 410 | `IFC_UPLOAD_EXPIRED` / `IFC_UPLOAD_ATTEMPT_EXPIRED` | complete | Phiên tải lên hết hạn (60 phút) | restart |
| 409 | `IFC_UPLOAD_ALREADY_COMPLETED` | initiate/complete | Intent đã hoàn tất | restart |
| 409 | `IFC_UPLOAD_IN_PROGRESS` | complete | Đang có lượt hoàn tất khác | thử lại |
| 404 | `IFC_UPLOAD_INTENT_NOT_FOUND` | complete | Không tìm thấy intent | restart |
| 422 | `IFC_SOURCE_MISMATCH` | complete | Tệp trên S3 khác kích thước/SHA-256 | restart |
| 409 | `IFC_SOURCE_CHANGED` | complete | Tệp staging bị thay giữa chừng | restart |
| 503 | `IFC_STORAGE_UNAVAILABLE` | complete | S3 không sẵn sàng (Retry-After) | retryable |
| 422 | `IFC_SOURCE_NOT_VERIFIED` | process | Nguồn chưa được xác minh | báo lỗi |
| 409 | `JOB_NOT_CLAIMABLE` / `JOB_TERMINAL` / `JOB_BUSY` / `JOB_CONFLICT` | retry/process | Chỉ job Failed mới chạy lại; job đang bận/đã kết thúc | ẩn nút retry nếu không Failed |
| 409 | `EQUIPMENT_CANDIDATES_UNAVAILABLE` | candidates | Chưa có geometry được chấp nhận | thông báo |
| 428/412/400 | — | equipment-decisions, style, annotations | Thiếu / cũ / sai If-Match | 412 → tải lại, giữ nháp |
| 422 | `CONTENT_INVALID` / `EQUIPMENT_DECISION_INVALID` | equipment-decisions | Body sai / candidate hoặc catalogKey không hợp lệ | hiện lỗi theo dòng |
| 422 | `STYLE_SELECTION_INVALID` | style | Preset/scheme không phải version Published của item đang hoạt động | (FE chưa dùng) |
| 409 | `REVISION_NOT_EDITABLE` | style | Revision Superseded/Rejected | (FE chưa dùng) |
| 503 | `PREVIEW_STORAGE_UNAVAILABLE` | editor-preview | Không kiểm tra được S3 | hiện lỗi + thử lại |

#### 4. Mã lỗi worker (nội bộ, không hiện cho người dùng)

`VALIDATION_ERROR`, 401 (sai `X-Worker-Key`), `GEOMETRY_PULL_DISABLED`, `ATTEMPT_STALE` (mất lease), `OUTPUT_CONFLICT`, `GEOMETRY_STORAGE_MISMATCH`, `GEOMETRY_STORAGE_UNAVAILABLE`, `EDITOR_SCHEMA_INVALID` / `EDITOR_SCHEMA_VERSION_UNSUPPORTED`, `BUILDING_METADATA_INVALID` / `BUILDING_METADATA_VERSION_UNSUPPORTED`, `PROCESSING_EXECUTOR_FORBIDDEN` / `_LOGIN_FAILED`.

---

### Thư viện đồ (Library)

Organization Library do PlatformAdmin quản lý (`/admin/library`, `src/features/admin-library`), OrganizationUser xem/áp dụng (`/workspace/library` + thẻ Thư viện trong trình soạn kịch bản, `src/features/library`). Mỗi **item** (`kind`, `code` viết hoa duy nhất `^[A-Z0-9][A-Z0-9_-]{0,79}$`, `isActive`, `revision`) có nhiều **version** (`Draft | Published`, `versionNumber`, `name` 1–255, `payload` ≤ 256 KB, `requiredCapabilities` ≤ 50, `payloadHash`). Version Published bất biến; sửa = tạo version mới. Item ngừng dùng biến khỏi danh sách nhưng version đã publish vẫn đọc được theo id (kịch bản cũ vẫn tham chiếu được). Áp dụng vào kịch bản luôn là **sao chép** (ghi provenance `libraryRefs[] {versionId, kind, code?}`), cập nhật mẫu sau này không đổi kịch bản đã soạn.

#### 1. Các loại (kind)

| Kind (BE) | Nhãn FE | Payload | Áp dụng | FE hỗ trợ |
|---|---|---|---|---|
| `ScenarioTemplate` | Kịch bản mẫu | `{state, description?}` — `state` là bản nháp `fet3d.editor/1` (cho phép một phần) | Chỉ điền trường phi không gian: `name`, `learningObjectives`, `learnerInstructions`, `timeLimitSeconds`, `modePolicy`, `rubric`. Không áp dụng `geometry`, `objects`, `runtimeVersion`, `randomSeed`, `replanIntervalSeconds` | Có |
| `RubricSample` | Tiêu chí chấm mẫu | `{rubric, description?}` — `rubric.schema_version` (chuỗi `"1"`), `pass_threshold`, `criteria[]{id, metric,...}` | Điền/Thay/Hợp nhất `rubric` (hợp nhất thêm tiêu chí chưa có theo `id`) | Có |
| `Equipment` | Thiết bị | `{description?, properties?}` — ≤ 50 thuộc tính string/number/boolean | Đặt `label` của đối tượng Equipment đang chọn = tên version; gợi ý `capability` nếu runtime của bản nháp công bố capability đó cho Equipment. Mô tả/thuộc tính chỉ tham khảo. Không tạo năng lực mới cho runtime | Có (FE bắt buộc mô tả, BE thì tuỳ chọn) |
| `StylePreset` | — | `{buildingTypes[1–10], keywords?, materials{default{floor,wall,ceiling}, <roomCategory>{surface?}…≤50}, defaultScheme?, description?}` | Chọn per-revision qua `PUT /api/revisions/{id}/style`; worker áp vật liệu PBR | **Chưa** (FE `LIBRARY_KINDS` chỉ 3 kind, `parseItem` loại bỏ kind lạ) |
| `ColorScheme` | — | `{colors{wall, accentWall, doorWood, skirting} (#RRGGBB), description?}` | Chọn cùng preset (không chọn → `defaultScheme` của preset) | **Chưa** |

Ghi chú `EditorContract.LibraryKinds` (BE) cho `libraryRefs` chỉ chấp nhận `ScenarioTemplate`, `RubricSample`, `Equipment`.

#### 2. Mẫu StylePreset / ColorScheme (`contracts/style/v1/fixtures/style-presets.sample.json`)

| Code | buildingTypes | Vật liệu mặc định (floor / wall / ceiling) | Theo phòng | defaultScheme |
|---|---|---|---|---|
| `SCHOOL` | school | floor.tile / wall.plaster / ceiling.tile | wc: tile/tile; corridor: floor.vinyl; workshop: floor.epoxy, wall.brick; lobby: stone | WARM-NEUTRAL |
| `HOSPITAL` | hospital, clinic | floor.vinyl / wall.plaster / ceiling.tile | wc: tile; lab: floor.epoxy; lobby: stone | CALM-GREEN |
| `OFFICE` | office | floor.tile / wall.plaster / ceiling.tile | office: floor.carpet; wc: tile; lobby: stone | WARM-NEUTRAL |
| `RESIDENTIAL` | residential | floor.wood / wall.plaster / wall.plaster | wc, kitchen: floor.tile, wall.tile | WARM-NEUTRAL |

| ColorScheme | wall | accentWall | doorWood | skirting |
|---|---|---|---|---|
| `WARM-NEUTRAL` | #E9E3D8 | #8FA9A3 | #A27A52 | #5E4E40 |
| `CALM-GREEN` | #E4EBE6 | #9DB8A8 | #B8936A | #6B6F6A |

Khoá vật liệu thư viện: `floor.tile`, `floor.wood`, `floor.carpet`, `floor.vinyl`, `floor.epoxy`, `ceiling.tile`, `wall.plaster`, `wall.brick`, `wall.tile`, `concrete`, `wood`, `stone`, `metal.painted`, `metal.brushed`, `glass.clear`, `glass.frosted`. Loại phòng (khớp `spaces[].category`): `wc`, `kitchen`, `corridor`, `office`, `lab`, `workshop`, `lobby`… Bề mặt: `floor`, `wall`, `ceiling`; phòng `default` = mọi phòng; ≤ 200 override.

#### 3. API thư viện

| Method | Endpoint | Hàm FE | Request | Response | Quyền |
|---|---|---|---|---|---|
| GET | `/api/library/items?kind&search&page&pageSize` | `libraryApi.listItems` | query | `Page<LibraryItem>` | Org, Admin (chỉ active + có Published) |
| GET | `/api/library/items/{id}` | `libraryApi.getItem` | — | `LibraryItem` (có `latestPublished`) | Org, Admin |
| GET | `/api/library/versions/{id}` | `libraryApi.getVersion` | — | `LibraryVersion` | Org (chỉ Published), Admin |
| GET | `/api/admin/library/items?kind&search&page&pageSize` | `libraryAdminApi.listItems` | query | `Page<LibraryItem>` | Admin |
| POST | `/api/admin/library/items` | `libraryAdminApi.createItem` | `{kind, code}` + Idempotency-Key | `WithEtag<LibraryItem>` (201; 409 `LIBRARY_CODE_EXISTS`) | Admin |
| GET/PATCH | `/api/admin/library/items/{id}` | `getItem` / `updateItem` | PATCH `{isActive}` + If-Match + Idempotency-Key tuỳ chọn | `WithEtag<LibraryItem>` | Admin |
| POST | `/api/admin/library/items/{id}/versions` | `createVersion` | `VersionInput {name, payload, requiredCapabilities}` + Idempotency-Key | `WithEtag<LibraryVersion>` (422 `CONTENT_INVALID` + `issues`) | Admin |
| GET/PUT | `/api/admin/library/versions/{id}` | `getVersion` / `updateVersion` | PUT chỉ Draft (409 `LIBRARY_VERSION_PUBLISHED`) + If-Match | `WithEtag<LibraryVersion>` | Admin |
| POST | `/api/admin/library/versions/{id}/publish` | `publishVersion` | If-Match | `WithEtag<LibraryVersion>` (409 `LIBRARY_CAPABILITY_UNSUPPORTED` nếu capability không có trong runtime catalog đang hoạt động) | Admin |

Mã lỗi nội dung (FE mirror trong `library/payload.ts#checkForm`): `STRING_INVALID`, `FIELD_REQUIRED`, `FIELD_UNKNOWN`, `CAPABILITIES_INVALID`, `PROPERTIES_INVALID`, `ID_DUPLICATE`, `CONTENT_TOO_LARGE`, `EDITOR_SCHEMA_VERSION_UNSUPPORTED`, `RUBRIC_SCHEMA_VERSION_UNSUPPORTED`, `RUBRIC_METRIC_UNSUPPORTED`.

#### 4. Quan hệ thư viện ↔ IFC

- 3D model của thiết bị **luôn lấy từ thư viện tài sản dùng chung (runtime)**, không bao giờ lấy hình học từ IFC; IFC chỉ cung cấp vị trí/neo (`ifcGlobalId`).
- Thiết bị phát hiện từ IFC → `catalogKey` (capability runtime) → đối tượng Equipment trong kịch bản; item thư viện `Equipment` bổ sung nhãn/mô tả và gợi ý capability qua `requiredCapabilities`.
- StylePreset/ColorScheme áp vật liệu cho mô hình theo revision (STYLE-01), chưa nối vào worker và FE.

---

### Kiểm tra type API

| Endpoint | Type FE | Trạng thái | Ghi chú |
|---|---|---|---|
| POST `/api/buildings/{id}/revisions/upload-url` | `InitiateIfcUploadInput` → `InitiatedIfcUpload` | Đủ | Khớp `InitiateIfcUploadRequest/Response` (FE bắt buộc `sha256Hash`, BE optional nhưng handler từ chối khi thiếu) |
| POST `/api/revisions/{id}/upload-complete` | `FinalizeIfcUploadInput` → `void` | Đủ | |
| POST `/api/revisions/{id}/process` | `ProcessRevisionResult` | Đủ | |
| GET `/api/revisions/{id}` | `BuildingRevision`, `SourceDocument` | Đủ | |
| GET `/api/revisions/{id}/processing-jobs` | `ProcessingJobPage` | Đủ | |
| GET `/api/processing-jobs/{id}` | `ProcessingJobDetail`, `ProcessingAttempt` | Đủ | |
| GET `/api/processing-jobs/{id}/qa` | `JobQa` / `ValidationRun` | Đã bổ sung | Thiếu `outcome`; thêm `ValidationRunWithOutcome` (`ifc-types.ts`), `pipeline.ts#runOutcome` đọc `outcome` trước |
| POST `/api/processing-jobs/{id}/retry` | `{requestId, reason}` → `RetryJobResult` | Đã bổ sung | Thêm tên type `RetryJobInput`; header Idempotency-Key tuỳ chọn chưa gửi |
| GET `/api/revisions/{id}/processing-logs` | `ProcessingLogPage` | Đã bổ sung | Thêm `ProcessingStep` (union bước) |
| GET `/api/revisions/{id}/issues` | `RevisionIssuePage` | Đã bổ sung | Đủ trường; thêm `IfcQaCode` union |
| GET `/api/revisions/{id}/artifacts` | `RevisionArtifactPage` | Đã bổ sung | Thêm `IfcArtifactType` |
| GET `/api/revisions/{id}/bim-facts` | `BimFactPage` | Đã bổ sung | Thêm `BimFactFilters` (API FE chưa truyền filter) |
| GET `/api/revisions/{id}/bim-facts/elements` | `BimFactElement`, `BimFactElementPage` | Đã bổ sung | Chưa có hàm API FE |
| GET `/api/validation-runs/{id}` | `ValidationRunWithOutcome` | Đã bổ sung | Chưa có hàm API FE |
| GET `/api/revisions/{id}/validation-runs` | `ValidationRunHistoryItem` (`scenarios/version-types.ts`) | Đủ | Thuộc nhóm scenarios |
| GET `/api/buildings/{id}/editor-preview` | `EditorPreview` | Đã bổ sung | Thiếu `schemaVersion/units/upAxis/handedness` → `EditorPreviewDetails` (scenario-editor có `EditorPreviewV1` tương đương) |
| GET `/api/revisions/{id}/floors` | `RevisionFloorsResponse` (`scenario-editor/api.ts`) | Đủ | Thuộc nhóm scenario-editor |
| GET `/api/revisions/{id}/equipment-candidates` | `EquipmentCandidates`, `EquipmentCandidate` | Đã bổ sung | Thêm `EquipmentDecisionView`, `EquipmentSuggestionView`, `EquipmentCatalogKey`/`KNOWN_EQUIPMENT_CATALOG_KEYS` |
| PATCH `/api/revisions/{id}/equipment-decisions` | `EquipmentDecisionInput[]` | Đã bổ sung | Thêm `EquipmentDecisionsRequest` |
| POST `/api/revisions/{id}/confirm-for-training` | `ConfirmTrainingInput` → `{reviewId}` | Đã bổ sung | Thêm `ConfirmTrainingResult` |
| POST `/api/revisions/{id}/reviews` | `RejectScenarioVersionInput` → `TechnicalRejectionResult` | Đã bổ sung | Chưa có hàm API FE |
| GET/PUT `/api/revisions/{id}/style` | `RevisionStyleView`, `RevisionStyleRequest`, `StyleOverride`, `StyleLibraryRef`… | Đã bổ sung | Chưa có hàm API/UI FE |
| Worker output `building_metadata` | `BuildingMetadataV1`, `BuildingInteractable`, `BuildingSpace` | Đã bổ sung | Theo `contracts/ifc/v1/building-metadata.schema.json` |
| Lỗi upload | `IfcUploadErrorCode` | Đã bổ sung | |
| `/api/library/*`, `/api/admin/library/*` | `LibraryItem`, `LibraryVersion`, `VersionInput` | Thiếu | `LibraryKind` thiếu `StylePreset`, `ColorScheme` (BE có); payload type đã thêm ở `ifc-types.ts` (`StylePresetPayload`, `ColorSchemePayload`) nhưng `library/types.ts` thuộc agent khác |
| `/internal/processing/*` | — | Không áp dụng | Chỉ worker gọi (X-Worker-Key) |

---

## Type API đã bổ sung & việc còn tồn đọng

### Đã bổ sung trong đợt này
| Feature | File | Nội dung |
|---|---|---|
| auth | `features/auth/types.ts`, `api.ts` | `AuthUser` thêm các trường BE trả về; `GoogleExchangeResponse`; `ForgotPasswordAccepted` (202) |
| learn | `features/learn/types.ts`, `api.ts` | Trường còn thiếu của `PublicPost`/`PublicVersion`; `BookmarkPage` (+ `counts`), `LearnBookmarksQuery`, `BookmarkState` |
| qr-landing | `features/qr-landing/types.ts` (mới), `api.ts` | Tách type ra file riêng; `QrResolution` thêm `serviceStatus`, `serviceEndsAt`, `canStartNewSessions` |
| accounts | `features/accounts/types.ts`, `api.ts` | `ManagedAccount` thêm trường mới; `CreatedAccount`; `sort` trong filter |
| organizations | `features/organizations/types.ts`, `api.ts` | `AdminOrganization`; `sort` trong filter |
| admin-reviews | `types.ts`, `review-detail.tsx` | `submittedByName` / `decidedByName`; giao diện hiển thị tên người gửi và người duyệt |
| admin-learn | `types.ts`, `api.ts` | `AdminPostListInfo` (`latest`), `CreateSituationInput`, trường còn thiếu của `KnowledgeSource`/`LearnImage` |
| buildings | `types.ts`, `qr-api.ts` | `ScenarioVersionSummary.reviewStatus/reviewId/rejectReason`, `BuildingQrIssued.content` |
| buildings (IFC) | `features/buildings/ifc-types.ts` (mới), `pipeline.ts` | Validation run, preview, retry, confirm-for-training, review kỹ thuật, các union bước/QA/mã lỗi, quyết định thiết bị, BIM facts, revision style. `runOutcome` đọc `outcome` trước |
| playtest | `features/playtest/types.ts` | `PlaytestCompletionView`, `PlaytestRejectedEvent(s)`, `openHandoffId`, `recovery.canIssueHandoff` |
| scenario-editor | `api.ts` | `RubricCatalog` (trước là `unknown`), `DraftValidationIssue`, các trường để tiếp tục bản nháp |
| scenarios | `version-types.ts` | `DraftSummary.stateKind`; `VersionReview` thêm tên/id tổ chức, tòa nhà, kịch bản, content, rubric |
| analytics | `types.ts`, `parse.ts` | `abandoned`, `awaitingSync`, `debrief[]`, `organizationName`, `aiUsage.resultTypes/byAudience` |
| support | `types.ts`, `api.ts` | `SupportTicketPage` (+ `counts`), `feedbackId`/`sessionId`, `reason`, `actorType`, `targetEntity` |
| org-ai | `types.ts`, `api.ts` + 3 component | `consumedUnits: number \| null`, `EndAiPolicyInput`, `technicalUsage`. **Sửa lỗi hiển thị** khi `consumedUnits` là `null` |
| rag | `api.ts` | `ChatRequest`, `DocumentIngestResponse`, `Source.source_id/version` |
| library | `types.ts` + `items-list.tsx`, `v1-library-panel.tsx`, `new-item-modal.tsx` | Thêm loại `StylePreset` và `ColorScheme`, trước đây bị bỏ qua khi parse. Form tạo mục chỉ cho chọn 3 loại kịch bản |
| billing, training-history | — | Đã đủ, không cần sửa |

### Còn tồn đọng (chưa làm)
- **Thư viện đồ, loại Style:** chưa có form tạo phiên bản cho `StylePreset`/`ColorScheme` (`admin-library/payload.ts`). Hiện chỉ xem được, không tạo được.
- **Endpoint BE có nhưng FE chưa gọi:**
  - `GET/PUT /api/revisions/{id}/style`
  - `GET /api/revisions/{id}/bim-facts/elements`
  - `GET /api/validation-runs/{id}`
  - `POST /api/revisions/{id}/reviews`
  - `PATCH /api/admin/learn/situations/{id}`
  - `GET /api/scenarios/{id}/playtests`
  - `GET /api/scenarios/{id}/playtest-availability`
  - `GET /api/learn/bookmarks/{postId}`
  - `GET /api/admin/billing/quota-policies/{id}`
- **`EditorPreview`** (`buildings/types.ts`) thiếu `schemaVersion`, `units`, `upAxis`, `handedness`. Có thể dùng `EditorPreviewDetails` trong `ifc-types.ts`.
- **`library/api.ts` → `listItems`** chưa gửi `isActive`, nên lọc trạng thái chỉ chạy trên trang đang tải.
- **`scripts/copy-ifc-wasm.mjs`** (`pnpm ifc:wasm`) chưa gắn vào `dev`/`build`. Phải chạy tay mỗi khi nâng `web-ifc`.
- **Quét IFC trên trình duyệt** mới đọc GlobalId, Name, ObjectType/PredefinedType, chưa đọc property sets.
- **`/privacy`** chưa nằm trong danh sách `next` được phép ở `features/auth/redirect.ts`.
