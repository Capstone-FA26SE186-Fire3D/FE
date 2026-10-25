"use client";

import { Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { useUrlParams } from "@/api/use-url-params";

import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatNumber } from "@/features/billing/format";

import { adminAiApi } from "../api";
import { aiErrorText, fieldIssue, operationLabel } from "../labels";
import { ADMIN_AI_OPERATIONS, urlFilter, type AiPolicy, type CreateAiPolicyInput } from "../types";
import styles from "../org-ai.module.css";

const QUOTA_UNIT = /^[a-z][a-z0-9_-]{0,49}$/;

const PAGE_SIZE = 20;

type Form = { operation: string; quotaUnit: string; reserveUnits: string; maxInputChars: string; maxSources: string; dailyUnits: string; effectiveFrom: string; effectiveUntil: string };
const EMPTY: Form = { operation: "", quotaUnit: "", reserveUnits: "", maxInputChars: "", maxSources: "", dailyUnits: "", effectiveFrom: "", effectiveUntil: "" };
type Errors = Partial<Record<keyof Form, string>>;

const toIso = (local: string) => new Date(local).toISOString();
const wholeNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);

/** Same bounds the controller enforces; values are never preset: an empty field stays empty until an admin decides. */
export function validatePolicy(form: Form): { errors: Errors; input?: CreateAiPolicyInput } {
  const errors: Errors = {};
  if (!(ADMIN_AI_OPERATIONS as readonly string[]).includes(form.operation)) errors.operation = "Chọn thao tác.";
  if (!QUOTA_UNIT.test(form.quotaUnit.trim())) errors.quotaUnit = "Chữ thường không dấu, bắt đầu bằng chữ cái; gồm a-z, 0-9, _ hoặc -, tối đa 50 ký tự. Phải khớp đơn vị hạn mức đã cấp.";
  const reserve = wholeNumber(form.reserveUnits);
  if (!(reserve >= 1 && reserve <= 100_000_000)) errors.reserveUnits = "Số nguyên từ 1 đến 100.000.000.";
  const maxChars = wholeNumber(form.maxInputChars);
  if (!(maxChars >= 1 && maxChars <= 20_000)) errors.maxInputChars = "Số nguyên từ 1 đến 20.000.";
  const maxSources = wholeNumber(form.maxSources);
  if (!(maxSources >= 1 && maxSources <= 100)) errors.maxSources = "Số nguyên từ 1 đến 100.";
  // TraineeAnswer has no billing grant: each Trainee gets `dailyUnits` per day, at least one reservation.
  const trainee = form.operation === "TraineeAnswer";
  const daily = wholeNumber(form.dailyUnits);
  if (trainee && !(daily >= 1 && daily <= 100_000_000)) errors.dailyUnits = "Số nguyên từ 1 đến 100.000.000.";
  else if (trainee && reserve >= 1 && daily < reserve) errors.dailyUnits = "Phải lớn hơn hoặc bằng mức giữ chỗ mỗi yêu cầu.";
  const from = form.effectiveFrom ? new Date(form.effectiveFrom).getTime() : null;
  const until = form.effectiveUntil ? new Date(form.effectiveUntil).getTime() : null;
  if (from !== null && Number.isNaN(from)) errors.effectiveFrom = "Thời điểm không hợp lệ.";
  if (until !== null && Number.isNaN(until)) errors.effectiveUntil = "Thời điểm không hợp lệ.";
  if (until !== null && !Number.isNaN(until) && until <= (from ?? Date.now())) errors.effectiveUntil = "Phải sau thời điểm bắt đầu hiệu lực.";
  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    input: {
      operation: form.operation, quotaUnit: form.quotaUnit.trim(), reserveUnits: reserve, maxInputChars: maxChars, maxSources, ...(trainee ? { dailyUnits: daily } : {}),
      ...(form.effectiveFrom ? { effectiveFrom: toIso(form.effectiveFrom) } : {}), ...(form.effectiveUntil ? { effectiveUntil: toIso(form.effectiveUntil) } : {}),
    },
  };
}

function periodState(policy: AiPolicy, now: number): { label: string; tone: Tone } {
  const from = new Date(policy.effectiveFrom).getTime();
  const until = policy.effectiveUntil ? new Date(policy.effectiveUntil).getTime() : null;
  if (from > now) return { label: "Chưa đến kỳ", tone: "info" };
  if (until !== null && until <= now) return { label: "Đã hết hạn", tone: "neutral" };
  return { label: "Đang hiệu lực", tone: "success" };
}

