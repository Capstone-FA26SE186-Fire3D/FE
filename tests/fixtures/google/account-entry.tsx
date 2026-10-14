import { createRoot } from "react-dom/client";
import { AccountProfile } from "../../../src/features/account/components/account-profile";
import { AuthSessionProvider } from "../../../src/features/auth/auth-session";
import { ThemeScope } from "../../../src/features/theme/theme-scope";
import { ToastProvider } from "../../../src/components/ui/toast";
import { destinations } from "./navigation";

createRoot(document.getElementById("root")!).render(
  <AuthSessionProvider><ThemeScope><ToastProvider><AccountProfile /></ToastProvider></ThemeScope></AuthSessionProvider>,
);
Object.assign(window, { googleTestDestinations: destinations });
