"use client";

import Link from "next/link";
import { BookOpen, Building2, FileScan, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";

type DashboardRole = "organization" | "trainee";

type DashboardItem = {
  description: string;
  href: string;
  icon: typeof BookOpen;
  title: string;
};

const dashboardItems: Record<DashboardRole, DashboardItem[]> = {
  trainee: [
    { title: "Mở Góc học tập", description: "Đọc lại nội dung đã lưu, đặt câu hỏi theo bài và xem lịch sử của phiên hiện tại.", href: routes.learningHub, icon: BookOpen },
    { title: "Khám phá Learn", description: "Tìm các bài học nền tảng về nhận thức thoát hiểm và PCCC.", href: routes.learn, icon: BookOpen },
    { title: "Xem hồ sơ", description: "Cập nhật thông tin cá nhân và bảo mật tài khoản Fire3D.", href: routes.account, icon: UserRound },
  ],
  organization: [
    { title: "Quản lý công trình", description: "Tạo công trình, theo dõi revision IFC, QA và artifact từ worker.", href: routes.workspaceBuildings, icon: Building2 },
    { title: "Quét mô hình IFC", description: "Rà soát tệp IFC cục bộ trước khi upload vào revision của công trình.", href: routes.workspaceIfc, icon: FileScan },
    { title: "Hồ sơ tổ chức", description: "Cập nhật hồ sơ cá nhân, tổ chức, avatar và bảo mật bằng API Fire3D.", href: routes.account, icon: UserRound },
  ],
};

const copy: Record<DashboardRole, { heading: string; intro: string; kicker: string; role: number }> = {
  trainee: {
    heading: "Không gian học tập",
    intro: "Học viên có thể đọc, lưu bài và hỏi theo ngữ cảnh. Kết quả mô phỏng/game chỉ xuất hiện khi backend cung cấp phiên học thực tế.",
    kicker: "Hành trình cá nhân",
    role: 2,
  },
  organization: {
    heading: "Không gian tổ chức",
    intro: "Quản lý BIM, revision IFC và kịch bản diễn tập theo phạm vi tổ chức. Việc xác nhận PCCC, publish và playtest vẫn phải qua các gate backend.",
    kicker: "Vận hành BIM",
    role: 1,
  },
};

export function RoleDashboard({ role }: { role: DashboardRole }) {
  const { isAuthenticated, ready, user } = useAuthSession();
  const content = copy[role];

  if (!ready) return <Card className="mt-12 p-7" aria-busy="true"><p>Đang kiểm tra phiên đăng nhập…</p></Card>;
  if (!isAuthenticated) return <Card className="mt-12 p-7"><h1>{content.heading}</h1><p>Hãy đăng nhập để mở không gian phù hợp với tài khoản của bạn.</p><Button asChild><Link href={routes.login}>Đăng nhập</Link></Button></Card>;
  if (user?.role !== content.role) return <Card className="mt-12 p-7"><h1>Không có quyền truy cập</h1><p>Trang này dành cho một loại tài khoản khác. Hãy mở trang phù hợp từ menu tài khoản.</p></Card>;

  return <section className="mx-auto max-w-[980px] py-[52px] pb-[88px]">
    <header className="max-w-[680px]"><p className="kicker"><span className="kicker-line" /> {content.kicker}</p><h1 className="my-4 text-[clamp(34px,5vw,54px)] tracking-[-.06em]">{content.heading}</h1><p className="leading-7 text-[var(--muted)]">{content.intro}</p></header>
    <div className="mt-8 grid gap-4 md:grid-cols-3">{dashboardItems[role].map((item) => {
      const Icon = item.icon;
      return <Card className="flex min-h-[248px] flex-col items-start p-7" key={item.title}><Icon aria-hidden="true" size={22} strokeWidth={1.7} /><h2 className="mb-2 mt-5 text-xl tracking-[-.04em]">{item.title}</h2><p className="leading-6 text-[var(--muted)]">{item.description}</p><Button asChild className="mt-auto" variant="secondary"><Link href={item.href}>{item.title}</Link></Button></Card>;
    })}</div>
  </section>;
}