/** Create modal (Figma "Modal / Tạo chính sách"): one effective period for one operation; immutable afterwards. */
function PolicyModal({ open, accessToken, onCreated, onClose }: { open: boolean; accessToken: string; onCreated: (policy: AiPolicy) => void; onClose: () => void }) {
  const formId = useId();
  const { keyFor, done } = useIdempotencyKey();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (key: keyof Form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    const checked = validatePolicy(form);
    setErrors(checked.errors);
    if (!checked.input) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      // The key follows the payload: a retry after a timeout replays the same create, a changed field mints a new key.
      const created = await adminAiApi.createPolicy(accessToken, checked.input, keyFor(checked.input));
      done();
      setForm(EMPTY);
      setErrors({});
      onCreated(created);
    } catch (cause) {
      setError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const server = (path: string, key: keyof Form) => errors[key] ?? fieldIssue(error, path);

  return <Modal open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }} size="lg" title="Tạo chính sách AI" description="Một kỳ hiệu lực cho một thao tác; không sửa được sau khi tạo."
    footer={<><Button type="button" variant="quiet" onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" form={formId} disabled={busy} data-testid="policy-create">{busy ? "Đang tạo…" : "Tạo chính sách"}</Button></>}>
    <form id={formId} className={styles.stack} onSubmit={submit} aria-label="Tạo chính sách AI" noValidate>
      <Alert tone="info" title="Không sửa được sau khi tạo">Chính sách không sửa được sau khi tạo. Muốn đổi, tạo kỳ hiệu lực mới cho thao tác đó (các kỳ của cùng thao tác không được chồng nhau). Không có giá trị mặc định: mọi con số do bạn quyết định.</Alert>
      <Field label="Thao tác" required error={server("$.operation", "operation")}>
        {(props) => <Combobox {...props} aria-label="Thao tác" value={form.operation} onChange={(value) => setForm((current) => ({ ...current, operation: value }))} placeholder="Chọn thao tác…" groupLabel="Thao tác" options={ADMIN_AI_OPERATIONS.map((value) => ({ value, label: operationLabel(value) }))} />}
      </Field>
      <Field label="Đơn vị hạn mức" required hint="Khớp đơn vị hạn mức đã cấp (ví dụ đơn vị trong chính sách hạn mức của gói). Hệ thống không quy đổi giữa tiền và token." error={server("$.quotaUnit", "quotaUnit")}>
        {(props) => <Input {...props} value={form.quotaUnit} onChange={set("quotaUnit")} autoComplete="off" spellCheck={false} />}
      </Field>
      <div className={styles.grid2}>
        <Field label="Giữ chỗ mỗi yêu cầu" required error={server("$.reserveUnits", "reserveUnits")}>{(props) => <Input {...props} inputMode="numeric" value={form.reserveUnits} onChange={set("reserveUnits")} />}</Field>
        <Field label="Số ký tự đầu vào tối đa" required error={server("$.maxInputChars", "maxInputChars")}>{(props) => <Input {...props} inputMode="numeric" value={form.maxInputChars} onChange={set("maxInputChars")} />}</Field>
        <Field label="Số nguồn tối đa" required error={server("$.maxSources", "maxSources")}>{(props) => <Input {...props} inputMode="numeric" value={form.maxSources} onChange={set("maxSources")} />}</Field>
        {form.operation === "TraineeAnswer" && <Field label="Hạn mức mỗi học viên mỗi ngày" required hint="Tính theo ngày giờ Việt Nam; gồm phần đã tính và phần đang giữ chỗ. Không lấy từ hạn mức của tổ chức." error={server("$.dailyUnits", "dailyUnits")}>{(props) => <Input {...props} inputMode="numeric" value={form.dailyUnits} onChange={set("dailyUnits")} data-testid="policy-daily-units" />}</Field>}
      </div>
      <div className={styles.grid2}>
        <Field label="Hiệu lực từ" hint="Để trống: có hiệu lực ngay khi tạo." error={server("$.effectiveFrom", "effectiveFrom")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveFrom} onChange={set("effectiveFrom")} />}</Field>
        <Field label="Hiệu lực đến" hint="Để trống: không có ngày kết thúc." error={server("$.effectiveUntil", "effectiveUntil")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveUntil} onChange={set("effectiveUntil")} />}</Field>
      </div>
      {error !== undefined && <Alert tone="danger" title="Chưa tạo được chính sách">{aiErrorText(error)}{" "}Nội dung bạn nhập vẫn được giữ; bấm Tạo để thử lại (không tạo trùng).</Alert>}
    </form>
  </Modal>;
}

