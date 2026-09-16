import type { Metadata } from "next";
import { DemoSessionProvider } from "@/store/demo-session";
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
  title: { default: "Fire3D — Làm quen hôm nay. Chủ động ngày mai.", template: "%s — Fire3D" },
  description: "Fire3D giúp mọi người làm quen với không gian và luyện quyết định trong những tình huống có ý nghĩa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><DemoSessionProvider>{children}</DemoSessionProvider></body></html>;
}
