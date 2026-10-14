"use client";

import { Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatNumber } from "@/features/billing/format";

import { adminAiApi } from "../api";
import { aiErrorText, fieldIssue, operationLabel } from "../labels";
import { AI_OPERATIONS, type AiPolicy, type CreateAiPolicyInput } from "../types";
import styles from "../org-ai.module.css";

const QUOTA_UNIT = /^[a-z][a-z0-9_-]{0,49}$/;

type Form = { operation: string; quotaUnit: string; reserveUnits: string; maxInputChars: string; maxSources: string; effectiveFrom: string; effectiveUntil: string };
const EMPTY: Form = { operation: "", quotaUnit: "", reserveUnits: "", maxInputChars: "", maxSources: "", effectiveFrom: "", effectiveUntil: "" };
type Errors = Partial<Record<keyof Form, string>>;

const toIso = (local: string) => new Date(local).toISOString();
const wholeNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);

/** Same bounds the controller enforces; values are never preset: an empty field stays empty until an admin decides. */
export function validatePolicy(form: Form): { errors: Errors; input?: CreateAiPolicyInput } {
  const errors: Errors = {};
  if (form.operation !== "ScenarioDraft" && form.operation !== "Answer") errors.operation = "Chọn thao tác.";
  if (!QUOTA_UNIT.test(form.quotaUnit.trim())) errors.quotaUnit = "Chữ thường, bắt đầu bằng chữ cái; gồm a-z, 0-9, _ hoặc -, tối đa 50 ký tự. Phải khớp đơn vị của quota đã cấp.";
  const reserve = wholeNumber(form.reserveUnits);
  if (!(reserve >= 1 && reserve <= 100_000_000)) errors.reserveUnits = "Số nguyên từ 1 đến 100.000.000.";
  const maxChars = wholeNumber(form.maxInputChars);
  if (!(maxChars >= 1 && maxChars <= 20_000)) errors.maxInputChars = "Số nguyên từ 1 đến 20.000.";
  const maxSources = wholeNumber(form.maxSources);
  if (!(maxSources >= 1 && maxSources <= 100)) errors.maxSources = "Số nguyên từ 1 đến 100.";
  const from = form.effectiveFrom ? new Date(form.effectiveFrom).getTime() : null;
  const until = form.effectiveUntil ? new Date(form.effectiveUntil).getTime() : null;
  if (from !== null && Number.isNaN(from)) errors.effectiveFrom = "Thời điểm không hợp lệ.";
  if (until !== null && Number.isNaN(until)) errors.effectiveUntil = "Thời điểm không hợp lệ.";
  if (until !== null && !Number.isNaN(until) && until <= (from ?? Date.now())) errors.effectiveUntil = "Phải sau thời điểm bắt đầu hiệu lực.";
  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    input: {
      operation: form.operation, quotaUnit: form.quotaUnit.trim(), reserveUnits: reserve, maxInputChars: maxChars, maxSources,
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

function PolicyForm({ accessToken, onCreated, onClose }: { accessToken: string; onCreated: (policy: AiPolicy) => void; onClose: () => void }) {
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
      onCreated(created);
    } catch (cause) {
      setError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const server = (path: string, key: keyof Form) => errors[key] ?? fieldIssue(error, path);

  return <form className={styles.stack} onSubmit={submit} aria-label="Tạo chính sách AI" noValidate>
    <Alert tone="info" title="Chính sách bất biến">Chính sách không sửa được sau khi tạo. Muốn đổi, tạo kỳ hiệu lực mới cho thao tác đó (các kỳ của cùng thao tác không được chồng nhau). Không có giá trị mặc định: mọi con số do bạn quyết định.</Alert>
    <Field label="Thao tác" required error={server("$.operation", "operation")}>
      {(props) => <Select {...props} value={form.operation} onChange={set("operation")}><option value="">Chọn thao tác…</option>{AI_OPERATIONS.map((value) => <option key={value} value={value}>{operationLabel(value)} ({value})</option>)}</Select>}
    </Field>
    <Field label="Đơn vị quota" required hint="Khớp đơn vị của quota đã cấp (ví dụ đơn vị trong chính sách quota của gói). Backend không quy đổi tiền hay token." error={server("$.quotaUnit", "quotaUnit")}>
      {(props) => <Input {...props} value={form.quotaUnit} onChange={set("quotaUnit")} autoComplete="off" spellCheck={false} />}
    </Field>
    <div className={styles.grid2}>
      <Field label="Giữ chỗ mỗi yêu cầu" required error={server("$.reserveUnits", "reserveUnits")}>{(props) => <Input {...props} inputMode="numeric" value={form.reserveUnits} onChange={set("reserveUnits")} />}</Field>
      <Field label="Số ký tự đầu vào tối đa" required error={server("$.maxInputChars", "maxInputChars")}>{(props) => <Input {...props} inputMode="numeric" value={form.maxInputChars} onChange={set("maxInputChars")} />}</Field>
      <Field label="Số nguồn tối đa" required error={server("$.maxSources", "maxSources")}>{(props) => <Input {...props} inputMode="numeric" value={form.maxSources} onChange={set("maxSources")} />}</Field>
    </div>
    <div className={styles.grid2}>
      <Field label="Hiệu lực từ" hint="Để trống: có hiệu lực ngay khi tạo." error={server("$.effectiveFrom", "effectiveFrom")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveFrom} onChange={set("effectiveFrom")} />}</Field>
      <Field label="Hiệu lực đến" hint="Để trống: không có ngày kết thúc." error={server("$.effectiveUntil", "effectiveUntil")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveUntil} onChange={set("effectiveUntil")} />}</Field>
    </div>
    {error !== undefined && <Alert tone="danger" title="Chưa tạo được chính sách">{aiErrorText(error)}{" "}Nội dung bạn nhập vẫn được giữ; bấm Tạo để thử lại với cùng khóa chống trùng.</Alert>}
    <div className="ops-actions"><Button type="submit" disabled={busy} data-testid="policy-create">{busy ? "Đang tạo…" : "Tạo chính sách"}</Button><Button type="button" variant="quiet" onClick={onClose} disabled={busy}>Hủy</Button></div>
  </form>;
}

