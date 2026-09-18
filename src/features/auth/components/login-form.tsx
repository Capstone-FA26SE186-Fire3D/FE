"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/configs/env";
import { routes } from "@/configs/routes";
import { useDemoSession } from "@/store/demo-session";
import { demoCredentials, safeNext } from "../demo-auth";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, pendingAction, ready } = useDemoSession();
  const [email, setEmail] = useState(demoCredentials.email);
  const [password, setPassword] = useState(demoCredentials.password);
  const [message, setMessage] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!login(email, password)) { setMessage("Email hoặc mật khẩu mẫu chưa đúng. Dùng tài khoản trải nghiệm hiển thị bên dưới."); return; }
    const next = pendingAction?.type === "ask"
      ? `${routes.learningHub}?article=${encodeURIComponent(pendingAction.slug)}`
      : pendingAction?.type === "save" ? `/learn/${pendingAction.slug}` : safeNext(params.get("next"));
    router.replace(next);
  };

  return (
    <form className="login-panel" onSubmit={submit} aria-describedby="demo-login-note">
      <h1>Chào mừng trở lại.</h1>
      <p data-testid="auth-mode" className="text-sm text-[var(--muted)]">{env.authMode}</p>
      <p id="demo-login-note">Phiên minh họa trên trình duyệt, không phải tài khoản thật. Không nhập mật khẩu cá nhân.</p>
      <div className="demo-account"><strong>Tài khoản trải nghiệm</strong><br />{demoCredentials.email}<br />{demoCredentials.password}</div>
      <label className="form-field">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" aria-invalid={!!message} /></label>
      <label className="form-field">Mật khẩu<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" aria-invalid={!!message} /></label>
      <Button disabled={!ready} className="form-submit" type="submit">Đăng nhập trải nghiệm</Button>
      {message && <p role="alert" aria-label="Lỗi đăng nhập" className="form-message">{message}</p>}
    </form>
  );
}
