"use client";

import { CircleStop, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { useUrlParams } from "@/api/use-url-params";

import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatNumber, quotaUnitLabel } from "@/features/billing/format";

import { adminAiApi } from "../api";
import { aiErrorText, fieldIssue, operationLabel } from "../labels";
import { ADMIN_AI_OPERATIONS, urlFilter, type AiPolicy, type CreateAiPolicyInput } from "../types";
import styles from "../org-ai.module.css";

/** The only units the AI service can settle (BE#176): one question = one unit, or the tokens the model read and wrote. */
const QUOTA_UNITS = [
  { value: "requests", label: "Lượt hỏi (requests): mỗi câu hỏi tính 1" },
  { value: "tokens", label: "Token (tokens): theo lượng chữ AI đọc và viết" },
] as const;

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
  if (!QUOTA_UNITS.some((unit) => unit.value === form.quotaUnit)) errors.quotaUnit = "Chọn đơn vị: lượt hỏi hoặc token.";
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
  else if (trainee && reserve >= 1 && daily < reserve) errors.dailyUnits = "Phải lớn hơn hoặc bằng mức tạm trừ mỗi câu hỏi.";
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

/** A policy can still be ended while its period has not finished (open-ended or ending later). */
const endable = (policy: AiPolicy, now: number) => !policy.effectiveUntil || new Date(policy.effectiveUntil).getTime() > now;

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

  return <Modal open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }} size="lg" title="Tạo chính sách AI" description="Một kỳ hiệu lực cho một thao tác; không sửa được sau khi tạo, chỉ kết thúc được."
    footer={<><Button type="button" variant="quiet" onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" form={formId} disabled={busy} data-testid="policy-create">{busy ? "Đang tạo…" : "Tạo chính sách"}</Button></>}>
    <form id={formId} className={styles.stack} onSubmit={submit} aria-label="Tạo chính sách AI" noValidate>
      <Alert tone="info" title="Không sửa được sau khi tạo">Chính sách không sửa được sau khi tạo. Muốn đổi, kết thúc chính sách đang chạy (menu ··· ở cuối hàng) rồi tạo chính sách mới từ thời điểm đó; các kỳ của cùng thao tác không được chồng nhau. Không có giá trị mặc định: mọi con số do bạn quyết định.</Alert>
      <Field label="Thao tác" required error={server("$.operation", "operation")}>
        {(props) => <Combobox {...props} aria-label="Thao tác" value={form.operation} onChange={(value) => setForm((current) => ({ ...current, operation: value }))} placeholder="Chọn thao tác…" groupLabel="Thao tác" options={ADMIN_AI_OPERATIONS.map((value) => ({ value, label: operationLabel(value) }))} />}
      </Field>
      <Field label="Đơn vị hạn mức" required hint="Phải trùng đơn vị hạn mức AI mà gói dịch vụ cấp cho tổ chức. Hệ thống không quy đổi giữa hai đơn vị." error={server("$.quotaUnit", "quotaUnit")}>
        {(props) => <Select {...props} value={form.quotaUnit} onChange={set("quotaUnit")}>
          <option value="">Chọn đơn vị…</option>
          {QUOTA_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
        </Select>}
      </Field>
      <div className={styles.grid2}>
        <Field label="Tạm trừ mỗi câu hỏi" required hint="Khi một câu hỏi được gửi, hệ thống trừ tạm số này khỏi hạn mức để không ai dùng quá. AI trả lời xong chỉ tính phần thực dùng, phần dư được hoàn lại; AI lỗi thì hoàn lại hết. Đơn vị lượt hỏi: để 1." error={server("$.reserveUnits", "reserveUnits")}>{(props) => <Input {...props} inputMode="numeric" value={form.reserveUnits} onChange={set("reserveUnits")} />}</Field>
        <Field label="Số ký tự đầu vào tối đa" required error={server("$.maxInputChars", "maxInputChars")}>{(props) => <Input {...props} inputMode="numeric" value={form.maxInputChars} onChange={set("maxInputChars")} />}</Field>
        <Field label="Số nguồn tối đa" required error={server("$.maxSources", "maxSources")}>{(props) => <Input {...props} inputMode="numeric" value={form.maxSources} onChange={set("maxSources")} />}</Field>
        {form.operation === "TraineeAnswer" && <Field label="Hạn mức mỗi học viên mỗi ngày" required hint="Tính theo ngày giờ Việt Nam; gồm phần đã tính và phần đang tạm trừ. Không lấy từ hạn mức của tổ chức." error={server("$.dailyUnits", "dailyUnits")}>{(props) => <Input {...props} inputMode="numeric" value={form.dailyUnits} onChange={set("dailyUnits")} data-testid="policy-daily-units" />}</Field>}
      </div>
      <div className={styles.grid2}>
        <Field label="Hiệu lực từ" hint="Để trống: có hiệu lực ngay khi tạo." error={server("$.effectiveFrom", "effectiveFrom")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveFrom} onChange={set("effectiveFrom")} />}</Field>
        <Field label="Hiệu lực đến" hint="Để trống: không có ngày kết thúc." error={server("$.effectiveUntil", "effectiveUntil")}>{(props) => <Input {...props} type="datetime-local" value={form.effectiveUntil} onChange={set("effectiveUntil")} />}</Field>
      </div>
      {error !== undefined && <Alert tone="danger" title="Chưa tạo được chính sách">{aiErrorText(error)}{" "}Nội dung bạn nhập vẫn được giữ; bấm Tạo để thử lại (không tạo trùng).</Alert>}
    </form>
  </Modal>;
}

