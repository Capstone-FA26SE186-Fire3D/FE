"use client";

import { useState } from "react";

import { commandDone, commandKey } from "@/api/command-keys";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { libraryAdminApi } from "@/features/library/api";
import { describeLibraryError, translateIssue, type LibraryErrorView } from "@/features/library/errors";
import { LIBRARY_LIMITS, SCENARIO_LIBRARY_KINDS, isScenarioKind, kindHint, kindLabel, type LibraryItem, type LibraryKind } from "@/features/library/types";

/** Creates an empty item (kind + code); only scenario kinds, since the version form has no StylePreset/ColorScheme payload yet. Versions and their content come next. The Idempotency-Key is the same while the same kind+code is retried. */
export function NewItemModal({ accessToken, initialKind, onClose, onCreated }: { accessToken: string; initialKind: LibraryKind | ""; onClose: () => void; onCreated: (item: LibraryItem) => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<LibraryKind | "">(initialKind);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LibraryErrorView | null>(null);
  const [touched, setTouched] = useState(false);

  // The backend upper-cases the code before checking it, so the form shows exactly what will be stored.
  const stored = code.trim().toUpperCase();
  const codeError = !stored ? "Nhập mã mục." : !LIBRARY_LIMITS.codePattern.test(stored) ? "Mã gồm chữ không dấu, số, _ và -, bắt đầu bằng chữ hoặc số, tối đa 80 ký tự." : undefined;
  const kindError = kind ? undefined : "Chọn loại mục.";
  const taken = error?.code === "LIBRARY_CODE_EXISTS";

  const submit = async () => {
    setTouched(true);
    if (busy || codeError || !kind) return;
    setBusy(true);
    setError(null);
    const input = { kind, code: stored };
    const intent = { op: "library-create-item", ...input };
    try {
      const created = await libraryAdminApi.createItem(accessToken, input, commandKey(intent));
      commandDone(intent);
      toast.notify({ tone: "success", title: "Đã tạo mục thư viện", description: `${created.data.code} · ${kindLabel[created.data.kind]}. Tạo phiên bản đầu tiên để có nội dung.` });
      onCreated(created.data);
    } catch (cause) {
      setError(describeLibraryError(cause));
    } finally {
      setBusy(false);
    }
  };

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title="Thêm mục thư viện" description="Mục là khung chứa các phiên bản. Mã và loại không đổi được sau khi tạo; mục không bao giờ bị xóa, chỉ ngừng dùng."
    footer={<><Button variant="quiet" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy} onClick={() => void submit()} data-testid="create-item">{busy ? "Đang tạo…" : error?.kind === "retry" ? "Thử lại" : "Tạo mục"}</Button></>}>
    <form className="ops-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
      <Field label="Loại" required error={touched ? kindError : undefined} hint={kind ? kindHint[kind] : undefined}>
        {(props) => <Select {...props} value={kind} onChange={(event) => setKind(isScenarioKind(event.target.value) ? event.target.value : "")} data-testid="new-item-kind">
          <option value="">Chọn…</option>
          {SCENARIO_LIBRARY_KINDS.map((value) => <option key={value} value={value}>{kindLabel[value]}</option>)}
        </Select>}
      </Field>
      <Field label="Mã" required error={taken ? "Mã này đã được dùng." : touched ? codeError : undefined} hint={stored ? `Sẽ lưu là: ${stored}` : "Duy nhất, tự chuyển thành chữ hoa."}>
        {(props) => <Input {...props} value={code} maxLength={80} autoComplete="off" spellCheck={false} onChange={(event) => setCode(event.target.value)} data-testid="new-item-code" />}
      </Field>
      {error && !taken && <Alert tone={error.kind === "retry" ? "warning" : "danger"} title={error.title}>{error.message}{error.issues.length > 0 && ` ${error.issues.map(translateIssue).join(" ")}`}</Alert>}
    </form>
  </Modal>;
}
