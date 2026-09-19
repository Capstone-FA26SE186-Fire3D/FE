import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { SiteHeader } from "@/layouts/site-header";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

export default function ResetPasswordPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><div className="login-shell"><Suspense fallback={<p>Đang mở biểu mẫu…</p>}><ResetPasswordForm /></Suspense></div></main></div>;
}