/**
 * "Kết thúc chính sách" (BE#176): sets only the end of the period, now by default or at a chosen later time. The next policy
 * for the operation can then start from that instant. One Idempotency-Key per dialog, so a retry never ends twice.
 */
function EndPolicyDialog({ policy, accessToken, onEnded, onClose }: { policy: AiPolicy; accessToken: string; onEnded: (policy: AiPolicy) => void; onClose: () => void }) {
  const { keyFor, done } = useIdempotencyKey();
  const [at, setAt] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  // Compared with when the dialog opened; the server checks again against its own clock.
  const [openedAt] = useState(() => Date.now());
  const invalid = at !== "" && (Number.isNaN(new Date(at).getTime()) || new Date(at).getTime() <= openedAt);
  const confirm = async () => {
    if (busy || invalid) return;
    setBusy(true);
    setError(undefined);
    try {
      const until = at ? toIso(at) : null;
      const ended = await adminAiApi.endPolicy(accessToken, policy.id, until, keyFor({ id: policy.id, until }));
      done();
      onEnded(ended);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };
  return <ConfirmDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }} tone="danger" busy={busy} confirmDisabled={invalid}
    title={`Kết thúc chính sách “${operationLabel(policy.operation)}”?`} confirmLabel={at ? "Đặt thời điểm kết thúc" : "Kết thúc ngay"}
    description="Sau thời điểm kết thúc, yêu cầu AI mới của thao tác này bị từ chối cho tới khi có chính sách mới. Yêu cầu đã gửi vẫn dùng chính sách cũ. Không hoàn tác được."
    onConfirm={confirm}>
    <Field label="Kết thúc lúc" hint="Để trống: kết thúc ngay bây giờ." error={invalid ? "Chọn thời điểm sau bây giờ." : undefined}>
      {(props) => <Input {...props} type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} data-testid="policy-end-at" />}
    </Field>
    {error !== undefined && <Alert tone="danger" title="Chưa kết thúc được chính sách">{aiErrorText(error)}</Alert>}
  </ConfirmDialog>;
}

