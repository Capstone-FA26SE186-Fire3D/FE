"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleAlert } from "lucide-react";
import { messageOf } from "@/api/describe-error";
import { ApiError } from "@/api/types/common";
import { useNow } from "@/api/use-now";
import { Button } from "@/components/ui/button";
import { Iconsax } from "@/components/ui/iconsax";
import { hasFirebaseAuthConfig } from "@/configs/env";
import { authApi } from "../api";
import { useAuthSession } from "../auth-session";
import { signInWithGoogle } from "../firebase";
import { googleErrorMessage } from "../google-errors";
import type { AuthUser, FirstLoginChallenge } from "../types";
import { GoogleIcon } from "./google-icon";

/**
 * First sign-in of an account an admin created (Chuyên viên PCCC, BE#235). The password was right, but no session exists
 * until the person proves the mailbox: the 6-digit code that was just emailed, or Google of the same email. The session
 * that follows only lets the person change the initial password (see `FirstPasswordChange`).
 */
export function FirstLoginVerify({ challenge: initial, onDone, onBack }: {
  challenge: FirstLoginChallenge;
  onDone: (user: AuthUser) => void;
  /** Back to email and password; `message` says why when the step can no longer be finished. */
  onBack: (message?: string) => void;
}) {
  const { adoptSession } = useAuthSession();
  const [challenge, setChallenge] = useState(initial);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"code" | "google" | "resend" | null>(null);
  const [resendAt, setResendAt] = useState(() => Date.now() + initial.resendAfterSeconds * 1000);
  const now = useNow(true, 500);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { headingRef.current?.focus(); }, []);

  const holdResend = (seconds: unknown) => {
    const value = Number(seconds);
    if (Number.isFinite(value) && value > 0) setResendAt(Date.now() + value * 1000);
  };

  /** The challenge is gone (30 minutes passed, or a newer sign-in replaced it): only a new sign-in helps. */
  const expired = (error: unknown) => {
    if (!(error instanceof ApiError) || error.code !== "FIRST_LOGIN_CHALLENGE_INVALID") return false;
    onBack(error.message);
    return true;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setMessage(""); setNotice(""); setBusy("code");
    try {
      onDone(adoptSession(await authApi.verifyFirstLogin(challenge.challengeToken, code)));
    } catch (error) {
      if (expired(error)) return;
      setBusy(null);
      setCode("");
      if (error instanceof ApiError && error.code === "FIRST_LOGIN_CODE_INVALID") {
        const left = Number(error.payload?.attemptsRemaining);
        setMessage(Number.isFinite(left) && left > 0 ? `Mã xác minh chưa đúng. Bạn còn ${left} lần thử.` : error.message);
        return;
      }
      if (error instanceof ApiError && error.code === "FIRST_LOGIN_CODE_LOCKED") holdResend(error.payload?.resendAfterSeconds);
      setMessage(messageOf(error, "Chưa xác minh được mã. Hãy thử lại."));
    }
  };

  const resend = async () => {
    if (busy || wait > 0) return;
    setMessage(""); setNotice(""); setBusy("resend");
    try {
      const next = await authApi.resendFirstLoginCode(challenge.challengeToken);
      setChallenge(next);
      setCode("");
      setResendAt(Date.now() + Math.max(next.resendAfterSeconds, 60) * 1000);
      setNotice("Đã gửi mã mới. Mã trước đó không còn dùng được.");
    } catch (error) {
      if (expired(error)) return;
      if (error instanceof ApiError && error.status === 429) holdResend(error.retryAfterSeconds ?? 60);
      setMessage(messageOf(error, "Chưa gửi lại được mã. Hãy thử lại."));
    } finally { setBusy(null); }
  };

  const google = async () => {
    if (busy) return;
    setMessage(""); setNotice(""); setBusy("google");
    try {
      const idToken = await signInWithGoogle();
      onDone(adoptSession(await authApi.verifyFirstLoginWithGoogle(challenge.challengeToken, idToken)));
    } catch (error) {
      if (expired(error)) return;
      setBusy(null);
      setMessage(googleErrorMessage(error));
    }
  };

  return <form className="login-panel" onSubmit={submit} aria-describedby="first-login-note" data-testid="first-login-verify">
    <h1 ref={headingRef} tabIndex={-1}>Xác minh email</h1>
    <p id="first-login-note">Đây là lần đăng nhập đầu của tài khoản. Nhập mã 6 chữ số vừa gửi đến <strong>{challenge.emailHint || "email của tài khoản"}</strong>. Mã có hiệu lực trong 10 phút.</p>
    {message && <div role="alert" aria-label="Lỗi xác minh" className="form-message"><CircleAlert aria-hidden="true" size={18} /><div><strong>Thông báo từ FET3D</strong><p>{message}</p></div></div>}
    {notice && <p className="verification-status" role="status">{notice}</p>}
    <fieldset className="auth-fields" disabled={busy !== null}>
      <label className="form-field">Mã xác minh<input required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" /></label>
    </fieldset>
    <Button className="form-submit" type="submit" disabled={busy !== null || code.length !== 6}>{busy === "code" ? "Đang xác minh…" : "Xác minh"}</Button>
    <Button type="button" variant="secondary" disabled={busy !== null || wait > 0} onClick={() => void resend()}>{busy === "resend" ? "Đang gửi…" : wait > 0 ? `Gửi lại mã sau ${wait} giây` : "Gửi lại mã"}</Button>
    {hasFirebaseAuthConfig && <Button className="google-sign-in" type="button" variant="secondary" disabled={busy !== null} onClick={() => void google()}><GoogleIcon /> Xác minh bằng Google của email này</Button>}
    <p className="verification-status">Không nhận được mã? Kiểm tra hộp thư rác. Nếu địa chỉ email sai, hãy báo quản trị FET3D để sửa.</p>
    <Button type="button" variant="quiet" disabled={busy !== null} onClick={() => onBack()}><Iconsax name="arrow-left" size={16} /> Quay lại đăng nhập</Button>
  </form>;
}
