import Link from "next/link";
import { ArrowUpRight, Building2, CheckCircle2, Download, Eye, Flame, ShieldCheck } from "lucide-react";
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
    description: "Fire3D giúp tổ chức tạo những trải nghiệm mô phỏng có ngữ cảnh, để người học có thể tập dượt, xem lại và cùng nói về những quyết định quan trọng.",
  },
  about: {
    kicker: "Về chúng tôi",
    title: <>Chúng tôi thiết kế<br /><em>những lần được thử.</em></>,
    description: "Fire3D là một dự án học tập nhập vai: kết nối không gian 3D, nội dung có nguồn và phản hồi để biến kiến thức khó nhớ thành một điều có thể bước vào.",
  },
  download: {
    kicker: "Ứng dụng Fire3D",
    title: <>Một cánh cửa khác<br /><em>sẽ sớm mở.</em></>,
    description: "Ứng dụng Android và các gói nội dung đang được chuẩn bị. Khi có bản phát hành thật, QR và trạng thái tải sẽ xuất hiện tại đây.",
  },
} as const;

export function PublicPage({ kind }: PublicPageProps) {
  const copy = content[kind];
  if (kind === "download") return <DownloadPage copy={copy} />;
  return <div className="site-shell"><SiteHeader /><main className="page-main"><section className="page-hero"><p className="kicker"><span className="kicker-line" /> {copy.kicker}</p><h1>{copy.title}</h1><p>{copy.description}</p><div className="page-hero-actions"><Button asChild><Link href={kind === "organizations" ? routes.learn : routes.home}>{kind === "organizations" ? "Xem cách học bắt đầu" : "Bước vào hành trình"} <ArrowUpRight size={16} /></Link></Button>{kind === "organizations" && <Button asChild variant="secondary"><Link href={routes.about}>Tìm hiểu về Fire3D</Link></Button>}</div></section><div className="section-grid">{kind === "organizations" ? <><InfoCard icon={<Building2 />} title="Tạo theo bối cảnh" body="Bắt đầu từ công trình, quy trình hoặc tình huống mà đội ngũ của bạn cần hiểu rõ hơn." /><InfoCard icon={<Eye />} title="Nhìn thấy tiến bộ" body="Kết quả mô phỏng giúp mở ra cuộc trao đổi về tín hiệu, quyết định và điều cần luyện thêm." /><InfoCard icon={<ShieldCheck />} title="Triển khai có kiểm soát" body="Các gói nội dung được phát hành theo quy trình rõ ràng. Website này không tự nhận chứng nhận an toàn." /></> : <><InfoCard icon={<Flame />} title="Không gian là ngôn ngữ" body="Chúng tôi dùng không gian để tạo ngữ cảnh, không dùng hiệu ứng để làm người học mất phương hướng." /><InfoCard icon={<Eye />} title="Phản hồi có ích" body="Một lần thử chỉ có giá trị khi người học hiểu mình đã thấy gì và có thể làm gì khác đi." /><InfoCard icon={<CheckCircle2 />} title="Minh bạch từ đầu" body="Các màn hình mẫu và trạng thái phát hành trên website đều được ghi rõ để bạn biết đâu là trải nghiệm thật." /></>}</div></main><SiteFooter /></div>;
}

function DownloadPage({ copy }: { copy: PageCopy }) {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><section className="page-hero"><p className="kicker"><span className="kicker-line" /> {copy.kicker}</p><h1>{copy.title}</h1><p>{copy.description}</p></section><Card className="download-panel"><div><h2 className="mb-3 text-2xl font-semibold tracking-[-.04em]">Trạng thái phát hành</h2><p className="mb-6 max-w-[570px] leading-7 text-[var(--muted)]">Hiện chưa có APK hoặc QR active để tải. Bạn có thể tiếp tục khám phá Learn trên web; khi nội dung mobile sẵn sàng, chúng tôi sẽ cập nhật đường dẫn chính thức.</p><div className="download-state"><Download size={18} /><span><strong className="text-[var(--text)]">Chưa khả dụng</strong><br />Không tạo QR giả và không suy đoán trạng thái cài đặt trên thiết bị.</span></div></div><div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--bg-soft)]"><div className="text-center text-[var(--dim)]"><Flame className="mx-auto mb-3 text-[var(--ember)]" /><span className="block text-xs uppercase tracking-[.15em]">Android package</span><span className="mt-2 block text-xs">coming when verified</span></div></div></Card></main><SiteFooter /></div>;
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <Card className="info-card"><span className="text-[var(--ember)]">{icon}</span><h2>{title}</h2><p>{body}</p></Card>;
}
