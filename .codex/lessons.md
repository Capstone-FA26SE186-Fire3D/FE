# FE — bài học dùng chung

Chỉ lưu kiến thức đã xác minh và cần cho team. Nhật ký lỗi, thử nghiệm và bàn giao từng phiên nằm trong .codex/local/ và không được track.

## Landing 3D — bài học triển khai

- Reveal sở hữu visibility shell/roof. Damage từng bật lại visible sau khi cutaway ẩn vỏ. Truyền tập visibility-controlled; damage chỉ được ẩn thêm. Test trước/trong/sau sụp và trở lại POV.
- Sụp từng khu đòi hỏi geometry/batch theo khu, không batch cả tầng rồi scale xuống. Giữ rest pose/pivot; dùng chung bayFall cho geometry, lửa và mảnh vỡ. Ẩn annotation khi công trình sụp để không treo mảng cam trên không.
- Tăng mật độ không chữa được bounds sai: lửa 3,4 m trong ô 6 m để khoảng hở cố định. Kiểm tra kích thước mét, field transform, mặt đối diện và clamp kính vào mép tòa nhà.
- Khói volume phải fade mọi biên mở; sprite cần noise warp, khác pha/kích thước và fade cạnh quad. Đen đặc + mật độ cao dễ lộ hộp/tròn. Cần quan sát actual render để nghiệm thu.
- Màn hình điện thoại từng nằm sau bevel: đưa screen ra trước thân; kiểm tra ảnh actual render target.
- Pointerdown preventDefault ngăn focus mặc định: gọi focus({preventScroll:true}) để Arrow/Home hoạt động mà không chọn chữ. Outline orbit đã bỏ theo yêu cầu; không tuyên bố đạt accessibility đầy đủ từ đó.
- Build/TypeScript không compile GPU shader: đã gặp GLSL reserved `patch`. Runtime phải ghi shader error và test canvas thật; poster/text DOM không chứng minh WebGL hoạt động.
- Timeout/session closed ở test dài không chứng minh assertion sai. Tách tình huống, đo timing, không đổi expected chỉ để lấy pass. Code check không thay visual review toàn bộ cảnh sụp.
- Build xong rồi mới chạy server production cho E2E; không rebuild cùng thư mục .next khi suite đang chạy. Kết quả từ server trộn hai bản build không đủ làm bằng chứng phát hành. Ngân sách thời gian test chức năng phải tách khỏi tiêu chí hiệu năng.
- Hydration `mdl-js` ngoài source cho thấy DOM khác trước hydrate; chưa xác định extension cụ thể. Kiểm tra browser sạch, không mặc định suppressHydrationWarning.
- Lệnh nối bằng `;` có thể trả exit code cuối dù build trước fail. Chạy độc lập hoặc fail-fast, ghi kết quả từng lệnh. Sandbox spawn EPERM cần quyền chạy phù hợp, không tắt kiểm tra TypeScript.

## 2026-09-13 — cài project skills

- `npm run build` đạt sau khi chạy ngoài sandbox; lỗi `spawn EPERM` ở sandbox là giới hạn môi trường, không phải lỗi build hiện tại.
- UI/UX Pro Max installer báo High Risk; chỉ copy skill, không bật hook. Review `SKILL.md` và script trước khi chạy.

## 2026-10-10 — Khu vận hành và kiểm thử với API thật

- **Mock không đủ làm bằng chứng tích hợp.** Chạy giao diện với API thật sớm: mock trả vai trò dạng số nên cột Vai trò hiện "Không xác định" với dữ liệu thật; request tạo tài khoản gửi số bị API từ chối. Ghi bằng chứng mock và API thật riêng.
- **Build test phải dùng `NEXT_PUBLIC_API_BASE_URL=` (rỗng).** Nếu `.env` trỏ API thật, mock Playwright thành khác origin và trình duyệt giấu `ETag`/`Retry-After`, làm vỡ test 412 và đếm ngược Retry-After dù code đúng. Build rồi mới chạy `next start`; không rebuild khi suite đang chạy.
- **Dữ liệu tải muộn không được ghi đè nội dung đang gõ.** Form hồ sơ từng bị ghi đè khi dữ liệu tổ chức về sau lúc người dùng đã nhập, rồi nút Lưu bật lên với giá trị của server. Khóa form tới khi mọi nguồn dữ liệu đã tải xong (không chỉ nguồn đầu tiên).
- **Test hẹn giờ thật nhạy với tải máy.** `google-onboarding:218` dùng proof hết hạn sau 3 giây thật nên lỗi khi máy chạy nhiều tiến trình; pass 10/10 khi rảnh. Dùng đồng hồ giả cho cả hạn proof thay vì thời gian thật.
- **Đối chiếu tài liệu với source/API thật trước khi chặn tính năng.** Tài liệu BE cũ nói PlatformAdmin chưa có API công trình, nhưng API thật cho PlatformAdmin liệt kê/tạo/sửa Building qua `organizationId` (query hoặc body); giao diện từng chặn admin vì tài liệu lỗi thời.
- **Đừng `git add -A` khi có thư mục công cụ trình duyệt.** `.playwright-mcp/` chứa snapshot có dữ liệu thật (email người dùng) và ảnh chụp; thêm vào ignore trước khi commit. Kiểm `git status` và `git show --stat` trước khi push.
- **Windows: xóa worktree.** `git worktree remove` có thể để lại thư mục (đường dẫn quá dài, node_modules). Xác nhận git không còn đăng ký worktree rồi xóa bằng PowerShell với tiền tố `\\?\`; sao lưu ghi chú `.codex/local` của worktree trước khi xóa.
- **Landing — đo hiệu năng:** headless mặc định dùng SwiftShader (~1 FPS) nên không dùng để so FPS; dùng ANGLE D3D11 (`--use-angle=d3d11`) và đo "sync ms" bằng `readPixels`, A/B xen kẽ vì máy dùng chung nhiễu 20–40%. Nút thắt chính là fill-rate theo pixel ratio và overdraw của sprite lửa/khói full-res; pixel ratio thích ứng có hysteresis và lửa instanced trong pass half-res giảm rõ nhất ở màn hình độ phân giải cao, còn ở DPR 1 chỉ khiêm tốn. Giảm bước raymarch của khói tường làm hiện hạt nhiễu, đã hoàn nguyên.
