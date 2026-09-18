"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/configs/env";
import { routes } from "@/configs/routes";
import Link from "next/link";
import { useDemoSession } from "@/store/demo-session";
import { useAuthSession } from "../auth-session";
import { demoCredentials, safeNext } from "../demo-auth";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { pendingAction, ready: demoReady } = useDemoSession();
  const { login, pending, ready: authReady } = useAuthSession();
  const [email, setEmail] = useState(env.authMode === "mock" ? demoCredentials.email : "");
  const [password, setPassword] = useState(env.authMode === "mock" ? demoCredentials.password : "");
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!await login({ email, password })) { setMessage("Email hoặc mật khẩu chưa đúng, hoặc dịch vụ hiện chưa sẵn sàng."); return; }
    const next = pendingAction?.type === "ask"
      ? `${routes.learningHub}?article=${encodeURIComponent(pendingAction.slug)}`
      : pendingAction?.type === "save" ? `/learn/${pendingAction.slug}` : safeNext(params.get("next"));
    router.replace(next);
  };

  return (
    <form className="login-panel" onSubmit={submit} aria-describedby="demo-login-note">
      <h1>Chào mừng trở lại.</h1>
      <p data-testid="auth-mode" className="text-sm text-[var(--muted)]">{env.authMode}</p>
      <p id="demo-login-note">{env.authMode === "mock" ? "Phiên minh họa trên trình duyệt, không phải tài khoản thật. Không nhập mật khẩu cá nhân." : "Đăng nhập bằng tài khoản do quản trị viên Fire3D cấp."}</p>
      {env.authMode === "mock" && <div className="demo-account"><strong>Tài khoản trải nghiệm</strong><br />{demoCredentials.email}<br />{demoCredentials.password}</div>}
      <label className="form-field">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" aria-invalid={!!message} /></label>
      <label className="form-field">Mật khẩu<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" aria-invalid={!!message} /></label>
      <Button disabled={!demoReady || !authReady || pending} className="form-submit" type="submit">{pending ? "Đang đăng nhập…" : env.authMode === "mock" ? "Đăng nhập trải nghiệm" : "Đăng nhập"}</Button>
      <Link className="text-sm underline underline-offset-4" href={routes.forgotPassword}>Quên mật khẩu?</Link>
      {message && <p role="alert" aria-label="Lỗi đăng nhập" className="form-message">{message}</p>}
    </form>
  );
}
