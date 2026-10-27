# Hướng dẫn sử dụng FET3D (phiên bản 1, ngày 27/10/2026)

FET3D là hệ thống tập huấn thoát nạn khi cháy bằng mô hình 3D dựng từ tệp BIM/IFC của công trình. Tài liệu này hướng dẫn cách dùng trang web FET3D (fet3d.io.vn) cho tài khoản tổ chức và học viên: các bước thao tác, cách thiết lập, ý nghĩa trạng thái và cách xử lý lỗi thường gặp. Luồng chính của FET3D là: tải tệp IFC của công trình → hệ thống dựng mô hình 3D → tổ chức soạn kịch bản → quản trị FET3D duyệt nội dung → dựng gói Android và phát hành → học viên quét mã QR và luyện tập trên ứng dụng Android → tổ chức xem báo cáo kết quả.

## Vai trò tài khoản

FET3D có ba loại tài khoản. Tài khoản tổ chức (chủ công trình, đơn vị tổ chức tập huấn) quản lý công trình, tệp IFC, kịch bản, phát hành, mã QR, báo cáo, thanh toán và Trợ lý AI của tổ chức. Học viên là người luyện tập: đọc bài học, quét QR, luyện trên ứng dụng Android và xem lịch sử luyện tập. Quản trị FET3D là đội vận hành hệ thống: duyệt kịch bản, phát hành báo giá, đối soát thanh toán, quản lý bài học công khai, thư viện mẫu và chính sách AI. Sau khi đăng nhập, tài khoản tổ chức được đưa tới trang Công trình (/workspace/buildings), học viên tới Thư viện cá nhân (/learning-hub), quản trị tới Tổng quan (/admin/overview).

## Đăng ký, đăng nhập và tài khoản

Đăng ký tài khoản FET3D: mở trang Đăng nhập, chọn tab «Tạo tài khoản», chọn «Loại tài khoản» là «Học viên» hoặc «Tổ chức». Học viên nhập «Tên người dùng» 3–30 ký tự (chỉ chữ a-z, số, dấu chấm, gạch dưới, gạch ngang). Tổ chức nhập «Tên tổ chức», «Địa chỉ tổ chức» và «Điện thoại tổ chức» (6–15 chữ số). Tổ chức được tạo ngay khi đăng ký, không có màn hình tạo tổ chức riêng. Sau đó nhập Email, Mật khẩu (6–128 ký tự), Xác nhận mật khẩu, bấm «Gửi mã OTP», nhập mã OTP 6 chữ số gửi về email rồi bấm «Xác thực và tạo tài khoản». Mã OTP có hạn 10 phút; nút «Gửi lại mã OTP» làm mã cũ hết hiệu lực.

Đăng nhập FET3D: nhập Email và Mật khẩu rồi bấm «Đăng nhập», hoặc bấm «Tiếp tục với Google». Lần đầu dùng Google sẽ hiện màn hình «Hoàn thiện tài khoản Google» để chọn loại tài khoản và điền thông tin. Nếu email đã có tài khoản đăng ký bằng mật khẩu, hãy đăng nhập bằng mật khẩu trước, sau đó vào trang Tài khoản và bấm «Liên kết Google». Sau khi liên kết Google hoặc đổi mật khẩu, mọi phiên đăng nhập trên các thiết bị bị thu hồi và cần đăng nhập lại; đây là hành vi bảo mật bình thường.

Quên mật khẩu FET3D: mở trang fet3d.io.vn/forgot-password, nhập email và bấm «Gửi yêu cầu», rồi làm theo hướng dẫn nhận được. Trang đặt lại mật khẩu (/reset-password) yêu cầu mật khẩu mới tối thiểu 8 ký tự. Liên kết đặt lại mật khẩu chỉ dùng được một lần và có hạn; nếu báo hết hạn hoặc đã dùng, hãy gửi yêu cầu mới.

Trang Tài khoản của bạn (/account): đổi ảnh đại diện (JPEG, PNG hoặc WebP, tối đa 5 MB, tối đa 4096×4096 điểm ảnh), sửa «Thông tin cá nhân» (họ tên, tên người dùng, ngày sinh, giới tính, số điện thoại) rồi bấm «Lưu hồ sơ cá nhân». Email không đổi được. Mục «Bảo mật» để đổi mật khẩu: nhập mật khẩu hiện tại, mật khẩu mới và xác nhận, bấm «Đổi mật khẩu»; tài khoản chỉ đăng nhập bằng Google không có mục này. Hiện chưa có chức năng hủy liên kết Google.

Hồ sơ tổ chức (menu «Hồ sơ tổ chức», /workspace/profile): sửa «Tên tổ chức», «Địa chỉ» (được in trên báo giá) và «Số điện thoại», bấm «Lưu hồ sơ». «Mã tổ chức» chỉ đọc, không đổi được. Nếu báo «Hồ sơ đã được cập nhật ở nơi khác», bấm «Tải bản mới»; các ô bạn đang sửa vẫn được giữ. Nếu trang báo «Tài khoản chưa thuộc tổ chức nào», hãy liên hệ quản trị FET3D.

## Điều hướng khu tổ chức

Thanh bên của khu tổ chức («Không gian tổ chức») gồm: nhóm Huấn luyện có «Công trình», «Thư viện mẫu», «Trợ lý AI»; nhóm Theo dõi có «Báo cáo»; nhóm Quản lý có «Dịch vụ & thanh toán», «Hỗ trợ & phản hồi», «Hồ sơ tổ chức»; nhóm Công cụ có «Quét mô hình IFC»; cùng liên kết «Khám phá bài học», nút «Thu gọn» và «Đăng xuất». Khi đang mở một công trình, thanh bên hiện 6 bước của công trình: Thông tin → IFC và xử lý → Soạn kịch bản → Phiên bản → Phát hành → Sử dụng.

Công cụ «Quét mô hình IFC» (/workspace/ifc) chỉ để xem nhanh một tệp IFC ngay trong trình duyệt: tệp không được tải lên máy chủ và không lưu vào công trình nào. Công cụ hỗ trợ IFC2X3 và IFC4, có các chế độ mặt bằng, mặt đứng, mặt cắt, nhìn xuyên, lớp hiển thị, chọn tầng, và cho biết tệp đã đủ "điểm neo" chưa (không gian có thể đặt nguồn cháy, cầu thang, cửa/lối thoát). Muốn dùng mô hình cho tập huấn thì phải tải IFC vào một công trình.

## Công trình

Tạo công trình mới: vào «Công trình», bấm «Thêm công trình», điền «Tên công trình» (bắt buộc, tối đa 200 ký tự), «Loại công trình» (chọn gợi ý như Chung cư, Trường học, Bệnh viện, Văn phòng, Nhà máy… hoặc gõ tự do), «Số tầng» (bắt buộc, số nguyên từ 1), «Tỉnh / Thành phố», «Quận / Huyện», «Địa chỉ» (tối đa 300 ký tự), rồi bấm «Tạo công trình». Hệ thống mở ngay tab IFC của công trình mới. Nên điền đủ tên và địa chỉ vì báo giá dịch vụ yêu cầu công trình có tên và địa chỉ.

Danh sách công trình có các cột Công trình, Loại, Tầng, Bước hiện tại, Cập nhật, Việc tiếp theo. Nút ở cột «Việc tiếp theo» đưa thẳng tới việc cần làm: «Chưa có IFC» → nút «Tải IFC»; «IFC đang xử lý», «IFC cần sửa», «IFC lỗi» → nút «Xem tiến trình»; «Sẵn sàng soạn kịch bản» hoặc «Đang soạn kịch bản» → nút «Soạn kịch bản». Có ô tìm theo tên, bộ lọc «Trạng thái» (Đang dùng, Đã lưu trữ, Tất cả), lọc «Loại», và chuyển giữa dạng bảng và dạng thẻ.

