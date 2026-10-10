"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, LogOut, Trash2 } from "lucide-react";
import { ApiError } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { authApi } from "@/features/auth/api";
import { useAuthSession } from "@/features/auth/auth-session";
import type { AuthUser, UserGender } from "@/features/auth/types";
import { organizationsApi } from "@/features/organizations/api";
import type { OrganizationProfile } from "@/features/organizations/types";

const roleNames = ["Quản trị nền tảng", "Người dùng tổ chức", "Học viên"];
const supportedAvatarTypes = ["image/jpeg", "image/png", "image/webp"];
const maxAvatarBytes = 5 * 1024 * 1024;

type ProfileForm = { dob: string; fullName: string; gender: "" | `${UserGender}`; phoneNumber: string; username: string };
type OrganizationForm = { address: string; name: string; phoneNumber: string };
type FormKey = "profile" | "organization" | "avatar" | "password";
type FormProblem = { message: string; fields: Record<string, string | undefined>; stale: boolean };

function etagFrom(headers: Headers, revision?: number) {
  return headers.get("etag") ?? (revision ? `"${revision}"` : null);
}

function toProfileForm(user: AuthUser): ProfileForm {
  return {
    dob: user.dob ?? "",
    fullName: user.fullName ?? "",
    gender: user.gender === undefined || user.gender === null ? "" : String(user.gender) as `${UserGender}`,
    phoneNumber: user.phoneNumber ?? "",
    username: user.username ?? "",
  };
}

function toOrganizationForm(organization: OrganizationProfile): OrganizationForm {
  return { address: organization.address ?? "", name: organization.name, phoneNumber: organization.phoneNumber ?? "" };
}

/** Turns an API failure into text shown next to the action that failed, plus per-field messages when the API sends them. */
function problemOf(error: unknown, fieldNames: string[]): FormProblem {
  if (error instanceof ApiError) {
    const fields = Object.fromEntries(fieldNames.map((name) => [name, error.fieldMessage(name)]));
    if (error.isPreconditionFailed) return { message: "Hồ sơ vừa được thay đổi ở nơi khác nên chưa lưu. Nội dung bạn nhập vẫn được giữ lại.", fields, stale: true };
    if (error.status === 428) return { message: "Chưa có phiên bản hồ sơ để đối chiếu. Hãy tải lại rồi lưu lại.", fields, stale: true };
    if (error.status === 429) return { message: error.retryAfterSeconds ? `Thao tác quá nhanh. Thử lại sau ${error.retryAfterSeconds} giây.` : "Thao tác quá nhanh. Hãy thử lại sau ít phút.", fields, stale: false };
    return { message: error.message || "Không thể lưu thay đổi. Vui lòng thử lại.", fields, stale: false };
  }
  return { message: error instanceof Error ? error.message : "Không thể lưu thay đổi. Vui lòng thử lại.", fields: {}, stale: false };
}

function Avatar({ avatarUrl, initials }: { avatarUrl?: string | null; initials: string }) {
  const frame = { width: 56, height: 56, borderRadius: "50%", flex: "0 0 auto" } as const;
  if (avatarUrl) return <Image style={{ ...frame, objectFit: "cover", display: "block" }} src={avatarUrl} alt="Ảnh đại diện hiện tại" width={56} height={56} unoptimized />;
  return <span style={{ ...frame, display: "grid", placeItems: "center", background: "var(--ember-soft)", color: "var(--ember)", fontWeight: 650 }} aria-hidden="true">{initials}</span>;
}

