"use client";

import { Copy, History, Printer, QrCode as QrIcon, RefreshCw, ShieldOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { QrCode } from "@/components/ui/qr-code";
import { isLocalOrigin, qrLandingUrl, resolveQrLandingOrigin } from "@/features/qr-landing/token";
import { formatDateTime, isStatus } from "../format";
import { buildingQrApi, type BuildingQrCode } from "../qr-api";
import { QrPrintSheet } from "./qr-print-sheet";
import "../qr.css";

const LABEL_MAX = 255;
const PRINT_FLAG = "printQr";

type Action = { kind: "create" } | { kind: "rotate"; code: BuildingQrCode } | { kind: "revoke"; code: BuildingQrCode };
/** The one-time token lives only in this state (RAM): never in storage, the URL or a log. */
type Issued = { token: string; url: string; label: string | null; kind: "created" | "rotated"; localOrigin: boolean };
type Notice = { tone: "warning" | "danger" | "info"; title: string; text: string };

const copy = {
  create: { title: "Tạo mã QR cho công trình?", confirm: "Tạo mã QR", impact: "Công trình sẽ có một mã QR đang hoạt động. Mã chỉ hiển thị MỘT LẦN ngay sau khi tạo: hệ thống không lưu mã ở dạng đọc lại được. QR chỉ xác định công trình, không cấp quyền tham gia." },
  rotate: { title: "Tạo lại mã QR?", confirm: "Tạo mã mới", impact: "QR hiện tại ngừng hoạt động NGAY: ai quét mã đã in hoặc đã dán sẽ không mở được công trình, bạn phải thay bằng mã mới. Mã mới chỉ hiển thị MỘT LẦN. Quyền tham gia đã cấp cho học viên thuộc công trình và mã tham gia vẫn giữ nguyên." },
  revoke: { title: "Thu hồi mã QR?", confirm: "Thu hồi mã", impact: "QR hiện tại ngừng hoạt động NGAY và công trình không còn mã QR nào cho tới khi bạn tạo mã mới. Đây là thu hồi do quản trị, khác với hết hạn dịch vụ. Quyền tham gia đã cấp cho học viên và mã tham gia vẫn giữ nguyên." },
} as const;

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    if (error.status === 403) return "Tài khoản này không có quyền quản lý mã QR.";
    if (error.status === 404) return "Không tìm thấy công trình hoặc mã QR. Có thể chúng đã bị xóa hoặc không thuộc tổ chức của bạn.";
    if (error.status === 429 || error.status === 503) return error.retryAfterSeconds ? `Hệ thống đang bận. Hãy thử lại sau ${error.retryAfterSeconds} giây.` : "Hệ thống đang bận. Hãy thử lại sau ít phút.";
    if (error.status >= 500) return "Máy chủ gặp lỗi. Hãy thử lại sau.";
    return error.fieldMessage("label") ?? "Yêu cầu không hợp lệ. Hãy kiểm tra lại nhãn (tối đa 255 ký tự).";
  }
  if (error instanceof TypeError) return "Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.";
  return "Không thể hoàn tất thao tác. Hãy thử lại.";
}

function codeNote(code: BuildingQrCode) {
  if (code.status === "Active") return code.replacedId ? "Tạo khi tạo lại mã" : "Mã hiện hành";
  return code.replacedBy ? "Đã thay bằng mã mới" : "Đã thu hồi";
}

/**
 * Figma "Truy cập · Mã QR": the Active code card (or an empty state with "Tạo mã QR"), the one-time view + print of a
 * freshly issued code, "Lịch sử mã" in a drawer (never the token), create / rotate / revoke behind an impact confirmation.
 * The QR encodes `<origin>/qr/<token>`; it identifies the Building and grants nothing.
 */