Sửa thông tin công trình: mở menu ··· ở hàng công trình (hoặc menu ··· trong trang chi tiết) → «Sửa thông tin», sửa rồi bấm «Lưu thay đổi». Nếu báo «Công trình vừa được thay đổi ở nơi khác», nghĩa là có người khác vừa sửa: bấm «Dùng bản mới nhất» để xem bản mới, hoặc bấm lưu lần nữa để ghi đè bằng nội dung của bạn.

Lưu trữ công trình: chỉ làm ở danh sách công trình, menu ··· của hàng → «Lưu trữ» → xác nhận. Lưu trữ không hoàn tác được (chưa có chức năng khôi phục). Dữ liệu IFC và kịch bản không bị xóa, công trình đã lưu trữ vẫn xem được bằng bộ lọc «Đã lưu trữ» nhưng không sửa được và không mua dịch vụ được.

Trang chi tiết công trình có tiêu đề kèm chip «Công khai»/«Riêng tư» và chip dịch vụ («Dịch vụ đến … · còn N ngày», «Dịch vụ đã hết hạn», «Chưa có dịch vụ»), nút «Mã QR công trình», menu ··· gồm «Sửa thông tin», «Tải IFC mới», «Tải lại dữ liệu», và 5 tab: «Hành trình», «IFC», «Kịch bản», «Truy cập», «Dịch vụ». Tab Hành trình cho biết bước nào «Hoàn tất», «Đang làm» hay «Khoá» và lý do khóa: Soạn kịch bản cần mô hình IFC sẵn sàng trước; Phiên bản cần lưu bản nháp trước; Chuẩn bị phát hành cần nội dung được duyệt; Quản lý sử dụng mở sau khi phát hành.

## Tải và xử lý tệp IFC

Tải tệp IFC lên công trình: mở công trình → tab «IFC» → bấm «Tải IFC» (hoặc menu ··· → «Tải IFC mới»). Kéo thả tệp .ifc vào ô hoặc bấm để chọn tệp, nhập «Tên bản IFC» (bắt buộc, tối đa 100 ký tự), bấm «Tải lên và xử lý». Tiến trình gồm: Chọn tệp → Kiểm tra (tính mã băm ngay trên máy) → Tải lên (hiện phần trăm) → Xác nhận → Xử lý. Trong lúc tải không đóng được hộp thoại; có nút «Hủy tải lên». Khi báo «Đã gửi xử lý IFC», mô hình chưa xong, hãy theo dõi ở mục «Tiến trình». Mỗi lần tải tạo một bản IFC mới; bản cũ chuyển thành «Đã được thay thế».

Định dạng IFC được nhận: chỉ tệp có đuôi .ifc, không rỗng, nội dung là IFC thật, phiên bản IFC2X3, IFC4 hoặc IFC4X3. Tệp Revit (.rvt) đổi tên, tệp nén (.zip) hay định dạng khác bị từ chối. Cách xuất IFC: trong Revit dùng File → Export → IFC; trong ArchiCAD dùng Save As → IFC. Nên dùng mô hình kiến trúc có phòng (IfcSpace) đặt tên rõ, có cửa và cầu thang; nên bật xuất phòng (Export rooms/spaces) khi xuất. Mô hình quá nặng nên giảm mức chi tiết khi xuất.

Khi tải IFC bị lỗi, nút sẽ đổi thành «Thử lại», «Gửi lại yêu cầu xử lý» (khi tệp đã được lưu) hoặc «Bắt đầu lại». Thử lại không tạo bản trùng. Các lỗi hay gặp: phiên tải lên hết hạn (bắt đầu lại), liên kết tải lên hết hạn (bấm Thử lại để nhận liên kết mới), tệp trên kho không khớp với tệp đã chọn hoặc tệp bị thay đổi trong lúc tải (tải lại từ đầu, không sửa tệp khi đang tải), kho lưu trữ bận hoặc mất kết nối (thử lại), «Tính năng tải IFC đang tạm tắt» (thử lại sau hoặc gửi hỗ trợ).

Trạng thái bản IFC: «Bản nháp», «Đã tải lên», «Đang xử lý», «Cần sửa mô hình», «Sẵn sàng soạn kịch bản», «Đã xác nhận dùng cho huấn luyện», «Bị từ chối», «Xử lý thất bại», «Đã được thay thế». Chỉ khi bản IFC «Sẵn sàng soạn kịch bản» hoặc «Đã xác nhận dùng cho huấn luyện» thì mới soạn kịch bản được. Thanh tiến trình của bản IFC gồm: Tải lên → Kiểm tra tệp → Dựng mô hình 3D → Kiểm tra tự động → (Xác nhận cửa thoát, chỉ khi cần) → Sẵn sàng soạn kịch bản.

Trạng thái lượt xử lý IFC (máy xử lý): «Đang chờ máy xử lý», «Đang xử lý», «Đã xử lý xong», «Xử lý thất bại», «Đã hủy», «Chưa xử lý». Máy xử lý lần lượt kiểm tra tệp, đọc IFC, làm sạch mô hình, giảm độ chi tiết, tạo đường đi, tạo vùng nguy hiểm, xuất mô hình 3D (GLB) và đóng gói. Trang tự cập nhật vài giây một lần. «Đã xử lý xong» chưa có nghĩa là mô hình đạt kiểm tra; hãy xem kết quả kiểm tra tự động. Thời gian xử lý tùy độ lớn của mô hình và hàng chờ.

Kiểm tra tự động của mô hình IFC cho kết quả «Kiểm tra đạt» hoặc «Kiểm tra không đạt», kèm danh sách vấn đề ở mục «Kỹ thuật». Mức độ vấn đề: «Nghiêm trọng» và «Lỗi» chặn việc dùng mô hình; «Cảnh báo» và «Thông tin» chỉ để biết, không chặn.

IFC báo «Xử lý thất bại»: mở mục Tiến trình, bấm chạy lại, nhập «Lý do chạy lại» (bắt buộc, tối đa 1000 ký tự) rồi bấm «Chạy lại». Chỉ lượt bị lỗi mới chạy lại được; lượt đã hủy hoặc đã xử lý xong không chạy lại được. Nếu chạy lại vẫn lỗi, hãy kiểm tra lại tệp, xuất IFC mới và tải lên; nếu vẫn lỗi, gửi yêu cầu hỗ trợ kèm Mã ở hộp «Thông tin cho bộ phận hỗ trợ».

IFC báo «Cần sửa mô hình» (kiểm tra không đạt): xem từng vấn đề ở mục «Kỹ thuật». Lỗi nằm trong mô hình phải sửa trong phần mềm thiết kế (Revit, ArchiCAD…) rồi tải IFC mới, vì FET3D không sửa tệp IFC. Riêng trường hợp chưa xác định được cửa thoát ra ngoài thì không cần tải lại (xem đoạn về cửa thoát).

Ý nghĩa các vấn đề kiểm tra IFC và cách xử lý: Cấu kiện không có hình khối 3D (IFC_NO_BODY_GEOMETRY) → xuất lại IFC có hình khối. Mô hình không có phòng (IFC_NO_SPACES) → bật xuất phòng/IfcSpace trong phần mềm thiết kế rồi tải lại. Phòng chưa có tên (IFC_SPACE_UNNAMED) → đặt tên phòng trong mô hình. Không phải mô hình kiến trúc (IFC_NOT_ARCHITECTURAL) → tệp chỉ có kết cấu hoặc cơ điện, hãy tải tệp kiến trúc. Mô hình quá nặng (IFC_TRIANGLE_BUDGET_EXCEEDED) → xuất lại với mức chi tiết thấp hơn hoặc bỏ đồ đạc chi tiết.