export function AdminPoliciesTab({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const list = useAsyncData("admin-ai:policies", (signal) => adminAiApi.listPolicies(accessToken, signal));
  const [creating, setCreating] = useState(false);
  const items = list.data?.items ?? [];
  const [now] = useState(() => Date.now());

  return <>
    <div className="ops-toolbar">
      <Button onClick={() => setCreating(true)} data-testid="policy-new"><Plus size={16} aria-hidden="true" />Tạo chính sách</Button>
      <Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
    </div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được chính sách AI" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert>}
    <Table caption="Chính sách giữ chỗ quota AI" data-testid="admin-ai-policies">
      <thead><tr><th>Thao tác</th><th>Đơn vị</th><th>Giữ chỗ</th><th>Ký tự tối đa</th><th>Nguồn tối đa</th><th>Hiệu lực</th><th>Trạng thái</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={7}><SkeletonRows rows={4} label="Đang tải chính sách…" /></TableMessage>}
        {items.map((policy) => {
          const state = periodState(policy, now);
          return <tr key={policy.id} data-testid="policy-row">
            <td>{operationLabel(policy.operation)}<span className="ops-cell-sub">{policy.operation}</span></td>
            <td>{policy.quotaUnit}</td>
            <td>{formatNumber(policy.reserveUnits)}</td>
            <td>{formatNumber(policy.maxInputChars)}</td>
            <td>{formatNumber(policy.maxSources)}</td>
            <td>{formatDateTime(policy.effectiveFrom)}<span className="ops-cell-sub">{policy.effectiveUntil ? `đến ${formatDateTime(policy.effectiveUntil)}` : "không có ngày kết thúc"}</span></td>
            <td><StatusBadge tone={state.tone}>{state.label}</StatusBadge></td>
          </tr>;
        })}
        {list.data && !items.length && <TableMessage colSpan={7}><EmptyState icon={SlidersHorizontal} title="Chưa có chính sách AI" description="Không có chính sách đang hiệu lực thì yêu cầu AI của tổ chức bị từ chối (AI_POLICY_UNAVAILABLE). Tạo chính sách cho từng thao tác; hệ thống không có giá trị seed." action={<Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo chính sách</Button>} /></TableMessage>}
      </tbody>
    </Table>
    <p className={styles.dim}>Trạng thái hiệu lực chỉ so ngày giờ của kỳ với đồng hồ trình duyệt; máy chủ quyết định chính sách áp dụng lúc gửi yêu cầu.</p>

    <Drawer open={creating} onOpenChange={setCreating} title="Tạo chính sách AI" description="Một kỳ hiệu lực cho một thao tác; không sửa được sau khi tạo.">
      {creating && <PolicyForm accessToken={accessToken} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); toast.notify({ tone: "success", title: "Đã tạo chính sách AI" }); }} />}
    </Drawer>
  </>;
}
