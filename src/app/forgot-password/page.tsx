import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { SiteHeader } from "@/layouts/site-header";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function ForgotPasswordPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><div className="login-shell"><ForgotPasswordForm /></div></main></div>;
}
