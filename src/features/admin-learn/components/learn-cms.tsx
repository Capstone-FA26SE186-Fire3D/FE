"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { NewPost } from "./new-post";
import { PostEditor } from "./post-editor";
import { PostsTab } from "./posts-tab";
import { SituationsTab } from "./situations-tab";

const SECTIONS = ["posts", "situations"] as const;
type Section = (typeof SECTIONS)[number];
const isSection = (value: string): value is Section => (SECTIONS as readonly string[]).includes(value);
/** Parameters owned by one section, cleared when switching so filters never leak across sections. */
const SECTION_PARAMS = ["page", "status", "q", "active", "quick"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PlatformAdmin Learn CMS over the real contract (BE#57/#69). URL state: `?section=posts|situations`, `?post=<id>|new`,
 * `&version=<id>`, `&tab=`, plus the list filters. Role is checked in the client; the API enforces it on every call.
 */
export function LearnCms() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const post = get("post");
  const sectionParam = get("section");
  const section: Section = isSection(sectionParam) ? sectionParam : "posts";

  const header = (title: string, description: string, actions?: ReactNode) => <PageHeader eyebrow="Quản lý nội dung" title={title} description={description} breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Learn CMS" }]} actions={actions} />;

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể quản lý nội dung Learn.</Alert>;

  const tab = get("tab") || "info";
  const closeEditor = () => setParams({ post: null, version: null, tab: null });

  if (post === "new") {
    return <>
      {header("Learn CMS", "Soạn bài viết, mẹo và video ngắn công khai theo tình huống.")}
      <NewPost accessToken={accessToken} tab={tab} onTab={(value) => setParams({ tab: value }, "replace")} onBack={closeEditor} onCreated={(id) => setParams({ post: id, version: null, tab: null })} />
    </>;
  }
  if (post) {
    if (!UUID.test(post)) return <>{header("Learn CMS", "Soạn bài viết, mẹo và video ngắn công khai theo tình huống.")}<Alert tone="danger" title="Đường dẫn bài không hợp lệ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={closeEditor}>Về danh sách</Button>}>Mã bài phải là một UUID.</Alert></>;
    return <>
      {header("Learn CMS", "Soạn bài viết, mẹo và video ngắn công khai theo tình huống.")}
      <PostEditor accessToken={accessToken} postId={post} versionId={UUID.test(get("version")) ? get("version") : ""} tab={tab} onTab={(value) => setParams({ tab: value }, "replace")} onBack={closeEditor} onOpenVersion={(id) => setParams({ version: id, tab: null })} />
    </>;
  }

  return <>
    {header("Learn CMS", "Bài viết, mẹo và video. Thao tác hợp lệ thay đổi theo trạng thái; Learn không có quy trình duyệt riêng.", <Button onClick={() => setParams({ post: "new", tab: null })}><Plus size={16} aria-hidden="true" />Tạo bài</Button>)}
    <Tabs value={section} onValueChange={(value) => { if (isSection(value) && value !== section) setParams({ ...Object.fromEntries(SECTION_PARAMS.map((key) => [key, null])), section: value === "posts" ? null : value }); }}>
      <TabsList aria-label="Learn CMS">
        <TabsTrigger value="posts">Bài viết</TabsTrigger>
        <TabsTrigger value="situations">Tình huống</TabsTrigger>
      </TabsList>
      <TabsContent value="posts"><PostsTab accessToken={accessToken} onOpen={(id) => setParams({ post: id })} onCreate={() => setParams({ post: "new", tab: null })} /></TabsContent>
      <TabsContent value="situations"><SituationsTab accessToken={accessToken} /></TabsContent>
    </Tabs>
  </>;
}
