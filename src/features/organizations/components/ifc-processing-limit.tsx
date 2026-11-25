"use client";

import { useState, type FormEvent } from "react";

import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { SupportCode } from "@/components/ui/support-code";
import { useToast } from "@/components/ui/toast";
import { Rows } from "@/features/admin-overview/components/admin-kit";

import { DAILY_LIMIT_MAX, ifcProcessingApi, parseDailyLimit, sourceText } from "../ifc-processing";

type Target = "organization" | "default";

/**
 * PlatformAdmin: the daily limit of IFC processing runs of one Organization (BE#219). Shows the limit in effect and today's
 * use, and writes a new policy version either for this Organization or as the default of every Organization.
 */
export function IfcProcessingLimit({ organizationId, accessToken }: { organizationId: string; accessToken: string }) {
  const toast = useToast();
  const usage = useAsyncData(`ifc-processing:${organizationId}`, (signal) => ifcProcessingApi.usageOf(accessToken, organizationId, signal), Boolean(accessToken));
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<Target>("organization");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [failure, setFailure] = useState<{ message: string; code?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const open = () => { setEditing(true); setTarget("organization"); setText(usage.data ? String(usage.data.dailyLimit) : ""); setNote(""); setFieldError(""); setFailure(null); };

  const save = async (input: { dailyLimit: number | null; target: Target }) => {
    if (saving) return;
    setSaving(true);
    setFailure(null);
    try {
      await ifcProcessingApi.createPolicy(accessToken, { organizationId: input.target === "organization" ? organizationId : undefined, dailyLimit: input.dailyLimit, note: note.trim() || undefined });
      setEditing(false);
      usage.reload();
      toast.notify({ tone: "success", title: "Đã lưu hạn mức xử lý mô hình", description: input.dailyLimit === null ? "Tổ chức dùng lại mức chung." : input.target === "default" ? "Mức chung mới áp dụng cho mọi tổ chức không có mức riêng." : undefined });
    } catch (cause) {
      const api = cause instanceof ApiError ? cause : null;
      setFailure({ message: api?.fieldErrors[0]?.message ?? (api?.status === 403 ? "Tài khoản này không có quyền đổi hạn mức." : "Chưa lưu được hạn mức. Hãy thử lại."), code: api?.code });
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = parseDailyLimit(text);
    if (value === null) { setFieldError(`Nhập số nguyên từ 0 đến ${DAILY_LIMIT_MAX.toLocaleString("vi-VN")}.`); return; }
    setFieldError("");
    void save({ dailyLimit: value, target });
  };

  return <section className="ops-stack" aria-label="Hạn mức xử lý mô hình IFC" data-testid="ifc-processing-limit">
    <span className="ops-field-hint" style={{ margin: 0 }}>Hạn mức xử lý mô hình IFC</span>
    {usage.loading && !usage.data && <Skeleton style={{ height: 64 }} />}
    {usage.error !== undefined && !usage.data && <Alert tone="danger" title="Không đọc được hạn mức xử lý mô hình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={usage.reload}>Thử lại</Button>} />}
    {usage.data && <>
      <Rows items={[
        { label: "Hạn mức mỗi ngày", value: usage.data.dailyLimit === 0 ? <strong>Đang tạm dừng xử lý mô hình mới</strong> : <><strong>{usage.data.dailyLimit.toLocaleString("vi-VN")} lượt</strong> ({sourceText(usage.data.source)})</> },
        { label: "Đã dùng hôm nay", value: `${usage.data.used.toLocaleString("vi-VN")} lượt, còn ${usage.data.remaining.toLocaleString("vi-VN")} lượt` },
      ]} />
      {!editing && <div className="ops-actions">
        <Button size="sm" variant="secondary" onClick={open} data-testid="ifc-limit-edit">Đổi hạn mức</Button>
        {usage.data.source === "Organization" && <Button size="sm" variant="quiet" disabled={saving} onClick={() => void save({ dailyLimit: null, target: "organization" })} data-testid="ifc-limit-reset">Dùng lại mức chung</Button>}
      </div>}
    </>}
    {editing && <form onSubmit={submit} noValidate className="ops-stack" aria-label="Đổi hạn mức xử lý mô hình IFC">
      <Field label="Áp dụng cho">
        {(p) => <Select {...p} value={target} onChange={(event) => setTarget(event.target.value as Target)} data-testid="ifc-limit-target">
          <option value="organization">Riêng tổ chức này</option>
          <option value="default">Mọi tổ chức (mức chung)</option>
        </Select>}
      </Field>
      <Field label="Số lượt xử lý mỗi ngày" required error={fieldError} hint="Mỗi lượt là một lần hệ thống xử lý một tệp IFC. Nhập 0 để tạm dừng xử lý mô hình mới.">
        {(p) => <Input {...p} inputMode="numeric" autoComplete="off" value={text} onChange={(event) => setText(event.target.value)} data-testid="ifc-limit-input" />}
      </Field>
      <Field label="Ghi chú (tùy chọn)" hint="Lý do đổi hạn mức, được lưu cùng lịch sử thay đổi.">
        {(p) => <Input {...p} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />}
      </Field>
      {failure && <Alert tone="danger">{failure.message}<SupportCode code={failure.code} /></Alert>}
      <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
        <Button type="button" variant="quiet" onClick={() => setEditing(false)} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving} data-testid="ifc-limit-save">{saving ? "Đang lưu…" : "Lưu hạn mức"}</Button>
      </div>
    </form>}
    {!editing && failure && <Alert tone="danger">{failure.message}<SupportCode code={failure.code} /></Alert>}
  </section>;
}
