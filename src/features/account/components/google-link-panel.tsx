"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { PasswordInput } from "@/components/ui/password-input";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasFirebaseAuthConfig } from "@/configs/env";
import { routes } from "@/configs/routes";
import { authApi } from "@/features/auth/api";
import { useAuthSession } from "@/features/auth/auth-session";
import { signInWithGoogle } from "@/features/auth/firebase";
import { googleErrorMessage } from "@/features/auth/google-errors";
import { GoogleIcon } from "@/features/auth/components/google-icon";
import { linkGoogleProblem, setPasswordProblem, type GoogleLinkProblem } from "@/features/auth/google-link-errors";
import type { AuthUser } from "@/features/auth/types";

type Props = {
  accessToken: string;
  profile: AuthUser;
  /** Called with the server's profile (and ETag) after a replayed link that does not end the session. */
  onProfileChange: (user: AuthUser, etag: string | null) => void;
  onReload: () => void;
};

type Wait = { until: number; seconds: number };

/** Count-down for 429/503 Retry-After; the action stays disabled until it reaches zero. */
function useWait() {
  const [wait, setWait] = useState<Wait | null>(null);
  const until = wait?.until;
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => {
      setWait((current) => {
        if (!current) return null;
        const seconds = Math.max(0, Math.ceil((current.until - Date.now()) / 1000));
        return seconds ? { ...current, seconds } : null;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [until]);
  const start = (seconds?: number) => setWait(seconds ? { until: Date.now() + seconds * 1000, seconds } : null);
  return [wait, start] as const;
}

/**
 * Link Google to a local account (FR-AUTH-08) and let a Google-only account add its first local password (FR-AUTH-10).
 * The Firebase idToken and the passwords live only inside one click handler: never in state, storage, logs or URLs.
 */
export function GoogleLinkPanel({ accessToken, profile, onProfileChange, onReload }: Props) {
  const router = useRouter();
  const { endSession } = useAuthSession();
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [problem, setProblem] = useState<GoogleLinkProblem | null>(null);
  const [localError, setLocalError] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [wait, startWait] = useWait();

  const linked = profile.googleLinked;
  const hasLocalLogin = profile.hasLocalLogin;
  // The API reports both flags on /api/auth/me. Without them the state is unknown: offer nothing rather than guess.
  if (linked === undefined || hasLocalLogin === undefined) return null;
  const googleOnly = linked && !hasLocalLogin;
  const disabled = working || !!wait || !hasFirebaseAuthConfig;

  const signInAgain = (code: string) => { endSession(); router.replace(`${routes.login}?notice=${code}`); };

  const acquireGoogleToken = async () => {
    try { return await signInWithGoogle(); } catch (error) { setProblem({ message: googleErrorMessage(error) }); return null; }
  };

  const link = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || disabled) return;
    setProblem(null); setNotice(null);
    if (!currentPassword) { setLocalError({ currentPassword: "Nhập mật khẩu hiện tại." }); return; }
    setLocalError({});
    busy.current = true; setWorking(true);
    try {
      const idToken = await acquireGoogleToken();
      if (!idToken) return;
      const result = await authApi.linkGoogle(accessToken, { idToken, currentPassword });
      setCurrentPassword("");
      if (result.requiresLogin) { signInAgain("google-linked"); return; }
      onProfileChange(result.user, result.etag);
      setNotice("Tài khoản Google này đã được liên kết từ trước. Phiên hiện tại vẫn còn hiệu lực.");
    } catch (error) {
      const next = linkGoogleProblem(error);
      setProblem(next);
      if (next.retryAfterSeconds) startWait(next.retryAfterSeconds);
      if (next.reload) onReload();
    } finally { busy.current = false; setWorking(false); }
  };

  const setPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || disabled) return;
    setProblem(null); setNotice(null);
    const found: typeof localError = {};
    if (newPassword.length < 6 || newPassword.length > 128) found.newPassword = "Mật khẩu mới cần từ 6 đến 128 ký tự.";
    else if (!newPassword.trim()) found.newPassword = "Mật khẩu không được chỉ gồm khoảng trắng.";
    if (newPassword !== confirmPassword) found.confirmPassword = "Xác nhận mật khẩu chưa khớp.";
    setLocalError(found);
    if (found.newPassword || found.confirmPassword) return;
    busy.current = true; setWorking(true);
    try {
      const idToken = await acquireGoogleToken();
      if (!idToken) return;
      await authApi.setLocalPassword(accessToken, { idToken, newPassword });
      setNewPassword(""); setConfirmPassword("");
      signInAgain("password-set");
    } catch (error) {
      const next = setPasswordProblem(error);
      setProblem(next);
      if (next.retryAfterSeconds) startWait(next.retryAfterSeconds);
      if (next.reload) onReload();
    } finally { busy.current = false; setWorking(false); }
  };

  const status = googleOnly ? "Chỉ đăng nhập bằng Google" : linked ? "Đã liên kết Google" : "Chưa liên kết Google";
  const alerts = <>
    {!hasFirebaseAuthConfig && <Alert tone="info" title="Chưa bật đăng nhập Google">Trang này chưa bật đăng nhập Google nên chưa thể liên kết.</Alert>}
    {wait && <Alert tone="warning" title="Cần chờ trước khi thử lại">Có thể thử lại sau {wait.seconds} giây.</Alert>}
    {notice && <Alert tone="success" title="Đã kiểm tra">{notice}</Alert>}
    {problem && !problem.field && <Alert tone={problem.needsLogin ? "warning" : "danger"} title={problem.needsLogin ? "Cần đăng nhập lại" : "Không hoàn tất được"} action={problem.needsLogin ? <Button asChild size="sm" variant="secondary" className="mt-3"><Link href={routes.login}>Đăng nhập lại</Link></Button> : problem.reload ? <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onReload}>Tải lại hồ sơ</Button> : undefined}>{problem.message}</Alert>}
  </>;

  return <Panel title="Đăng nhập bằng Google" description="Liên kết Google để đăng nhập nhanh hơn. Email, vai trò và quyền truy cập không thay đổi." data-testid="google-link-panel" bodyClassName="ops-stack">
    <div><StatusBadge tone={linked ? "success" : "neutral"}>{status}</StatusBadge></div>
    {linked && hasLocalLogin && <p className="ops-muted">Tài khoản này đã liên kết Google và có mật khẩu FET3D. Hiện chưa có thao tác hủy liên kết trong ứng dụng.</p>}

    {!linked && <form onSubmit={link} noValidate className="ops-stack" aria-label="Liên kết Google">
      <p className="ops-muted">Nhập mật khẩu hiện tại, sau đó xác thực tài khoản Google. Khi liên kết thành công, mọi phiên đăng nhập sẽ bị thu hồi và bạn đăng nhập lại.</p>
      <Field label="Mật khẩu hiện tại" required error={localError.currentPassword ?? (problem?.field === "currentPassword" ? problem.message : undefined)}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="mật khẩu hiện tại" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />}</Field>
      {alerts}
      <div><Button type="submit" disabled={disabled}><GoogleIcon />{working ? "Đang xác thực…" : "Xác thực Google và liên kết"}</Button></div>
    </form>}

    {googleOnly && <form onSubmit={setPassword} noValidate className="ops-stack" aria-label="Đặt mật khẩu FET3D">
      <p className="ops-muted">Tài khoản này chưa có mật khẩu FET3D. Đặt mật khẩu để đăng nhập bằng email. Bạn cần xác thực Google lại ngay lúc đặt, và mọi phiên sẽ bị thu hồi sau khi đặt.</p>
      <Field label="Mật khẩu mới" required hint="6 đến 128 ký tự." error={localError.newPassword ?? (problem?.field === "newPassword" ? problem.message : undefined)}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="mật khẩu mới để đặt lần đầu" autoComplete="new-password" required minLength={6} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />}</Field>
      <Field label="Xác nhận mật khẩu mới" required error={localError.confirmPassword}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="xác nhận mật khẩu mới để đặt lần đầu" autoComplete="new-password" required minLength={6} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />}</Field>
      {alerts}
      <div><Button type="submit" disabled={disabled}><GoogleIcon />{working ? "Đang xác thực…" : "Xác thực Google và đặt mật khẩu"}</Button></div>
    </form>}

    {linked && hasLocalLogin && (problem || notice || !hasFirebaseAuthConfig) && alerts}
  </Panel>;
}
