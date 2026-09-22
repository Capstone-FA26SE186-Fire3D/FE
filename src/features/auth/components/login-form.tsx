"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { hasFirebaseAuthConfig } from "@/configs/env";
import { routes } from "@/configs/routes";
import { useDemoSession } from "@/store/demo-session";
import { useAuthSession } from "../auth-session";
import { safeNext } from "../redirect";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { pendingAction } = useDemoSession();
  const { login, ready, register } = useAuthSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      if (mode === "register") await register({ email, password, fullName });
      else await login(email, password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xác thực. Vui lòng thử lại.");
      setSubmitting(false);
      return;
    }
    const next = pendingAction?.type === "ask"
      ? `${routes.learningHub}?article=${encodeURIComponent(pendingAction.slug)}`
      : pendingAction?.type === "save" ? `/learn/${pendingAction.slug}` : safeNext(params.get("next"));
    router.replace(next);
  };

  return (
    <form className="login-panel" onSubmit={submit} aria-describedby="auth-note">
      <div className="auth-tabs" role="tablist" aria-label="Xác thực">
        <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setMessage(""); }}>Đăng nhập</button>
        <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setMessage(""); }}>Tạo tài khoản</button>
      </div>
      <h1>{mode === "login" ? "Đăng nhập Firebase" : "Tạo tài khoản"}</h1>
      <p id="auth-note">{mode === "login" ? "Dùng tài khoản Email/Password đã được bật trong Firebase Authentication." : "Mật khẩu cần từ 12 ký tự để đáp ứng yêu cầu của Fire3D."}</p>
      {!hasFirebaseAuthConfig && <p className="auth-setup" role="status">Chưa cấu hình Firebase cho môi trường này.</p>}
      {mode === "register" && <label className="form-field">Họ và tên<input required minLength={1} maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" aria-invalid={!!message} /></label>}
      <label className="form-field">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" aria-invalid={!!message} /></label>
      <label className="form-field">Mật khẩu<input required minLength={12} maxLength={128} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={!!message} /></label>
      <Button disabled={!ready || !hasFirebaseAuthConfig || submitting} className="form-submit" type="submit">{submitting ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</Button>
      {message && <p role="alert" aria-label="Lỗi xác thực" className="form-message">{message}</p>}
    </form>
  );
}
