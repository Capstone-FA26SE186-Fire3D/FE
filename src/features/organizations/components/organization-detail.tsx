"use client";

import { BarChart3, Building2, Pencil, RefreshCw, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Rows } from "@/features/admin-overview/components/admin-kit";
import { routes } from "@/configs/routes";
import { organizationsApi } from "../api";
import type { AdminUpdateOrganizationInput, Organization, OrganizationDetail as OrganizationDetailData } from "../types";

const formatDate = (value: string) => new Date(value).toLocaleString("vi-VN");
const buildingsHref = (id: string) => `${routes.adminOrganizations}/${id}/buildings`;
const ownersHref = (id: string) => `${routes.adminAccounts}?organizationId=${id}`;

type Loaded = { organization: OrganizationDetailData; etag: string | null };
/** Only what the admin typed. Untouched fields follow the loaded record, so a reload never writes a stale value back. */
type Edits = Partial<Record<"name" | "address" | "phoneNumber", string>>;
type FieldErrors = Partial<Record<"name" | "address" | "phoneNumber", string>>;

/** The API's ETag is the profile revision; fall back to the body when a proxy hides the header. */
const etagOf = (headers: Headers, organization: OrganizationDetailData) => headers.get("etag") ?? (organization.profileRevision ? `"${organization.profileRevision}"` : null);
const valueOf = (organization: OrganizationDetailData) => ({ name: organization.name, address: organization.address ?? "", phoneNumber: organization.phoneNumber ?? "" });
const dash = (value: string | null | undefined) => (value?.trim() ? value : "Chưa có");

/**
 * Admin view and edit of one organization, drawn inside the organization drawer (Figma 52:1416). Saving sends
 * `PATCH /api/organizations/{id}` with `If-Match` and only the changed fields (the API rejects null/empty). On 412 the
 * typed values stay and the admin loads the newer version to compare; a late load never overwrites what is being typed
 * because drafts live apart from the loaded record. `onLoaded` hands the fetched record to the drawer (eyebrow, footer toggle).
 */
