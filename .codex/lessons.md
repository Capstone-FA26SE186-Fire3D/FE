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
- Hydration `mdl-js` ngoài source cho thấy DOM khác trước hydrate; chưa xác định extension cụ thể. Kiểm tra browser sạch, không mặc định suppressHydrationWarning.
- Lệnh nối bằng `;` có thể trả exit code cuối dù build trước fail. Chạy độc lập hoặc fail-fast, ghi kết quả từng lệnh. Sandbox spawn EPERM cần quyền chạy phù hợp, không tắt kiểm tra TypeScript.

## 2026-09-13 — cài project skills

- `npm run build` đạt sau khi chạy ngoài sandbox; lỗi `spawn EPERM` ở sandbox là giới hạn môi trường, không phải lỗi build hiện tại.
- UI/UX Pro Max installer báo High Risk; chỉ copy skill, không bật hook. Review `SKILL.md` và script trước khi chạy.