Các vấn đề IFC không chặn: IFC không có thiết bị báo cháy/chữa cháy (IFC_NO_FIRE_EQUIPMENT) → đặt thiết bị trong trình soạn kịch bản. IFC không có nguồn nước (IFC_NO_WATER_SOURCE) → đặt nguồn nước trong trình soạn nếu kịch bản cần. Thiết bị phát hiện có độ tin cậy thấp (IFC_LOW_CONFIDENCE_DEVICE) → xác nhận hoặc loại bỏ thiết bị đó ở mục Thiết bị. Phòng không có sàn bên dưới (IFC_NO_FLOOR_UNDER_SPACE) → hệ thống đã tự tạo sàn, hãy kiểm tra lại trong xem trước 3D. Vật liệu chưa có trong từ điển (IFC_UNMAPPED_MATERIAL) → mô hình vẫn dùng được.

Chưa xác định được cửa thoát ra ngoài (IFC_EXIT_UNKNOWN, bước «Chọn cửa thoát ra ngoài»): vào tab IFC → mục «Thiết bị», tìm cửa dẫn ra ngoài, bấm «Làm cửa thoát» rồi bấm «Lưu quyết định». Không cần tải lại IFC.

Mục «Thiết bị» của tab IFC («Thiết bị phát hiện từ IFC») liệt kê thiết bị PCCC, nguồn nước, cửa và thang máy hệ thống đọc được từ IFC, chỉ có sau khi mô hình qua kiểm tra tự động. Mỗi dòng có thao tác «Xác nhận», «Đổi loại…», «Làm cửa thoát», «Loại bỏ», «Dùng gợi ý» (lấy quyết định từ bản IFC trước) và «Xem trong mô hình». Lưu bằng «Lưu quyết định». Quyết định này không sửa tệp IFC hay kịch bản; thiết bị đã xác nhận có thể đưa vào kịch bản bằng nút «Thêm thiết bị đã xác nhận» trong trình soạn.

Mục «Xem trước 3D» hiển thị mô hình 3D do hệ thống dựng (không phải tệp IFC trên máy bạn). Khi mô hình chưa sẵn sàng, trang tự kiểm tra lại mỗi 5 giây, có nút «Kiểm tra lại». Xem được mô hình chưa có nghĩa là đã được phép huấn luyện hay phát hành. Nếu báo «Mô hình được tạo bằng bản xử lý cũ», hãy tải lên IFC mới. Mục «Ghi chú» cho phép thêm ghi chú lên cấu kiện (mã cấu kiện IFC, nhãn tối đa 200 ký tự, nội dung tối đa 2000 ký tự, tối đa 500 ghi chú); ghi chú lưu riêng, không thay đổi mô hình.

Xác nhận mô hình dùng được cho huấn luyện: ở tab IFC mục Tiến trình có khung «Xác nhận mô hình dùng được cho huấn luyện». Điều kiện: lượt xử lý mới nhất «Kiểm tra đạt» và đã có ít nhất một phiên bản kịch bản dựng trên bản IFC này. Chọn «Phiên bản kịch bản», bấm «Xác nhận dùng cho huấn luyện» rồi xác nhận; bản IFC chuyển sang «Đã xác nhận dùng cho huấn luyện». Đây là xác nhận kỹ thuật cho mô hình 3D, không phải duyệt nội dung. Mỗi bản IFC mới phải xác nhận lại.

## Soạn kịch bản

Tạo kịch bản: mở công trình → tab «Kịch bản» → bấm «Tạo kịch bản», nhập «Tên kịch bản» (bắt buộc, tối đa 200 ký tự) → «Tạo và mở trình soạn». Ở màn «Soạn kịch bản», mở một bản nháp đã lưu bằng «Mở bản nháp», hoặc tạo bản nháp mới trên một bản IFC bằng «Tạo bản nháp». Nếu báo «Bản IFC chưa sẵn sàng soạn kịch bản» hoặc «Cần xử lý lại IFC để soạn trên mô hình 3D», hãy bấm «Mở tab IFC của công trình» để xử lý IFC trước.

Trình soạn kịch bản («Soạn trên mô hình 3D») có các thẻ «Đối tượng», «Kịch bản», «Thư viện», «Kiểm tra (N)», «Mô hình», «Khả dụng» và khung «Tầng và đối tượng». Đặt đối tượng bằng cách chọn tầng rồi bấm lên mô hình. Loại đối tượng: «Điểm xuất phát» (bắt buộc có ít nhất 1, nơi học viên bắt đầu), «Nguy cơ» (nguồn cháy, khói…), «Điểm đến» (ví dụ lối ra an toàn), «NPC» (nhân vật mô phỏng), «Cấu kiện bị chặn» (bắt buộc chọn cấu kiện neo, ví dụ cửa bị kẹt) và «Thiết bị» (bình chữa cháy, nút báo cháy…).

Thông tin kịch bản trong trình soạn: «Tên kịch bản» (1–255 ký tự), «Mục tiêu học tập» (tối đa 50 mục, mỗi mục tối đa 1000 ký tự), «Hướng dẫn cho người học» (1–10.000 ký tự), «Thời gian tối đa» (1–86.400 giây), chế độ huấn luyện «Học», «Có hướng dẫn» hoặc «Đánh giá», «Phiên bản ứng dụng», và tiêu chí chấm (rubric) gồm «Ngưỡng đạt», «Mã tiêu chí», «Chỉ số», «Toán tử», «Ngưỡng», «Trọng số» (tối đa 100 tiêu chí). Một kịch bản có tối đa 2000 đối tượng.

Lưu và kiểm tra kịch bản: thanh công cụ có «Kiểm tra» (kiểm với máy chủ, không lưu), «Lưu» (phím tắt Ctrl+S hoặc Cmd+S), «Chạy thử» và «Phiên bản». Trạng thái lưu hiển thị: «Đã lưu», «Chưa lưu», «Đang lưu…», «Xung đột», «Lỗi khi lưu», «Chưa hợp lệ để lưu». Rời trang khi chưa lưu sẽ được hỏi lại. Nếu báo bản nháp đã được thay đổi ở nơi khác (xung đột), chưa có gì bị ghi đè: bấm «Tải bản mới để đối chiếu» và chọn giữ từng phần, hoặc «Giữ bản của tôi, quyết định sau». Nếu báo lỗi cấu trúc, xem danh sách ở thẻ «Kiểm tra» và sửa; nội dung của bạn vẫn được giữ.

## Thư viện mẫu

Thư viện mẫu (menu «Thư viện mẫu») chứa nội dung chuẩn do quản trị FET3D xuất bản: «Kịch bản mẫu» (phần nội dung, không gồm vị trí trên mô hình), «Tiêu chí chấm mẫu» và «Thiết bị» (mô tả thiết bị ứng dụng hỗ trợ). Thư viện chỉ để xem; tìm theo mã hoặc tên mẫu, lọc theo yêu cầu, bấm «Xem chi tiết». Không bắt buộc dùng mẫu, vẫn soạn tay được đầy đủ.

Dùng mẫu từ thư viện: bấm «Dùng làm mẫu» → chọn «Công trình» và «Kịch bản» → «Mở trình soạn thảo». Trình soạn mở ở thẻ «Thư viện»: chọn bản nháp, «Xem trước thay đổi», chọn cách xử lý từng nhóm (điền vào ô trống, thay, hợp nhất hoặc giữ nguyên), bấm «Xem lại và áp dụng» → «Áp dụng», sau đó bấm «Lưu». Áp dụng là sao chép: mẫu cập nhật về sau không làm đổi bản nháp, phiên bản hay bài đã phát hành. Có nút «Hoàn tác lần áp dụng này». Cần có công trình đang hoạt động và đã có kịch bản.

