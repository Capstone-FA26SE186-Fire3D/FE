"use client";

import { ArrowLeft, FilePlus2, Library } from "lucide-react";
import { useState } from "react";

import { commandDone, commandKey } from "@/api/command-keys";
import { useAsyncData } from "@/api/use-async-data";
import { DetailList, formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { libraryAdminApi } from "@/features/library/api";
import { describeLibraryError, type LibraryErrorView } from "@/features/library/errors";
import { formFromVersion, type VersionForm } from "@/features/library/payload";
import { kindLabel, type LibraryItem, type LibraryVersion, type WithEtag } from "@/features/library/types";
import { VersionEditor } from "./version-editor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The state of the new-version form: blank, a copy of an earlier version, or the author's own unsaved content. */
type NewSeed = { form: VersionForm | null; from: string | null };

/**
 * One item: its state, activation, version list and the open version. URL: `?item=<id>&version=<id|new>`. The item is read with
 * its ETag (the item revision), which PATCH carries as If-Match; versions carry their own ETag.
 */
export function ItemDetail({ accessToken, itemId, versionParam, onVersion, onBack, onListChanged }: {
  accessToken: string;
  itemId: string;
  versionParam: string;
  onVersion: (versionId: string | null) => void;
  onBack: () => void;
  onListChanged: () => void;
}) {
  const toast = useToast();
  const [rev, setRev] = useState(0);
  const [versionRev, setVersionRev] = useState(0);
  const [seed, setSeed] = useState<NewSeed>({ form: null, from: null });
  const [toggle, setToggle] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState<LibraryErrorView | null>(null);

  const itemQuery = useAsyncData<WithEtag<LibraryItem>>(`library-item:${itemId}:${rev}`, (signal) => libraryAdminApi.getItem(accessToken, itemId, signal));
  const wantsVersion = UUID.test(versionParam);
  const versionQuery = useAsyncData<WithEtag<LibraryVersion>>(`library-version:${versionParam}:${versionRev}`, (signal) => libraryAdminApi.getVersion(accessToken, versionParam, signal), wantsVersion);

  // The query keeps the previous version while the next one loads; only a version that matches the URL is shown.
  const loaded = versionQuery.data && versionQuery.data.data.id === versionParam ? versionQuery.data : undefined;
  const reloadItem = () => { setRev((value) => value + 1); onListChanged(); };
  const back = <div><Button variant="quiet" size="sm" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Button></div>;

  if (itemQuery.error !== undefined && !itemQuery.data) {
    const view = describeLibraryError(itemQuery.error);
    if (view.kind === "notFound") return <div className="ops-stack">{back}<EmptyState icon={Library} title="Không tìm thấy mục" description="Mục không tồn tại hoặc đường dẫn không đúng." /></div>;
    return <div className="ops-stack">{back}<Alert tone="danger" title="Không tải được mục thư viện" action={<Button size="sm" variant="secondary" className="mt-3" onClick={itemQuery.reload}>Thử lại</Button>}>{view.message}</Alert></div>;
  }
  if (!itemQuery.data) return <div className="ops-stack">{back}<SkeletonRows rows={6} label="Đang tải mục thư viện…" /></div>;

  const item = itemQuery.data.data;
  const etag = itemQuery.data.etag;
  const versions = [...item.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const draftCount = versions.filter((entry) => entry.status === "Draft").length;
  const publishedId = item.latestPublished?.id ?? null;

  const startNew = (form: VersionForm | null, from: LibraryVersion | null) => {
    setSeed({ form: form ?? (from ? formFromVersion(from) : null), from: from ? `v${from.versionNumber}` : form ? "nội dung đang soạn" : null });
    onVersion("new");
  };

  const runToggle = async () => {
    if (toggleBusy) return;
    setToggleBusy(true);
    setToggleError(null);
    const next = !item.isActive;
    const intent = { op: "library-item-active", itemId: item.id, etag, isActive: next };
    try {
      await libraryAdminApi.updateItem(accessToken, item.id, { isActive: next }, etag, commandKey(intent));
      commandDone(intent);
      setToggle(false);
      reloadItem();
      toast.notify({ tone: "success", title: next ? "Đã dùng lại mục" : "Đã ngừng dùng mục", description: item.code });
    } catch (cause) {
      const view = describeLibraryError(cause);
      setToggleError(view);
      if (view.kind === "stale") reloadItem();
    } finally {
      setToggleBusy(false);
    }
  };

  return <div className="ops-stack" data-testid="item-detail">
    {back}
    <Panel title={item.code} description={`${kindLabel[item.kind]} · ETag mục ${etag}`}
      actions={<>
        <StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang dùng" : "Ngừng dùng"}</StatusBadge>
        <Button variant="secondary" onClick={() => { setToggleError(null); setToggle(true); }} data-testid="toggle-active">{item.isActive ? "Ngừng dùng" : "Dùng lại"}</Button>
        <Button onClick={() => startNew(null, null)} data-testid="new-version"><FilePlus2 size={16} aria-hidden="true" />Tạo phiên bản</Button>
      </>} bodyClassName="ops-stack">
      <DetailList items={[
        { label: "Bản tổ chức đang thấy", value: item.latestPublished ? `v${item.latestPublished.versionNumber} · ${item.latestPublished.name}` : "Chưa có bản đã xuất bản" },
        { label: "Phiên bản", value: `${versions.length} (${draftCount} bản nháp)` },
        { label: "Cập nhật", value: formatDateTime(item.updatedAt) },
      ]} />
      {!item.isActive && <Alert tone="warning" title="Mục đang ngừng dùng">Tổ chức không thấy mục này khi chọn mẫu mới. Các phiên bản đã xuất bản vẫn đọc được theo mã để những kịch bản đã dùng không bị ảnh hưởng.</Alert>}
      {item.isActive && !item.latestPublished && <Alert tone="info" title="Tổ chức chưa thấy mục này">Mục chỉ hiện cho tổ chức khi có ít nhất một phiên bản đã xuất bản.</Alert>}
    </Panel>

    <Panel title="Phiên bản" description="Bản đã xuất bản là bất biến; mỗi lần đổi nội dung tạo một phiên bản mới." bodyClassName="ops-stack">
      {versions.length === 0
        ? <EmptyState icon={FilePlus2} title="Chưa có phiên bản nào" description="Tạo phiên bản đầu tiên, nhập nội dung rồi xuất bản để tổ chức dùng được." action={<Button size="sm" onClick={() => startNew(null, null)}>Tạo phiên bản</Button>} />
        : <Table caption="Các phiên bản của mục">
          <thead><tr><th>Phiên bản</th><th>Tên</th><th>Trạng thái</th><th>Xuất bản</th><th aria-label="Thao tác" /></tr></thead>
          <tbody>{versions.map((entry) => <tr key={entry.id} data-testid={`version-row-${entry.versionNumber}`}>
            <td className="ops-cell-primary">v{entry.versionNumber}</td>
            <td style={{ overflowWrap: "anywhere", minWidth: 200 }}>{entry.name}</td>
            <td><span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}><StatusBadge tone={entry.status === "Published" ? "success" : "warning"}>{entry.status === "Published" ? "Đã xuất bản" : "Bản nháp"}</StatusBadge>{entry.id === publishedId && <StatusBadge tone="ember">Tổ chức đang thấy</StatusBadge>}{entry.id === versionParam && <StatusBadge tone="info">Đang mở</StatusBadge>}</span></td>
            <td>{formatDateTime(entry.publishedAt)}</td>
            <td className="ops-cell-actions">{entry.id !== versionParam && <Button size="sm" variant="quiet" aria-label={`Mở phiên bản ${entry.versionNumber}`} onClick={() => onVersion(entry.id)}>Mở</Button>}</td>
          </tr>)}</tbody>
        </Table>}
    </Panel>

    {versionParam === "new" && <VersionEditor key={`new:${seed.from ?? "blank"}`} accessToken={accessToken} item={item} version={null} seed={seed.form} onCreated={(created) => onVersion(created.id)} onChanged={reloadItem} onFork={startNew} onClose={() => onVersion(null)} />}
    {versionParam !== "new" && versionParam !== "" && !wantsVersion && <Alert tone="danger" title="Đường dẫn phiên bản không hợp lệ">Mã phiên bản phải là một UUID.</Alert>}
    {wantsVersion && !loaded && versionQuery.error !== undefined && (() => {
      const view = describeLibraryError(versionQuery.error);
      return <Alert tone="danger" title={view.kind === "notFound" ? "Không tìm thấy phiên bản" : "Không tải được phiên bản"} action={view.kind === "notFound" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={versionQuery.reload}>Thử lại</Button>}>{view.message}</Alert>;
    })()}
    {wantsVersion && !loaded && versionQuery.error === undefined && <SkeletonRows rows={5} label="Đang tải phiên bản…" />}
    {loaded && loaded.data.itemId === item.id && <VersionEditor key={`${loaded.data.id}:${versionRev}`} accessToken={accessToken} item={item} version={loaded} seed={null} onCreated={(created) => onVersion(created.id)} onChanged={reloadItem} onFork={startNew} onClose={() => onVersion(null)} />}
    {loaded && loaded.data.itemId !== item.id && <Alert tone="danger" title="Phiên bản không thuộc mục này">Mở lại từ danh sách phiên bản của mục.</Alert>}

    <p className="ops-field-hint" style={{ margin: 0 }}>Dữ liệu lấy từ máy chủ. <button type="button" onClick={() => { reloadItem(); setVersionRev((value) => value + 1); }} style={{ background: "none", border: 0, padding: 0, color: "var(--ember)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Tải lại</button> sẽ bỏ thay đổi chưa lưu trong phiên bản đang mở.</p>

    {toggle && <Modal open onOpenChange={(open) => { if (!open && !toggleBusy) setToggle(false); }} title={item.isActive ? "Ngừng dùng mục này?" : "Dùng lại mục này?"}
      description={item.isActive ? "Tổ chức không còn thấy mục này khi chọn mẫu mới. Bản đã xuất bản vẫn đọc được theo mã, nên kịch bản đã dùng không bị ảnh hưởng." : "Nếu mục có phiên bản đã xuất bản, tổ chức thấy lại mục này trong danh sách chọn."}
      footer={<><Button variant="quiet" disabled={toggleBusy} onClick={() => setToggle(false)}>Hủy</Button><Button variant={item.isActive ? "danger" : "primary"} disabled={toggleBusy} onClick={() => void runToggle()} data-testid="confirm-toggle">{toggleBusy ? "Đang gửi…" : toggleError?.kind === "retry" ? "Thử lại" : item.isActive ? "Ngừng dùng" : "Dùng lại"}</Button></>}>
      <div className="ops-stack">
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Mục <strong style={{ color: "var(--text)" }}>{item.code}</strong></p>
        {toggleError && <Alert tone={toggleError.kind === "stale" ? "warning" : "danger"} title={toggleError.title}>{toggleError.kind === "stale" ? "Mục đã đổi ở nơi khác; đã tải lại. Kiểm tra trạng thái rồi thử lại." : toggleError.message}</Alert>}
      </div>
    </Modal>}
  </div>;
}
