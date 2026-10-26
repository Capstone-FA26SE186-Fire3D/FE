"use client";

import { Inbox, MessageSquareText, Plus, Search, Star } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubTabs } from "@/components/ui/sub-tabs";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { formatDateTime } from "@/utils/date-range";
import { supportApi } from "../api";
import { feedbackStatusLabel, feedbackStatusOptions, feedbackStatusTone, priorityLabel, priorityTone, ticketStatusLabel, ticketStatusOptions, ticketStatusTone } from "../labels";
import type { Feedback, Ticket } from "../types";
import { errorText, MessageComposer, MessageList, useTicketDetail } from "./ticket-thread";
import styles from "./support.module.css";
import "@/assets/styles/ops-v2.css";
import { LoadingBlock } from "@/components/ui/spinner";

const PAGE_SIZE = 20;
const TABS = ["tickets", "feedback"] as const;
type TabKey = (typeof TABS)[number];
const isTab = (value: string): value is TabKey => (TABS as readonly string[]).includes(value);

export type SupportAudience = "organization" | "trainee";

/** Detail of one ticket in a right drawer (Figma 50:2371): status, the original description, the thread and the reply composer. */
function TicketDrawer({ ticketId, accessToken, myId, onClose }: { ticketId: string; accessToken: string; myId: string; onClose: () => void }) {
  const toast = useToast();
  const { state, error, loading, reload } = useTicketDetail("user", accessToken, ticketId);
  const ticket = state?.ticket;

  return <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} size="lg" data-testid="ticket-drawer"
    title={ticket?.subject ?? "Chi tiết yêu cầu"}
    description={ticket ? `${ticket.ticketNumber} · gửi ${formatDateTime(ticket.createdAt)}` : "Lịch sử trao đổi với đội hỗ trợ."}
    eyebrow={ticket ? <><StatusBadge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</StatusBadge><StatusBadge tone={priorityTone(ticket.priority)}>Ưu tiên: {priorityLabel(ticket.priority)}</StatusBadge></> : undefined}
    headerExtra={<Button size="sm" variant="quiet" onClick={reload} disabled={loading}>{loading ? "Đang tải…" : "Tải lại"}</Button>}
    footer={<Button variant="quiet" onClick={onClose}>Đóng</Button>}>
    {!state && error !== undefined && <Alert tone="danger" title="Không mở được yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{errorText(error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>}
    {!state && error === undefined && <SkeletonDetail rows={6} />}
    {state && ticket && <div className="ops-stack">
      <p className={styles.description}>{ticket.description}</p>
      <dl className={styles.meta}>
        <dt>Cập nhật</dt><dd>{formatDateTime(ticket.updatedAt)}</dd>
        {ticket.resolvedAt && <><dt>Giải quyết</dt><dd>{formatDateTime(ticket.resolvedAt)}</dd></>}
      </dl>
      <section className={styles.section} aria-label="Trao đổi">
        <h3>Trao đổi ({state.messageTotal})</h3>
        <MessageList messages={state.messages} empty="Chưa có phản hồi. Đội hỗ trợ sẽ trả lời tại đây; bạn cũng có thể bổ sung thông tin bên dưới." label={(item) => item.authorId === myId ? { name: "Bạn", mine: true } : { name: item.author?.displayName?.trim() ? `${item.author.displayName.trim()} · Đội hỗ trợ FET3D` : "Đội hỗ trợ FET3D", mine: false }} />
        <MessageComposer
          ticketId={ticket.id}
          disabledReason={ticket.status === "Closed" ? "Yêu cầu này đã đóng. Hãy tạo yêu cầu mới nếu bạn cần hỗ trợ thêm." : undefined}
          onSend={async (message, key) => {
            await supportApi.addMessage("user", accessToken, ticket.id, message, key);
            toast.notify({ tone: "success", title: "Đã gửi tin nhắn" });
            reload();
          }}
        />
      </section>
    </div>}
  </Drawer>;
}

