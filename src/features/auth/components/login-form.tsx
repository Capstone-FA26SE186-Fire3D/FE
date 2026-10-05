"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { ApiError } from "@/api/types/common";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { hasFirebaseAuthConfig } from "@/configs/env";
import { routes } from "@/configs/routes";
import { useDemoSession } from "@/store/demo-session";
import { authApi } from "../api";
import { useAuthSession } from "../auth-session";
import { postLoginRoute } from "../redirect";
import type { RegisterInput } from "../types";
import { Iconsax } from "@/components/ui/iconsax";
import { googleErrorMessage } from "../google-errors";
import type { GoogleOnboardingProof } from "../types";
import { GoogleIcon } from "./google-icon";

type FieldErrors = Record<string, string>;

function errorCode(error: unknown) {
  const code = error instanceof ApiError ? error.payload?.code : undefined;
  return typeof code === "string" ? code : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  const errors = error.payload?.errors;
  if (typeof errors !== "object" || errors === null || Array.isArray(errors)) return {};

  return Object.fromEntries(Object.entries(errors).flatMap(([key, value]) => {
    const message = Array.isArray(value) ? value.find((item): item is string => typeof item === "string") : value;
    return typeof message === "string" ? [[key.toLowerCase(), message]] : [];
  }));
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { pendingAction } = useDemoSession();
  const { isAuthenticated, login, loginWithGoogle, completeGoogleOnboarding, ready, register, user } = useAuthSession();
  const [googleOnboarding, setGoogleOnboarding] = useState<{ proof: GoogleOnboardingProof | null } | null>(null);
  const [proofExpired, setProofExpired] = useState(false);
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
  const [otpNotice, setOtpNotice] = useState("");
  const [existingEmail, setExistingEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [otpPending, setOtpPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const initialStage = useRef(true);
  const requestedNext = pendingAction?.type === "ask"
    ? `${routes.learningHub}?article=${encodeURIComponent(pendingAction.slug)}`
    : pendingAction?.type === "save" ? `/learn/${pendingAction.slug}` : params.get("next");

  useEffect(() => {
    if (initialStage.current) { initialStage.current = false; return; }
    headingRef.current?.focus();
  }, [mode, googleOnboarding]);

  useEffect(() => {
    const proof = googleOnboarding?.proof;
    if (!proof) return;
    const timer = window.setTimeout(() => setProofExpired(true), Math.min(Math.max(0, Date.parse(proof.expiresAt) - Date.now()), 2147483647));
    return () => window.clearTimeout(timer);
  }, [googleOnboarding]);

  useEffect(() => {
    if (ready && isAuthenticated) router.replace(postLoginRoute(user, requestedNext));
  }, [isAuthenticated, requestedNext, ready, router, user]);

  if (ready && isAuthenticated) return <p className="auth-redirect" role="status">Bạn đã đăng nhập. Đang chuyển hướng…</p>;

  const clearRegistrationProof = () => {
    setOtp("");
    setOtpSent(false);
    setOtpNotice("");
  };

  const selectMode = (nextMode: "login" | "register") => {
    setGoogleOnboarding(null);
    setProofExpired(false);
    setMode(nextMode);
    setMessage("");
    setFieldErrors({});
    setExistingEmail("");
    if (nextMode === "login") clearRegistrationProof();
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    clearRegistrationProof();
    setExistingEmail("");
    setFieldErrors((current) => ({ ...current, email: "" }));
  };

  const requestOtp = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.form?.reportValidity()) return;
    setMessage("");
    setFieldErrors({});
    setExistingEmail("");
    setOtpNotice("");
    setOtpPending(true);
    try {
      await authApi.requestRegistrationOtp(email.trim());
      setOtpSent(true);
      setOtp("");
      setOtpNotice("Yêu cầu gửi mã OTP đã được tiếp nhận. Nhập mã gồm 6 chữ số trong email của bạn.");
    } catch (error) {
      setFieldErrors(toFieldErrors(error));
      if (errorCode(error) === "EMAIL_EXISTS") setExistingEmail(email.trim());
      setMessage(errorMessage(error, "Không thể gửi mã OTP. Vui lòng thử lại."));
    } finally {
      setOtpPending(false);
    }
  };

  const resendRegistrationOtp = async () => {
    setMessage("");
    setFieldErrors({});
    setExistingEmail("");
    setOtpNotice("");
    setOtpPending(true);
    try {
      await authApi.resendVerification(email.trim());
      setOtp("");
      setOtpSent(true);
      setOtpNotice("Đã yêu cầu mã OTP mới. Mã và xác minh trước đó không còn hiệu lực.");
    } catch (error) {
      setFieldErrors(toFieldErrors(error));
      if (errorCode(error) === "EMAIL_EXISTS") setExistingEmail(email.trim());
      setMessage(errorMessage(error, "Không thể gửi lại mã OTP. Vui lòng thử lại."));
    } finally {
      setOtpPending(false);
    }
  };

  const registrationInput = (registrationToken: string): RegisterInput => {
    const base = { email: email.trim(), password, confirmPassword, fullName: fullName.trim() || undefined, registrationToken };
    return accountType === "organization"
      ? { ...base, accountType, organizationName: organizationName.trim(), organizationAddress: organizationAddress.trim(), organizationPhoneNumber: organizationPhoneNumber.trim() }
      : { ...base, accountType, username: username.trim().toLowerCase() };
  };

  const redirectAfterLogin = (authenticatedUser: NonNullable<typeof user>) => {
    router.replace(postLoginRoute(authenticatedUser, requestedNext));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setFieldErrors({});

    if (mode === "login") {
      setSubmitting(true);
      try {
        redirectAfterLogin(await login(email.trim(), password));
      } catch (error) {
        setFieldErrors(toFieldErrors(error));
        setMessage(errorMessage(error, "Không thể đăng nhập. Vui lòng thử lại."));
        setSubmitting(false);
      }
      return;
    }

    if (googleOnboarding) {
      const proof = googleOnboarding.proof;
      if (!proof || proofExpired || Date.parse(proof.expiresAt) <= Date.now()) { setProofExpired(!!proof); return; }
      setSubmitting(true);
      try {
        const input = accountType === "trainee"
          ? { onboardingToken: proof.token, accountType, username: username.trim().toLowerCase() }
          : { onboardingToken: proof.token, accountType, organizationName: organizationName.trim(), organizationAddress: organizationAddress.trim(), organizationPhoneNumber: organizationPhoneNumber.trim() };
        redirectAfterLogin(await completeGoogleOnboarding(input));
        setGoogleOnboarding(null);
      } catch (error) {
        setFieldErrors(toFieldErrors(error));
        setMessage(googleErrorMessage(error));
        if (["ONBOARDING_TOKEN_EXPIRED", "ONBOARDING_TOKEN_INVALID"].includes(errorCode(error) ?? "")) { setProofExpired(true); setGoogleOnboarding({ proof: null }); }
        if (["ACCOUNT_LINK_REQUIRED", "EMAIL_EXISTS"].includes(errorCode(error) ?? "")) setExistingEmail(proof.email);
      } finally { setSubmitting(false); }
      return;
    }

    if (!otpSent || otp.length !== 6) {
      setFieldErrors({ otp: "Nhập mã OTP gồm 6 chữ số trước khi tạo tài khoản." });
      return;
    }

    setSubmitting(true);
    let registrationToken: string;
    try {
      registrationToken = (await authApi.verifyRegistrationOtp(email.trim(), otp)).registrationToken;
    } catch (error) {
      setFieldErrors({ ...toFieldErrors(error), otp: errorMessage(error, "Mã OTP không hợp lệ hoặc đã hết hạn.") });
      setMessage(errorMessage(error, "Mã OTP không hợp lệ hoặc đã hết hạn."));
      setSubmitting(false);
      return;
    }

    try {
      await register(registrationInput(registrationToken));
    } catch (error) {
      setFieldErrors(toFieldErrors(error));
      setMessage(errorMessage(error, "Không thể tạo tài khoản. Vui lòng kiểm tra lại thông tin."));
      clearRegistrationProof();
      setSubmitting(false);
      return;
    }

    try {
      redirectAfterLogin(await login(email.trim(), password));
    } catch {
      clearRegistrationProof();
      setPassword("");
      setConfirmPassword("");
      setMode("login");
      setMessage("Tài khoản đã được tạo. Đăng nhập tự động chưa thành công; hãy đăng nhập bằng email và mật khẩu vừa tạo.");
      setSubmitting(false);
    }
  };

  const submitGoogle = async () => {
    setMessage("");
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (googleOnboarding) setGoogleOnboarding({ proof: null });
      const result = await loginWithGoogle();
      if (result.status === "Authenticated") { setGoogleOnboarding(null); redirectAfterLogin(result.authentication.user); }
      else if (result.status === "OnboardingRequired") {
        setGoogleOnboarding({ proof: result.onboarding });
        setProofExpired(!!result.onboarding && Date.parse(result.onboarding.expiresAt) <= Date.now());
        setMode("register"); setAccountType("trainee"); setExistingEmail("");
        setUsername(""); setOrganizationName(""); setOrganizationAddress(""); setOrganizationPhoneNumber("");
        setPassword(""); setConfirmPassword(""); clearRegistrationProof();
        if (result.onboarding) setEmail(result.onboarding.email);
      } else {
        setGoogleOnboarding(null);
        setMode("login");
        setMessage("Email này đã có tài khoản. Đăng nhập bằng email và mật khẩu để tiếp tục; Google chưa được liên kết.");
      }
    } catch (error) {
      setMessage(googleErrorMessage(error));
    } finally { setSubmitting(false); }
  };

  return (
    <form className="login-panel" onSubmit={submit} aria-describedby="auth-note">
      {!googleOnboarding && <div className="auth-tabs" role="tablist" aria-label="Xác thực">
        <button type="button" role="tab" disabled={submitting || otpPending} aria-selected={mode === "login"} onClick={() => selectMode("login")}>Đăng nhập</button>
        <button type="button" role="tab" disabled={submitting || otpPending} aria-selected={mode === "register"} onClick={() => selectMode("register")}>Tạo tài khoản</button>
      </div>}
      <h1 ref={headingRef} tabIndex={-1}>{googleOnboarding ? "Hoàn thiện tài khoản Google" : mode === "login" ? "Đăng nhập Fire3D" : "Tạo tài khoản"}</h1>
      <p id="auth-note">{googleOnboarding ? "Chọn loại tài khoản và hoàn thiện thông tin để tiếp tục." : mode === "login" ? "Tiếp tục học với tài khoản của bạn." : otpSent ? "Bước 2 / 2 · Xác minh email" : "Bước 1 / 2 · Thông tin tài khoản"}</p>
      {message && <div role="alert" aria-label="Lỗi xác thực" className="form-message"><CircleAlert aria-hidden="true" size={18} /><div><strong>Thông báo từ Fire3D</strong><p>{message}</p><button type="button" disabled={submitting} onClick={() => { setMessage(""); headingRef.current?.focus(); }}>Kiểm tra thông tin và thử lại</button></div></div>}
      {googleOnboarding && <div className="verification-panel" role="status"><p>{!googleOnboarding.proof ? "Hiện chưa thể tạo tài khoản Google vì dịch vụ chưa cung cấp xác minh cần thiết. Bạn có thể thử lại Google hoặc đăng ký bằng email." : proofExpired ? "Xác minh đã hết hạn. Hãy thử lại Google." : `Đang hoàn thiện cho ${googleOnboarding.proof.email}`}</p></div>}
      <fieldset className="auth-fields" disabled={submitting || otpPending} hidden={mode === "register" && otpSent && !googleOnboarding}>
      {mode === "register" && <>
        <fieldset className="account-type-fieldset">
          <legend>Loại tài khoản</legend>
          <div className="account-type-options">
            <label className={`account-type-card ${accountType === "trainee" ? "is-selected" : ""}`}>
              <Iconsax name="user" />
              <span className="account-type-copy"><strong>Học viên</strong><small>Học kiến thức và tham gia tập huấn.</small></span>
              <input className="account-type-radio" type="radio" name="account-type" checked={accountType === "trainee"} onChange={() => setAccountType("trainee")} />
            </label>
            <label className={`account-type-card ${accountType === "organization" ? "is-selected" : ""}`}>
              <Iconsax name="buildings" />
              <span className="account-type-copy"><strong>Tổ chức</strong><small>Quản lý BIM, IFC và kịch bản diễn tập.</small></span>
              <input className="account-type-radio" type="radio" name="account-type" checked={accountType === "organization"} onChange={() => setAccountType("organization")} />
            </label>
          </div>
        </fieldset>
        {!googleOnboarding && <label className="form-field">Họ và tên <span className="field-optional">(không bắt buộc)</span><input maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" aria-invalid={!!fieldErrors.fullname} /> <FieldError message={fieldErrors.fullname} /></label>}
        {accountType === "trainee" ? <label className="form-field">Tên người dùng<input required minLength={3} maxLength={30} pattern="[a-z0-9._\-]{3,30}" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" aria-invalid={!!fieldErrors.username} /> <FieldError message={fieldErrors.username} /></label> : <>
          <label className="form-field">Tên tổ chức<input required maxLength={200} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} aria-invalid={!!fieldErrors.organizationname} /> <FieldError message={fieldErrors.organizationname} /></label>
          <label className="form-field">Địa chỉ tổ chức<input required maxLength={500} value={organizationAddress} onChange={(event) => setOrganizationAddress(event.target.value)} aria-invalid={!!fieldErrors.organizationaddress} /> <FieldError message={fieldErrors.organizationaddress} /></label>
          <label className="form-field">Điện thoại tổ chức<input required maxLength={16} pattern="\+?[0-9]{6,15}" value={organizationPhoneNumber} onChange={(event) => setOrganizationPhoneNumber(event.target.value)} autoComplete="tel" aria-invalid={!!fieldErrors.organizationphonenumber} /> <FieldError message={fieldErrors.organizationphonenumber} /></label>
        </>}
      </>}
      {!googleOnboarding && <>
      <label className="form-field">Email<input required type="email" maxLength={254} value={email} onChange={(event) => changeEmail(event.target.value)} autoComplete="email" aria-invalid={!!fieldErrors.email} /> <FieldError message={fieldErrors.email} /></label>
      <label className="form-field">Mật khẩu<PasswordInput visibilityLabel="mật khẩu" required minLength={mode === "register" ? 6 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={!!fieldErrors.password} aria-label="Mật khẩu" /> <FieldError message={fieldErrors.password} /></label>
      {mode === "register" && <label className="form-field">Xác nhận mật khẩu<PasswordInput visibilityLabel="xác nhận mật khẩu" required minLength={6} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" aria-invalid={!!fieldErrors.confirmpassword} aria-label="Xác nhận mật khẩu" /> <FieldError message={fieldErrors.confirmpassword} /></label>}
      </>}
      </fieldset>
      {mode === "register" && !googleOnboarding && <section className="verification-panel" aria-labelledby="registration-verification-title">
        <h2 id="registration-verification-title">Xác minh email</h2>
        {otpSent && <Button type="button" variant="quiet" disabled={submitting || otpPending} onClick={clearRegistrationProof}><Iconsax name="arrow-left" size={16} /> Sửa thông tin</Button>}
        {!otpSent ? <Button type="button" variant="secondary" disabled={!ready || otpPending} onClick={(event) => void requestOtp(event)}>{otpPending ? "Đang gửi…" : "Gửi mã OTP"}</Button> : <>
          <p>Nhập mã 6 chữ số đã gửi đến <strong>{email}</strong>.</p>
          <label className="form-field">Mã OTP<input required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" aria-invalid={!!fieldErrors.otp} /> <FieldError message={fieldErrors.otp} /></label>
          <Button type="button" variant="secondary" disabled={otpPending} onClick={() => void resendRegistrationOtp()}>{otpPending ? "Đang gửi…" : "Gửi lại mã OTP"}</Button>
        </>}
        {otpNotice && <p className="verification-status" role="status">{otpNotice}</p>}
      </section>}
      {existingEmail && mode === "register" && <section className="verification-panel" aria-labelledby="existing-email-title">
        <h2 id="existing-email-title">Email đã có tài khoản</h2>
        <p><strong>{existingEmail}</strong> đã được đăng ký. Hãy đăng nhập hoặc sử dụng chức năng quên mật khẩu.</p>
        <Button type="button" variant="secondary" onClick={() => selectMode("login")}>Đăng nhập</Button>
      </section>}
      {!googleOnboarding && (mode === "login" || otpSent) && <Button disabled={!ready || submitting || (mode === "register" && otp.length !== 6)} className="form-submit" type="submit">{submitting ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Xác thực và tạo tài khoản"}</Button>}
      {googleOnboarding && <><Button className="form-submit" type="submit" disabled={submitting || !googleOnboarding.proof || proofExpired}>{submitting ? "Đang hoàn tất…" : "Hoàn tất tài khoản"}</Button><Button type="button" variant="secondary" disabled={submitting} onClick={() => void submitGoogle()}><GoogleIcon /> Thử lại Google</Button><Button type="button" variant="quiet" disabled={submitting} onClick={() => selectMode("register")}>Đăng ký bằng email</Button><Button type="button" variant="quiet" disabled={submitting} onClick={() => selectMode("login")}><Iconsax name="arrow-left" size={16} /> Đăng nhập bằng email</Button></>}
      {mode === "login" && <Button disabled={!ready || !hasFirebaseAuthConfig || submitting} className="google-sign-in" type="button" variant="secondary" onClick={() => void submitGoogle()}><GoogleIcon /> Tiếp tục với Google</Button>}
    </form>
  );
}
