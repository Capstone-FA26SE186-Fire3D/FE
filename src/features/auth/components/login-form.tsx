"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasFirebaseAuthConfig } from "@/configs/env";
import { routes } from "@/configs/routes";
import { useDemoSession } from "@/store/demo-session";
import { useAuthSession } from "../auth-session";
import { safeNext } from "../redirect";
import { GoogleIcon } from "./google-icon";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { pendingAction } = useDemoSession();
  const { isAuthenticated, login, loginWithGoogle, ready, register } = useAuthSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<"trainee" | "organization">("trainee");
  const [username, setUsername] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationAddress, setOrganizationAddress] = useState("");
  const [organizationPhoneNumber, setOrganizationPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ready && isAuthenticated) router.replace(safeNext(params.get("next")));
  }, [isAuthenticated, params, ready, router]);

  if (ready && isAuthenticated) return <p className="auth-redirect" role="status">Bạn đã đăng nhập. Đang chuyển hướng…</p>;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      if (mode === "register") {
        if (accountType === "organization") {
          await register({ accountType, email, password, confirmPassword, fullName, organizationName, organizationAddress, organizationPhoneNumber });
        } else {
          await register({ accountType, email, password, confirmPassword, fullName, username: username.trim().toLowerCase() });
        }
      }
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

  const submitGoogle = async () => {
    setMessage("");
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xác thực với Google. Vui lòng thử lại.");
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
      <h1>{mode === "login" ? "Đăng nhập Fire3D" : "Tạo tài khoản"}</h1>
      <p id="auth-note">{mode === "login" ? "Dùng email và mật khẩu Fire3D. Google là lựa chọn bổ sung khi môi trường đã cấu hình Firebase." : "Mật khẩu cần từ 12 ký tự để đáp ứng yêu cầu của Fire3D."}</p>
      {mode === "register" && <>
        <fieldset className="account-type-fieldset">
          <legend>Loại tài khoản</legend>
          <div className="account-type-options">
            <label className={`account-type-card ${accountType === "trainee" ? "is-selected" : ""}`}>
              <UserRound aria-hidden="true" size={20} strokeWidth={1.7} />
              <span className="account-type-copy"><strong>Học viên</strong><small>Học kiến thức và tham gia tập huấn.</small></span>
              <input className="account-type-radio" type="radio" name="account-type" checked={accountType === "trainee"} onChange={() => setAccountType("trainee")} />
            </label>
            <label className={`account-type-card ${accountType === "organization" ? "is-selected" : ""}`}>
              <Building2 aria-hidden="true" size={20} strokeWidth={1.7} />
              <span className="account-type-copy"><strong>Tổ chức</strong><small>Quản lý BIM, IFC và kịch bản diễn tập.</small></span>
              <input className="account-type-radio" type="radio" name="account-type" checked={accountType === "organization"} onChange={() => setAccountType("organization")} />
            </label>
          </div>
        </fieldset>
        <label className="form-field">Họ và tên<input required minLength={1} maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" aria-invalid={!!message} /></label>
        {accountType === "trainee" ? <label className="form-field">Tên người dùng<input required minLength={3} maxLength={50} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" aria-invalid={!!message} /></label> : <>
          <label className="form-field">Tên tổ chức<input required maxLength={200} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} aria-invalid={!!message} /></label>
          <label className="form-field">Địa chỉ tổ chức<input required maxLength={500} value={organizationAddress} onChange={(event) => setOrganizationAddress(event.target.value)} aria-invalid={!!message} /></label>
          <label className="form-field">Điện thoại tổ chức<input required maxLength={30} value={organizationPhoneNumber} onChange={(event) => setOrganizationPhoneNumber(event.target.value)} autoComplete="tel" aria-invalid={!!message} /></label>
        </>}
      </>}
      <label className="form-field">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" aria-invalid={!!message} /></label>
      <label className="form-field">Mật khẩu<input required minLength={12} maxLength={128} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={!!message} /></label>
      {mode === "register" && <label className="form-field">Xác nhận mật khẩu<input required minLength={12} maxLength={128} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" aria-invalid={!!message} /></label>}
      <Button disabled={!ready || submitting} className="form-submit" type="submit">{submitting ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</Button>
      {mode === "login" && <Button disabled={!ready || !hasFirebaseAuthConfig || submitting} className="google-sign-in" type="button" variant="secondary" onClick={() => void submitGoogle()}><GoogleIcon /> Tiếp tục với Google</Button>}
      {message && <p role="alert" aria-label="Lỗi xác thực" className="form-message">{message}</p>}
    </form>
  );
}
