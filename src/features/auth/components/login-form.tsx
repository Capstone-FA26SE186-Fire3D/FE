"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, CircleAlert, UserRound } from "lucide-react";
import { ApiError } from "@/api/types/common";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { hasFirebaseAuthConfig } from "@/configs/env";
import { routes } from "@/configs/routes";
import { useDemoSession } from "@/store/demo-session";
import { authApi } from "../api";
import { useAuthSession } from "../auth-session";
import { postLoginRoute } from "../redirect";
import { GoogleIcon } from "./google-icon";

function errorCode(error: unknown) {
  const code = error instanceof ApiError ? error.payload?.code : undefined;
  return typeof code === "string" ? code : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { pendingAction } = useDemoSession();
  const { isAuthenticated, login, loginWithGoogle, ready, register, user } = useAuthSession();
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
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [registrationToken, setRegistrationToken] = useState("");
  const [otpNotice, setOtpNotice] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [resendNotice, setResendNotice] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [otpPending, setOtpPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);

  useEffect(() => {
    if (ready && isAuthenticated) router.replace(postLoginRoute(user, params.get("next")));
  }, [isAuthenticated, params, ready, router, user]);

  if (ready && isAuthenticated) return <p className="auth-redirect" role="status">Bạn đã đăng nhập. Đang chuyển hướng…</p>;

  const clearRegistrationProof = () => {
    setOtp("");
    setOtpSent(false);
    setRegistrationToken("");
    setOtpNotice("");
  };

  const selectMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setMessage("");
    setPendingVerificationEmail("");
    setResendNotice("");
    if (nextMode === "login") clearRegistrationProof();
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    clearRegistrationProof();
    setPendingVerificationEmail("");
    setResendNotice("");
  };

  const requestOtp = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.form?.reportValidity()) return;
    setMessage("");
    setOtpNotice("");
    setOtpPending(true);
    try {
      await authApi.requestRegistrationOtp(email.trim());
      setOtpSent(true);
      setOtp("");
      setOtpNotice("Mã OTP đã được gửi. Nhập mã gồm 6 chữ số trong email của bạn.");
    } catch (error) {
      setMessage(errorMessage(error, "Không thể gửi mã OTP. Vui lòng thử lại."));
    } finally {
      setOtpPending(false);
    }
  };

  const verifyOtp = async () => {
    setMessage("");
    setOtpNotice("");
    setOtpPending(true);
    try {
      const proof = await authApi.verifyRegistrationOtp(email.trim(), otp.trim());
      setRegistrationToken(proof.registrationToken);
      setOtpNotice("Email đã được xác minh. Bạn có thể tạo tài khoản.");
    } catch (error) {
      setMessage(errorMessage(error, "Mã OTP không hợp lệ hoặc đã hết hạn."));
    } finally {
      setOtpPending(false);
    }
  };

  const resendRegistrationOtp = async () => {
    setMessage("");
    setOtpNotice("");
    setOtpPending(true);
    try {
      await authApi.resendVerification(email.trim());
      setOtp("");
      setRegistrationToken("");
      setOtpSent(true);
      setOtpNotice("Mã OTP mới đã được gửi. Mã và xác minh trước đó không còn hiệu lực.");
    } catch (error) {
      setMessage(errorMessage(error, "Không thể gửi lại mã OTP. Vui lòng thử lại."));
    } finally {
      setOtpPending(false);
    }
  };

  const resendVerification = async () => {
    setMessage("");
    setResendNotice("");
    setResendPending(true);
    try {
      await authApi.resendVerification(pendingVerificationEmail);
      setResendNotice("Mã OTP đã được yêu cầu. Hãy kiểm tra email của bạn.");
    } catch (error) {
      setMessage(errorMessage(error, "Không thể gửi lại mã OTP. Vui lòng thử lại."));
    } finally {
      setResendPending(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (mode === "register" && !registrationToken) {
      setMessage("Hãy xác minh email bằng mã OTP trước khi tạo tài khoản.");
      return;
    }
    setSubmitting(true);
    let authenticatedUser = user;
    try {
      authenticatedUser = mode === "register"
        ? accountType === "organization"
          ? await register({ accountType, email, password, confirmPassword, fullName, organizationName, organizationAddress, organizationPhoneNumber, registrationToken })
          : await register({ accountType, email, password, confirmPassword, fullName, username: username.trim().toLowerCase(), registrationToken })
        : await login(email, password);
    } catch (error) {
      if (mode === "login" && errorCode(error) === "EMAIL_NOT_VERIFIED") setPendingVerificationEmail(email.trim());
      if (mode === "register" && errorCode(error) === "EMAIL_VERIFICATION_REQUIRED") clearRegistrationProof();
      setMessage(errorMessage(error, "Không thể xác thực. Vui lòng thử lại."));
      setSubmitting(false);
      return;
    }
    const next = pendingAction?.type === "ask"
      ? `${routes.learningHub}?article=${encodeURIComponent(pendingAction.slug)}`
      : pendingAction?.type === "save" ? `/learn/${pendingAction.slug}` : postLoginRoute(authenticatedUser, params.get("next"));
    router.replace(next);
  };

  const submitGoogle = async () => {
    setMessage("");
    setSubmitting(true);
    let authenticatedUser = user;
    try {
      authenticatedUser = await loginWithGoogle();
    } catch (error) {
      setMessage(errorMessage(error, "Không thể xác thực với Google. Vui lòng thử lại."));
      setSubmitting(false);
      return;
    }
    const next = pendingAction?.type === "ask"
      ? `${routes.learningHub}?article=${encodeURIComponent(pendingAction.slug)}`
      : pendingAction?.type === "save" ? `/learn/${pendingAction.slug}` : postLoginRoute(authenticatedUser, params.get("next"));
    router.replace(next);
  };

  return (
    <form className="login-panel" onSubmit={submit} aria-describedby="auth-note">
      <div className="auth-tabs" role="tablist" aria-label="Xác thực">
        <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => selectMode("login")}>Đăng nhập</button>
        <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => selectMode("register")}>Tạo tài khoản</button>
      </div>
      <h1>{mode === "login" ? "Đăng nhập Fire3D" : "Tạo tài khoản"}</h1>
      <p id="auth-note">{mode === "login" ? "Dùng email và mật khẩu Fire3D. Google là lựa chọn bổ sung khi môi trường đã cấu hình Firebase." : "Điền thông tin, xác minh email bằng OTP, rồi mới tạo tài khoản."}</p>
      {message && <div role="alert" aria-label="Lỗi xác thực" className="form-message"><CircleAlert aria-hidden="true" size={18} /><div><strong>Thông báo từ Fire3D</strong><p>{message}</p></div></div>}
      {pendingVerificationEmail && mode === "login" && <section className="verification-panel" aria-labelledby="pending-verification-title">
        <h2 id="pending-verification-title">Tài khoản chưa xác minh</h2>
        <p>Email <strong>{pendingVerificationEmail}</strong> cần được xác minh trước khi đăng nhập.</p>
        <Button type="button" variant="secondary" disabled={resendPending} onClick={() => void resendVerification()}>{resendPending ? "Đang gửi…" : "Gửi lại mã OTP"}</Button>
        {resendNotice && <p className="verification-status" role="status">{resendNotice}</p>}
      </section>}
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
      <label className="form-field">Email<input required type="email" value={email} onChange={(event) => changeEmail(event.target.value)} autoComplete="email" aria-invalid={!!message} /></label>
      <label className="form-field">Mật khẩu<PasswordInput visibilityLabel="mật khẩu" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={!!message} aria-label="Mật khẩu" /></label>
      {mode === "register" && <label className="form-field">Xác nhận mật khẩu<PasswordInput visibilityLabel="xác nhận mật khẩu" required minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" aria-invalid={!!message} aria-label="Xác nhận mật khẩu" /></label>}
      {mode === "register" && !registrationToken && <section className="verification-panel" aria-labelledby="registration-verification-title">
        <h2 id="registration-verification-title">Xác minh email</h2>
        {!otpSent ? <Button type="button" variant="secondary" disabled={!ready || otpPending} onClick={(event) => void requestOtp(event)}>{otpPending ? "Đang gửi…" : "Gửi mã OTP"}</Button> : <>
          <p>Nhập mã 6 chữ số đã gửi đến <strong>{email}</strong>.</p>
          <label className="form-field">Mã OTP<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" /></label>
          <Button type="button" variant="secondary" disabled={otpPending || otp.length !== 6} onClick={() => void verifyOtp()}>{otpPending ? "Đang xác minh…" : "Xác minh mã"}</Button>
          <Button type="button" variant="secondary" disabled={otpPending} onClick={() => void resendRegistrationOtp()}>{otpPending ? "Đang gửi…" : "Gửi lại mã OTP"}</Button>
        </>}
        {otpNotice && <p className="verification-status" role="status">{otpNotice}</p>}
      </section>}
      {mode === "register" && registrationToken && <p className="verification-status" role="status">{otpNotice}</p>}
      {(mode === "login" || !!registrationToken) && <Button disabled={!ready || submitting} className="form-submit" type="submit">{submitting ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</Button>}
      {mode === "login" && <Button disabled={!ready || !hasFirebaseAuthConfig || submitting} className="google-sign-in" type="button" variant="secondary" onClick={() => void submitGoogle()}><GoogleIcon /> Tiếp tục với Google</Button>}
    </form>
  );
}
