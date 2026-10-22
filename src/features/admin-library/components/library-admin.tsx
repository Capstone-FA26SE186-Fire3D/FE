"use client";

import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

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
 * PlatformAdmin Organization Library over the real contract (BE#57/#69, FE#54). URL state: list filters (`kind`, `page`),
 * `?item=<id>` and `&version=<id|new>`. Role is checked in the client; the API enforces it on every call.
 */
export function LibraryAdmin() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const [creating, setCreating] = useState(false);
  const [listRev, setListRev] = useState(0);
  const item = get("item");
  const version = get("version");
  const kind = get("kind");

  const header = (actions?: ReactNode) => <PageHeader eyebrow="Quản lý nội dung" title="Thư viện tổ chức" description="Template kịch bản, rubric mẫu và metadata thiết bị hỗ trợ. Không tự chia sẻ IFC hay kịch bản riêng của tổ chức." breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Thư viện tổ chức" }]} actions={actions} />;

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể quản lý thư viện tổ chức.</Alert>;

  const closeItem = () => setParams({ item: null, version: null });

  if (item) {
    if (!UUID.test(item)) return <>{header()}<Alert tone="danger" title="Đường dẫn mục không hợp lệ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={closeItem}>Về danh sách</Button>}>Mã mục phải là một UUID.</Alert></>;
    return <>
      {header()}
      <ItemDetail accessToken={accessToken} itemId={item} versionParam={version} onVersion={(id) => setParams({ version: id })} onBack={closeItem} onListChanged={() => setListRev((value) => value + 1)} />
    </>;
  }

  return <>
    {header(<Button onClick={() => setCreating(true)} data-testid="add-item"><Plus size={16} aria-hidden="true" />Thêm mục</Button>)}
    <ItemsList accessToken={accessToken} reloadKey={listRev} onOpen={(id) => setParams({ item: id, version: null })} onCreate={() => setCreating(true)} />
    {creating && <NewItemModal accessToken={accessToken} initialKind={isKind(kind) ? kind : ""} onClose={() => setCreating(false)} onCreated={(created) => { setCreating(false); setListRev((value) => value + 1); setParams({ item: created.id, version: null }); }} />}
  </>;
}
