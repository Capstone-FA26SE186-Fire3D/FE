import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/layouts/site-header";
import { SiteFooter } from "@/layouts/site-footer";
import { OrganizationHero } from "./organization-hero";
import styles from "./public.module.css";

const steps = [
  ["Chuẩn bị công trình", "Bắt đầu từ tệp IFC của công trình. Mô hình 3D giúp tổ chức đặt tình huống tập huấn vào đúng bối cảnh."],
  ["Kiểm tra bản IFC", "Xem lại mô hình, các tầng và khu vực sử dụng trước khi tạo nội dung. Mỗi bản IFC cần được kiểm tra trước khi phát hành."],
  ["Thiết kế kịch bản", "Đặt điểm bắt đầu, khu vực xảy ra tình huống và mục tiêu của lượt tập. Mỗi kịch bản gắn với một bản IFC đã được kiểm tra."],
  ["Phát hành và tạo mã QR", "Phát hành một phiên bản nội dung cụ thể. Mã QR của công trình dẫn tới bản đang phát hành, không phải một ứng dụng riêng cho từng tòa nhà."],
  ["Mở bài tập trên Android", "Ứng dụng chỉ cần cài một lần. Người học quét mã QR, ứng dụng tải nội dung về rồi mở bài tập 3D trên điện thoại."],
  ["Xem lại kết quả", "Theo dõi lịch sử và kết quả mô phỏng để xác định nội dung cần luyện thêm. Kết quả này không phải chứng nhận hoặc kết luận an toàn công trình."],
];
export function OrganizationPage() {
  return <div className="site-shell"><div className={styles.header}><SiteHeader /></div><main>
    <OrganizationHero><p className="kicker">FET3D / DÀNH CHO TỔ CHỨC</p><h1>Dành cho tổ chức</h1><p>Một công trình. Nhiều cơ hội tập dượt.<br />Chuẩn bị không gian và xây dựng những lượt tập huấn có bối cảnh cho đội ngũ của bạn.</p><Button asChild><Link href="#workflow">Xem quy trình <ArrowUpRight size={16} /></Link></Button></OrganizationHero>
    <section id="workflow" className={styles.workflow}><p className="kicker">TỪ MÔ HÌNH ĐẾN TRẢI NGHIỆM</p><h2>Mỗi lượt tập bắt đầu từ một quy trình rõ ràng.</h2><p className={styles.lead}>Đây là phần giới thiệu quy trình của FET3D. Các bước được thực hiện trong không gian tổ chức sau khi đăng nhập.</p><ol className={styles.steps}>{steps.map(([title, body]) => <li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol><aside className={styles.note}>Khu quản lý cần tài khoản tổ chức và quyền truy cập đúng tổ chức. Việc chọn lựa chọn trên trang chủ không cấp quyền quản lý. Ứng dụng Android hiện chưa có bản tải chính thức trên website này.</aside></section>
  </main><SiteFooter /></div>;
}