export function QrPanel({ accessToken, buildingId, buildingName }: { accessToken: string; buildingId: string; buildingName: string }) {
  const toast = useToast();
  const busy = useRef(false);
  const list = useAsyncData(`qr-codes:${buildingId}`, (signal) => buildingQrApi.list(accessToken, buildingId, 1, 100, signal));
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [label, setLabel] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const hasIssued = issued !== null;
  useEffect(() => {
    // The token cannot be read again: warn before the tab closes while it is still on screen.
    if (!hasIssued) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasIssued]);

  useEffect(() => {
    const clear = () => { delete document.documentElement.dataset[PRINT_FLAG]; };
    window.addEventListener("afterprint", clear);
    return () => { window.removeEventListener("afterprint", clear); clear(); };
  }, []);

  const items = list.data?.items ?? [];
  const active = items.find((item) => item.status === "Active") ?? null;

  const open = (action: Action) => { setError(""); setLabel(""); setPending(action); };
  const close = () => { if (!working) { setPending(null); setError(""); } };

  const run = async () => {
    if (busy.current || !pending) return;
    busy.current = true;
    setWorking(true);
    setError("");
    const wanted = label.trim() || null;
    try {
      if (pending.kind === "revoke") {
        await buildingQrApi.revoke(accessToken, buildingId, pending.code.id);
        setIssued(null);
        setNotice(null);
        toast.notify({ tone: "success", title: "Đã thu hồi mã QR", description: "QR cũ đã ngừng hoạt động." });
      } else {
        const result = pending.kind === "create"
          ? await buildingQrApi.create(accessToken, buildingId, wanted)
          : await buildingQrApi.rotate(accessToken, buildingId, pending.code.id, wanted);
        const url = qrLandingUrl(resolveQrLandingOrigin(window.location.origin), result.token);
        setIssued({ token: result.token, url, label: result.code.label ?? wanted, kind: pending.kind === "create" ? "created" : "rotated", localOrigin: isLocalOrigin(url) });
        setNotice(null);
        toast.notify({ tone: "success", title: pending.kind === "create" ? "Đã tạo mã QR" : "Đã tạo mã QR mới", description: pending.kind === "rotate" ? "QR cũ đã ngừng hoạt động." : undefined });
      }
      setPending(null);
      list.reload();
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : undefined;
      if (cause instanceof ApiError && cause.status === 409) {
        setPending(null);
        list.reload();
        setNotice(code === "QR_ALREADY_EXISTS"
          ? { tone: "warning", title: "Công trình đã có mã QR đang hoạt động", text: "Không thể tạo thêm: mỗi công trình chỉ có một mã đang hoạt động. Có thể đồng nghiệp vừa tạo, hoặc lần tạo trước đã thành công nhưng bạn chưa nhận được phản hồi. Mã không đọc lại được; hãy dùng “Tạo mã mới” để nhận QR mới." }
          : { tone: "warning", title: "Mã này đã bị thu hồi hoặc thay thế", text: "Danh sách đã được tải lại. Chưa có thay đổi nào khác được áp dụng." });
      } else if (cause instanceof TypeError) {
        // The request may have reached the server: the token of a lost response cannot be recovered, only replaced.
        setPending(null);
        list.reload();
        setNotice({ tone: "warning", title: "Chưa nhận được phản hồi từ máy chủ", text: "Mã có thể đã được tạo nhưng token không thể xem lại. Kiểm tra lịch sử mã; nếu đã có mã hoạt động mà bạn chưa lưu, hãy dùng “Tạo mã mới”." });
      } else {
        setError(errorText(cause));
      }
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const copyLink = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      toast.notify({ tone: "success", title: "Đã sao chép liên kết QR" });
    } catch {
      toast.notify({ tone: "warning", title: "Không sao chép tự động được", description: "Hãy chọn liên kết và sao chép thủ công." });
    }
  };

  const print = () => {
    document.documentElement.dataset[PRINT_FLAG] = "true";
    window.print();
  };

  if (list.loading && !list.data) return <div className="org-card"><Skeleton style={{ height: 180 }} /></div>;
  if (list.error !== undefined && !list.data) {
    const gone = isStatus(list.error, 404);
    return <div className="org-card"><Alert tone={gone ? "warning" : "danger"} title={gone ? "Không tìm thấy công trình" : "Không tải được mã QR"} action={gone ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}><RefreshCw size={14} aria-hidden="true" />Thử lại</Button>}>{errorText(list.error)}</Alert></div>;
  }

  return <div className="ops-stack">
    {notice && <Alert tone={notice.tone} title={notice.title}>{notice.text}</Alert>}
    {list.error !== undefined && list.data && <Alert tone="warning" title="Dữ liệu có thể đã cũ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Tải lại danh sách</Button>}>Không làm mới được danh sách mã. Đang hiển thị lần tải gần nhất.</Alert>}

    {issued && <section className="org-card" data-testid="qr-issued" aria-labelledby="qr-issued-title">
      <h2 id="qr-issued-title" className="org-card-title">{issued.kind === "created" ? "Mã QR mới" : "Mã QR mới (đã thay mã cũ)"}</h2>
      <div className="ops-stack">
        <Alert tone="warning" title="Mã này chỉ hiển thị một lần">Hệ thống chỉ lưu dấu băm của mã, nên không xem lại được. In hoặc sao chép liên kết ngay. Rời tab, tải lại trang hoặc bấm “Ẩn mã” là mất; khi đó chỉ có thể tạo mã mới và mã hiện tại sẽ ngừng hoạt động.{issued.kind === "rotated" ? " QR cũ đã ngừng hoạt động: hãy thay mọi bản in cũ." : ""}</Alert>
        {issued.localOrigin && <Alert tone="info" title="Liên kết đang trỏ về máy của bạn">QR này mở {new URL(issued.url).origin}, chỉ truy cập được trên mạng hiện tại. Hãy tạo mã khi đang dùng địa chỉ chính thức của FET3D để in ra dùng thật.</Alert>}
        <div className="qr-issued-body">
          <div className="qr-frame"><QrCode value={issued.url} size={220} label={`Mã QR của ${buildingName}`} /></div>
          <div className="ops-stack">
            <p className="ops-muted">QR mở trang của công trình trên FET3D. Người học đăng nhập, xem các bài đã phát hành rồi bắt đầu trong ứng dụng; QR không cấp quyền.</p>
            <div className="ops-code-box"><code data-testid="qr-link">{issued.url}</code><Button variant="secondary" onClick={() => void copyLink()}><Copy size={16} aria-hidden="true" />Sao chép liên kết</Button></div>
            <div className="ops-actions">
              <Button onClick={print}><Printer size={16} aria-hidden="true" />In mã QR</Button>
              <Button variant="quiet" onClick={() => setIssued(null)}>Ẩn mã</Button>
            </div>
          </div>
        </div>
      </div>
    </section>}
    {issued && <QrPrintSheet buildingName={buildingName} label={issued.label} url={issued.url} />}

    <section className="org-card" aria-labelledby="qr-title">
      <div className="org-row" style={{ marginBottom: 14 }}>
        <div><h2 id="qr-title" className="org-card-title" style={{ marginBottom: 2 }}>Mã QR công trình</h2><p className="org-card-sub" style={{ margin: 0 }}>Một mã cố định cho mỗi công trình. QR chỉ xác định công trình và không cấp quyền.</p></div>
        <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)} data-testid="qr-history-open"><History size={14} aria-hidden="true" />Lịch sử mã{items.length ? ` (${items.length})` : ""}</Button>
      </div>
      {active ? <div className="bd-qr-active">
        <div className="bd-qr-active-icon" aria-hidden="true"><QrIcon size={28} /></div>
        <dl className="jr-kv">
          <div><dt>Trạng thái</dt><dd><StatusBadge tone="success">Đang hoạt động</StatusBadge></dd></div>
          <div><dt>Nhãn</dt><dd>{active.label || "—"}</dd></div>
          <div><dt>Tạo lúc</dt><dd>{formatDateTime(active.createdAt)}</dd></div>
        </dl>
        <p className="ops-muted">Hệ thống không lưu token ở dạng đọc lại được, nên không in lại được mã đang hoạt động. Cần bản in mới thì tạo mã mới: mã hiện tại sẽ ngừng hoạt động ngay.</p>
        <div className="ops-actions">
          <Button onClick={() => open({ kind: "rotate", code: active })} disabled={working}><RefreshCw size={16} aria-hidden="true" />Tạo mã mới</Button>
          <Button variant="quiet" onClick={() => open({ kind: "revoke", code: active })} disabled={working}><ShieldOff size={16} aria-hidden="true" />Thu hồi mã</Button>
        </div>
      </div> : <EmptyState icon={QrIcon} title="Công trình chưa có mã QR đang hoạt động" description={items.length ? "Mã trước đó đã bị thu hồi. Tạo mã mới để người học quét được lại." : "Tạo mã QR để in và dán tại công trình. Mã chỉ hiển thị một lần ngay sau khi tạo."} action={<Button onClick={() => open({ kind: "create" })} disabled={working}><QrIcon size={16} aria-hidden="true" />Tạo mã QR</Button>} />}
    </section>

    <Drawer open={historyOpen} onOpenChange={setHistoryOpen} size="md" title="Lịch sử mã QR" description="Không hiển thị token. Mới nhất ở trên." flush>
      {items.length === 0 ? <p className="ops-muted" style={{ padding: 20 }}>Chưa có mã nào được tạo cho công trình này.</p> : <Table className="qr-table" caption="Lịch sử mã QR của công trình">
        <thead><tr><th>Nhãn</th><th>Trạng thái</th><th>Tạo lúc</th><th>Thu hồi lúc</th><th>Ghi chú</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td>{item.label || "—"}</td>
          <td><StatusBadge tone={item.status === "Active" ? "success" : "neutral"}>{item.status === "Active" ? "Đang hoạt động" : item.status === "Revoked" ? "Đã thu hồi" : item.status}</StatusBadge></td>
          <td>{formatDateTime(item.createdAt)}</td>
          <td>{formatDateTime(item.revokedAt)}</td>
          <td>{codeNote(item)}</td>
        </tr>)}</tbody>
      </Table>}
      {list.data && list.data.total > items.length && <p className="ops-muted" style={{ padding: "0 20px 20px" }}>Đang hiển thị {items.length} / {list.data.total} mã gần nhất.</p>}
    </Drawer>

    <Modal
      open={pending !== null}
      onOpenChange={(next) => { if (!next) close(); }}
      size="sm"
      title={pending ? copy[pending.kind].title : ""}
      description={pending ? copy[pending.kind].impact : undefined}
      className={pending?.kind === "revoke" ? "ops-dialog--danger" : undefined}
      footer={<><Button variant="ghost" onClick={close} disabled={working}>Hủy</Button><Button variant={pending?.kind === "revoke" ? "danger" : "primary"} onClick={() => void run()} disabled={working}>{working ? "Đang xử lý…" : pending ? copy[pending.kind].confirm : ""}</Button></>}
    >
      <div className="ops-stack">
        {pending && pending.kind !== "revoke" && <Field label="Nhãn (không bắt buộc)" hint={pending.kind === "rotate" ? "Để trống để giữ nhãn hiện tại." : "Ví dụ: Sảnh chính tầng 1."}>{(p) => <Input {...p} value={label} maxLength={LABEL_MAX} disabled={working} onChange={(event) => setLabel(event.target.value)} />}</Field>}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  </div>;
}
