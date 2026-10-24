"use client";

import { Copy, KeyRound, Lock, RefreshCw, ShieldOff } from "lucide-react";
import { useRef, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { buildingsApi } from "../api";
import { describeApiError } from "../format";
import type { BuildingAccess } from "../types";

type Action = { kind: "visibility"; to: "Private" | "Public" } | { kind: "rotate" } | { kind: "revoke" };

const copy: Record<Action["kind"], { title: string; confirm: string; impact: (action: Action, hasCode: boolean) => string }> = {
  visibility: {
    title: "Đổi chế độ truy cập?",
    confirm: "Đổi chế độ",
    impact: (action) => `Chuyển sang “${action.kind === "visibility" && action.to === "Public" ? "Công khai" : "Riêng tư"}” làm mất hiệu lực quyền tham gia của mọi học viên đã xác thực mã trước đó. ${action.kind === "visibility" && action.to === "Public" ? "Học viên đã đăng nhập sẽ vào được mà không cần mã." : "Học viên cần mã tham gia hiện hành để vào lại."}`,
  },
  rotate: {
    title: "Tạo mã tham gia mới?",
    confirm: "Tạo mã mới",
    impact: (_action, hasCode) => `${hasCode ? "Mã hiện tại sẽ ngừng hoạt động và " : ""}quyền của mọi học viên đã tham gia bằng mã cũ bị vô hiệu. Mã mới chỉ hiển thị MỘT LẦN ngay sau khi tạo; hãy sao chép và gửi cho học viên.`,
  },
  revoke: {
    title: "Thu hồi mã tham gia?",
    confirm: "Thu hồi mã",
    impact: () => "Mã hiện tại ngừng hoạt động và quyền của mọi học viên đã tham gia bằng mã bị vô hiệu. Công trình Riêng tư sẽ không có mã nào cho tới khi bạn tạo mã mới.",
  },
};

const visibilityOptions = [
  { value: "Private", label: "Riêng tư (cần mã tham gia)" },
  { value: "Public", label: "Công khai (chỉ cần đăng nhập)" },
];

/**
 * Figma "Truy cập · Quyền tham gia": left card = mode + apply; right card = participation code (create / rotate / revoke,
 * the new code shown once in its own dialog). Every change sends If-Match "access-<n>" and asks for confirmation first.
 */
export function BuildingAccessPanel({ accessToken, buildingId }: { accessToken: string; buildingId: string }) {
  const toast = useToast();
  const busy = useRef(false);
  const access = useAsyncData(`access:${buildingId}`, (signal) => buildingsApi.getAccess(accessToken, buildingId, signal));
  const [current, setCurrent] = useState<BuildingAccess | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"Private" | "Public" | "">("");

  const loaded = current ?? access.data ?? null;
  const selectedVisibility = visibility || (loaded?.visibility === "Public" ? "Public" : "Private");

  const run = async () => {
    if (busy.current || !pending || !loaded) return;
    busy.current = true;
    setWorking(true);
    setError("");
    try {
      let next: BuildingAccess;
      if (pending.kind === "visibility") next = await buildingsApi.updateAccess(accessToken, buildingId, pending.to, loaded.accessRevision);
      else if (pending.kind === "rotate") next = await buildingsApi.rotateParticipationCode(accessToken, buildingId, loaded.accessRevision);
      else next = await buildingsApi.revokeParticipationCode(accessToken, buildingId, loaded.accessRevision);
      // The code only exists in this response: keep it in memory, never in storage or the URL.
      const { code, ...rest } = next;
      setCurrent(rest);
      setVisibility("");
      setStale(false);
      setShownCode(pending.kind === "rotate" && code ? code : null);
      setPending(null);
      toast.notify({ tone: "success", title: pending.kind === "rotate" ? "Đã tạo mã tham gia mới" : pending.kind === "revoke" ? "Đã thu hồi mã tham gia" : "Đã đổi chế độ truy cập", description: "Quyền cũ của học viên đã bị vô hiệu." });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 412) {
        setPending(null);
        setStale(true);
      } else {
        setError(describeApiError(cause, "Không thể áp dụng thay đổi. Hãy thử lại."));
      }
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const reloadFresh = () => {
    setCurrent(null);
    setStale(false);
    setError("");
    access.reload();
  };

  const copyCode = async () => {
    if (!shownCode) return;
    try {
      await navigator.clipboard.writeText(shownCode);
      toast.notify({ tone: "success", title: "Đã sao chép mã tham gia" });
    } catch {
      toast.notify({ tone: "warning", title: "Không sao chép tự động được", description: "Hãy chọn mã và sao chép thủ công." });
    }
  };

  if (access.loading && !loaded) return <div className="bd-access"><div className="org-card"><Skeleton style={{ height: 160 }} /></div><div className="org-card"><Skeleton style={{ height: 120 }} /></div></div>;
  if (access.error !== undefined && !loaded) {
    return <div className="org-card"><Alert tone="danger" title="Không tải được cài đặt truy cập" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reloadFresh}>Thử lại</Button>}>{describeApiError(access.error, "Hãy thử lại sau.")}</Alert></div>;
  }
  if (!loaded) return null;

  const isPublic = loaded.visibility === "Public";
  const visibilityDirty = selectedVisibility !== (isPublic ? "Public" : "Private");

  return <div className="ops-stack">
    {stale && <Alert tone="warning" title="Cài đặt truy cập đã thay đổi" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reloadFresh}><RefreshCw size={14} aria-hidden="true" />Tải bản mới</Button>}>Có người khác vừa đổi chế độ hoặc mã tham gia. Chưa có thay đổi nào của bạn được áp dụng; hãy tải bản mới rồi thao tác lại.</Alert>}
    {error && !pending && <Alert tone="danger">{error}</Alert>}

    <div className="bd-access">
      <section className="org-card" aria-labelledby="bd-access-title">
        <h2 id="bd-access-title" className="org-card-title">Quyền tham gia</h2>
        <p className="org-card-sub">Quy định ai được vào công trình để tập huấn.</p>
        <dl className="jr-kv bd-access-kv">
          <div><dt>Chế độ</dt><dd><StatusBadge tone={isPublic ? "info" : "neutral"}>{isPublic ? "Công khai" : "Riêng tư"}</StatusBadge></dd></div>
          <div><dt>Mã tham gia</dt><dd>{loaded.hasParticipationCode ? <StatusBadge tone="success">Đang có mã</StatusBadge> : <StatusBadge tone="neutral">Chưa có mã</StatusBadge>}</dd></div>
          <div><dt>Phiên bản quyền</dt><dd>{loaded.accessRevision}</dd></div>
        </dl>
        <div className="bd-access-mode">
          <Field label="Chế độ truy cập">{(p) => <Combobox {...p} value={selectedVisibility} options={visibilityOptions} groupLabel="Chế độ" searchPlaceholder="Tìm…" onChange={(value) => setVisibility(value as "Private" | "Public")} aria-label="Chế độ truy cập" />}</Field>
          <Button variant="secondary" disabled={!visibilityDirty || working} onClick={() => { setError(""); setPending({ kind: "visibility", to: selectedVisibility }); }}>Áp dụng chế độ</Button>
        </div>
        <p className="ops-muted">Riêng tư: học viên đăng nhập và nhập mã tham gia hiện hành. Công khai: học viên chỉ cần đăng nhập. QR không cấp quyền. Đổi chế độ hoặc mã làm vô hiệu quyền đã cấp.</p>
      </section>

      <section className="org-card" aria-labelledby="bd-code-title">
        <div className="org-row">
          <div><h2 id="bd-code-title" className="org-card-title" style={{ marginBottom: 2 }}>Mã tham gia</h2><p className="org-card-sub" style={{ margin: 0 }}>Mã chung do tổ chức cung cấp cho học viên.</p></div>
          <Button onClick={() => { setError(""); setPending({ kind: "rotate" }); }} disabled={working}><KeyRound size={16} aria-hidden="true" />{loaded.hasParticipationCode ? "Tạo mã mới" : "Tạo mã tham gia"}</Button>
        </div>
        {shownCode ? <div className="ops-stack" style={{ marginTop: 14 }}>
          <Alert tone="warning" title="Mã này chỉ hiển thị một lần">Hệ thống không lưu mã ở dạng đọc lại được. Sao chép và gửi cho học viên ngay; rời trang hoặc ẩn khung này là không xem lại được.</Alert>
          <div className="ops-code-box"><code data-testid="participation-code">{shownCode}</code><Button variant="secondary" onClick={() => void copyCode()}><Copy size={16} aria-hidden="true" />Sao chép</Button></div>
          <div className="ops-actions"><Button variant="quiet" onClick={() => setShownCode(null)}>Tôi đã lưu mã, ẩn đi</Button></div>
        </div> : <div className="bd-confirm-state" data-tone="locked" style={{ marginTop: 14 }}><Lock size={16} aria-hidden="true" /><div><strong>{loaded.hasParticipationCode ? "Đang có mã; hệ thống không hiển thị lại mã cũ." : "Chưa có mã."}</strong><span>Mã chỉ hiển thị một lần ngay sau khi tạo — bạn sẽ sao chép trong hộp thoại.</span></div></div>}
        {loaded.hasParticipationCode && <div className="ops-actions" style={{ marginTop: 14 }}><Button variant="quiet" onClick={() => { setError(""); setPending({ kind: "revoke" }); }} disabled={working}><ShieldOff size={16} aria-hidden="true" />Thu hồi mã</Button></div>}
      </section>
    </div>

    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => { if (!open && !working) setPending(null); }}
      tone={pending?.kind === "revoke" ? "danger" : "primary"}
      title={pending ? copy[pending.kind].title : ""}
      description={pending ? copy[pending.kind].impact(pending, loaded.hasParticipationCode) : undefined}
      confirmLabel={pending ? copy[pending.kind].confirm : ""}
      busy={working}
      onConfirm={run}
    >
      {error ? <Alert tone="danger">{error}</Alert> : <p className="ops-muted">Thao tác này có hiệu lực ngay và không thể hoàn tác.</p>}
    </ConfirmDialog>
  </div>;
}
