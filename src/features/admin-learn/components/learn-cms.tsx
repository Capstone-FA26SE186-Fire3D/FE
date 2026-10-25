"use client";

import { Plus } from "lucide-react";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SubTabs } from "@/components/ui/sub-tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { NewPostModal } from "./new-post";
import { PostEditor } from "./post-editor";
import { PostsTab } from "./posts-tab";
import { SituationsTab } from "./situations-tab";
import "./learn-quick.css";
import { LoadingBlock } from "@/components/ui/spinner";

const SECTIONS = ["posts", "situations"] as const;
type Section = (typeof SECTIONS)[number];
const isSection = (value: string): value is Section => (SECTIONS as readonly string[]).includes(value);
/** Parameters owned by one section, cleared when switching so filters never leak across sections. */
const SECTION_PARAMS = ["page", "status", "q", "active", "quick"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESCRIPTION = "Bài viết, mẹo và video công khai. Bấm hàng để sửa nhanh; thao tác được phép tùy theo trạng thái bài. Bài học không cần qua bước duyệt riêng.";

/**
 * PlatformAdmin Learn CMS over the real contract (BE#57/#69), Admin v2 (Figma 53:758). URL state: `?section=posts|situations`,
 * `?post=<id>` (editor) or `?post=new` (the "Bài mới" modal over the list), `&version=<id>`, `&tab=content|publish`,
 * `?quick=<id>` (the quick-edit drawer), plus the list filters. Role is checked in the client; the API enforces it on every call.
 */
export function LearnCms() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const post = get("post");
  const sectionParam = get("section");
  const section: Section = isSection(sectionParam) ? sectionParam : "posts";

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ quản trị FET3D có thể quản lý bài học.</Alert>;

  const closeEditor = () => setParams({ post: null, version: null, tab: null });
  const openNew = () => setParams({ post: "new", tab: null });
  const header = <PageHeader eyebrow="Quản lý nội dung" title="Quản lý bài học" description={DESCRIPTION} breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Bài học" }]} actions={!post || post === "new" ? <Button onClick={openNew}><Plus size={16} aria-hidden="true" />Tạo bài</Button> : undefined} />;

  if (post && post !== "new") {
    if (!UUID.test(post)) return <>{header}<Alert tone="danger" title="Đường dẫn bài không hợp lệ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={closeEditor}>Về danh sách</Button>}>Đường dẫn không trỏ tới bài nào. Hãy mở bài từ danh sách.</Alert></>;
    return <>
      {header}
      <PostEditor accessToken={accessToken} postId={post} versionId={UUID.test(get("version")) ? get("version") : ""} tab={get("tab")} onTab={(value) => setParams({ tab: value || null }, "replace")} onBack={closeEditor} onOpenVersion={(id) => setParams({ version: id, tab: null })} />
    </>;
  }

  return <>
    {header}
    <SubTabs label="Quản lý bài học" value={section} className="mb-4" onValueChange={(value) => { if (isSection(value) && value !== section) setParams({ ...Object.fromEntries(SECTION_PARAMS.map((key) => [key, null])), section: value === "posts" ? null : value }); }}
      items={[{ value: "posts", label: "Bài viết" }, { value: "situations", label: "Tình huống" }]} />
    {section === "posts" ? <PostsTab accessToken={accessToken} onOpen={(id) => setParams({ post: id, quick: null })} onCreate={openNew} /> : <SituationsTab accessToken={accessToken} />}
    {post === "new" && <NewPostModal accessToken={accessToken} onClose={() => setParams({ post: null })} onCreated={(id) => setParams({ post: id, version: null, tab: null })} />}
  </>;
}
