import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeft, Flame } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/layouts/site-header";
import { LoginForm } from "@/features/auth/components/login-form";
import { routes } from "@/configs/routes";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><div className="login-shell"><div><p className="kicker"><span className="kicker-line" /> Fire3D / phiên trải nghiệm</p><h1 className="mt-5 max-w-[500px] text-5xl font-medium tracking-[-.07em]">Mang những câu hỏi của bạn vào Góc học tập.</h1><p className="mt-5 max-w-[470px] leading-7 text-[var(--muted)]">Lưu bài đọc, hỏi theo ngữ cảnh và xem lại một hành trình mô phỏng — tất cả trong dữ liệu mẫu trên trình duyệt này.</p><Link className="mt-7 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--text)]" href={routes.learn}><ArrowLeft size={15} /> Tiếp tục đọc công khai</Link></div><Suspense fallback={<div className="login-panel"><Flame className="text-[var(--ember)]" /></div>}><LoginForm /></Suspense></div></main></div>;
}
