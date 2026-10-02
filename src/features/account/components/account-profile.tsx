"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, CircleAlert, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
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

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Không thể lưu thay đổi. Vui lòng thử lại.";
}

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

function Avatar({ avatarUrl, initials }: { avatarUrl?: string | null; initials: string }) {
  if (avatarUrl) return <Image className="account-profile-avatar account-avatar-image" src={avatarUrl} alt="Ảnh đại diện hiện tại" width={52} height={52} unoptimized />;
  return <span className="account-profile-avatar" aria-hidden="true">{initials}</span>;
}

export function AccountProfile() {
  const { accessToken, isAuthenticated, logout, ready, updateUser, user } = useAuthSession();
  const router = useRouter();
  const [profile, setProfile] = useState<AuthUser | null>(user);
  const [profileEtag, setProfileEtag] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => user ? toProfileForm(user) : { dob: "", fullName: "", gender: "", phoneNumber: "", username: "" });
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null);
  const [organizationEtag, setOrganizationEtag] = useState<string | null>(null);
  const [organizationForm, setOrganizationForm] = useState<OrganizationForm>({ address: "", name: "", phoneNumber: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loadProfile = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const profileResponse = await authApi.meWithMeta(accessToken);
      setProfile(profileResponse.data);
      setProfileForm(toProfileForm(profileResponse.data));
      setProfileEtag(etagFrom(profileResponse.headers, profileResponse.data.profileRevision));
      updateUser(profileResponse.data);
      if (profileResponse.data.role !== 1) {
        setOrganization(null);
        setOrganizationEtag(null);
        return;
      }
      const organizationResponse = await organizationsApi.getMine(accessToken);
      setOrganization(organizationResponse.data);
      setOrganizationForm(toOrganizationForm(organizationResponse.data));
      setOrganizationEtag(etagFrom(organizationResponse.headers, organizationResponse.data.profileRevision));
    } catch (loadError) {
      setError(messageOf(loadError));
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
    if (!accessToken || !profileEtag) return;
    setSavingProfile(true); setError(null); setNotice(null);
    try {
      const next = await authApi.updateProfile(accessToken, profileEtag, {
        fullName: profileForm.fullName.trim(),
        ...(profileForm.username.trim() ? { username: profileForm.username.trim() } : {}),
        dob: profileForm.dob || null,
        gender: profileForm.gender === "" ? null : Number(profileForm.gender) as UserGender,
        phoneNumber: profileForm.phoneNumber.trim() || null,
      });
      setProfile(next.data); setProfileForm(toProfileForm(next.data)); setProfileEtag(etagFrom(next.headers, next.data.profileRevision)); updateUser(next.data);
      setNotice("Đã lưu hồ sơ cá nhân.");
    } catch (saveError) { setError(messageOf(saveError)); } finally { setSavingProfile(false); }
  };

  const saveOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !organizationEtag) return;
    setSavingOrganization(true); setError(null); setNotice(null);
    try {
      const next = await organizationsApi.updateMine(accessToken, organizationEtag, {
        name: organizationForm.name.trim(),
        address: organizationForm.address.trim() || null,
        phoneNumber: organizationForm.phoneNumber.trim() || null,
      });
      setOrganization(next.data); setOrganizationForm(toOrganizationForm(next.data)); setOrganizationEtag(etagFrom(next.headers, next.data.profileRevision));
      setNotice("Đã lưu hồ sơ tổ chức.");
    } catch (saveError) { setError(messageOf(saveError)); } finally { setSavingOrganization(false); }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accessToken || !profile || !profileEtag) return;
    if (!supportedAvatarTypes.includes(file.type) || file.size > maxAvatarBytes) {
      setError("Ảnh đại diện phải là JPEG, PNG hoặc WebP và không vượt quá 5 MiB.");
      return;
    }
    setSavingAvatar(true); setError(null); setNotice(null);
    try {
      const result = await authApi.uploadAvatar(accessToken, profileEtag, file);
      const next = { ...profile, avatarUrl: result.data.url, profileRevision: result.data.profileRevision };
      setProfile(next); setProfileEtag(etagFrom(result.headers, result.data.profileRevision)); updateUser(next); setNotice("Đã cập nhật ảnh đại diện.");
    } catch (uploadError) { setError(messageOf(uploadError)); } finally { setSavingAvatar(false); }
  };

  const removeAvatar = async () => {
    if (!accessToken || !profile || !profileEtag) return;
    setSavingAvatar(true); setError(null); setNotice(null);
    try {
      const result = await authApi.deleteAvatar(accessToken, profileEtag);
      const next = { ...profile, avatarUrl: null };
      setProfile(next); setProfileEtag(etagFrom(result.headers, profile.profileRevision ? profile.profileRevision + 1 : undefined)); updateUser(next); setNotice("Đã xóa ảnh đại diện.");
    } catch (deleteError) { setError(messageOf(deleteError)); } finally { setSavingAvatar(false); }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    if (newPassword.length < 6) { setError("Mật khẩu mới cần có ít nhất 6 ký tự."); return; }
    if (newPassword !== confirmPassword) { setError("Xác nhận mật khẩu mới chưa khớp."); return; }
    setSavingPassword(true); setError(null); setNotice(null);
    try {
      await authApi.changePassword(accessToken, currentPassword, newPassword);
      void logout();
      router.replace(routes.login);
    } catch (changeError) { setError(messageOf(changeError)); } finally { setSavingPassword(false); }
  };

  if (!ready) return <Card className="account-card" aria-busy="true">Đang tải tài khoản…</Card>;
  if (!isAuthenticated || !user) return <Card className="account-card"><h1>Tài khoản</h1><p>Bạn cần đăng nhập để xem trang này.</p><Button asChild><Link href={routes.login}>Đăng nhập</Link></Button></Card>;

  return <section className="account-page">
    <header className="account-heading"><p className="kicker"><span className="kicker-line" /> Hồ sơ cá nhân</p><h1>Tài khoản của bạn</h1><p>Cập nhật thông tin cá nhân, tổ chức và bảo mật. Email, vai trò và quyền truy cập do Fire3D quản lý.</p></header>
    {error && <p className="form-message" role="alert"><CircleAlert aria-hidden="true" size={18} /><span><strong>Không thể lưu thay đổi</strong><span>{error}</span></span></p>}
    {notice && <p className="account-notice" role="status">{notice}</p>}
    <Card className="account-card">
      <div className="account-profile-summary"><Avatar avatarUrl={displayUser?.avatarUrl} initials={initials} /><div><h2>{displayName}</h2><p>{displayUser?.email}</p></div></div>
      <div className="account-avatar-actions"><label className="account-file-button"><Camera size={16} /> {savingAvatar ? "Đang tải ảnh…" : "Đổi ảnh đại diện"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAvatar(event)} disabled={savingAvatar || !profileEtag} /></label>{displayUser?.avatarUrl && <Button type="button" variant="quiet" onClick={() => void removeAvatar()} disabled={savingAvatar}><Trash2 size={16} /> Xóa ảnh</Button>}</div>
      <dl className="account-details"><div><dt>Vai trò</dt><dd>{roleNames[displayUser?.role ?? 2] ?? "Người dùng"}</dd></div><div><dt>Tổ chức</dt><dd>{organization?.name ?? (displayUser?.organizationId ? "Đang tải tổ chức…" : "Chưa thuộc tổ chức")}</dd></div></dl>
    </Card>
    <Card className="account-card"><h2>Thông tin cá nhân</h2><p className="account-card-copy">Các trường này dùng ETag để không ghi đè thay đổi từ nơi khác.</p><form className="account-form" onSubmit={saveProfile}>
      <label>Họ và tên<input aria-label="Họ và tên" required maxLength={200} value={profileForm.fullName} onChange={(event) => setProfileForm((value) => ({ ...value, fullName: event.target.value }))} /></label>
      <label>Tên người dùng<input aria-label="Tên người dùng" minLength={3} maxLength={30} value={profileForm.username} onChange={(event) => setProfileForm((value) => ({ ...value, username: event.target.value }))} placeholder="nguyen.van.a" /></label>
      <label>Ngày sinh<input aria-label="Ngày sinh" type="date" value={profileForm.dob} onChange={(event) => setProfileForm((value) => ({ ...value, dob: event.target.value }))} /></label>
      <label>Giới tính<select aria-label="Giới tính" value={profileForm.gender} onChange={(event) => setProfileForm((value) => ({ ...value, gender: event.target.value as ProfileForm["gender"] }))}><option value="">Chưa cung cấp</option><option value="0">Nam</option><option value="1">Nữ</option><option value="2">Khác</option></select></label>
      <label>Số điện thoại<input aria-label="Số điện thoại" inputMode="tel" maxLength={16} value={profileForm.phoneNumber} onChange={(event) => setProfileForm((value) => ({ ...value, phoneNumber: event.target.value }))} placeholder="+84901234567" /></label>
      <p className="account-readonly">Email đăng nhập: <strong>{displayUser?.email}</strong></p>
      <Button type="submit" disabled={savingProfile || loading || !profileEtag}>{savingProfile ? "Đang lưu…" : "Lưu hồ sơ cá nhân"}</Button>
    </form></Card>
    {displayUser?.role === 1 && <Card className="account-card"><h2>Hồ sơ tổ chức</h2><p className="account-card-copy">Chỉ người dùng tổ chức hiện tại mới có thể cập nhật thông tin của tổ chức mình.</p><form className="account-form" onSubmit={saveOrganization}>
      <label>Tên tổ chức<input aria-label="Tên tổ chức" required maxLength={200} value={organizationForm.name} onChange={(event) => setOrganizationForm((value) => ({ ...value, name: event.target.value }))} /></label>
      <label>Địa chỉ<input aria-label="Địa chỉ tổ chức" maxLength={500} value={organizationForm.address} onChange={(event) => setOrganizationForm((value) => ({ ...value, address: event.target.value }))} /></label>
      <label>Điện thoại tổ chức<input aria-label="Điện thoại tổ chức" inputMode="tel" maxLength={30} value={organizationForm.phoneNumber} onChange={(event) => setOrganizationForm((value) => ({ ...value, phoneNumber: event.target.value }))} /></label>
      <Button type="submit" disabled={savingOrganization || loading || !organizationEtag}>{savingOrganization ? "Đang lưu…" : "Lưu hồ sơ tổ chức"}</Button>
    </form></Card>}
    <Card className="account-card"><h2>Bảo mật</h2><p className="account-card-copy">Đổi mật khẩu sẽ thu hồi mọi phiên Fire3D, sau đó bạn sẽ đăng nhập lại.</p><form className="account-form" onSubmit={changePassword}>
      <label>Mật khẩu hiện tại<PasswordInput aria-label="Mật khẩu hiện tại" visibilityLabel="mật khẩu hiện tại" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
      <label>Mật khẩu mới<PasswordInput aria-label="Mật khẩu mới" visibilityLabel="mật khẩu mới" autoComplete="new-password" required minLength={6} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
      <label>Xác nhận mật khẩu mới<PasswordInput aria-label="Xác nhận mật khẩu mới" visibilityLabel="xác nhận mật khẩu mới" autoComplete="new-password" required minLength={6} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
      <Button type="submit" disabled={savingPassword}>{savingPassword ? "Đang đổi mật khẩu…" : "Đổi mật khẩu"}</Button>
    </form></Card>
    <Button variant="secondary" onClick={() => void logout()}><LogOut size={16} /> Đăng xuất</Button>
  </section>;
}
