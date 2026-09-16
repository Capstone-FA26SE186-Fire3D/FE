import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/layouts/site-header";
import { SiteFooter } from "@/layouts/site-footer";
import { OrganizationHero } from "./organization-hero";
import styles from "./public.module.css";

const steps = [
  ["Chuẩn bị công trình", "Bắt đầu từ dữ liệu IFC của công trình. Không gian là nền tảng để tổ chức đặt tình huống tập huấn vào đúng bối cảnh."],
  ["Kiểm tra revision", "Xem lại phiên bản mô hình, hình học và các khu vực sử dụng trước khi tạo nội dung. Mỗi revision cần được kiểm tra trước khi phát hành."],
  ["Thiết kế scenario", "Đặt điểm bắt đầu, khu vực tình huống và mục tiêu của lượt tập. Liên kết scenario với revision công trình đã được kiểm tra."],
  ["Publish release và QR", "Phát hành một phiên bản nội dung được xác định rõ. QR của hoạt động liên kết đến release đang active, không phải một ứng dụng mới cho từng tòa nhà."],
  ["Mở hoạt động trên Android", "Ứng dụng được cài một lần. Người học resolve QR, tải và xác minh gói nội dung rồi mở trải nghiệm Unity trên điện thoại."],
  ["Xem lại kết quả", "Theo dõi lịch sử và kết quả mô phỏng để xác định nội dung cần luyện thêm. Kết quả này không phải chứng nhận hoặc kết luận an toàn công trình."],
];
export function OrganizationPage() {
  return <div className="site-shell"><div className={styles.header}><SiteHeader /></div><main>
    <OrganizationHero><p className="kicker">FIRE3D / DÀNH CHO TỔ CHỨC</p><h1>Dành cho tổ chức</h1><p>Một công trình. Nhiều cơ hội tập dượt.<br />Chuẩn bị không gian và xây dựng những lượt tập huấn có bối cảnh cho đội ngũ của bạn.</p><Button asChild><Link href="#workflow">Xem quy trình <ArrowUpRight size={16} /></Link></Button></OrganizationHero>
    <section id="workflow" className={styles.workflow}><p className="kicker">TỪ MÔ HÌNH ĐẾN TRẢI NGHIỆM</p><h2>Mỗi lượt tập bắt đầu từ một quy trình rõ ràng.</h2><p className={styles.lead}>Đây là phần giới thiệu quy trình dự kiến của Fire3D. Website mẫu chưa cung cấp khu quản lý công trình hoặc chức năng phát hành hoạt động thật.</p><ol className={styles.steps}>{steps.map(([title, body]) => <li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol><aside className={styles.note}>Khu quản lý thực tế yêu cầu tài khoản tổ chức và quyền truy cập đúng tổ chức. Việc chọn nhánh trên landing không cấp quyền quản lý. Hiện chưa có APK hoặc QR hoạt động để phát hành từ website này.</aside></section>
  </main><SiteFooter /></div>;
}
