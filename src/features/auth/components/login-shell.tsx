"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import "@/assets/styles/ops.css";
import { FET3DLogo } from "@/components/brand/fet3d-logo";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { routes } from "@/configs/routes";
import { ThemeScope } from "@/features/theme/theme-scope";
import { PixelEvacuation } from "./pixel-evacuation";
import "../login.css";

/**
 * Frame of `/login`: a looping pixel evacuation scene on the left, the form card on the right. It lives in the same ThemeScope (stored
 * preference `fire3d-ops-theme`) as the learning area the learner lands in, so the theme does not change at sign-in.
 * Nothing here changes the stored preference by itself; the toggle is the learner's own choice.
 */
export function LoginShell({ children }: { children: ReactNode }) {
  return <ThemeScope className="login-theme">
    <div className="login-split">
      <aside className="login-art" aria-label="Giới thiệu">
        <h2>Học bài, luyện tập, xem kết quả — theo nhịp của bạn</h2>
        <PixelEvacuation className="login-pixel" />
      </aside>
      <main className="login-side" id="login-main">
        <div className="login-side-top">
          <Link className="login-brand" href={routes.home} aria-label="FET3D, về trang chủ"><FET3DLogo variant="mark" /><span>FET3D</span></Link>
          <ThemeToggle />
        </div>
        <div className="login-side-body">
          {children}
          <Link className="login-public-link" href={routes.learn}><ArrowLeft size={16} aria-hidden="true" /> Tiếp tục đọc công khai</Link>
        </div>
      </main>
    </div>
  </ThemeScope>;
}
