import Link from "next/link";
import { ArrowUpRight, Building2, CheckCircle2, Eye, Flame, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";

type PublicPageProps = { kind: "organizations" | "about" | "download" };
type PageCopy = { kicker: string; title: React.ReactNode; description: string };

const content = {
  organizations: {
    kicker: "Dành cho tổ chức",
    title: <>Biến việc tập huấn<br /><em>thành một năng lực.</em></>,
    description: "FET3D giúp tổ chức tạo những trải nghiệm mô phỏng có ngữ cảnh, để người học có thể tập dượt, xem lại và cùng nói về những quyết định quan trọng.",
  },
  about: {
    kicker: "Về chúng tôi",
    title: <>Chúng tôi thiết kế<br /><em>những lần được thử.</em></>,
    description: "FET3D là một dự án học tập nhập vai: kết nối không gian 3D, nội dung có nguồn và phản hồi để biến kiến thức khó nhớ thành một điều có thể bước vào.",
  },
  download: {
    kicker: "Ứng dụng FET3D",
    title: <>Tập thoát nạn<br /><em>trên điện thoại.</em></>,
    description: "Ứng dụng FET3D cho Android mở các bài tập huấn thoát nạn 3D của công trình mà tổ chức của bạn đã chuẩn bị. Ứng dụng đang được thử nghiệm trên Google Play, nên chưa có trên cửa hàng cho mọi người.",
  },
} as const;

export function PublicPage({ kind }: PublicPageProps) {
  const copy = content[kind];
  if (kind === "download") return <DownloadPage copy={copy} />;
  return <div className="site-shell"><SiteHeader /><main className="page-main"><section className="page-hero"><p className="kicker"><span className="kicker-line" /> {copy.kicker}</p><h1>{copy.title}</h1><p>{copy.description}</p><div className="page-hero-actions"><Button asChild><Link href={kind === "organizations" ? routes.learn : routes.home}>{kind === "organizations" ? "Xem cách học bắt đầu" : "Bước vào hành trình"} <ArrowUpRight size={16} /></Link></Button>{kind === "organizations" && <Button asChild variant="secondary"><Link href={routes.about}>Tìm hiểu về FET3D</Link></Button>}</div></section><div className="section-grid">{kind === "organizations" ? <><InfoCard icon={<Building2 />} title="Tạo theo bối cảnh" body="Bắt đầu từ công trình, quy trình hoặc tình huống mà đội ngũ của bạn cần hiểu rõ hơn." /><InfoCard icon={<Eye />} title="Nhìn thấy tiến bộ" body="Kết quả mô phỏng giúp mở ra cuộc trao đổi về tín hiệu, quyết định và điều cần luyện thêm." /><InfoCard icon={<ShieldCheck />} title="Triển khai có kiểm soát" body="Các gói nội dung được phát hành theo quy trình rõ ràng. Website này không tự nhận chứng nhận an toàn." /></> : <><InfoCard icon={<Flame />} title="Không gian là ngôn ngữ" body="Chúng tôi dùng không gian để tạo ngữ cảnh, không dùng hiệu ứng để làm người học mất phương hướng." /><InfoCard icon={<Eye />} title="Phản hồi có ích" body="Một lần thử chỉ có giá trị khi người học hiểu mình đã thấy gì và có thể làm gì khác đi." /><InfoCard icon={<CheckCircle2 />} title="Minh bạch từ đầu" body="Tính năng nào chưa có đều được ghi rõ trên website để bạn biết đâu là trải nghiệm thật." /></>}</div></main><SiteFooter /></div>;
}

function DownloadPage({ copy }: { copy: PageCopy }) {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><section className="page-hero"><p className="kicker"><span className="kicker-line" /> {copy.kicker}</p><h1>{copy.title}</h1><p>{copy.description}</p></section><Card className="download-panel"><div><h2 className="mb-3 text-2xl font-semibold tracking-[-.04em]">Cách nhận ứng dụng</h2><p className="mb-6 max-w-[570px] leading-7 text-[var(--muted)]">Ứng dụng đã có và đang trong giai đoạn thử nghiệm trên Google Play. Trong giai đoạn này, ứng dụng chưa hiện khi tìm trên cửa hàng và trang này chưa có tệp cài đặt để tải. Người học cài ứng dụng qua lời mời do tổ chức của mình hoặc nhóm FET3D gửi.</p><div className="download-state" data-testid="download-state"><Smartphone size={18} aria-hidden="true" /><span><strong className="text-[var(--text)]">Đang thử nghiệm trên Google Play</strong><br />Chưa nhận được lời mời? Hãy hỏi người phụ trách tập huấn ở tổ chức của bạn. Trong lúc chờ, bạn có thể <Link className="download-link" href={routes.learn}>đọc bài học trên web</Link>.</span></div></div><div><h2 className="mb-4 text-lg font-semibold tracking-[-.03em]">Khi đã có lời mời</h2><ol className="download-steps"><li><span>Mở lời mời trên điện thoại Android và cài ứng dụng FET3D từ Google Play. Chỉ cần cài một lần.</span></li><li><span>Mở ứng dụng và đăng nhập bằng tài khoản FET3D của bạn.</span></li><li><span>Quét mã QR của công trình bằng chức năng quét trong ứng dụng, rồi chọn bài để bắt đầu.</span></li></ol></div></Card><div className="section-grid mt-[14px]"><InfoCard icon={<Flame />} title="Ứng dụng làm gì" body="Ứng dụng tải bài tập huấn về máy và cho bạn tập thoát nạn trong mô hình 3D của chính công trình đó: học, luyện có hướng dẫn hoặc làm bài đánh giá. Bài tập 3D chỉ chơi trong ứng dụng Android; trang web không có bài 3D." /><InfoCard icon={<Smartphone />} title="Điện thoại cần có" body="Điện thoại Android 10 trở lên. Cần có mạng khi tải bài và khi bắt đầu bài. Chưa có bản cho iPhone (iOS)." /><InfoCard icon={<QrCode />} title="Mã QR công trình" body="Mỗi công trình có một mã QR do tổ chức in hoặc gửi. Khi đã cài ứng dụng, quét mã này trong ứng dụng là mở được danh sách bài của công trình. Bạn vẫn cần đăng nhập; công trình Riêng tư cần thêm mã tham gia do tổ chức cung cấp." /></div></main><SiteFooter /></div>;
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <Card className="info-card"><span className="text-[var(--ember)]">{icon}</span><h2>{title}</h2><p>{body}</p></Card>;
}