/** Policy versions (immutable: no row action, no edit); the "Thao tác" chip filters on the server. */
export function AdminPoliciesTab({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const operation = urlFilter(get("operation"), ADMIN_AI_OPERATIONS);
  const list = useAsyncData(`admin-ai:policies:${page}:${operation}`, (signal) => adminAiApi.listPolicies(accessToken, { page, pageSize: PAGE_SIZE, operation: operation || undefined }, signal));
  const [creating, setCreating] = useState(false);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const [now] = useState(() => Date.now());

  const columns: DataColumn<AiPolicy>[] = [
    { key: "operation", header: "Thao tác", primary: true, render: (policy) => <CellTitle title={operationLabel(policy.operation)} /> },
    { key: "unit", header: "Đơn vị", width: 110, render: (policy) => policy.quotaUnit },
    { key: "reserve", header: "Giữ chỗ", width: 110, align: "right", render: (policy) => formatNumber(policy.reserveUnits) },
    { key: "chars", header: "Ký tự tối đa", width: 120, align: "right", hideBelow: 1100, render: (policy) => formatNumber(policy.maxInputChars) },
    { key: "sources", header: "Nguồn tối đa", width: 120, align: "right", hideBelow: 1100, render: (policy) => formatNumber(policy.maxSources) },
    { key: "daily", header: "Hạn mức/ngày", width: 130, align: "right", hideBelow: 1200, render: (policy) => (policy.dailyUnits != null ? formatNumber(policy.dailyUnits) : "—") },
    { key: "period", header: "Hiệu lực", width: 220, hideBelow: 900, render: (policy) => <CellTitle title={formatDateTime(policy.effectiveFrom)} sub={policy.effectiveUntil ? `đến ${formatDateTime(policy.effectiveUntil)}` : "không có ngày kết thúc"} /> },
    { key: "state", header: "Trạng thái", width: 140, render: (policy) => { const state = periodState(policy, now); return <StatusBadge tone={state.tone}>{state.label}</StatusBadge>; } },
  ];

  return <div className={styles.stack}>
    <DataTable<AiPolicy>
      caption="Chính sách giữ chỗ hạn mức AI"
      data-testid="ai-policies-table"
      columns={columns}
      rows={items}
      rowKey={(policy) => policy.id}
      loading={list.loading && !list.data}
      rowTone={(policy) => (periodState(policy, now).label === "Đã hết hạn" ? "muted" : undefined)}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được chính sách AI" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <FilterChips label="Bộ lọc chính sách">
          <FilterChip label="Thao tác" value={operation} onChange={(value) => setParams({ operation: value })} options={ADMIN_AI_OPERATIONS.map((value) => ({ value, label: operationLabel(value) }))} />
        </FilterChips>
        <span className="ops-toolbar-grow" />
        <Button variant="quiet" onClick={list.reload} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
        <Button onClick={() => setCreating(true)} data-testid="policy-new"><Plus size={16} aria-hidden="true" />Tạo chính sách</Button>
      </>}
      empty={operation
        ? <EmptyState icon={SlidersHorizontal} title="Không có chính sách cho thao tác này" description="Đổi hoặc xóa bộ lọc thao tác." />
        : <EmptyState icon={SlidersHorizontal} title="Chưa có chính sách AI" description="Không có chính sách đang hiệu lực thì yêu cầu AI của tổ chức bị từ chối. Tạo chính sách cho từng thao tác; hệ thống không có giá trị mặc định." action={<Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo chính sách</Button>} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.hint}>Chính sách không sửa được nên hàng không có menu thao tác. Trạng thái hiệu lực ở đây so theo giờ trên máy bạn; hệ thống quyết định chính sách áp dụng lúc gửi yêu cầu.</p>

    <PolicyModal open={creating} accessToken={accessToken} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); toast.notify({ tone: "success", title: "Đã tạo chính sách AI" }); }} />
  </div>;
}
