import type { Metadata } from "next";
import { Suspense } from "react";
import { Flame } from "lucide-react";
import { Iconsax } from "@/components/ui/iconsax";
import Link from "next/link";
import { SiteHeader } from "@/layouts/site-header";
import { LoginForm } from "@/features/auth/components/login-form";
import { routes } from "@/configs/routes";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main login-page-main"><div className="login-shell"><div className="login-intro"><p className="kicker"><span className="kicker-line" /> FET3D / Góc học tập</p><h1 className="mt-5 max-w-[500px] text-5xl font-medium tracking-[-.07em]">Học tiếp từ điều bạn quan tâm.</h1><p className="mt-5 max-w-[470px] leading-7 text-[var(--muted)]">Lưu bài, hỏi theo ngữ cảnh và xem lại kiến thức đã đọc.</p><Link className="mt-7 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--text)]" href={routes.learn}><Iconsax name="arrow-left" size={16} /> Tiếp tục đọc công khai</Link></div><Suspense fallback={<div className="login-panel"><Flame className="text-[var(--ember)]" /></div>}><LoginForm /></Suspense></div></main></div>;
}
