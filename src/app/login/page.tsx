import type { Metadata } from "next";
import { Suspense } from "react";
import { Flame } from "lucide-react";
import { LoginShell } from "@/features/auth/components/login-shell";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return <LoginShell><Suspense fallback={<div className="login-panel"><Flame className="text-[var(--ember)]" /></div>}><LoginForm /></Suspense></LoginShell>;
}