## Phiên bản, duyệt nội dung và phát hành

Tạo phiên bản kịch bản: trong trình soạn bấm «Phiên bản» (trang «Phiên bản và phát hành») → «Tạo phiên bản mới» → chọn bản nháp → «Kiểm tra bản nháp» → «Tạo phiên bản». Phiên bản là bản đóng băng: nội dung và tiêu chí chấm bị khóa, không sửa được. Muốn sửa thì sửa bản nháp và tạo phiên bản mới; phiên bản mới phải gửi duyệt lại. Mỗi phiên bản có các tab «Tổng quan», «Dựng gói», «Kiểm tra», «Gửi duyệt», «Phát hành», «Chạy thử». Để phát hành cần đủ ba điều kiện độc lập: gói đã kiểm tra đạt và được chốt, nội dung được quản trị FET3D duyệt, và bấm phát hành khi công trình có dịch vụ còn hiệu lực.

Gửi duyệt kịch bản: ở tab «Gửi duyệt» của phiên bản, bấm «Gửi duyệt» → xác nhận. Mỗi phiên bản chỉ gửi duyệt một lần. Có thể gửi duyệt trước khi dựng gói xong. Người duyệt là quản trị FET3D. Trạng thái duyệt: «Chưa gửi duyệt», «Chờ duyệt» (đang chờ quản trị FET3D), «Đã duyệt», «Bị từ chối» kèm lý do. Khi bị từ chối, sửa bản nháp theo lý do, tạo phiên bản mới và gửi duyệt lại. Thời gian duyệt tùy đội quản trị; nếu chờ lâu có thể gửi yêu cầu hỗ trợ.

Dựng gói (tab «Dựng gói» của phiên bản): chọn «Loại gói» là «Gói phát hành» (để phát hành cho học viên) hoặc «Gói chạy thử» (để tổ chức tự chạy thử trên điện thoại, không phát hành), chọn «Nền tảng» (hiện chỉ có Android), bấm «Dựng gói». Trạng thái lượt dựng: «Chờ máy dựng», «Đang dựng», «Dựng xong», «Dựng lỗi», «Đã hủy». Lượt dựng lỗi chạy lại bằng «Chạy lại job» kèm «Lý do dựng lại». Dựng xong, hệ thống tự kiểm tra gói. Gói phát hành và gói chạy thử là hai loại khác nhau, cần dựng riêng.

Chốt gói phát hành (tab «Kiểm tra»): xem «Kết quả kiểm tra tự động». Khi «Kiểm tra đạt» và không còn lỗi chặn («Lỗi», «Nghiêm trọng»), bấm «Chốt gói phát hành». Chốt gói là xác nhận dùng đúng gói vừa kiểm tra đạt, không phải duyệt nội dung. Trạng thái kỹ thuật: «Chưa dựng gói», «Đang dựng», «Dựng lỗi», «Dựng xong, chờ kiểm tra», «Kiểm tra không đạt», «Kiểm tra đạt, chờ chốt», «Đã chốt gói». Khung «Còn thiếu gì để phát hành?» liệt kê điều kiện còn thiếu.

Phát hành cho học viên (tab «Phát hành»): khi nội dung «Đã duyệt» và gói «Đã chốt», bấm «Tạo bản phát hành». Bản phát hành ở trạng thái «Đã tạo, chưa phát hành», học viên chưa dùng được. Bấm «Phát hành»: hệ thống kiểm tra lại duyệt, gói và dịch vụ của công trình, rồi chuyển sang «Đã phát hành» và học viên dùng được. Phát hành cần dịch vụ trả phí (gói 6 hoặc 12 tháng) còn hiệu lực; gói dùng thử không đủ để phát hành. Muốn ngừng, bấm «Thu hồi bản phát hành» và nhập lý do (1–1000 ký tự); trạng thái chuyển «Đã thu hồi».

Không thấy nút phát hành hoặc không phát hành được: kiểm tra đủ ba điều kiện: (1) phiên bản «Đã duyệt»; (2) gói phát hành «Đã chốt gói» ở tab Kiểm tra; (3) công trình có dịch vụ trả phí còn hiệu lực (tab Dịch vụ của công trình hoặc mục Dịch vụ & thanh toán). Nếu báo «Gói không tương thích với phiên bản ứng dụng hiện tại», hãy dựng lại gói. Nếu báo kết quả kiểm tra không còn khớp với gói mới nhất (gói vừa dựng lại), tải lại trang rồi chốt lại.

Chạy thử trên điện thoại (tab «Chạy thử», không bắt buộc): cần một gói chạy thử đã dựng xong và kiểm tra đạt, và công trình có dịch vụ còn hiệu lực hoặc gói dùng thử còn lượt. Bấm «Bắt đầu chạy thử» → «Tạo mã QR mở trên điện thoại», quét bằng ứng dụng FET3D trên Android đã đăng nhập cùng tài khoản tổ chức. Mã dùng một lần, hết hạn sau 5 phút; có «Mã dự phòng», «Sao chép mã», «Sao chép liên kết», «Cấp lại mã». Trạng thái: «Đã chuẩn bị» (chưa trừ lượt dùng thử), «Điện thoại đã nhận mã», «Đang khởi chạy», «Đang chạy trên thiết bị», «Đã hoàn tất» (kết quả hiện trên web, không tính vào báo cáo học viên), «Đã hủy». Lượt dùng thử đã trừ không được hoàn khi hủy.

## Học viên tham gia: chế độ truy cập, mã tham gia và mã QR

FET3D không có màn hình gán hay mời từng học viên. Học viên tham gia công trình bằng mã QR của công trình, và nếu công trình riêng tư thì thêm mã tham gia. Thiết lập ở tab «Truy cập» của công trình. Chế độ «Công khai (chỉ cần đăng nhập)»: học viên nào đăng nhập và quét QR đều tham gia được. Chế độ «Riêng tư (cần mã tham gia)»: học viên phải nhập mã tham gia do tổ chức cung cấp. Đổi chế độ bằng «Áp dụng chế độ»; đổi chế độ làm mất quyền của mọi học viên đã xác thực trước đó.

Mã tham gia (công trình riêng tư): bấm «Tạo mã tham gia» hoặc «Tạo mã mới». Mã chỉ hiển thị một lần: bấm «Sao chép», gửi cho học viên, rồi bấm «Tôi đã lưu mã, ẩn đi». «Thu hồi mã» có hiệu lực ngay và không hoàn tác. Tạo mã mới hoặc thu hồi mã đều làm mất quyền đã cấp bằng mã cũ, học viên phải nhập mã mới. Học viên nhập mã dài 8–128 ký tự, không có khoảng trắng.

Mã QR công trình: bấm «Mã QR công trình» hoặc tab Truy cập → «Mã QR» → «Tạo mã QR». Mỗi công trình chỉ có một mã QR đang hoạt động, và mã chỉ hiển thị một lần khi tạo; có các nút «Sao chép liên kết», «In mã QR», «Ẩn mã», «Tạo mã mới», «Thu hồi mã», «Lịch sử mã». Tạo mã mới làm mã cũ ngừng ngay, phải thay bản in cũ. Mã QR chỉ xác định công trình, không cấp quyền học. Nếu báo «Công trình đã có mã QR đang hoạt động», hãy dùng «Tạo mã mới» vì mã cũ không xem lại được.