export function OrganizationDetail({ id, accessToken, onLoaded, onSaved }: { id: string; accessToken: string; onLoaded?: (organization: Organization) => void; onSaved: () => void }) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);
  const [edits, setEdits] = useState<Edits | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [staleEtag, setStaleEtag] = useState<string | null>(null);
  const inFlight = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(undefined);
      organizationsApi.getDetail(accessToken, id, controller.signal)
        .then((response) => { if (!controller.signal.aborted) { setLoaded({ organization: response.data, etag: etagOf(response.headers, response.data) }); onLoadedRef.current?.(response.data); } })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [accessToken, id, token]);
  const reload = useCallback(() => setToken((value) => value + 1), []);

  if (!loaded) {
    if (loadError !== undefined) {
      const missing = loadError instanceof ApiError && loadError.status === 404;
      return <Alert tone="danger" title={missing ? "Không tìm thấy tổ chức" : "Không mở được tổ chức"} action={missing ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{missing ? "Tổ chức có thể đã bị xóa hoặc đường dẫn không đúng." : "Hãy kiểm tra kết nối rồi thử lại."}</Alert>;
    }
    return <div role="status" aria-live="polite"><span className="ops-sr-only">Đang tải thông tin tổ chức…</span><SkeletonDetail rows={5} /></div>;
  }

  const { organization, etag } = loaded;
  const reloaded = staleEtag !== null && etag !== staleEtag;

  const startEdit = () => { setEdits({}); setErrors({}); setFormError(""); setStaleEtag(null); };
  const cancelEdit = () => { setEdits(null); setErrors({}); setFormError(""); setStaleEtag(null); };

  const current = valueOf(organization);
  const shown = { ...current, ...edits };
  const pending: AdminUpdateOrganizationInput = {};
  if (edits) {
    for (const field of ["name", "address", "phoneNumber"] as const) {
      const typed = edits[field]?.trim();
      if (typed !== undefined && typed !== current[field]) pending[field] = typed;
    }
  }
  const dirty = Object.keys(pending).length > 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || !edits || !dirty) return;
    const found: FieldErrors = {};
    if (pending.name !== undefined && (!pending.name || pending.name.length > 200)) found.name = "Tên tổ chức dài từ 1 đến 200 ký tự.";
    if (pending.address !== undefined && (!pending.address || pending.address.length > 500)) found.address = organization.address ? "Địa chỉ không được để trống (tối đa 500 ký tự). Địa chỉ đã có thì chỉ sửa được, không xóa trống được." : "Địa chỉ dài từ 1 đến 500 ký tự.";
    if (pending.phoneNumber !== undefined && !pending.phoneNumber) found.phoneNumber = "Số điện thoại không được để trống. Số đã có thì chỉ sửa được, không xóa trống được.";
    setErrors(found);
    if (found.name || found.address || found.phoneNumber) return;
    if (!etag) { setFormError("Chưa có phiên bản hồ sơ để đối chiếu. Hãy tải lại rồi lưu lại."); return; }
    inFlight.current = true;
    setSaving(true);
    setFormError("");
    try {
      const response = await organizationsApi.update(accessToken, organization.id, etag, pending);
      setLoaded({ organization: response.data, etag: etagOf(response.headers, response.data) });
      onLoadedRef.current?.(response.data);
      setEdits(null);
      setStaleEtag(null);
      toast.notify({ tone: "success", title: "Đã lưu hồ sơ tổ chức", description: response.data.name });
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.isPreconditionFailed) setStaleEtag(etag);
      else if (cause instanceof ApiError && cause.status === 428) { setStaleEtag(etag); setFormError("Chưa có phiên bản hồ sơ để đối chiếu. Hãy tải bản mới rồi lưu lại."); }
      else if (cause instanceof ApiError && cause.status === 409) {
        setErrors({ phoneNumber: cause.fieldMessage("phoneNumber") ?? "Số điện thoại này đang được tổ chức khác sử dụng." });
        setFormError("Hồ sơ chưa được lưu. Nội dung bạn nhập vẫn được giữ lại; hãy đổi số điện thoại rồi lưu lại.");
      } else if (cause instanceof ApiError && cause.status === 404) setFormError("Tổ chức không còn tồn tại nên không lưu được.");
      else if (cause instanceof ApiError && cause.fieldErrors.length) {
        setErrors({ name: cause.fieldMessage("name"), address: cause.fieldMessage("address"), phoneNumber: cause.fieldMessage("phoneNumber") });
        setFormError("Máy chủ từ chối dữ liệu. Kiểm tra các trường được đánh dấu.");
      } else setFormError("Không thể lưu hồ sơ. Nội dung bạn nhập vẫn được giữ lại; hãy thử lại.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const hasCounts = [organization.buildingCount, organization.accountCount].some((value) => typeof value === "number");

  return <div className="ops-stack">
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
      <span className="ops-field-hint" style={{ margin: 0 }}>Hồ sơ tổ chức</span>
      <div className="ops-actions" style={{ flexWrap: "nowrap" }}>
        {!edits && <Button size="sm" variant="secondary" onClick={startEdit}><Pencil size={14} aria-hidden="true" />Sửa hồ sơ</Button>}
        <Button size="sm" variant="quiet" onClick={reload} disabled={loading} aria-label="Tải lại tổ chức"><RefreshCw size={14} aria-hidden="true" />{loading ? "Đang tải…" : "Tải lại"}</Button>
      </div>
    </div>

    {!edits && <Rows items={[
      { label: "Tên tổ chức", value: <strong>{organization.name}</strong> },
      { label: "Địa chỉ", value: dash(organization.address) },
      { label: "Số điện thoại", value: dash(organization.phoneNumber) },
      ...(hasCounts ? [{ label: "Quy mô", value: `${organization.buildingCount ?? "—"} công trình · ${organization.accountCount ?? "—"} tài khoản` }] : []),
      { label: "Mã định danh", value: <span className="adm-mono" title={organization.id}>{organization.id.slice(0, 8)}…</span> },
      { label: "Tạo lúc", value: formatDate(organization.createdAt) },
      { label: "Cập nhật", value: formatDate(organization.updatedAt) },
    ]} />}

    {edits && <form onSubmit={submit} noValidate className="ops-stack" aria-label="Sửa hồ sơ tổ chức">
      {staleEtag !== null && <Alert tone="warning" title={reloaded ? "Đã tải bản mới nhất" : "Hồ sơ vừa được thay đổi ở nơi khác"} action={!reloaded && <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={reload} disabled={loading}>{loading ? "Đang tải…" : "Tải bản mới để đối chiếu"}</Button>}>
        {reloaded ? `Bản mới nhất: ${organization.name} · ${dash(organization.address)} · ${dash(organization.phoneNumber)}. Nội dung bạn nhập vẫn được giữ; kiểm tra rồi bấm Lưu để áp dụng, hoặc Hủy để bỏ.` : "Nội dung bạn nhập được giữ nguyên, chưa ghi đè gì. Tải bản mới để đối chiếu rồi lưu lại."}
      </Alert>}
      <Field label="Tên tổ chức" required error={errors.name}>{(p) => <Input {...p} maxLength={200} value={shown.name} onChange={(event) => setEdits({ ...edits, name: event.target.value })} />}</Field>
      <Field label="Địa chỉ" error={errors.address}>{(p) => <Input {...p} maxLength={500} value={shown.address} onChange={(event) => setEdits({ ...edits, address: event.target.value })} />}</Field>
      <Field label="Số điện thoại" hint="Không được trùng với tổ chức khác." error={errors.phoneNumber}>{(p) => <Input {...p} inputMode="tel" maxLength={16} value={shown.phoneNumber} onChange={(event) => setEdits({ ...edits, phoneNumber: event.target.value })} />}</Field>
      {!organization.isActive && <p className="ops-field-hint" style={{ margin: 0 }}>Tổ chức đang vô hiệu hóa vẫn sửa được hồ sơ.</p>}
      {formError && <Alert tone="danger">{formError}</Alert>}
      <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
        <Button type="button" variant="quiet" onClick={cancelEdit} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving || !dirty}>{saving ? "Đang lưu…" : "Lưu hồ sơ"}</Button>
      </div>
    </form>}

    <div className="ops-actions" aria-label="Liên kết tổ chức">
      <Button asChild size="sm" variant="secondary"><Link href={buildingsHref(organization.id)}><Building2 size={14} aria-hidden="true" />Xem công trình</Link></Button>
      <Button asChild size="sm" variant="secondary"><Link href={`${routes.adminOrganizations}/${organization.id}/analytics`}><BarChart3 size={14} aria-hidden="true" />Xem báo cáo</Link></Button>
      <Button asChild size="sm" variant="secondary"><Link href={ownersHref(organization.id)}><UserPlus size={14} aria-hidden="true" />Tạo tài khoản tổ chức</Link></Button>
    </div>
  </div>;
}
