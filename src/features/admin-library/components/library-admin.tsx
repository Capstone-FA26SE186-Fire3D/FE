"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { isKind } from "@/features/library/types";
import { ItemDetail } from "./item-detail";
import { ItemsList } from "./items-list";
import { NewItemModal } from "./new-item-modal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PlatformAdmin Organization Library over the real contract (BE#57/#69, FE#54), Admin v2 (Figma 53:1111). URL state: list
 * filters (`kind`, `page`, `q`, `state`), `?item=<id>` opens the item drawer over the list and `&version=<id|new>` the version
 * editor inside it. Role is checked in the client; the API enforces it on every call.
 */
export function LibraryAdmin() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const [creating, setCreating] = useState(false);
  const [listRev, setListRev] = useState(0);
  const item = get("item");
  const version = get("version");
  const kind = get("kind");

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể quản lý thư viện tổ chức.</Alert>;

  const closeItem = () => setParams({ item: null, version: null });
  const bumpList = () => setListRev((value) => value + 1);

  return <>
    <PageHeader eyebrow="Quản lý nội dung" title="Thư viện tổ chức" description="Template kịch bản, rubric mẫu và metadata thiết bị mà tổ chức dùng để soạn bài. Không tự chia sẻ IFC hay kịch bản riêng của tổ chức." breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Thư viện mẫu" }]}
      actions={<Button onClick={() => setCreating(true)} data-testid="add-item"><Plus size={16} aria-hidden="true" />Thêm mục</Button>} />
    {item && !UUID.test(item) && <Alert tone="danger" className="mb-4" title="Đường dẫn mục không hợp lệ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={closeItem}>Về danh sách</Button>}>Mã mục phải là một UUID.</Alert>}
    <ItemsList accessToken={accessToken} reloadKey={listRev} onOpen={(id) => setParams({ item: id, version: null })} onNewVersion={(id) => setParams({ item: id, version: "new" })} onCreate={() => setCreating(true)} onChanged={bumpList} />
    {item && UUID.test(item) && <ItemDetail key={item} accessToken={accessToken} itemId={item} versionParam={version} onVersion={(id) => setParams({ version: id })} onClose={closeItem} onListChanged={bumpList} />}
    {creating && <NewItemModal accessToken={accessToken} initialKind={isKind(kind) ? kind : ""} onClose={() => setCreating(false)} onCreated={(created) => { setCreating(false); bumpList(); setParams({ item: created.id, version: null }); }} />}
  </>;
}