Học viên vào bài tập huấn như thế nào: (1) quét mã QR công trình, trang công trình mở ra, đăng nhập bằng tài khoản học viên; (2) nếu công trình riêng tư, nhập «Mã tham gia» rồi bấm «Xác minh mã»; (3) xem danh sách «Bài tập huấn» đã phát hành; (4) cài ứng dụng FET3D trên điện thoại Android, đăng nhập, quét lại mã QR trong ứng dụng và chọn bài. Bài tập không chạy trên web. Điện thoại cần có mạng khi bắt đầu bài. Khi bắt đầu, hệ thống kiểm tra lại quyền tham gia, hạn dịch vụ và số suất học viên.

Học viên không vào được bài: kiểm tra (1) công trình đang Riêng tư hay Công khai, học viên đã nhập đúng mã tham gia hiện hành chưa (tạo mã mới, thu hồi mã hoặc đổi chế độ làm mã cũ mất hiệu lực); (2) mã QR có bị tạo lại hoặc thu hồi không (khi đó trang báo «Không tìm thấy công trình»); (3) bài đã «Đã phát hành» chưa hay đã bị thu hồi; (4) dịch vụ của công trình còn hạn không; (5) công trình còn suất học viên trong kỳ không. Học viên báo «Mã tham gia không đúng hoặc tổ chức đã đổi mã» thì gửi lại mã hiện hành. Chỉ tài khoản học viên mới nhập được mã tham gia.

## Dịch vụ, gói và thanh toán

Dịch vụ công trình là gói trả phí theo từng công trình, thời hạn 6 hoặc 12 tháng, có số học viên tối đa mỗi kỳ và kèm hạn mức AI trả trước. Một suất học viên được tính khi một học viên khác nhau bắt đầu học trực tuyến lần đầu trong kỳ; học viên đã được tính thì học lại không tốn thêm suất. Khi «Đã hết suất học viên», học viên mới không bắt đầu được nhưng người đã được tính vẫn học tiếp; muốn thêm thì «Nâng cấp học viên». Dùng thử chỉ để chạy thử, không có suất học viên và không đủ để phát hành. Giá, gói và hạn mức do quản trị FET3D cấu hình.

Trang «Dịch vụ & thanh toán» (/workspace/billing) có các tab «Dịch vụ theo công trình», «Báo giá và thanh toán», «Hạn mức AI», «Nhắc gia hạn», «Số lượng lớn», và các nút «Nạp hạn mức AI», «+ Mua gói công trình». Chỉ tài khoản tổ chức mua được. Trạng thái dịch vụ công trình: «Đang hiệu lực», «Sắp hết hạn» (còn 5 ngày trở xuống), «Đã hết hạn», «Chưa đến kỳ», «Chưa có dịch vụ». Nút theo trạng thái: «Mua gói», «Gia hạn», «Nâng cấp». Bấm một hàng để xem kỳ hiện tại, kỳ sắp tới, học viên tối đa và suất đã dùng.

Mua gói dịch vụ cho công trình: bấm «+ Mua gói công trình» (hoặc «Mua gói»), chọn loại «Mua mới / gia hạn», tick các công trình (tối đa 100 công trình mỗi báo giá; công trình phải có tên và địa chỉ), chọn gói ở mục Gói («Gói 6 tháng» hoặc «Gói 12 tháng», giá tính theo tháng mỗi công trình, ghi số học viên mỗi kỳ và hạn mức AI kèm theo), bấm «Tạo báo giá». Hệ thống tự xác định từng công trình là mua mới hay gia hạn. Báo giá vừa tạo là bản nháp: quản trị FET3D phải phát hành báo giá thì tổ chức mới chấp nhận và thanh toán được.

Nâng cấp số học viên: chọn loại báo giá «Nâng cấp» cho công trình đang có kỳ hiệu lực, chọn gói đích có số học viên cao hơn mức hiện tại. Kỳ dịch vụ và suất đã dùng được giữ nguyên; phí nâng cấp là phí một lần. Nếu báo «Gói đích phải có số học viên lớn hơn mức hiện tại», hãy chọn gói lớn hơn. Cần trên 100 công trình thì dùng tab «Số lượng lớn»: điền số công trình dự kiến, thời hạn mong muốn, người liên hệ, email, số điện thoại, ghi chú, bấm «Gửi yêu cầu»; đội FET3D sẽ liên hệ và lập báo giá.

Trạng thái báo giá và việc cần làm: «Bản nháp · chờ phát hành» → chờ quản trị FET3D phát hành, bấm «Tải lại trạng thái» để xem; «Đã phát hành · chờ chấp nhận» → tick ô đồng ý điều khoản và tổng thanh toán rồi bấm «Chấp nhận báo giá» (chấp nhận chưa phát sinh phí); «Đã chấp nhận» → bấm «Thanh toán qua PayOS»; «Hết hạn» → tạo báo giá mới; «Đã hủy» → không dùng được nữa. Hủy báo giá bằng «Hủy báo giá» kèm lý do; nếu đang có thanh toán mở thì phải hủy thanh toán đó trước.

Thanh toán qua PayOS: bấm «Thanh toán qua PayOS», hệ thống tạo liên kết và chuyển sang trang PayOS để chuyển khoản/quét mã. Trả tiền xong PayOS đưa về trang «Đang kiểm tra thanh toán»; việc quay về chỉ là điều hướng, chưa chứng minh đã trả tiền. Tiến trình gồm Chấp nhận báo giá → Thanh toán qua PayOS → Kích hoạt dịch vụ; trang tự cập nhật, có nút «Kiểm tra ngay». Chỉ khi thấy «Đã thanh toán và kích hoạt dịch vụ» thì dịch vụ mới có hiệu lực. Liên kết hết hạn, bị hủy hoặc thất bại thì bấm «Tạo lại thanh toán», hệ thống không tính tiền hai lần. «Hủy thanh toán» chỉ làm được khi PayOS chưa xác nhận tiền.

Thanh toán bị kẹt hoặc chưa kích hoạt: «Đang chờ PayOS xác nhận thanh toán» → hoàn tất trên trang PayOS rồi chờ. «Đã nhận tiền · đang kích hoạt dịch vụ» → không cần làm gì, trang tự cập nhật. «Đã nhận tiền · mới kích hoạt một phần» hoặc «cần đối soát» → không thanh toán lại; hệ thống tự thử lại, nếu kéo dài hãy gửi yêu cầu hỗ trợ kèm mã đơn (orderCode) hoặc số báo giá để quản trị FET3D đối soát. Nếu tiền vào cho một báo giá đã hủy, dịch vụ không tự kích hoạt và tiền không tự hoàn: gửi hỗ trợ kèm mã giao dịch.

Nhắc gia hạn: hệ thống nhắc 5 ngày trước khi kỳ dịch vụ hết hạn, hiện ở tab «Nhắc gia hạn» và banner «N nhắc gia hạn chưa đọc» trên trang. Mỗi nhắc có nút «Gia hạn» và «Đã đọc». Dịch vụ hết hạn thì học viên vẫn xem được trang công trình nhưng không bắt đầu được phiên luyện tập mới, và không phát hành được bài mới.

## Hạn mức AI

Hạn mức AI là quỹ trả trước dùng chung cho cả tổ chức, không chia theo công trình. Gói công trình, nâng cấp và nạp thêm đều cộng vào cùng quỹ; mỗi lần cấp có hạn dùng riêng, phần hết hạn chưa dùng không cộng sang kỳ sau. Tab «Hạn mức AI» hiển thị «Còn dùng được» (= đã cấp − đang tạm trừ − đã dùng), «Đã cấp (còn hiệu lực)», «Đang tạm trừ», «Đã dùng», «Đã hết hạn chưa dùng», «Sắp có hiệu lực», cùng «Lịch sử cấp hạn mức», «Báo giá nạp thêm» và «Lịch sử sử dụng» (Đang tạm trừ, Đã tính, Đã hoàn lại).

