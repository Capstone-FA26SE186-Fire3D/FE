"use client";

import { Gauge, Plus, RefreshCw } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { billingApi } from "../api";
import { billingErrorText } from "../errors";
import { formatDateTime, localInputToIso } from "../format";
import "../billing.css";

const PAGE_SIZE = 20;
const UNIT = /^[a-z][a-z0-9_-]{0,49}$/;

/**
 * Prepaid AI quota policy versions. A version is immutable (no edit, no delete): changing a unit or validity means
 * creating a new version and pointing packages/top-ups at it. Audience, kind and rollover are fixed by the server;
 * there is no default unit or amount.
 */
export function PoliciesSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const { page, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const list = useAsyncData(`commerce:policies:${page}`, (signal) => billingApi.listQuotaPolicies(accessToken, page, PAGE_SIZE, signal));
  const lock = useRef(false);
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setUnit(""); setFrom(""); setUntil(""); setErrors({}); setFormError(""); setOpen(true); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const found: Record<string, string> = {};
    const fromIso = localInputToIso(from);
    const untilIso = until ? localInputToIso(until) : null;
    if (!UNIT.test(unit.trim())) found.quotaUnit = "Đơn vị gồm chữ thường, số, gạch dưới hoặc gạch ngang, bắt đầu bằng chữ (1–50 ký tự).";
    if (!fromIso) found.effectiveFrom = "Chọn thời điểm bắt đầu hiệu lực.";
    if (until && (!untilIso || !fromIso || new Date(untilIso) <= new Date(fromIso))) found.effectiveUntil = "Thời điểm kết thúc phải sau thời điểm bắt đầu, hoặc để trống nếu không giới hạn.";
    setErrors(found);
    if (Object.keys(found).length) return;
    lock.current = true; setSaving(true); setFormError("");
    try {
      const created = await billingApi.createQuotaPolicy(accessToken, { quotaUnit: unit.trim(), effectiveFrom: fromIso as string, effectiveUntil: untilIso });
      toast.notify({ tone: "success", title: "Đã tạo phiên bản chính sách", description: `${created.quotaUnit} · ${created.id.slice(0, 8)}. Phiên bản không thể sửa; thay đổi sẽ là phiên bản mới.` });
      setOpen(false);
      list.reload();
    } catch (cause) {
      if (cause instanceof ApiError) setErrors({ quotaUnit: cause.fieldMessage("quotaUnit"), effectiveFrom: cause.fieldMessage("effectiveFrom"), effectiveUntil: cause.fieldMessage("effectiveUntil") });
      setFormError(billingErrorText(cause));
    } finally { lock.current = false; setSaving(false); }
  };

  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;
  return <div className="ops-stack">
    <div className="bill-row"><p className="bill-muted">Phiên bản chính sách quota AI của tổ chức: đơn vị và khoảng hiệu lực. Bất biến theo phiên bản; quota không cộng dồn sang kỳ sau (rollover None do máy chủ đặt). Không có chính sách hay số lượng mặc định.</p><div className="ops-actions"><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo phiên bản</Button></div></div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được chính sách quota" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    <Table className="bill-table" caption="Phiên bản chính sách quota AI">
      <thead><tr><th>Phiên bản</th><th>Đơn vị</th><th>Hiệu lực</th><th>Đối tượng</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={4} label="Đang tải chính sách…" /></TableMessage>}
        {items.map((item) => <tr key={item.id} data-testid="policy-row">
          <td><span className="ops-cell-primary bill-wrap">{item.id.slice(0, 8)}<span className="ops-cell-sub bill-wrap">{item.id}</span></span></td>
          <td>{item.quotaUnit}</td>
          <td>{formatDateTime(item.effectiveFrom)}<span className="ops-cell-sub">đến {item.effectiveUntil ? formatDateTime(item.effectiveUntil) : "không giới hạn"}</span></td>
          <td>{item.audience} · {item.policyKind}<span className="ops-cell-sub">rollover: {item.rollover}</span></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={Gauge} title="Chưa có chính sách quota" description="Tạo phiên bản đầu tiên (đơn vị và khoảng hiệu lực) trước khi cấu hình gói có quota AI hoặc phát hành top-up." action={<Button onClick={openCreate}>Tạo phiên bản</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={open} onOpenChange={(next) => { if (!next && !saving) setOpen(false); }} title="Tạo phiên bản chính sách" description="Không thể sửa hay xóa sau khi tạo. Đơn vị là lựa chọn nghiệp vụ rõ ràng; hệ thống không quy đổi giữa các đơn vị.">
      <form onSubmit={submit} noValidate className="ops-stack">
        <Field label="Đơn vị quota" required error={errors.quotaUnit} hint="Ví dụ do bạn quy định (chữ thường, 1–50 ký tự).">{(p) => <Input {...p} maxLength={50} autoComplete="off" value={unit} onChange={(event) => setUnit(event.target.value)} />}</Field>
        <div className="ops-form-grid">
          <Field label="Hiệu lực từ" required error={errors.effectiveFrom} hint="Giờ địa phương, lưu dưới dạng UTC.">{(p) => <Input {...p} type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />}</Field>
          <Field label="Hiệu lực đến" error={errors.effectiveUntil} hint="Để trống nếu không giới hạn.">{(p) => <Input {...p} type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} />}</Field>
        </div>
        {formError && <Alert tone="danger" title="Chưa tạo được phiên bản">{formError}</Alert>}
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button type="button" variant="quiet" onClick={() => setOpen(false)} disabled={saving}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang tạo…" : "Tạo phiên bản"}</Button></div>
      </form>
    </Drawer>
  </div>;
}
