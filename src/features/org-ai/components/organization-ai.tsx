"use client";

import { Gauge } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthSession } from "@/features/auth/auth-session";

import type { AiRequest } from "../types";
import { ApplyTargetDialog } from "./apply-target-dialog";
import { AskTab } from "./ask-tab";
import { DraftTab } from "./draft-tab";
import { HistoryTab } from "./history-tab";
import { BILLING_AI_HREF } from "./request-view";

const TABS = ["ask", "draft", "history"] as const;
type TabKey = (typeof TABS)[number];
const isTab = (value: string): value is TabKey => (TABS as readonly string[]).includes(value);

/** Every URL parameter owned by a tab; switching tabs clears them so filters and the open request never leak across tabs. */
const TAB_PARAMS = ["page", "request", "status", "resultType", "operation", "mine"];

/** `/workspace/ai`: Organization AI through the .NET API (never the FastAPI service). OrganizationUser only. */
export function OrganizationAi() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const setParamsRef = useRef(setParams);
  useEffect(() => {
    setParamsRef.current = setParams;
  });
  const [applying, setApplying] = useState<AiRequest | null>(null);
  // Stable on purpose: the submit hook calls it after an await, when `setParams` of the render that started the call is stale.
  const onRequest = useCallback((requestId: string | null) => setParamsRef.current({ request: requestId }, "replace"), []);

  const tabParam = get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "ask";
  const requestId = get("request");

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 1 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Hỏi đáp và đề xuất kịch bản bằng AI dành cho tài khoản tổ chức (OrganizationUser).</Alert>;

  const changeTab = (value: string) => {
    if (!isTab(value) || value === tab) return;
    setParams({ ...Object.fromEntries(TAB_PARAMS.map((key) => [key, null])), tab: value === "ask" ? null : value });
  };

  return <>
    <PageHeader
      title="Trợ lý AI"
      description="Hỏi đáp có trích dẫn và đề xuất kịch bản trên nguồn đã được duyệt. AI chỉ đề xuất; không tự sửa kịch bản, không phát hành, không phải chứng nhận an toàn."
      eyebrow="Huấn luyện" breadcrumbs={[{ label: "Trợ lý AI" }]}
      actions={<Button asChild variant="quiet"><Link href={BILLING_AI_HREF}><Gauge size={16} aria-hidden="true" />Quota AI & top-up</Link></Button>}
    />
    <Tabs value={tab} onValueChange={changeTab}>
      <TabsList aria-label="Trợ lý AI">
        <TabsTrigger value="ask">Hỏi đáp</TabsTrigger>
        <TabsTrigger value="draft">Đề xuất kịch bản</TabsTrigger>
        <TabsTrigger value="history">Lịch sử</TabsTrigger>
      </TabsList>
      <TabsContent value="ask" style={{ marginTop: 16 }}>{tab === "ask" && <AskTab accessToken={accessToken} requestId={requestId} onRequest={onRequest} />}</TabsContent>
      <TabsContent value="draft" style={{ marginTop: 16 }}>{tab === "draft" && <DraftTab accessToken={accessToken} requestId={requestId} onRequest={onRequest} onApply={setApplying} />}</TabsContent>
      <TabsContent value="history" style={{ marginTop: 16 }}>{tab === "history" && <HistoryTab accessToken={accessToken} onApply={setApplying} />}</TabsContent>
    </Tabs>
    <ApplyTargetDialog accessToken={accessToken} request={applying} onClose={() => setApplying(null)} />
  </>;
}