Đơn vị hạn mức AI: «lượt hỏi» (requests), mỗi câu hỏi hoặc yêu cầu tính 1 lượt; hoặc «token», tính theo lượng chữ AI đọc và viết. Hai đơn vị không quy đổi lẫn nhau. Hiện FET3D tính Trợ lý AI theo lượt hỏi. Một lần gửi tính một lượt hỏi, kể cả khi trong tin nhắn có nhiều câu, miễn là không vượt giới hạn ký tự.

Tạm trừ hạn mức AI là gì: khi gửi một câu hỏi, hệ thống trừ tạm một phần hạn mức (số «Tạm trừ mỗi câu hỏi», với lượt hỏi là 1) để không ai dùng quá. AI trả lời xong thì chỉ tính phần thực dùng, phần dư được hoàn lại; AI lỗi thì hoàn lại hết. Vì vậy «Đã dùng» ở thẻ hạn mức có thể gồm cả phần đang tạm trừ trong vài giây.

Nạp thêm hạn mức AI: bấm «Nạp hạn mức AI» (hoặc nút «Nạp thêm hạn mức» khi hết), chọn loại báo giá «Hạn mức AI», nhập «Số lượng muốn mua» (có thể để trống), bấm «Tạo báo giá nạp thêm», chờ quản trị phát hành báo giá, chấp nhận rồi thanh toán qua PayOS và chờ kích hoạt. Nạp thêm không gia hạn hay nâng cấp công trình. Khi hết hạn mức («Hạn mức AI đã hết» hoặc «Chưa có hạn mức AI»), không gửi được yêu cầu AI mới; hệ thống không tính vượt mức và không ghi nợ.

## Trợ lý AI

Trợ lý AI của tổ chức: nút «Hỏi Trợ lý AI» (biểu tượng ✦) nằm ở góc dưới bên phải mọi trang trong khu tổ chức. Đầu khung chat hiện hạn mức còn lại («Còn N lượt hỏi»). Nếu đang ở trong một công trình, khung hiện ngữ cảnh «Đang xem · Công trình › Kịch bản». Có hai chế độ: «Hỏi đáp» (hỏi về quy định thoát nạn, thiết bị PCCC, kịch bản, cách dùng FET3D) và «Đề xuất kịch bản» (mô tả mục tiêu, người học, bối cảnh; cần chọn công trình có bản IFC sẵn sàng). Enter để gửi, Shift+Enter để xuống dòng, Esc để đóng; nút «Mở rộng» mở khung rộng hơn. Giới hạn ký tự hiển thị dưới ô nhập và do chính sách AI quy định.

Trợ lý AI trả lời dựa trên đâu: AI chỉ trả lời từ các nguồn tri thức đã được quản trị FET3D duyệt (văn bản pháp luật và quy chuẩn PCCC, tài liệu an toàn cháy, hướng dẫn sử dụng FET3D này) và luôn kèm «Nguồn trích dẫn». AI không xem được dữ liệu riêng của tổ chức như lỗi cụ thể của một lượt xử lý, giao dịch hay tài khoản; với các trường hợp đó hãy gửi yêu cầu hỗ trợ kèm Mã. AI có thể sai, hãy kiểm tra nguồn. AI chỉ đề xuất: không tự sửa kịch bản, không phát hành, và không phải chứng nhận an toàn PCCC.

Dùng đề xuất kịch bản của AI: ở chế độ «Đề xuất kịch bản», sau khi AI trả lời, bấm «Dùng làm bản nháp» hoặc «Áp dụng vào bản nháp…», chọn «Công trình» → «Kịch bản» → «Mở trình soạn thảo». Thay đổi được đưa vào trình soạn ở trạng thái chưa lưu và hoàn tác được; xem lại rồi bấm «Lưu». Đề xuất đã hoàn tất được lưu ở trang «Trợ lý AI» → tab «Đề xuất đã lưu».

Trang Trợ lý AI (/workspace/ai) có tab «Lịch sử hội thoại» (lọc theo loại yêu cầu, trạng thái, kết quả, «Chỉ của tôi»; bấm một hàng để đọc lại), «Đề xuất đã lưu» và «Hạn mức & giới hạn» (cho mỗi thao tác: «Tạm trừ mỗi câu hỏi», «Đầu vào tối đa» ký tự, «Nguồn tối đa», «Có thể gửi»). Trạng thái yêu cầu AI: Đang chờ xử lý, Đang xử lý, Hoàn tất, Thất bại, Chờ đối soát, Bị từ chối. Kết quả «Chưa đủ căn cứ» nghĩa là nguồn không đủ để trả lời; «Bị cổng an toàn từ chối» nghĩa là câu hỏi bị chặn vì an toàn; hãy đổi câu hỏi.

Lỗi Trợ lý AI: «Dịch vụ AI chưa được bật hoặc chưa cấu hình» (AI_PROVIDER_UNAVAILABLE) → dịch vụ AI chưa hoạt động, chưa bị trừ hạn mức, liên hệ hỗ trợ. «Chưa có chính sách AI cho thao tác này» (AI_POLICY_UNAVAILABLE) → báo quản trị FET3D. «Hạn mức AI của tổ chức không đủ» (AI_QUOTA_EXHAUSTED) hoặc «Cần nạp thêm hoặc kích hoạt hạn mức AI» → nạp thêm hạn mức. «Nội dung dài hơn giới hạn» (AI_INPUT_TOO_LARGE) → rút gọn câu hỏi. «Chưa có nguồn nào đủ điều kiện để trả lời» (AI_NO_SOURCES) → chờ quản trị duyệt nguồn. «Công trình chưa có bản IFC sẵn sàng» (AI_REVISION_NOT_READY) → hoàn tất xử lý IFC trước khi xin đề xuất kịch bản. «Gửi quá nhanh» → chờ vài giây.

Yêu cầu AI «Thất bại»: các lý do gồm không gửi được tới dịch vụ AI, chưa rõ dịch vụ đã xử lý xong, kết quả hoặc trích dẫn không hợp lệ, tài liệu nguồn đã thay đổi so với bản được ghim (AI_SOURCE_HASH_MISMATCH), bản IFC đã ghim không còn dùng được. Phần hạn mức đã tạm trừ được hoàn lại. Thường chỉ cần gửi lại; nếu lặp lại, gửi hỗ trợ kèm Mã. Nếu hiện «Chưa rõ yêu cầu đã được ghi nhận hay chưa» (mất phản hồi), đừng tạo yêu cầu mới: bấm «Tra yêu cầu gần nhất của tôi» hoặc «Gửi lại (không trừ hai lần)».

## Báo cáo

Báo cáo (menu «Báo cáo», /workspace/analytics) chỉ tính phiên học thật của học viên; lượt chạy thử và bước chuẩn bị gói không được tính. Có hai tab «Huấn luyện» và «Vận hành». Chọn thời gian bằng chip «Thời gian»: 7, 30 hoặc 90 ngày, hoặc tự chọn «Từ ngày» / «Đến ngày» rồi «Áp dụng»; mặc định 30 ngày gần nhất, tối đa 90 ngày. Ngày tính theo giờ quốc tế UTC (chậm 7 giờ so với giờ Việt Nam). Tab Huấn luyện có bộ lọc «Công trình», «Kịch bản» (chọn công trình trước), «Nhóm theo» (Ngày, Tuần, Tháng, Công trình, Kịch bản) và nút «Xuất CSV» (tệp bao-cao-huan-luyen.csv).

