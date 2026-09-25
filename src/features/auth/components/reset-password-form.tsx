"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "../auth-session";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const { pending, resetPassword } = useAuthSession();
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const token = params.get("token") ?? "";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!token) { setError("Liên kết đặt lại mật khẩu không hợp lệ."); return; }
    try { await resetPassword(token, newPassword); setMessage("Mật khẩu đã được đặt lại. Bạn có thể đăng nhập."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đặt lại mật khẩu. Vui lòng thử lại."); }
  };

  return <form className="login-panel" onSubmit={submit}>
    <h1>Đặt lại mật khẩu</h1>
    <p className="text-[var(--muted)]">Chọn mật khẩu mới cho tài khoản của bạn.</p>
    <label className="form-field">Mật khẩu mới<input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
    <Button className="form-submit" type="submit" disabled={pending}>{pending ? "Đang đặt lại…" : "Đặt lại mật khẩu"}</Button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
