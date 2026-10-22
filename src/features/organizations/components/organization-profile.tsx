"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { describeApiError } from "@/api/describe-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { organizationsApi } from "../api";
import type { OrganizationProfile as Profile } from "../types";

type Form = { address: string; name: string; phoneNumber: string };
type Problem = { message: string; fields: Record<string, string | undefined> };

const toForm = (profile: Profile): Form => ({ address: profile.address ?? "", name: profile.name, phoneNumber: profile.phoneNumber ?? "" });
const etagOf = (headers: Headers, revision?: number) => headers.get("etag") ?? (revision ? `"${revision}"` : null);

function problemOf(error: unknown): Problem {
  if (error instanceof ApiError) {
    const fields = { name: error.fieldMessage("name"), address: error.fieldMessage("address"), phoneNumber: error.fieldMessage("phoneNumber") };
    if (error.status === 428) return { message: "Chưa có phiên bản hồ sơ để đối chiếu. Hãy tải lại rồi lưu lại.", fields };
    if (error.status === 429) return { message: error.retryAfterSeconds ? `Thao tác quá nhanh. Thử lại sau ${error.retryAfterSeconds} giây.` : "Thao tác quá nhanh. Hãy thử lại sau ít phút.", fields };
    const generic = error.status === 401 || error.status === 403 || error.status === 404 || error.status >= 500;
    return { message: generic ? describeApiError(error, "") : error.message || "Không thể lưu thay đổi. Vui lòng thử lại.", fields };
  }
  return { message: describeApiError(error, "Không thể lưu thay đổi. Vui lòng thử lại."), fields: {} };
}

/**
 * `/workspace/profile`: the organization's own profile (`GET/PATCH /api/organizations/me`, ETag + If-Match).
 * Name, address and phone are editable; the slug is read only. Nothing else belongs to the organization profile.
 */
export function OrganizationProfile() {
  const { accessToken, ready, user } = useAuthSession();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ address: "", name: "", phoneNumber: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  /** The newer server version found after a 412: the user's own values stay in the form until they pick one. */
  const [conflict, setConflict] = useState<{ profile: Profile; etag: string | null } | null>(null);

  const allowed = ready && user?.role === 1 && Boolean(accessToken);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await organizationsApi.getMine(accessToken);
      setProfile(response.data);
      setForm(toForm(response.data));
      setEtag(etagOf(response.headers, response.data.profileRevision));
      setConflict(null);
    } catch (cause) {
      setLoadError(describeApiError(cause, "Không tải được hồ sơ tổ chức."));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!allowed) return;
    const task = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(task);
  }, [allowed, load]);

  const save = async (event?: FormEvent, overrideEtag?: string | null) => {
    event?.preventDefault();
    const sendEtag = overrideEtag ?? etag;
    if (!accessToken || !sendEtag || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const next = await organizationsApi.updateMine(accessToken, sendEtag, { name: form.name.trim(), address: form.address.trim() || null, phoneNumber: form.phoneNumber.trim() || null });
      setProfile(next.data);
      setForm(toForm(next.data));
      setEtag(etagOf(next.headers, next.data.profileRevision));
      setConflict(null);
      toast.notify({ tone: "success", title: "Đã lưu hồ sơ tổ chức" });
    } catch (cause) {
      if (cause instanceof ApiError && cause.isPreconditionFailed) {
        try {
          const latest = await organizationsApi.getMine(accessToken);
          setConflict({ profile: latest.data, etag: etagOf(latest.headers, latest.data.profileRevision) });
        } catch (readError) {
          setProblem(problemOf(readError));
        }
      } else {
        setProblem(problemOf(cause));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!allowed) return <Alert tone="danger" title="Không có quyền truy cập">Hồ sơ tổ chức dành cho tài khoản tổ chức. Tài khoản cá nhân nằm ở <Link href={routes.account}>Tài khoản của bạn</Link>.</Alert>;

  const locked = loading && !profile;
  const dirty = profile !== null && (form.name !== profile.name || form.address !== (profile.address ?? "") || form.phoneNumber !== (profile.phoneNumber ?? ""));

  return <div className="org">
    <PageHeader eyebrow="Quản lý" title="Hồ sơ tổ chức" description="Tên, địa chỉ và điện thoại của tổ chức." breadcrumbs={[{ label: "Hồ sơ tổ chức" }]} />
    {loadError && <Alert tone="danger" title="Không tải được hồ sơ tổ chức" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void load()}>Thử lại</Button>}>{loadError}</Alert>}
    <div className="org-stack">
      {conflict && <Alert tone="warning" title="Dữ liệu đã thay đổi trên máy chủ (412)" action={<div className="ops-actions" style={{ marginTop: 10 }}>
        <Button size="sm" onClick={() => void save(undefined, conflict.etag)} disabled={saving}>{saving ? "Đang lưu…" : "Ghi đè bằng giá trị của tôi"}</Button>
        <Button size="sm" variant="secondary" onClick={() => { setProfile(conflict.profile); setForm(toForm(conflict.profile)); setEtag(conflict.etag); setConflict(null); }} disabled={saving}>Dùng bản mới nhất</Button>
      </div>}>
        Có người vừa cập nhật hồ sơ. Giá trị bạn đang nhập vẫn được giữ; bản mới nhất là “{conflict.profile.name}”. Chọn giữ giá trị của bạn hay dùng bản mới nhất.
      </Alert>}

      <section className="org-card" aria-labelledby="org-profile-title">
        <h2 id="org-profile-title" className="org-card-title">Thông tin tổ chức</h2>
        {locked ? <div className="org-stack-sm"><Skeleton style={{ height: 44 }} /><Skeleton style={{ height: 44 }} /></div> : <form onSubmit={(event) => void save(event)} noValidate className="org-stack">
          <div className="org-profile-grid">
            <Field label="Tên tổ chức" required hint="Giá trị của bạn" error={problem?.fields.name}>{(p) => <Input {...p} required maxLength={200} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} />}</Field>
            <Field label="Mã định danh (slug)" hint="Không thể đổi.">{(p) => <Input {...p} value={profile?.slug ?? ""} readOnly aria-readonly="true" />}</Field>
            <Field label="Địa chỉ" hint="Địa chỉ liên hệ của tổ chức." error={problem?.fields.address}>{(p) => <Input {...p} maxLength={500} value={form.address} onChange={(event) => setForm((value) => ({ ...value, address: event.target.value }))} />}</Field>
            <Field label="Điện thoại" error={problem?.fields.phoneNumber}>{(p) => <Input {...p} inputMode="tel" maxLength={30} value={form.phoneNumber} onChange={(event) => setForm((value) => ({ ...value, phoneNumber: event.target.value }))} />}</Field>
          </div>
          {problem && <Alert tone="danger" title="Không thể lưu thay đổi">{problem.message}</Alert>}
          <div className="ops-actions"><Button type="submit" disabled={saving || !etag || !form.name.trim() || (!dirty && !conflict)}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</Button></div>
        </form>}
      </section>
      <p className="org-card-sub" style={{ margin: 0 }}>Đổi mật khẩu, ảnh đại diện hoặc liên kết Google nằm ở <Link href={routes.account}>Tài khoản của bạn</Link>.</p>
    </div>
  </div>;
}
