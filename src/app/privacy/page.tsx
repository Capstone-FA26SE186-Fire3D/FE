import type { Metadata } from "next";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư",
  description: "Cách FET3D (website và ứng dụng Android) thu thập, sử dụng, chia sẻ và bảo vệ dữ liệu người dùng.",
};

const UPDATED = "27/10/2026";

/** Public privacy policy for the website and the FET3D Android app (Google Play listing link). No sign-in, plain HTML. */
export default function PrivacyPage() {
  return <div className="site-shell">
    <SiteHeader />
    <main className="page-main">
      <article className={styles.doc}>
        <p className="kicker"><span className="kicker-line" /> Pháp lý</p>
        <h1>Chính sách quyền riêng tư</h1>
        <p className={styles.meta}>Áp dụng cho website fet3d.io.vn và ứng dụng Android FET3D · Cập nhật {UPDATED}</p>

        <p>FET3D là hệ thống tập huấn thoát nạn khi cháy bằng mô hình 3D, gồm website fet3d.io.vn và ứng dụng Android FET3D. Chính sách này giải thích chúng tôi thu thập dữ liệu nào, dùng để làm gì, chia sẻ với ai, lưu bao lâu và bạn có những quyền gì. Khi dùng FET3D, bạn đồng ý với cách xử lý dữ liệu được mô tả dưới đây.</p>

        <h2>1. Dữ liệu chúng tôi thu thập</h2>
        <ul>
          <li><strong>Thông tin tài khoản:</strong> email, họ tên, tên người dùng, mật khẩu (chỉ lưu dưới dạng đã mã hóa một chiều), loại tài khoản; với tài khoản tổ chức còn có tên, địa chỉ và số điện thoại của tổ chức.</li>
          <li><strong>Đăng nhập bằng Google:</strong> nếu bạn chọn đăng nhập bằng Google, chúng tôi nhận email, tên và mã định danh tài khoản Google do Google cung cấp qua Firebase Authentication. Chúng tôi không nhận mật khẩu Google của bạn.</li>
          <li><strong>Hồ sơ tùy chọn:</strong> ảnh đại diện, ngày sinh, giới tính, số điện thoại nếu bạn tự nhập.</li>
          <li><strong>Dữ liệu tập huấn:</strong> công trình và bài tập bạn tham gia, thời điểm bắt đầu/kết thúc, chế độ chơi, kết quả và điểm đánh giá, lịch sử luyện tập, bài học đã lưu.</li>
          <li><strong>Câu hỏi gửi Trợ lý AI:</strong> nội dung câu hỏi, câu trả lời và nguồn trích dẫn, để hiển thị lại lịch sử và tính hạn mức.</li>
          <li><strong>Yêu cầu hỗ trợ và phản hồi:</strong> nội dung bạn gửi cho đội hỗ trợ.</li>
          <li><strong>Dữ liệu thiết bị:</strong> mã nhận thông báo đẩy (Firebase Cloud Messaging) và thông tin cài đặt cần để gửi thông báo; nhật ký kỹ thuật cơ bản của máy chủ (địa chỉ IP, thời gian truy cập, lỗi) để vận hành và bảo mật.</li>
          <li><strong>Dữ liệu của tổ chức:</strong> tệp mô hình công trình (IFC), kịch bản, mã QR, báo giá và trạng thái thanh toán. Việc thanh toán do cổng PayOS xử lý; FET3D không nhận và không lưu số thẻ hay thông tin tài khoản ngân hàng.</li>
        </ul>
        <p>Chúng tôi <strong>không</strong> thu thập vị trí, danh bạ, tin nhắn, ghi âm hay dữ liệu sức khỏe, và không dùng dữ liệu cho quảng cáo.</p>

        <h2>2. Quyền truy cập trên ứng dụng Android</h2>
        <ul>
          <li><strong>Máy ảnh:</strong> chỉ dùng để quét mã QR của công trình. Hình ảnh từ máy ảnh không được lưu hay gửi lên máy chủ.</li>
          <li><strong>Ảnh/thư viện:</strong> chỉ khi bạn chủ động chọn ảnh làm ảnh đại diện; chỉ ảnh bạn chọn được tải lên.</li>
          <li><strong>Thông báo:</strong> để gửi thông báo liên quan đến tài khoản và bài tập; bạn có thể tắt trong cài đặt thiết bị.</li>
          <li><strong>Internet:</strong> để đăng nhập, tải bài tập và đồng bộ kết quả.</li>
        </ul>

        <h2>3. Mục đích sử dụng</h2>
        <ul>
          <li>Tạo và bảo vệ tài khoản, đăng nhập, xác minh email.</li>
          <li>Cung cấp bài tập huấn, kiểm tra quyền tham gia công trình và đồng bộ kết quả.</li>
          <li>Cho tổ chức sở hữu công trình xem kết quả và báo cáo tập huấn của học viên tham gia công trình đó.</li>
          <li>Trả lời câu hỏi qua Trợ lý AI và quản lý hạn mức sử dụng.</li>
          <li>Xử lý báo giá, thanh toán và kích hoạt dịch vụ cho tổ chức.</li>
          <li>Hỗ trợ người dùng, gửi thông báo cần thiết, phát hiện và ngăn chặn lạm dụng, khắc phục lỗi.</li>
        </ul>

        <h2>4. Chia sẻ dữ liệu</h2>
        <p>Chúng tôi không bán dữ liệu cá nhân. Dữ liệu chỉ được chia sẻ trong các trường hợp:</p>
        <ul>
          <li><strong>Tổ chức sở hữu công trình:</strong> khi học viên tham gia bài tập của một công trình, tổ chức đó xem được tên/tài khoản và kết quả tập huấn của học viên trên công trình của họ.</li>
          <li><strong>Nhà cung cấp dịch vụ xử lý dữ liệu thay mặt chúng tôi:</strong> Google (Firebase Authentication, Firebase Cloud Messaging, mô hình AI Gemini để trả lời câu hỏi gửi Trợ lý AI), Microsoft Azure (máy chủ và cơ sở dữ liệu), Amazon Web Services (lưu trữ tệp), Vercel (lưu trữ website), PayOS (thanh toán của tổ chức), dịch vụ gửi email (gửi mã xác minh). Các nhà cung cấp chỉ được dùng dữ liệu để cung cấp dịch vụ cho FET3D.</li>
          <li><strong>Theo yêu cầu pháp luật:</strong> khi cơ quan nhà nước có thẩm quyền yêu cầu theo quy định.</li>
        </ul>

        <h2>5. Bảo mật</h2>
        <p>Dữ liệu được truyền qua kết nối mã hóa HTTPS. Mật khẩu chỉ lưu dạng đã mã hóa một chiều. Phiên đăng nhập trên ứng dụng được lưu trong vùng lưu trữ bảo mật của thiết bị. Quyền truy cập dữ liệu được giới hạn theo vai trò: mỗi tổ chức chỉ thấy dữ liệu của tổ chức mình.</p>

        <h2>6. Thời gian lưu trữ</h2>
        <p>Chúng tôi lưu dữ liệu tài khoản và tập huấn trong thời gian tài khoản còn hoạt động. Khi tài khoản bị xóa, dữ liệu cá nhân được xóa hoặc ẩn danh trong vòng 30 ngày, trừ dữ liệu phải giữ theo quy định pháp luật (ví dụ chứng từ thanh toán) và nhật ký bảo mật được giữ có thời hạn.</p>

        <h2>7. Quyền của bạn và xóa tài khoản</h2>
        <p>Bạn có thể xem và sửa thông tin cá nhân trong trang Tài khoản (website) hoặc Hồ sơ (ứng dụng). Để yêu cầu xóa tài khoản và dữ liệu liên quan, hoặc yêu cầu bản sao dữ liệu, hãy đăng nhập và gửi yêu cầu ở mục <strong>Hỗ trợ</strong> với chủ đề “Xóa tài khoản”. Chúng tôi xác minh chủ tài khoản và xử lý trong vòng 30 ngày.</p>

        <h2>8. Trẻ em</h2>
        <p>FET3D phục vụ tập huấn an toàn cháy cho học viên do tổ chức (trường học, doanh nghiệp, tòa nhà) hướng dẫn và không nhắm đến trẻ em dưới 13 tuổi. Người dưới 16 tuổi nên dùng với sự đồng ý và hướng dẫn của cha mẹ, giáo viên hoặc tổ chức.</p>

        <h2>9. Thay đổi chính sách</h2>
        <p>Khi chính sách thay đổi, chúng tôi cập nhật trang này và ngày cập nhật ở đầu trang. Thay đổi quan trọng sẽ được thông báo trên website hoặc ứng dụng.</p>

        <h2>10. Liên hệ</h2>
        <p>Mọi câu hỏi về quyền riêng tư, hãy gửi qua mục <strong>Hỗ trợ</strong> trên website fet3d.io.vn hoặc trong ứng dụng FET3D.</p>
      </article>
    </main>
    <SiteFooter />
  </div>;
}
