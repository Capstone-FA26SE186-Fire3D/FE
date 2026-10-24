"use client";

import { Gauge, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthSession } from "@/features/auth/auth-session";

import { useOptionalAiBubble } from "../floating/ai-bubble-context";
import type { AiRequest } from "../types";
import { AiQuotaCard } from "./ai-side-rail";
import { ApplyTargetDialog } from "./apply-target-dialog";
import { HistoryTab } from "./history-tab";
import { BILLING_AI_HREF } from "./request-view";

const TABS = ["history", "saved", "quota"] as const;
type TabKey = (typeof TABS)[number];
const isTab = (value: string): value is TabKey => (TABS as readonly string[]).includes(value);

/** Every URL parameter owned by a tab; switching tabs clears them so filters and the open request never leak across tabs. */
const TAB_PARAMS = ["page", "request", "status", "resultType", "operation", "mine"];

/**
 * `/workspace/ai` (Figma 48:1988): the chat lives in the floating bubble on every page; this page reads back the history,
 * the saved scenario proposals and the quota. Organization AI through the .NET API (never the FastAPI service). OrganizationUser only.
 */
export function OrganizationAi() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const bubble = useOptionalAiBubble();
  const [applying, setApplying] = useState<AiRequest | null>(null);

  const tabParam = get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "history";

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 1 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Hỏi đáp và đề xuất kịch bản bằng AI dành cho tài khoản tổ chức (OrganizationUser).</Alert>;

  const changeTab = (value: string) => {
    if (!isTab(value) || value === tab) return;
    setParams({ ...Object.fromEntries(TAB_PARAMS.map((key) => [key, null])), tab: value === "history" ? null : value });
  };

  return <div className="org">
    <PageHeader
      title="Trợ lý AI"
      description="Chat nằm ở bong bóng nổi trên mọi trang. Trang này để xem lại lịch sử, bản đề xuất đã lưu và quota. AI chỉ đề xuất; không tự sửa kịch bản, không phát hành, không phải chứng nhận an toàn."
      eyebrow="Huấn luyện" breadcrumbs={[{ label: "Trợ lý AI" }]}
      actions={<>
        <Button asChild variant="quiet"><Link href={BILLING_AI_HREF}><Gauge size={16} aria-hidden="true" />Quota AI & top-up</Link></Button>
        {bubble?.enabled && <Button type="button" onClick={bubble.openPanel} data-testid="ai-open-bubble"><Sparkles size={16} aria-hidden="true" />Mở trợ lý</Button>}
      </>}
    />
    <Tabs value={tab} onValueChange={changeTab}>
      <TabsList aria-label="Trợ lý AI">
        <TabsTrigger value="history">Lịch sử hội thoại</TabsTrigger>
        <TabsTrigger value="saved">Đề xuất đã lưu</TabsTrigger>
        <TabsTrigger value="quota">Quota & giới hạn</TabsTrigger>
      </TabsList>
      <TabsContent value="history">{tab === "history" && <HistoryTab accessToken={accessToken} variant="history" onApply={setApplying} />}</TabsContent>
      <TabsContent value="saved">{tab === "saved" && <HistoryTab accessToken={accessToken} variant="saved" onApply={setApplying} />}</TabsContent>
      <TabsContent value="quota">{tab === "quota" && <AiQuotaCard accessToken={accessToken} />}</TabsContent>
    </Tabs>
    <ApplyTargetDialog accessToken={accessToken} request={applying} onClose={() => setApplying(null)} />
  </div>;
}
