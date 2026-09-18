"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "../auth-session";

export function ForgotPasswordForm() {
  const { pending, requestPasswordReset } = useAuthSession();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    try { await requestPasswordReset(email); setMessage("Đã gửi yêu cầu. Hãy kiểm tra kênh do quản trị viên Fire3D hướng dẫn."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể gửi yêu cầu. Vui lòng thử lại."); }
  };

  return <form className="login-panel" onSubmit={submit}>
    <h1>Quên mật khẩu?</h1>
    <p className="text-[var(--muted)]">Nhập email tài khoản để bắt đầu khôi phục mật khẩu.</p>
    <label className="form-field">Email<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
    <Button className="form-submit" type="submit" disabled={pending}>{pending ? "Đang gửi…" : "Gửi yêu cầu"}</Button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
