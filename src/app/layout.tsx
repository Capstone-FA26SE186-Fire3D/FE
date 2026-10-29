import type { Metadata } from "next";
import { AuthSessionProvider } from "@/features/auth/auth-session";
import { THEME_BOOT_SCRIPT } from "@/features/theme/theme-boot";
import "@/assets/styles/globals.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";

export const metadata: Metadata = {
  title: { default: "FET3D — Làm quen hôm nay. Chủ động ngày mai.", template: "%s — FET3D" },
  description: "FET3D — A BIM-to-Game Platform for Building-Specific Fire Evacuation Scenario Training. Làm quen với không gian và luyện quyết định trong những tình huống có ý nghĩa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The inline script applies the saved light/dark choice before the first paint (see theme-boot.ts); it sets an
  // attribute on <html>, hence suppressHydrationWarning.
  return <html lang="vi" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} /></head><body><AuthSessionProvider>{children}</AuthSessionProvider></body></html>;
}
