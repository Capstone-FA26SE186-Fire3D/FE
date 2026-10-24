"use client";

import { LogOut, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { describeApiError } from "@/api/describe-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton, LoadingBlock } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { keepEdits } from "@/utils/keep-edits";
import { organizationsApi } from "../api";
import type { OrganizationProfile as Profile } from "../types";
import "./organization-profile.css";

type Form = { address: string; name: string; phoneNumber: string };
type Problem = { message: string; fields: Record<string, string | undefined>; stale: boolean };

const toForm = (profile: Profile): Form => ({ address: profile.address ?? "", name: profile.name, phoneNumber: profile.phoneNumber ?? "" });
const etagOf = (headers: Headers, revision?: number) => headers.get("etag") ?? (revision ? `"${revision}"` : null);

function problemOf(error: unknown): Problem {
  if (error instanceof ApiError) {
    const fields = { name: error.fieldMessage("name"), address: error.fieldMessage("address"), phoneNumber: error.fieldMessage("phoneNumber") };
    if (error.isPreconditionFailed) return { message: "Bản của bạn dựa trên phiên bản cũ. Tải bản mới để đối chiếu: các trường bạn đã sửa vẫn được giữ, phần còn lại lấy theo bản mới nhất, rồi lưu lại.", fields, stale: true };
    if (error.status === 428) return { message: "Chưa có phiên bản hồ sơ để đối chiếu. Hãy tải lại rồi lưu lại.", fields, stale: true };
    if (error.status === 429) return { message: error.retryAfterSeconds ? `Thao tác quá nhanh. Thử lại sau ${error.retryAfterSeconds} giây.` : "Thao tác quá nhanh. Hãy thử lại sau ít phút.", fields, stale: false };
    const generic = error.status === 401 || error.status === 403 || error.status === 404 || error.status >= 500;
    return { message: generic ? describeApiError(error, "") : error.message || "Không thể lưu thay đổi. Vui lòng thử lại.", fields, stale: false };
  }
  return { message: describeApiError(error, "Không thể lưu thay đổi. Vui lòng thử lại."), fields: {}, stale: false };
}

/**
 * `/workspace/profile` (Figma 50:2592 / 54:12552): the organization's own profile (`GET/PATCH /api/organizations/me`, ETag +
 * If-Match). Name, address and phone are editable; the slug is read only. The API has no other field (no province,
 * district, contact or tax id), so nothing else is drawn. On a 412 the user's edits stay in the form and "Tải bản mới"
 * reloads the newer record under them (`keepEdits`), like the account profile.
 */
export function OrganizationProfile() {
  const { accessToken, logout, ready, user } = useAuthSession();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ address: "", name: "", phoneNumber: "" });
  // The server values the form was last filled from: a field differs from it only if the user edited it.
  const saved = useRef<Form | null>(null);
  const [savedForm, setSavedForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "busy" | "done">("idle");
  const [problem, setProblem] = useState<Problem | null>(null);

  const allowed = ready && user?.role === 1 && Boolean(accessToken);

  /** `keepForms` (after a 412): refresh the ETag and the untouched fields but leave what the user typed. */
  const load = useCallback(async (keepForms = false) => {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await organizationsApi.getMine(accessToken);
      const latest = toForm(response.data);
      const base = saved.current;
      saved.current = latest;
      setSavedForm(latest);
      setProfile(response.data);
      setForm((current) => (keepForms ? keepEdits(current, base, latest) : latest));
      setEtag(etagOf(response.headers, response.data.profileRevision));
      if (keepForms) setProblem(null);
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

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !etag || saveState !== "idle") return;
    setSaveState("busy");
    setProblem(null);
    try {
      const next = await organizationsApi.updateMine(accessToken, etag, { name: form.name.trim(), address: form.address.trim() || null, phoneNumber: form.phoneNumber.trim() || null });
      saved.current = toForm(next.data);
      setSavedForm(saved.current);
      setProfile(next.data);
      setForm(toForm(next.data));
      setEtag(etagOf(next.headers, next.data.profileRevision));
      toast.notify({ tone: "success", title: "Đã lưu hồ sơ tổ chức" });
      setSaveState("done");
      window.setTimeout(() => setSaveState("idle"), 1200);
    } catch (cause) {
      setProblem(problemOf(cause));
      setSaveState("idle");
    }
  };

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (!allowed) return <Alert tone="danger" title="Không có quyền truy cập">Hồ sơ tổ chức dành cho tài khoản tổ chức. Tài khoản cá nhân nằm ở <Link href={routes.account}>Tài khoản của bạn</Link>.</Alert>;

  const locked = loading && !profile;
  const dirty = savedForm !== null && (form.name !== savedForm.name || form.address !== savedForm.address || form.phoneNumber !== savedForm.phoneNumber);
  const reset = () => { if (savedForm) setForm(savedForm); setProblem(null); };

  return <div className="org org-profile">
    <PageHeader eyebrow="Quản lý" title="Hồ sơ tổ chức" description="Thông tin hiển thị cho đội vận hành và trên hóa đơn báo giá." breadcrumbs={[{ label: "Hồ sơ tổ chức" }]} />
    {loadError && <Alert tone="danger" className="mb-4" title="Không tải được hồ sơ tổ chức" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void load()}>Thử lại</Button>}>{loadError}</Alert>}
    <div className="org-stack">
      {problem && <Alert tone={problem.stale ? "warning" : "danger"} title={problem.stale ? "Hồ sơ đã được cập nhật ở nơi khác" : "Không thể lưu thay đổi"} action={problem.stale ? <div className="ops-actions" style={{ marginTop: 10 }}>
        <Button size="sm" variant="secondary" onClick={() => void load(true)} disabled={loading}><RefreshCw size={14} aria-hidden="true" />{loading ? "Đang tải…" : "Tải bản mới"}</Button>
      </div> : undefined}>{problem.message}</Alert>}

      <section className="org-card org-profile-card" aria-labelledby="org-profile-title">
        <h2 id="org-profile-title" className="org-card-title">Thông tin tổ chức</h2>
        {locked ? <div className="org-profile-grid" aria-busy="true"><Skeleton style={{ height: 44 }} /><Skeleton style={{ height: 44 }} /><Skeleton style={{ height: 44 }} /><Skeleton style={{ height: 44 }} /></div> : <form onSubmit={(event) => void save(event)} noValidate className="org-stack">
          <fieldset className="ops-fieldset" disabled={saveState === "busy"} style={{ minWidth: 0 }}>
            <div className="org-profile-grid">
              <Field label="Tên tổ chức" required error={problem?.fields.name}>{(p) => <Input {...p} required maxLength={200} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} autoComplete="organization" />}</Field>
              <Field label="Mã tổ chức (chỉ đọc)" hint="Không thể đổi.">{(p) => <Input {...p} className="org-profile-slug" value={profile?.slug ?? ""} readOnly aria-readonly="true" />}</Field>
              <Field label="Địa chỉ" hint="Địa chỉ liên hệ của tổ chức, in trên báo giá." error={problem?.fields.address}>{(p) => <Input {...p} maxLength={500} value={form.address} onChange={(event) => setForm((value) => ({ ...value, address: event.target.value }))} autoComplete="street-address" />}</Field>
              <Field label="Số điện thoại" error={problem?.fields.phoneNumber}>{(p) => <Input {...p} inputMode="tel" maxLength={30} value={form.phoneNumber} onChange={(event) => setForm((value) => ({ ...value, phoneNumber: event.target.value }))} autoComplete="tel" />}</Field>
            </div>
          </fieldset>
          <div className="org-profile-foot">
            <Button type="button" variant="ghost" onClick={reset} disabled={!dirty || saveState === "busy"}>Hoàn tác</Button>
            <SubmitButton type="submit" state={saveState} doneLabel="Đã lưu" disabled={!etag || !form.name.trim() || (!dirty && !problem?.stale)}>Lưu hồ sơ</SubmitButton>
          </div>
        </form>}
      </section>
      <p className="org-card-sub" style={{ margin: 0 }}>Đổi mật khẩu, ảnh đại diện hoặc liên kết Google nằm ở <Link href={routes.account}>Tài khoản của bạn</Link>.</p>
      <div><Button variant="secondary" onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />Đăng xuất</Button></div>
    </div>
  </div>;
}