Ý nghĩa chỉ số báo cáo huấn luyện: «Lượt chơi» là số lượt học viên bắt đầu chơi trong kỳ; «Học viên» là số học viên khác nhau; «Hoàn thành» là số lượt đi tới cuối kịch bản; «Tỉ lệ hoàn thành» = hoàn thành ÷ lượt chơi; «Đang chơi» là số phiên đang chạy lúc xem; «Tỉ lệ đạt» = Đạt ÷ (Đạt + Chưa đạt), chỉ tính lượt có chấm điểm; «Thời gian chơi» tính từ lúc bắt đầu đến lúc kết thúc (trung bình và trung vị). Kết quả phiên: Đạt, Chưa đạt, Chưa hoàn tất, Không chấm. Chế độ: Học, Có hướng dẫn, Đánh giá. Thẻ «Sử dụng AI» cho biết hạn mức AI đã chốt, đang tạm trừ và cần đối soát.

Tab Vận hành của báo cáo: «Công trình (hiện tại)» (đang hoạt động / lưu trữ), «Tiến trình xử lý (trong kỳ)» gồm xử lý IFC và dựng gói theo trạng thái (hoàn tất chưa có nghĩa là mô hình đạt kiểm tra), «Yêu cầu hỗ trợ (trong kỳ)», và biểu đồ «Hoạt động huấn luyện theo ngày» (lượt chơi, học viên tham gia, hoàn thành mỗi ngày). Mỗi biểu đồ có «Xem bảng số liệu» để xem số chính xác. Tab Vận hành không có xuất CSV.

## Hỗ trợ và phản hồi

Gửi yêu cầu hỗ trợ: vào «Hỗ trợ & phản hồi» → tab «Yêu cầu hỗ trợ» → «Tạo yêu cầu», nhập «Chủ đề» (tối đa 255 ký tự) và «Mô tả» (tối đa 10.000 ký tự), bấm «Gửi yêu cầu». Nên ghi tên công trình, bản IFC hoặc số báo giá, và dán Mã ở hộp «Thông tin cho bộ phận hỗ trợ» nếu có; không gửi mật khẩu. Hiện không đính kèm tệp được và không tự chọn mức ưu tiên (đội FET3D đặt mức Thấp, Bình thường, Cao, Khẩn cấp). Trạng thái: Mới → Đang xử lý → Đã giải quyết → Đã đóng; chỉ đội FET3D đổi trạng thái.

Trao đổi trong yêu cầu hỗ trợ: bấm vào yêu cầu để mở «Chi tiết yêu cầu», phần «Trao đổi», nhập «Tin nhắn mới» (tối đa 10.000 ký tự) và bấm «Gửi tin nhắn». Tin nhắn của đội hỗ trợ ghi là «Đội hỗ trợ FET3D». Yêu cầu «Đã đóng» không nhận tin mới, hãy tạo yêu cầu mới. Tab «Phản hồi» để góp ý sản phẩm («Gửi phản hồi»: chủ đề, nội dung, mức hài lòng 1–5), không dùng cho việc cần hỗ trợ gấp.

Hộp «Thông tin cho bộ phận hỗ trợ»: là dòng thu gọn dưới một số thông báo lỗi, bấm vào mới mở ra, gồm Mã (mã lỗi kỹ thuật, ví dụ IFC_NO_SPACES), Định danh (mã của lượt xử lý, giao dịch hay yêu cầu AI) và Chi tiết. Người dùng không cần hiểu các mã này; khi gửi yêu cầu hỗ trợ, hãy mở hộp, sao chép Mã và Định danh rồi dán vào mô tả để đội hỗ trợ tra nhanh.

## Lỗi chung thường gặp

Lỗi chung trên FET3D và cách xử lý: «Mất kết nối tới máy chủ» → kiểm tra mạng rồi thử lại. «Thông tin chưa hợp lệ» → xem lỗi ghi dưới từng ô. «Phiên đăng nhập đã hết hạn» → đăng nhập lại. «Bạn không có quyền thực hiện thao tác này» → dùng đúng loại tài khoản (tổ chức, học viên). «Không tìm thấy dữ liệu, hoặc dữ liệu không thuộc tổ chức của bạn» → dữ liệu đã xóa, đã lưu trữ hoặc thuộc tổ chức khác. «Thao tác không thực hiện được ở trạng thái hiện tại» → trạng thái vừa đổi (ví dụ đã duyệt, đã phát hành), tải lại trang. «Tệp quá lớn» → chọn tệp nhỏ hơn. «Hệ thống đang bận, thử lại sau N giây» → chờ đúng thời gian. «Máy chủ đang gặp lỗi» → thử lại sau ít phút, nếu kéo dài thì gửi hỗ trợ.

Thông báo «Dữ liệu vừa được thay đổi ở nơi khác» hoặc «đã được người khác thay đổi»: có người khác hoặc một tab trình duyệt khác của bạn đã lưu trước. Phần lớn màn hình giữ nguyên nội dung bạn đang nhập; hãy tải bản mới để đối chiếu rồi lưu lại. «Dữ liệu cần tải lại trước khi lưu» → tải lại trang. «Yêu cầu trùng với một yêu cầu trước nhưng nội dung khác» → tải lại trang rồi gửi lại. Ở nhiều màn hình (tải IFC, chạy thử, xử lý IFC), nút «Thử lại» gửi lại đúng yêu cầu cũ nên không bị ghi hai lần.

Lỗi đăng nhập và tài khoản: «Email hoặc mật khẩu không đúng» → kiểm tra lại hoặc dùng trang quên mật khẩu. «Bạn đã đăng nhập sai quá nhiều lần» → chờ một lúc rồi thử lại. «Tài khoản hoặc tổ chức đang bị khóa» → liên hệ quản trị FET3D. «Hãy xác minh email trước khi đăng nhập» → mở thư xác minh. «Email này đã được đăng ký», «Số điện thoại đã được một tổ chức sử dụng» → dùng giá trị khác. «Mã xác minh sai hoặc đã hết hạn» → yêu cầu mã mới. «Bạn yêu cầu mã quá nhiều lần» → chờ rồi thử lại (giới hạn 5 lần mỗi giờ cho một email). «Lượt đăng ký này đã hết hạn» → đăng ký lại. «Tài khoản vừa thay đổi ở nơi khác» → đăng nhập lại.

Lỗi đăng nhập Google: «Email này đã có tài khoản. Hãy đăng nhập bằng email và mật khẩu rồi liên kết Google trong hồ sơ» → làm đúng như vậy. «Trình duyệt đã chặn cửa sổ Google» → cho phép cửa sổ bật lên rồi thử lại. «Tài khoản Google này đã được liên kết với một tài khoản FET3D khác» → dùng tài khoản Google khác. «Cần đăng nhập Google lại trong vòng 5 phút trước khi đặt mật khẩu» → xác thực Google lại. Không thể thay tài khoản Google đã liên kết.

Lỗi kịch bản, phiên bản và gói: «Phiên bản này đã được gửi duyệt» → mỗi phiên bản chỉ gửi một lần, chờ kết quả. «Cần quản trị FET3D duyệt nội dung của phiên bản này trước» → gửi duyệt và chờ. «Bản nháp đã thay đổi từ lần bạn tải. Chưa tạo phiên bản nào» → tải lại rồi tạo phiên bản. «Tệp IFC của công trình chưa tải lên xong» → hoàn tất tải IFC rồi dựng gói. «Kiểm tra chưa đạt hoặc còn lỗi chặn nên chưa chốt được gói» → sửa lỗi, dựng lại gói. «Chưa chốt gói phát hành ở tab Kiểm tra» → bấm «Chốt gói phát hành». «Công trình chưa có dịch vụ trả phí còn hiệu lực. Gói dùng thử không đủ để phát hành» → mua hoặc gia hạn gói dịch vụ. «Hệ thống chưa mở chức năng phát hành» → liên hệ hỗ trợ.

