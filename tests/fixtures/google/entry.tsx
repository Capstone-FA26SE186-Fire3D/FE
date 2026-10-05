import { createRoot } from "react-dom/client";
import { AuthSessionProvider } from "../../../src/features/auth/auth-session";
import { LoginForm } from "../../../src/features/auth/components/login-form";
import { DemoSessionProvider } from "../../../src/store/demo-session";
import { destinations } from "./navigation";

createRoot(document.getElementById("root")!).render(<DemoSessionProvider><AuthSessionProvider><LoginForm /></AuthSessionProvider></DemoSessionProvider>);
Object.assign(window, { googleTestDestinations: destinations });
