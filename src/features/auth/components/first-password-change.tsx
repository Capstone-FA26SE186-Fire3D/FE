"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { ApiError } from "@/api";
import { describeApiError } from "@/api/describe-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { authApi } from "../api";
import { useAuthSession } from "../auth-session";

/**
 * Shown instead of the workspace while the account still uses the password an admin set (BE#235, `firstLoginStep`
 * "ChangePassword"): until it changes, the API refuses everything else with 403 PASSWORD_CHANGE_REQUIRED. Changing the
 * password revokes every session, so the person signs in again with the new one.
 */
export function FirstPasswordChange() {
  const router = useRouter();
  const { accessToken, endSession, logout, user } = useAuthSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || busy) return;
    const found: typeof errors = {};
    if (!current) found.current = "Nhập mật khẩu ban đầu mà quản trị đã đưa cho bạn.";
    if (next.length < 6 || next.length > 128) found.next = "Mật khẩu mới cần từ 6 đến 128 ký tự.";
    else if (next === current) found.next = "Mật khẩu mới phải khác mật khẩu ban đầu.";
    if (confirm !== next) found.confirm = "Xác nhận mật khẩu mới chưa khớp.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true); setProblem("");
    try {
      await authApi.changePassword(accessToken, current, next);
      endSession();
      router.replace("/login?notice=first-password-changed");
    } catch (cause) {
      if (cause instanceof ApiError) setErrors({ current: cause.fieldMessage("currentPassword") ?? (cause.code === "INVALID_CURRENT_PASSWORD" ? cause.message : undefined), next: cause.fieldMessage("newPassword") });
      setProblem(describeApiError(cause, "Chưa đổi được mật khẩu. Hãy thử lại."));
      setBusy(false);
    }
  };

  return <main className="ops-access" data-testid="first-password-change"><div className="ops-panel ops-panel-body" style={{ maxWidth: 480, width: "100%" }}>
    <h1>Đổi mật khẩu ban đầu</h1>
    <p>Email{user?.email ? <> <strong>{user.email}</strong></> : null} đã được xác minh. Mật khẩu hiện tại do quản trị đặt, nên bạn cần đổi sang mật khẩu của riêng mình trước khi dùng tài khoản. Sau khi đổi, hãy đăng nhập lại bằng mật khẩu mới.</p>
    <form onSubmit={submit} noValidate className="ops-stack">
      <Field label="Mật khẩu ban đầu" required error={errors.current}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="mật khẩu ban đầu" autoComplete="current-password" required maxLength={128} value={current} onChange={(event) => setCurrent(event.target.value)} />}</Field>
      <Field label="Mật khẩu mới" required hint="Từ 6 đến 128 ký tự." error={errors.next}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="mật khẩu mới" autoComplete="new-password" required minLength={6} maxLength={128} value={next} onChange={(event) => setNext(event.target.value)} />}</Field>
      <Field label="Xác nhận mật khẩu mới" required error={errors.confirm}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="xác nhận mật khẩu mới" autoComplete="new-password" required minLength={6} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} />}</Field>
      {problem && <Alert tone="danger" title="Chưa đổi được mật khẩu">{problem}</Alert>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button type="submit" disabled={busy}>{busy ? "Đang đổi mật khẩu…" : "Đổi mật khẩu"}</Button>
        <Button type="button" variant="quiet" disabled={busy} onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />Đăng xuất</Button>
      </div>
    </form>
  </div></main>;
}