Lỗi chạy thử: «Phiên bản này chưa có gói chạy thử đã dựng và kiểm tra đạt» → vào tab Dựng gói, chọn «Gói chạy thử». «Công trình chưa có dịch vụ trả phí còn hiệu lực hoặc gói dùng thử đã hết lượt chạy thử» → mua gói. «Bản nháp đã đổi so với phiên bản» → tạo phiên bản mới rồi dựng gói chạy thử. «Mã đã hết hạn hoặc đã bị thay bằng mã mới», «Mã đã được một điện thoại khác dùng», «Không thể hiển thị lại mã đã tạo» → cấp lại mã. «Đã bắt đầu chơi nên không chuyển sang thiết bị khác được». «Chỉ thiết bị đang giữ lượt chạy thử mới làm được thao tác này» → trang web chỉ theo dõi và hủy. «Chức năng chạy thử chưa được bật» → liên hệ hỗ trợ (chưa bị trừ lượt).

Lỗi thanh toán: «Chỉ báo giá đã được chấp nhận và còn hạn mới thanh toán được» → chấp nhận báo giá hoặc xin báo giá mới. «Báo giá đã quá hạn hiệu lực» → tạo báo giá mới. «Báo giá này đã được thanh toán» → xem trạng thái kích hoạt, không trả lại. «Báo giá còn thanh toán chưa kết thúc» → hủy thanh toán đó (hoặc chờ PayOS báo hết hạn) rồi mới hủy báo giá. «Công trình thiếu tên hoặc địa chỉ» → bổ sung thông tin công trình rồi tạo báo giá lại. «Kỳ dịch vụ này đang được giữ cho một thanh toán khác» → hoàn tất hoặc hủy thanh toán kia. «PayOS phản hồi chậm / tạm thời không khả dụng» → chờ ít phút. «Liên kết thanh toán không còn tồn tại hoặc đã hết hạn» → tạo lại thanh toán. «Cổng thanh toán PayOS đang tạm tắt» → liên hệ hỗ trợ. «Gói chưa cấu hình đủ nên chưa bán được» → chờ quản trị FET3D.

## Dành cho học viên

Thư viện cá nhân của học viên (/learning-hub) gồm: «Tổng quan» (Luyện tập trên ứng dụng, Đọc bài học, hướng dẫn «Làm quen trong ba bước»), «Bài đã lưu», «Trợ lý AI» (câu hỏi đã hỏi và lượt hỏi hôm nay), «Lịch sử luyện tập», «Hỗ trợ» và «Hồ sơ». Trạng thái phiên luyện tập: Đang khởi động, Đang chơi, Chờ đồng bộ, Đã hoàn thành (không có nghĩa là đạt), Đã hủy, Đã bỏ dở, Gặp lỗi. Kết quả đánh giá: Đạt, Chưa đạt, Chưa hoàn tất, Không chấm điểm. Học viên luyện tập lại không giới hạn số lần.

Bài học công khai (/learn) gồm bài viết, mẹo và video về phòng cháy chữa cháy, thoát nạn, sơ cứu; ai cũng đọc được không cần đăng nhập. Tìm kiếm 2–100 ký tự, gõ có dấu hay không dấu đều được; lọc theo «Loại bài» (Bài viết, Mẹo, Video) và «Tình huống». Chỉ tài khoản học viên được «Lưu bài viết» và bấm «Hỏi Trợ lý AI về bài này».

Trợ lý AI cho học viên: mỗi học viên có số lượt hỏi theo ngày, hiển thị «Hôm nay còn N». Hết lượt thì báo «Đã hết lượt hỏi hôm nay», lượt mới có lại vào đầu ngày hôm sau. AI bị khóa khi đang làm bài ở chế độ «Đánh giá». Nếu báo «Trợ lý AI chưa được bật», dịch vụ AI chưa hoạt động cho học viên.

Ứng dụng Android FET3D: bài tập huấn chạy trên ứng dụng Android, không chạy trên web. Cài ứng dụng, đăng nhập bằng tài khoản học viên, quét mã QR công trình trong ứng dụng rồi chọn bài. Nếu trang «Tải ứng dụng» báo «Chưa khả dụng», hãy hỏi tổ chức hoặc gửi yêu cầu hỗ trợ để nhận bản cài. Điện thoại cần có mạng lúc bắt đầu bài để hệ thống kiểm tra quyền, hạn dịch vụ và suất học viên.

## Câu hỏi nhanh

Làm sao để bắt đầu dùng FET3D cho một tòa nhà? Đăng ký tài khoản tổ chức → tạo công trình → tải tệp IFC của tòa nhà và chờ xử lý đạt → tạo kịch bản và soạn trên mô hình 3D → tạo phiên bản và gửi duyệt → dựng gói phát hành, kiểm tra và chốt gói → mua gói dịch vụ cho công trình → tạo bản phát hành và bấm Phát hành → tạo mã QR (và mã tham gia nếu riêng tư) gửi cho học viên → xem kết quả ở Báo cáo.

Vì sao tôi chưa soạn kịch bản được? Vì bản IFC chưa «Sẵn sàng soạn kịch bản»: có thể đang xử lý, xử lý thất bại, cần sửa mô hình, hoặc chưa chọn cửa thoát ra ngoài. Mở tab IFC của công trình để xem tiến trình và kết quả kiểm tra tự động.

Học viên có cần trả tiền không? Không. Tổ chức mua gói dịch vụ cho công trình; mỗi học viên khác nhau tính một suất trong kỳ khi bắt đầu học lần đầu. Học viên chỉ cần tài khoản học viên, mã QR (và mã tham gia nếu công trình riêng tư) và ứng dụng Android.

Duyệt kịch bản và chốt gói khác nhau thế nào? Duyệt kịch bản là quản trị FET3D kiểm tra nội dung tập huấn của phiên bản. Chốt gói phát hành là tổ chức xác nhận dùng đúng gói Android vừa dựng và kiểm tra kỹ thuật đạt. Phát hành cần cả hai. Xác nhận mô hình dùng được cho huấn luyện ở tab IFC là xác nhận kỹ thuật cho mô hình 3D, cũng không phải duyệt nội dung. Không bước nào là chứng nhận hay phê duyệt PCCC của cơ quan chức năng.

Sửa kịch bản đã phát hành thế nào? Phiên bản đã tạo không sửa được. Sửa bản nháp trong trình soạn, tạo phiên bản mới, gửi duyệt, dựng và chốt gói mới, rồi tạo bản phát hành mới. Bản phát hành cũ có thể thu hồi khi không dùng nữa.

Đổi tệp IFC khi tòa nhà thay đổi? Tải IFC mới trong tab IFC; bản cũ chuyển «Đã được thay thế». Kịch bản cần tạo bản nháp trên bản IFC mới, và bản IFC mới cần xác nhận dùng cho huấn luyện lại. Quyết định thiết bị có thể lấy lại từ bản trước bằng «Dùng gợi ý».

FET3D có thay cho diễn tập PCCC thật hoặc chứng nhận PCCC không? Không. FET3D là công cụ tập huấn mô phỏng; kết quả đạt trong FET3D không phải chứng nhận, và tổ chức vẫn phải tuân thủ quy định phòng cháy chữa cháy, huấn luyện và diễn tập theo pháp luật hiện hành.