/** Policy versions: immutable except for ending them from the row menu; the "Thao tác" chip filters on the server. */
export function AdminPoliciesTab({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const operation = urlFilter(get("operation"), ADMIN_AI_OPERATIONS);
  const list = useAsyncData(`admin-ai:policies:${page}:${operation}`, (signal) => adminAiApi.listPolicies(accessToken, { page, pageSize: PAGE_SIZE, operation: operation || undefined }, signal));
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<AiPolicy | null>(null);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const [now, setNow] = useState(() => Date.now());

  const columns: DataColumn<AiPolicy>[] = [
    { key: "operation", header: "Thao tác", primary: true, render: (policy) => <CellTitle title={operationLabel(policy.operation)} /> },
    { key: "unit", header: "Đơn vị", width: 130, render: (policy) => <CellTitle title={quotaUnitLabel(policy.quotaUnit)} sub={quotaUnitLabel(policy.quotaUnit) !== policy.quotaUnit ? `mã nhập: ${policy.quotaUnit}` : undefined} /> },
    { key: "reserve", header: "Tạm trừ", width: 110, align: "right", render: (policy) => formatNumber(policy.reserveUnits) },
    { key: "chars", header: "Ký tự tối đa", width: 120, align: "right", hideBelow: 1100, render: (policy) => formatNumber(policy.maxInputChars) },
    { key: "sources", header: "Nguồn tối đa", width: 120, align: "right", hideBelow: 1100, render: (policy) => formatNumber(policy.maxSources) },
    { key: "daily", header: "Hạn mức/ngày", width: 130, align: "right", hideBelow: 1200, render: (policy) => (policy.dailyUnits != null ? formatNumber(policy.dailyUnits) : "—") },
    { key: "period", header: "Hiệu lực", width: 220, hideBelow: 900, render: (policy) => <CellTitle title={formatDateTime(policy.effectiveFrom)} sub={policy.effectiveUntil ? `đến ${formatDateTime(policy.effectiveUntil)}` : "không có ngày kết thúc"} /> },
    { key: "state", header: "Trạng thái", width: 140, render: (policy) => { const state = periodState(policy, now); return <StatusBadge tone={state.tone}>{state.label}</StatusBadge>; } },
  ];

  return <div className={styles.stack}>
    <DataTable<AiPolicy>
      caption="Chính sách hạn mức AI"
      data-testid="ai-policies-table"
      columns={columns}
      rows={items}
      rowKey={(policy) => policy.id}
      loading={list.loading && !list.data}
      rowTone={(policy) => (periodState(policy, now).label === "Đã hết hạn" ? "muted" : undefined)}
      rowMenu={(policy) => [endable(policy, now)
        ? { label: "Kết thúc chính sách", icon: CircleStop, tone: "danger" as const, onSelect: () => setEnding(policy) }
        : { label: "Kết thúc chính sách", icon: CircleStop, disabled: true, hint: "Chính sách đã hết hiệu lực.", onSelect: () => undefined }]}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được chính sách AI" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <FilterChips label="Bộ lọc chính sách">
          <FilterChip label="Thao tác" value={operation} onChange={(value) => setParams({ operation: value })} options={ADMIN_AI_OPERATIONS.map((value) => ({ value, label: operationLabel(value) }))} />
        </FilterChips>
        <span className="ops-toolbar-grow" />
        <Button variant="quiet" onClick={() => { setNow(Date.now()); list.reload(); }} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
        <Button onClick={() => setCreating(true)} data-testid="policy-new"><Plus size={16} aria-hidden="true" />Tạo chính sách</Button>
      </>}
      empty={operation
        ? <EmptyState icon={SlidersHorizontal} title="Không có chính sách cho thao tác này" description="Đổi hoặc xóa bộ lọc thao tác." />
        : <EmptyState icon={SlidersHorizontal} title="Chưa có chính sách AI" description="Không có chính sách đang hiệu lực thì yêu cầu AI của tổ chức bị từ chối. Tạo chính sách cho từng thao tác; hệ thống không có giá trị mặc định." />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.hint}>Chính sách không sửa được. Muốn đổi số liệu: mở menu ··· ở cuối hàng, chọn “Kết thúc chính sách”, rồi tạo chính sách mới. Trạng thái hiệu lực ở đây so theo giờ trên máy bạn; hệ thống quyết định chính sách áp dụng lúc gửi yêu cầu.</p>
    {ending && <EndPolicyDialog policy={ending} accessToken={accessToken} onClose={() => setEnding(null)} onEnded={() => { setEnding(null); setNow(Date.now()); list.reload(); toast.notify({ tone: "success", title: "Đã kết thúc chính sách AI", description: "Tạo chính sách mới cho thao tác này nếu muốn tiếp tục cho phép yêu cầu AI." }); }} />}

    <PolicyModal open={creating} accessToken={accessToken} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); toast.notify({ tone: "success", title: "Đã tạo chính sách AI" }); }} />
  </div>;
}
