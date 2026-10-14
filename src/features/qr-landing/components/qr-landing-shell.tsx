"use client";

import Link from "next/link";
import "@/assets/styles/ops.css";
import { FET3DLogo } from "@/components/brand/fet3d-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { ThemeScope } from "@/features/theme/theme-scope";
import { QrLanding } from "./qr-landing";
import "../qr-landing.css";

/** Public page frame for `/qr/<token>`: themed (light/dark/system), own top bar, no site navigation that could leak the URL. */
export function QrLandingShell({ token }: { token: string }) {
  return <ThemeScope>
    <ToastProvider>
      <div className="qrl-page">
        <a className="ops-skip" href="#qr-main">Bỏ qua tới nội dung</a>
        <header className="qrl-topbar">
          <Link className="qrl-brand" href={routes.home} aria-label="FET3D, về trang chủ"><FET3DLogo variant="mark" /><span>FET3D</span></Link>
          <span className="qrl-spacer" />
          <ThemeToggle />
          <Account />
        </header>
        <main id="qr-main" className="qrl-main" tabIndex={-1}>
          <QrLanding token={token} />
        </main>
      </div>
    </ToastProvider>
  </ThemeScope>;
}

function Account() {
  const { ready, user } = useAuthSession();
  if (!ready || !user) return null;
  return <span className="qrl-user" title={user.email}>{user.fullName || user.email}</span>;
}
