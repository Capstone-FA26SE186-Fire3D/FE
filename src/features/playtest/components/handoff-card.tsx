"use client";

import { Copy, QrCode as QrIcon, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useIdempotencyKey } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/ui/qr-code";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import { playtestApi } from "../api";
import { describePlaytestError, outcomeIsUnknown, type PlaytestErrorView } from "../errors";
import { canIssueHandoff, formatCountdown, isPlaytestTerminal, msUntil } from "../status";
import type { PlaytestHandoff, PlaytestStatus } from "../types";
import { useNow } from "../use-now";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Short-lived Mobile handoff. The QR encodes exactly the `deepLink` BE returned (an opaque one-time code, 5 minutes): no
 * credential, package or permission is added by Web. The code exists only in this component's memory: after a reload the
 * server still reports the open handoff (`openHandoffExpiresAt`) but cannot show the code again, so a new one is issued.
 */
export function HandoffCard({ accessToken, playtest, canAct, onIssued }: {
  accessToken: string;
  playtest: PlaytestStatus;
  canAct: boolean;
  /** Re-read the playtest after a new code so `openHandoffExpiresAt` is current. */
  onIssued: () => void;
}) {
  const toast = useToast();
  const key = useIdempotencyKey();
  const [handoff, setHandoff] = useState<PlaytestHandoff | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlaytestErrorView | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);

  const issuable = canIssueHandoff(playtest);
  const held = handoff && handoff.playtestId === playtest.id ? handoff : undefined;
  const serverOpen = playtest.openHandoffExpiresAt;
  const watchClock = Boolean(held || serverOpen || blockedUntil);
  const now = useNow(watchClock);

  const codeLeft = held ? msUntil(held.expiresAt, now) : undefined;
  const codeLive = Boolean(held && codeLeft !== undefined && codeLeft > 0 && issuable);
  const serverLeft = msUntil(serverOpen, now);
  const serverOpenLive = serverLeft !== undefined && serverLeft > 0;
  const blocked = blockedUntil > now;
  const terminal = isPlaytestTerminal(playtest.status);

  const issue = async () => {
    if (busy || !canAct || !issuable || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const created = await playtestApi.createHandoff(accessToken, playtest.id, key.keyFor({ playtestId: playtest.id }));
      key.done();
      setHandoff(created);
      onIssued();
    } catch (cause) {
      const view = describePlaytestError(cause);
      setError(view);
      if (!outcomeIsUnknown(cause)) key.done();
      if (view.retryAfterSeconds) setBlockedUntil(Date.now() + view.retryAfterSeconds * 1000);
      if (view.code === "PLAYTEST_HANDOFF_NOT_RECOVERABLE") setHandoff(undefined);
    } finally {
      setBusy(false);
    }
  };

  const copyValue = async (value: string, what: string) => {
    toast.notify(await copy(value) ? { tone: "success", title: `Đã sao chép ${what}` } : { tone: "warning", title: "Không sao chép được", description: "Trình duyệt chặn truy cập clipboard. Hãy quét QR." });
  };

  if (terminal) return null;

  const label = held || serverOpen ? "Cấp lại mã" : "Tạo mã chuyển sang Mobile";

  return <section className="pt-card" aria-labelledby="pt-handoff-title" data-testid="handoff-card">
    <h3 id="pt-handoff-title" className="ver-section-title"><QrIcon size={16} aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: 6 }} />Chuyển sang Mobile</h3>

    {!issuable && <p className="ver-note">{playtest.boundToMobile
      ? "Một phiên Mobile đã nhận mã và giữ playtest này. Web không cấp thêm mã và không bắt đầu thay Mobile."
      : "Playtest đã bắt đầu trên thiết bị: mã chuyển chỉ cấp được trước khi bắt đầu."}</p>}

    {issuable && codeLive && held && <div className="pt-qr-row">
      <div className="pt-qr-frame"><QrCode value={held.deepLink} size={192} label="Mã QR chuyển playtest sang Mobile" /></div>
      <div className="pt-qr-meta">
        <p className="ver-note"><strong>Quét bằng ứng dụng Mobile</strong> đã đăng nhập cùng tài khoản. Mã dùng một lần, không chứa quyền truy cập.</p>
        <div className="pt-countdown" data-testid="handoff-countdown"><span>Hết hạn sau</span><strong>{formatCountdown(codeLeft ?? 0)}</strong></div>
        <p className="ver-note">Mã dự phòng</p>
        <code className="ver-hash pt-code" data-testid="handoff-code">{held.code}</code>
        <div className="ver-actions-row">
          <Button size="sm" variant="secondary" onClick={() => void copyValue(held.code, "mã")}><Copy size={14} aria-hidden="true" />Sao chép mã</Button>
          <Button size="sm" variant="secondary" onClick={() => void copyValue(held.deepLink, "liên kết")}><Copy size={14} aria-hidden="true" />Sao chép liên kết</Button>
        </div>
      </div>
    </div>}

    {issuable && !codeLive && held && <Alert tone="warning" title="Mã đã hết hạn">Mã chỉ có hiệu lực 5 phút. Cấp lại mã để có QR mới; mã cũ không dùng được nữa.</Alert>}
    {issuable && !held && serverOpenLive && <Alert tone="info" title="Đang có một mã mở">Máy chủ báo có mã còn hiệu lực đến {new Date(serverOpen as string).toLocaleTimeString("vi-VN")}, nhưng mã chỉ hiển thị một lần lúc tạo nên không thể xem lại. Cấp lại mã sẽ thay mã đó.</Alert>}
    {issuable && !held && !serverOpenLive && <p className="ver-note">Chưa có mã đang mở. Tạo mã để hiện QR cho ứng dụng Mobile. Tạo mã không trừ lượt dùng thử.</p>}

    {error && <Alert tone="danger" title={error.title} className="pt-error">
      {error.message}{error.retryAfterSeconds ? ` Thử lại sau ${error.retryAfterSeconds} giây.` : ""}
      {error.code && <span className="pt-code-tag"> Mã lỗi: {error.code}</span>}
    </Alert>}

    {issuable && <div className="ver-actions-row" style={{ marginTop: 12 }}>
      <Button onClick={() => void issue()} disabled={busy || !canAct || blocked}>
        <RefreshCw size={16} aria-hidden="true" className={busy ? "pt-spin" : undefined} />{busy ? "Đang tạo mã…" : label}
      </Button>
      {blocked && <StatusBadge tone="warning">Chờ {Math.max(1, Math.ceil((blockedUntil - now) / 1000))} giây</StatusBadge>}
    </div>}
  </section>;
}