/** Create form (Figma 50:2482): the API accepts subject + description only. One Idempotency-Key per payload; a retry replays it. */
function CreateTicketModal({ open, accessToken, audience, onCreated, onClose }: { open: boolean; accessToken: string; audience: SupportAudience; onCreated: (id: string) => void; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const { keyFor, done } = useIdempotencyKey();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ subject?: string; description?: string }>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const payload = { subject: subject.trim(), description: description.trim() };
    const found: typeof errors = {};
    if (!payload.subject || payload.subject.length > 255) found.subject = "Chủ đề dài từ 1 đến 255 ký tự.";
    if (!payload.description || payload.description.length > 10000) found.description = "Mô tả dài từ 1 đến 10.000 ký tự.";
    setErrors(found);
    if (found.subject || found.description) return;
    inFlight.current = true;
    setSaving(true);
    setFormError("");
    try {
      const ticket = await supportApi.createTicket(accessToken, payload, keyFor(payload));
      done();
      toast.notify({ tone: "success", title: "Đã gửi yêu cầu hỗ trợ", description: ticket.ticketNumber });
      setSubject(""); setDescription(""); setErrors({});
      onCreated(ticket.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors.length) setErrors({ subject: cause.fieldMessage("subject"), description: cause.fieldMessage("description") });
      setFormError(errorText(cause, "Không gửi được yêu cầu. Nội dung của bạn vẫn được giữ lại; bấm Gửi để thử lại, yêu cầu sẽ không bị tạo trùng."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return <Modal open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }} title="Tạo yêu cầu hỗ trợ" description="Chỉ cần chủ đề và mô tả. Đội FET3D sẽ trả lời ngay trong yêu cầu này."
    footer={<><Button type="button" variant="quiet" onClick={onClose} disabled={saving}>Hủy</Button><Button type="submit" form={formId} disabled={saving}>{saving ? "Đang gửi…" : "Gửi yêu cầu"}</Button></>}>
    <form id={formId} onSubmit={submit} noValidate className="ops-stack">
      <Field label="Chủ đề" required error={errors.subject}>{(p) => <Input {...p} maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} autoComplete="off" />}</Field>
      <Field label="Mô tả" required hint={audience === "trainee" ? "Mô tả vấn đề, các bước đã thử và bài học hoặc buổi tập liên quan (nếu có). Không gửi mật khẩu." : "Mô tả vấn đề, các bước đã thử, tên công trình hoặc bản IFC liên quan (nếu có). Không gửi mật khẩu."} error={errors.description}>{(p) => <Textarea {...p} rows={6} maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mô tả vấn đề, tên công trình nếu có…" />}</Field>
      {formError && <Alert tone="danger">{formError}</Alert>}
    </form>
  </Modal>;
}

function TicketsTab({ accessToken, myId, audience }: { accessToken: string; myId: string; audience: SupportAudience }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("status");
  const ticketId = get("ticket");
  const urlSearch = get("q");
  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);
  const master = audience === "organization";
  const [localCreating, setLocalCreating] = useState(false);
  // Organization: the page header button opens the form through ?create=1; the Trainee hub keeps its own toggle.
  const creating = master ? get("create") === "1" : localCreating;
  const setCreating = (value: boolean) => { if (master) setParams({ create: value ? "1" : null }); else setLocalCreating(value); };
  const list = useAsyncData(`org-tickets:${page}:${status}`, (signal) => supportApi.listTickets("user", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined }, signal), true);
  const loaded = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  // The API filters by status only; the subject search narrows the loaded page.
  const needle = urlSearch.trim().toLowerCase();
  const items = needle ? loaded.filter((ticket) => `${ticket.subject} ${ticket.ticketNumber}`.toLowerCase().includes(needle)) : loaded;

  const columns: DataColumn<Ticket>[] = [
    { key: "subject", header: "Chủ đề", primary: true, render: (ticket) => <CellTitle title={ticket.subject} sub={ticket.ticketNumber} /> },
    { key: "priority", header: "Mức", width: 140, render: (ticket) => <StatusBadge tone={priorityTone(ticket.priority)}>{priorityLabel(ticket.priority)}</StatusBadge> },
    { key: "status", header: "Trạng thái", width: 160, render: (ticket) => <StatusBadge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</StatusBadge> },
    { key: "updated", header: "Cập nhật", width: 170, hideBelow: 900, render: (ticket) => formatDateTime(ticket.updatedAt) },
  ];

  return <>
    {list.error !== undefined && <Alert tone="danger" className="mb-4" title="Không tải được danh sách yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>}
    <DataTable
      caption="Yêu cầu hỗ trợ của bạn"
      data-testid="tickets-table"
      columns={columns}
      rows={items}
      rowKey={(ticket) => ticket.id}
      loading={list.loading && !list.data}
      onRowClick={(ticket) => setParams({ ticket: ticket.id, page })}
      toolbar={<>
        <TableSearch value={searchText} onChange={setSearchText} label="Tìm yêu cầu" placeholder="Tìm theo chủ đề hoặc mã" />
        <FilterChips label="Bộ lọc yêu cầu">
          <FilterChip label="Trạng thái" value={status} onChange={(value) => setParams({ status: value })} options={ticketStatusOptions.map((value) => ({ value, label: ticketStatusLabel(value) }))} />
        </FilterChips>
        {!master && <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo yêu cầu hỗ trợ</Button>}
      </>}
      empty={<EmptyState icon={status || needle ? Search : Inbox} title={status || needle ? "Không có yêu cầu phù hợp." : "Bạn chưa gửi yêu cầu hỗ trợ nào"} description={status || needle ? "Thử đổi từ khóa hoặc bộ lọc trạng thái." : audience === "trainee" ? "Khi gặp sự cố với bài học, ứng dụng hoặc tài khoản, hãy tạo yêu cầu để đội FET3D hỗ trợ." : "Khi gặp sự cố với công trình, mô hình IFC hoặc tài khoản, hãy tạo yêu cầu để đội FET3D hỗ trợ."} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className="ops-field-hint" style={{ margin: "10px 0 0" }}>Bấm một hàng để xem hội thoại trong ngăn bên phải. “Tạo yêu cầu” mở hộp thoại chỉ gồm chủ đề và mô tả.</p>

    <CreateTicketModal open={creating} accessToken={accessToken} audience={audience} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); list.reload(); setParams({ ticket: id, page: 1, create: null }); }} />
    {ticketId && <TicketDrawer key={ticketId} ticketId={ticketId} accessToken={accessToken} myId={myId} onClose={() => setParams({ ticket: null, page })} />}
  </>;
}

