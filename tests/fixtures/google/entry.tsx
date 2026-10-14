import { createRoot } from "react-dom/client";
import { AuthSessionProvider } from "../../../src/features/auth/auth-session";
import { LoginForm } from "../../../src/features/auth/components/login-form";
import { destinations } from "./navigation";

createRoot(document.getElementById("root")!).render(<AuthSessionProvider><LoginForm /></AuthSessionProvider>);
Object.assign(window, { googleTestDestinations: destinations });