export function AccountProfile() {
  const { accessToken, isAuthenticated, logout, ready, updateUser, user } = useAuthSession();
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<AuthUser | null>(user);
  const [profileEtag, setProfileEtag] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => user ? toProfileForm(user) : { dob: "", fullName: "", gender: "", phoneNumber: "", username: "" });
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null);
  const [organizationEtag, setOrganizationEtag] = useState<string | null>(null);
  const [organizationForm, setOrganizationForm] = useState<OrganizationForm>({ address: "", name: "", phoneNumber: "" });
  const [problems, setProblems] = useState<Partial<Record<FormKey, FormProblem>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Partial<Record<FormKey, boolean>>>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});

  const setProblem = (key: FormKey, problem?: FormProblem) => setProblems((current) => ({ ...current, [key]: problem }));
  const setBusy = (key: FormKey, value: boolean) => setSaving((current) => ({ ...current, [key]: value }));

  /** `keepForms` is used after a 412: refresh the ETag and the saved values but leave what the user typed. */
  const loadProfile = useCallback(async (keepForms = false) => {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const profileResponse = await authApi.meWithMeta(accessToken);
      setProfile(profileResponse.data);
      if (!keepForms) setProfileForm(toProfileForm(profileResponse.data));
      setProfileEtag(etagFrom(profileResponse.headers, profileResponse.data.profileRevision));
      updateUser(profileResponse.data);
      if (profileResponse.data.role !== 1) {
        setOrganization(null);
        setOrganizationEtag(null);
        return;
      }
      const organizationResponse = await organizationsApi.getMine(accessToken);
      setOrganization(organizationResponse.data);
      if (!keepForms) setOrganizationForm(toOrganizationForm(organizationResponse.data));
      setOrganizationEtag(etagFrom(organizationResponse.headers, organizationResponse.data.profileRevision));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Không tải được hồ sơ.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, updateUser]);

  useEffect(() => {
    const task = window.setTimeout(() => { void loadProfile(); }, 0);
    return () => window.clearTimeout(task);
  }, [loadProfile]);

  const displayUser = profile ?? user;
  const displayName = displayUser?.fullName?.trim() || displayUser?.email || "Tài khoản Fire3D";
  const initials = useMemo(() => displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), [displayName]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !profileEtag || saving.profile) return;
    setBusy("profile", true); setProblem("profile");
    try {
      const next = await authApi.updateProfile(accessToken, profileEtag, {
        fullName: profileForm.fullName.trim(),
        ...(profileForm.username.trim() ? { username: profileForm.username.trim() } : {}),
        dob: profileForm.dob || null,
        gender: profileForm.gender === "" ? null : Number(profileForm.gender) as UserGender,
        phoneNumber: profileForm.phoneNumber.trim() || null,
      });
      setProfile(next.data); setProfileForm(toProfileForm(next.data)); setProfileEtag(etagFrom(next.headers, next.data.profileRevision)); updateUser(next.data);
      toast.notify({ tone: "success", title: "Đã lưu hồ sơ cá nhân" });
    } catch (cause) { setProblem("profile", problemOf(cause, ["fullName", "username", "dob", "gender", "phoneNumber"])); } finally { setBusy("profile", false); }
  };

  const saveOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !organizationEtag || saving.organization) return;
    setBusy("organization", true); setProblem("organization");
    try {
      const next = await organizationsApi.updateMine(accessToken, organizationEtag, {
        name: organizationForm.name.trim(),
        address: organizationForm.address.trim() || null,
        phoneNumber: organizationForm.phoneNumber.trim() || null,
      });
      setOrganization(next.data); setOrganizationForm(toOrganizationForm(next.data)); setOrganizationEtag(etagFrom(next.headers, next.data.profileRevision));
      toast.notify({ tone: "success", title: "Đã lưu hồ sơ tổ chức" });
    } catch (cause) { setProblem("organization", problemOf(cause, ["name", "address", "phoneNumber"])); } finally { setBusy("organization", false); }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accessToken || !profile || !profileEtag) return;
    if (!supportedAvatarTypes.includes(file.type) || file.size > maxAvatarBytes) {
      setProblem("avatar", { message: "Ảnh đại diện phải là JPEG, PNG hoặc WebP và không vượt quá 5 MiB.", fields: {}, stale: false });
      return;
    }
    setBusy("avatar", true); setProblem("avatar");
    try {
      const result = await authApi.uploadAvatar(accessToken, profileEtag, file);
      const next = { ...profile, avatarUrl: result.data.url, profileRevision: result.data.profileRevision };
      setProfile(next); setProfileEtag(etagFrom(result.headers, result.data.profileRevision)); updateUser(next);
      toast.notify({ tone: "success", title: "Đã cập nhật ảnh đại diện." });
    } catch (cause) { setProblem("avatar", problemOf(cause, [])); } finally { setBusy("avatar", false); }
  };

  const removeAvatar = async () => {
    if (!accessToken || !profile || !profileEtag) return;
    setBusy("avatar", true); setProblem("avatar");
    try {
      const result = await authApi.deleteAvatar(accessToken, profileEtag);
      const next = { ...profile, avatarUrl: null };
      setProfile(next); setProfileEtag(etagFrom(result.headers, profile.profileRevision ? profile.profileRevision + 1 : undefined)); updateUser(next);
      toast.notify({ tone: "success", title: "Đã xóa ảnh đại diện." });
    } catch (cause) { setProblem("avatar", problemOf(cause, [])); } finally { setBusy("avatar", false); }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || saving.password) return;
    const found: typeof passwordErrors = {};
    if (newPassword.length < 6) found.newPassword = "Mật khẩu mới cần có ít nhất 6 ký tự.";
    if (newPassword !== confirmPassword) found.confirmPassword = "Xác nhận mật khẩu mới chưa khớp.";
    setPasswordErrors(found);
    if (found.newPassword || found.confirmPassword) return;
    setBusy("password", true); setProblem("password");
    try {
      await authApi.changePassword(accessToken, currentPassword, newPassword);
      void logout();
      router.replace(routes.login);
    } catch (cause) { setProblem("password", problemOf(cause, ["currentPassword", "newPassword"])); } finally { setBusy("password", false); }
  };

  if (!ready) return <div aria-busy="true" role="status" className="ops-stack"><Skeleton style={{ height: 40, width: 260 }} /><Skeleton style={{ height: 160 }} /><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Đang tải tài khoản…</span></div>;
  if (!isAuthenticated || !user) return <Panel title="Tài khoản" bodyClassName="ops-stack"><p style={{ margin: 0, color: "var(--muted)" }}>Bạn cần đăng nhập để xem trang này.</p><div><Button asChild><Link href={routes.login}>Đăng nhập</Link></Button></div></Panel>;

  const errorAlert = (key: FormKey, onReload?: () => void) => {
    const problem = problems[key];
    if (!problem) return null;
    return <Alert tone={problem.stale ? "warning" : "danger"} title={problem.stale ? "Hồ sơ đã thay đổi" : "Không thể lưu thay đổi"} action={problem.stale && onReload ? <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onReload} disabled={loading}>{loading ? "Đang tải…" : "Tải bản mới nhất"}</Button> : undefined}>{problem.message}</Alert>;
  };
  const reloadKeepingInput = (key: FormKey) => () => { setProblem(key); void loadProfile(true); };
  const avatarLocked = Boolean(saving.avatar) || !profileEtag;
  const fieldError = (key: FormKey, name: string) => problems[key]?.fields[name];

  return <div style={{ maxWidth: 760 }}>
    <PageHeader title="Tài khoản của bạn" description="Cập nhật thông tin cá nhân, tổ chức và bảo mật. Email, vai trò và quyền truy cập do Fire3D quản lý." />
    <div className="ops-stack">
      {loadError && <Alert tone="danger" title="Không tải được hồ sơ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void loadProfile()}>Thử lại</Button>}>{loadError}</Alert>}

      <Panel bodyClassName="ops-stack">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar avatarUrl={displayUser?.avatarUrl} initials={initials} />
          <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: 18, overflowWrap: "anywhere" }}>{displayName}</h2><p style={{ margin: "3px 0 0", color: "var(--muted)", overflowWrap: "anywhere" }}>{displayUser?.email}</p></div>
        </div>
        <div className="ops-actions">
          <label className="ops-file-button" data-disabled={avatarLocked ? "true" : undefined}>
            <Camera size={16} aria-hidden="true" />{saving.avatar ? "Đang tải ảnh…" : "Đổi ảnh đại diện"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAvatar(event)} disabled={avatarLocked} />
          </label>
          {displayUser?.avatarUrl && <Button type="button" variant="quiet" onClick={() => void removeAvatar()} disabled={saving.avatar}><Trash2 size={16} aria-hidden="true" />Xóa ảnh</Button>}
        </div>
        {errorAlert("avatar", reloadKeepingInput("avatar"))}
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, margin: 0 }}>
          <div><dt className="ops-field-hint">Vai trò</dt><dd style={{ margin: "4px 0 0" }}>{roleNames[displayUser?.role ?? 2] ?? "Người dùng"}</dd></div>
          <div><dt className="ops-field-hint">Tổ chức</dt><dd style={{ margin: "4px 0 0" }}>{organization?.name ?? (displayUser?.organizationId ? "Đang tải tổ chức…" : "Chưa thuộc tổ chức")}</dd></div>
        </dl>
      </Panel>

      <Panel title="Thông tin cá nhân" description="Các trường này dùng ETag để không ghi đè thay đổi từ nơi khác.">
        <form onSubmit={saveProfile} noValidate className="ops-stack">
          <div className="ops-form-grid">
            <Field label="Họ và tên" required error={fieldError("profile", "fullName")}>{(p) => <Input {...p} required maxLength={200} value={profileForm.fullName} onChange={(event) => setProfileForm((value) => ({ ...value, fullName: event.target.value }))} />}</Field>
            <Field label="Tên người dùng" error={fieldError("profile", "username")}>{(p) => <Input {...p} minLength={3} maxLength={30} value={profileForm.username} onChange={(event) => setProfileForm((value) => ({ ...value, username: event.target.value }))} placeholder="nguyen.van.a" />}</Field>
            <Field label="Ngày sinh" error={fieldError("profile", "dob")}>{(p) => <Input {...p} type="date" value={profileForm.dob} onChange={(event) => setProfileForm((value) => ({ ...value, dob: event.target.value }))} />}</Field>
            <Field label="Giới tính" error={fieldError("profile", "gender")}>{(p) => <Select {...p} value={profileForm.gender} onChange={(event) => setProfileForm((value) => ({ ...value, gender: event.target.value as ProfileForm["gender"] }))}><option value="">Chưa cung cấp</option><option value="0">Nam</option><option value="1">Nữ</option><option value="2">Khác</option><option value="3">Không muốn nêu</option></Select>}</Field>
            <Field label="Số điện thoại" error={fieldError("profile", "phoneNumber")} className="ops-span-all">{(p) => <Input {...p} inputMode="tel" maxLength={16} value={profileForm.phoneNumber} onChange={(event) => setProfileForm((value) => ({ ...value, phoneNumber: event.target.value }))} placeholder="+84901234567" />}</Field>
          </div>
          <p className="ops-field-hint" style={{ margin: 0 }}>Email đăng nhập: <strong style={{ color: "var(--text)" }}>{displayUser?.email}</strong></p>
          {errorAlert("profile", reloadKeepingInput("profile"))}
          <div><Button type="submit" disabled={saving.profile || loading || !profileEtag}>{saving.profile ? "Đang lưu…" : "Lưu hồ sơ cá nhân"}</Button></div>
        </form>
      </Panel>

      {displayUser?.role === 1 && <Panel title="Hồ sơ tổ chức" description="Chỉ người dùng tổ chức hiện tại mới có thể cập nhật thông tin của tổ chức mình.">
        <form onSubmit={saveOrganization} noValidate className="ops-stack">
          <div className="ops-form-grid">
            <Field label="Tên tổ chức" required error={fieldError("organization", "name")} className="ops-span-all">{(p) => <Input {...p} required maxLength={200} value={organizationForm.name} onChange={(event) => setOrganizationForm((value) => ({ ...value, name: event.target.value }))} />}</Field>
            <Field label="Địa chỉ tổ chức" error={fieldError("organization", "address")}>{(p) => <Input {...p} maxLength={500} value={organizationForm.address} onChange={(event) => setOrganizationForm((value) => ({ ...value, address: event.target.value }))} />}</Field>
            <Field label="Điện thoại tổ chức" error={fieldError("organization", "phoneNumber")}>{(p) => <Input {...p} inputMode="tel" maxLength={30} value={organizationForm.phoneNumber} onChange={(event) => setOrganizationForm((value) => ({ ...value, phoneNumber: event.target.value }))} />}</Field>
          </div>
          {errorAlert("organization", reloadKeepingInput("organization"))}
          <div><Button type="submit" disabled={saving.organization || loading || !organizationEtag}>{saving.organization ? "Đang lưu…" : "Lưu hồ sơ tổ chức"}</Button></div>
        </form>
      </Panel>}

      <Panel title="Bảo mật" description="Đổi mật khẩu sẽ thu hồi mọi phiên Fire3D, sau đó bạn sẽ đăng nhập lại.">
        <form onSubmit={changePassword} noValidate className="ops-stack">
          <Field label="Mật khẩu hiện tại" required error={fieldError("password", "currentPassword")}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="mật khẩu hiện tại" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />}</Field>
          <Field label="Mật khẩu mới" required error={passwordErrors.newPassword ?? fieldError("password", "newPassword")}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="mật khẩu mới" autoComplete="new-password" required minLength={6} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />}</Field>
          <Field label="Xác nhận mật khẩu mới" required error={passwordErrors.confirmPassword}>{(p) => <PasswordInput {...p} className="ops-input" visibilityLabel="xác nhận mật khẩu mới" autoComplete="new-password" required minLength={6} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />}</Field>
          {errorAlert("password")}
          <div><Button type="submit" disabled={saving.password}>{saving.password ? "Đang đổi mật khẩu…" : "Đổi mật khẩu"}</Button></div>
        </form>
      </Panel>

      <div><Button variant="secondary" onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />Đăng xuất</Button></div>
    </div>
  </div>;
}