const ratingOptions = [5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} / 5` }));

function CreateFeedbackModal({ open, accessToken, onCreated, onClose }: { open: boolean; accessToken: string; onCreated: () => void; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const { keyFor, done } = useIdempotencyKey();
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState("");
  const [errors, setErrors] = useState<{ category?: string; message?: string; rating?: string }>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const payload = { category: category.trim(), message: message.trim(), ...(rating ? { rating: Number(rating) } : {}) };
    const found: typeof errors = {};
    if (!payload.category || payload.category.length > 100) found.category = "Chủ đề dài từ 1 đến 100 ký tự.";
    if (!payload.message || payload.message.length > 10000) found.message = "Nội dung dài từ 1 đến 10.000 ký tự.";
    setErrors(found);
    if (found.category || found.message) return;
    inFlight.current = true;
    setSaving(true);
    setFormError("");
    try {
      await supportApi.createFeedback(accessToken, payload, keyFor(payload));
      done();
      toast.notify({ tone: "success", title: "Đã gửi phản hồi", description: "Cảm ơn bạn đã đóng góp ý kiến." });
      setCategory(""); setMessage(""); setRating(""); setErrors({});
      onCreated();
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors.length) setErrors({ category: cause.fieldMessage("category"), message: cause.fieldMessage("message"), rating: cause.fieldMessage("rating") });
      setFormError(errorText(cause, "Không gửi được phản hồi. Nội dung của bạn vẫn được giữ lại; bấm Gửi để thử lại, phản hồi sẽ không bị tạo trùng."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return <Modal open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }} title="Gửi phản hồi" description="Phản hồi được đội FET3D xem xét; không dùng để yêu cầu hỗ trợ khẩn."
    footer={<><Button type="button" variant="quiet" onClick={onClose} disabled={saving}>Hủy</Button><Button type="submit" form={formId} disabled={saving}>{saving ? "Đang gửi…" : "Gửi phản hồi"}</Button></>}>
    <form id={formId} onSubmit={submit} noValidate className="ops-stack">
      <Field label="Chủ đề" required hint="Ví dụ: Giao diện, Hiệu năng, Quét IFC." error={errors.category}>{(p) => <Input {...p} maxLength={100} value={category} onChange={(event) => setCategory(event.target.value)} autoComplete="off" />}</Field>
      <Field label="Nội dung" required error={errors.message}>{(p) => <Textarea {...p} rows={6} maxLength={10000} value={message} onChange={(event) => setMessage(event.target.value)} />}</Field>
      <Field label="Mức hài lòng" hint="Không bắt buộc." error={errors.rating}>{(p) => <Combobox {...p} aria-label="Mức hài lòng" value={rating} onChange={setRating} options={ratingOptions} placeholder="Không đánh giá" groupLabel="Thang 5" clearable />}</Field>
      {formError && <Alert tone="danger">{formError}</Alert>}
    </form>
  </Modal>;
}

function FeedbackTab({ accessToken, audience }: { accessToken: string; audience: SupportAudience }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("status");
  const [creating, setCreating] = useState(false);
  const list = useAsyncData(`org-feedback:${page}:${status}`, (signal) => supportApi.listFeedback("user", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined }, signal), true);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  const columns: DataColumn<Feedback>[] = [
    { key: "message", header: "Phản hồi", primary: true, render: (item) => <CellTitle title={<span className={styles.clip}>{item.message}</span>} sub={item.category} /> },
    { key: "rating", header: "Đánh giá", width: 120, render: (item) => item.rating === null ? "—" : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={14} aria-hidden="true" />{item.rating}/5</span> },
    { key: "status", header: "Trạng thái", width: 150, render: (item) => <StatusBadge tone={feedbackStatusTone(item.status)}>{feedbackStatusLabel(item.status)}</StatusBadge> },
    { key: "created", header: "Gửi lúc", width: 170, hideBelow: 900, render: (item) => formatDateTime(item.createdAt) },
  ];

  return <>
    {list.error !== undefined && <Alert tone="danger" className="mb-4" title="Không tải được phản hồi" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>}
    <DataTable
      caption="Phản hồi bạn đã gửi"
      data-testid="feedback-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      toolbar={<>
        <FilterChips label="Bộ lọc phản hồi">
          <FilterChip label="Trạng thái" value={status} onChange={(value) => setParams({ status: value })} options={feedbackStatusOptions.map((value) => ({ value, label: feedbackStatusLabel(value) }))} />
        </FilterChips>
        <span className="ops-toolbar-grow" />
        <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Gửi phản hồi</Button>
      </>}
      empty={<EmptyState icon={status ? Search : MessageSquareText} title={status ? "Không có phản hồi phù hợp." : "Bạn chưa gửi phản hồi nào"} description={status ? "Thử đổi bộ lọc trạng thái." : audience === "trainee" ? "Chia sẻ góp ý về bài học, ứng dụng hoặc trải nghiệm luyện tập để FET3D cải thiện." : "Chia sẻ góp ý về công cụ, mô hình hoặc trải nghiệm sử dụng để FET3D cải thiện."} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <CreateFeedbackModal open={creating} accessToken={accessToken} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} />
  </>;
}

/** Tickets and feedback of the signed-in creator. Shared by the organization workspace and the Trainee learning hub. */
export function SupportTabs({ accessToken, myId, audience }: { accessToken: string; myId: string; audience: SupportAudience }) {
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "tickets";
  return <SubTabs label="Hỗ trợ và phản hồi" value={tab} onValueChange={(value) => { if (isTab(value) && value !== tab) setParams({ tab: value === "tickets" ? null : value, ticket: null, status: null, page: null, q: null }); }} className={styles.tabs}
    items={[{ value: "tickets", label: "Yêu cầu hỗ trợ" }, { value: "feedback", label: "Phản hồi" }]}>
    <div className="ops-subtabs-content">
      {tab === "tickets" ? <TicketsTab accessToken={accessToken} myId={myId} audience={audience} /> : <FeedbackTab accessToken={accessToken} audience={audience} />}
    </div>
  </SubTabs>;
}

export function OrganizationSupport() {
  const { accessToken, ready, user } = useAuthSession();
  const { setParams } = useUrlParams();

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 1 || !accessToken) {
    return <Alert tone="danger" title="Chỉ dành cho tài khoản tổ chức" action={user?.role === 0 ? <Link className="mt-3 inline-block underline" href={routes.adminSupport}>Mở hộp thư hỗ trợ của quản trị</Link> : user?.role === 2 ? <Link className="mt-3 inline-block underline" href={routes.learningHubSupport}>Mở hỗ trợ trong Góc học tập</Link> : undefined}>Yêu cầu và phản hồi thuộc về người tạo; quản trị FET3D xử lý chúng trong khu quản trị.</Alert>;
  }

  return <div className="org">
    <PageHeader
      title="Hỗ trợ và phản hồi"
      description="Gửi yêu cầu cho đội vận hành (chủ đề và mô tả) hoặc góp ý về sản phẩm. Theo dõi phản hồi ở một nơi."
      eyebrow="Quản lý" breadcrumbs={[{ label: "Hỗ trợ & phản hồi" }]}
      actions={<Button onClick={() => setParams({ tab: null, create: "1" })}><Plus size={16} aria-hidden="true" />Tạo yêu cầu</Button>}
    />
    <SupportTabs accessToken={accessToken} myId={user.id} audience="organization" />
  </div>;
}
