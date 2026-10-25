"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { qrLandingApi } from "../api";

const CODE_MIN = 8;
const CODE_MAX = 128;

type Wait = { until: number; seconds: number };

/**
 * Private Building: the Trainee enters the shared participation code. The code lives only in this input's state, is
 * sent once to `participation/verify` and is never written to storage, the URL or a message. The caller re-reads the
 * QR resolution after success; this form never decides access itself.
 */
export function ParticipationForm({ accessToken, buildingId, onVerified, onSessionLost }: {
  accessToken: string;
  buildingId: string;
  onVerified: () => void;
  onSessionLost: () => void;
}) {
  const busy = useRef(false);
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [wait, setWait] = useState<Wait | null>(null);

  const waitUntil = wait?.until;
  useEffect(() => {
    if (!waitUntil) return;
    const timer = window.setInterval(() => {
      setWait((current) => {
        if (!current) return null;
        const seconds = Math.max(0, Math.ceil((current.until - Date.now()) / 1000));
        return seconds ? { ...current, seconds } : null;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [waitUntil]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || wait) return;
    const value = code.trim();
    if (value.length < CODE_MIN || value.length > CODE_MAX || /\s/.test(value)) {
      setError("");
      setFieldError(`Mã tham gia gồm ${CODE_MIN}–${CODE_MAX} ký tự và không có khoảng trắng.`);
      return;
    }
    busy.current = true;
    setWorking(true);
    setError("");
    setFieldError("");
    try {
      await qrLandingApi.verifyParticipation(accessToken, buildingId, value);
      setCode("");
      onVerified();
    } catch (cause) {
      if (!(cause instanceof ApiError)) {
        setError("Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.");
      } else if (cause.status === 401) {
        setCode("");
        onSessionLost();
      } else if (cause.status === 400 && cause.code === "PARTICIPATION_CODE_INVALID") {
        setFieldError("Mã tham gia không đúng hoặc tổ chức đã đổi mã. Hãy hỏi lại mã hiện hành.");
      } else if (cause.status === 400) {
        setFieldError(cause.fieldMessage("code") ?? `Mã tham gia gồm ${CODE_MIN}–${CODE_MAX} ký tự và không có khoảng trắng.`);
      } else if (cause.status === 429 || cause.status === 503) {
        const seconds = cause.retryAfterSeconds ?? (cause.status === 429 ? 30 : 10);
        setWait({ until: Date.now() + seconds * 1000, seconds });
        setError(cause.status === 429 ? "Bạn đã thử quá nhiều lần. Hãy đợi rồi nhập lại." : "Hệ thống đang bận. Hãy đợi một chút rồi thử lại.");
      } else if (cause.status === 403) {
        setError("Chỉ tài khoản học viên mới nhập được mã tham gia.");
      } else if (cause.status === 404) {
        setError("Không tìm thấy công trình. Mã QR có thể đã bị thay đổi; hãy quét lại.");
      } else {
        setError("Máy chủ gặp lỗi. Hãy thử lại sau.");
      }
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  return <Panel title="Nhập mã tham gia" description="Công trình này ở chế độ Riêng tư. QR chỉ xác định công trình, không cấp quyền." bodyClassName="ops-stack">
    <form className="ops-stack" onSubmit={(event) => void submit(event)} noValidate>
      <Field label="Mã tham gia" hint="Do tổ chức quản lý công trình cung cấp. Mã không được lưu lại trên trình duyệt." error={fieldError} required>
        {(p) => <Input {...p} name="participation-code" value={code} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} disabled={working} onChange={(event) => { setCode(event.target.value); setFieldError(""); }} />}
      </Field>
      {error && <Alert tone={wait ? "warning" : "danger"}>{error}{wait ? ` Thử lại sau ${wait.seconds} giây.` : ""}</Alert>}
      <div className="ops-actions">
        <Button type="submit" disabled={working || wait !== null || code.trim() === ""}><KeyRound size={16} aria-hidden="true" />{working ? "Đang xác minh…" : wait ? `Chờ ${wait.seconds}s` : "Xác minh mã"}</Button>
      </div>
    </form>
  </Panel>;
}
