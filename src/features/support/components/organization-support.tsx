"use client";

import { Inbox, MessageSquareText, Plus, Search, Star } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { formatDateTime } from "@/utils/date-range";
import { supportApi } from "../api";
import { feedbackStatusLabel, feedbackStatusOptions, feedbackStatusTone, priorityLabel, priorityTone, ticketStatusLabel, ticketStatusOptions, ticketStatusTone } from "../labels";
import { errorText, MessageComposer, MessageList, useTicketDetail } from "./ticket-thread";
import styles from "./support.module.css";

const PAGE_SIZE = 20;
const TABS = ["tickets", "feedback"] as const;
type TabKey = (typeof TABS)[number];
const isTab = (value: string): value is TabKey => (TABS as readonly string[]).includes(value);

function UserTicketPanel({ ticketId, accessToken, myId }: { ticketId: string; accessToken: string; myId: string }) {
  const toast = useToast();
  const { state, error, loading, reload } = useTicketDetail("user", accessToken, ticketId);

  if (!state) {
    if (error !== undefined) return <Alert tone="danger" title="Không mở được yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{errorText(error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>;
    return <SkeletonRows rows={5} label="Đang tải yêu cầu…" />;
  }
  const { ticket, messages } = state;

  return <div>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span className={styles.mono}>{ticket.ticketNumber}</span>
      <StatusBadge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</StatusBadge>
      <StatusBadge tone={priorityTone(ticket.priority)}>Ưu tiên: {priorityLabel(ticket.priority)}</StatusBadge>
      <Button size="sm" variant="quiet" onClick={reload} disabled={loading} style={{ marginLeft: "auto" }}>{loading ? "Đang tải…" : "Tải lại"}</Button>
    </div>
    <h3 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, overflowWrap: "anywhere" }}>{ticket.subject}</h3>
    <p className={styles.description}>{ticket.description}</p>
    <dl className={styles.meta} style={{ marginTop: 12 }}>
      <dt>Gửi lúc</dt><dd>{formatDateTime(ticket.createdAt)}</dd>
      <dt>Cập nhật</dt><dd>{formatDateTime(ticket.updatedAt)}</dd>
      {ticket.resolvedAt && <><dt>Giải quyết</dt><dd>{formatDateTime(ticket.resolvedAt)}</dd></>}
    </dl>
    <section className={styles.section} aria-label="Trao đổi">
      <h3>Trao đổi ({state.messageTotal})</h3>
      <MessageList messages={messages} empty="Chưa có phản hồi. Đội hỗ trợ sẽ trả lời tại đây; bạn cũng có thể bổ sung thông tin bên dưới." label={(authorId) => authorId === myId ? { name: "Bạn", mine: true } : { name: "Đội hỗ trợ Fire3D", mine: false }} />
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
  </div>;
}

function CreateTicketForm({ accessToken, onCreated, onCancel }: { accessToken: string; onCreated: (id: string) => void; onCancel: () => void }) {
  const toast = useToast();
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
    if (!payload.subject || payload.subject.length > 255) found.subject = "Tiêu đề dài từ 1 đến 255 ký tự.";
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
      onCreated(ticket.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors.length) setErrors({ subject: cause.fieldMessage("subject"), description: cause.fieldMessage("description") });
      setFormError(errorText(cause, "Không gửi được yêu cầu. Nội dung của bạn vẫn được giữ lại; bấm Gửi để thử lại, yêu cầu sẽ không bị tạo trùng."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return <form onSubmit={submit} noValidate className="ops-stack">
    <Field label="Tiêu đề" required error={errors.subject}>{(p) => <Input {...p} maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} autoComplete="off" />}</Field>
    <Field label="Mô tả" required hint="Mô tả vấn đề, các bước đã thử và tên công trình liên quan (nếu có). Không gửi mật khẩu." error={errors.description}>{(p) => <Textarea {...p} rows={7} maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
    {formError && <Alert tone="danger">{formError}</Alert>}
    <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
      <Button type="button" variant="quiet" onClick={onCancel} disabled={saving}>Hủy</Button>
      <Button type="submit" disabled={saving}>{saving ? "Đang gửi…" : "Gửi yêu cầu"}</Button>
    </div>
  </form>;
}

function TicketsTab({ accessToken, myId }: { accessToken: string; myId: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("status");
  const ticketId = get("ticket");
  const [creating, setCreating] = useState(false);
  const list = useAsyncData(`org-tickets:${page}:${status}`, (signal) => supportApi.listTickets("user", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined }, signal), true);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  return <>
    <div className="ops-toolbar">
      <Select aria-label="Trạng thái yêu cầu" style={{ width: 200 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option>{ticketStatusOptions.map((value) => <option key={value} value={value}>{ticketStatusLabel(value)}</option>)}
      </Select>
      <span className="ops-toolbar-grow" />
      <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo yêu cầu hỗ trợ</Button>
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>}

    <Table caption="Yêu cầu hỗ trợ của bạn">
      <thead><tr><th>Yêu cầu</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={3}><SkeletonRows rows={5} label="Đang tải yêu cầu…" /></TableMessage>}
        {items.map((ticket) => <tr key={ticket.id}>
          <td><button type="button" className={styles.rowButton} onClick={() => setParams({ ticket: ticket.id, page })} aria-label={`Mở yêu cầu ${ticket.ticketNumber}: ${ticket.subject}`}><span className={styles.clip}>{ticket.subject}</span><span className="ops-cell-sub">{ticket.ticketNumber}</span></button></td>
          <td><StatusBadge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</StatusBadge></td>
          <td>{formatDateTime(ticket.updatedAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={3}><EmptyState icon={status ? Search : Inbox} title={status ? "Không có yêu cầu phù hợp." : "Bạn chưa gửi yêu cầu hỗ trợ nào"} description={status ? "Thử đổi bộ lọc trạng thái." : "Khi gặp sự cố với công trình, mô hình IFC hoặc tài khoản, hãy tạo yêu cầu để đội Fire3D hỗ trợ."} action={!status && <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo yêu cầu hỗ trợ</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={creating} onOpenChange={(open) => { if (!open) setCreating(false); }} title="Tạo yêu cầu hỗ trợ" description="Đội Fire3D sẽ trả lời ngay trong yêu cầu này.">
      <CreateTicketForm accessToken={accessToken} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); list.reload(); setParams({ ticket: id, page: 1 }); }} />
    </Drawer>
    <Drawer open={Boolean(ticketId)} onOpenChange={(open) => { if (!open) setParams({ ticket: null, page }); }} title="Chi tiết yêu cầu" description="Lịch sử trao đổi với đội hỗ trợ." className={styles.wideDrawer}>
      {ticketId && <UserTicketPanel key={ticketId} ticketId={ticketId} accessToken={accessToken} myId={myId} />}
    </Drawer>
  </>;
}

function CreateFeedbackForm({ accessToken, onCreated, onCancel }: { accessToken: string; onCreated: () => void; onCancel: () => void }) {
  const toast = useToast();
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
      onCreated();
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors.length) setErrors({ category: cause.fieldMessage("category"), message: cause.fieldMessage("message"), rating: cause.fieldMessage("rating") });
      setFormError(errorText(cause, "Không gửi được phản hồi. Nội dung của bạn vẫn được giữ lại; bấm Gửi để thử lại, phản hồi sẽ không bị tạo trùng."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return <form onSubmit={submit} noValidate className="ops-stack">
    <Field label="Chủ đề" required hint="Ví dụ: Giao diện, Hiệu năng, Quét IFC." error={errors.category}>{(p) => <Input {...p} maxLength={100} value={category} onChange={(event) => setCategory(event.target.value)} autoComplete="off" />}</Field>
    <Field label="Nội dung" required error={errors.message}>{(p) => <Textarea {...p} rows={6} maxLength={10000} value={message} onChange={(event) => setMessage(event.target.value)} />}</Field>
    <Field label="Mức hài lòng" hint="Không bắt buộc." error={errors.rating}>{(p) => <Select {...p} value={rating} onChange={(event) => setRating(event.target.value)}><option value="">Không đánh giá</option>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</Select>}</Field>
    {formError && <Alert tone="danger">{formError}</Alert>}
    <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
      <Button type="button" variant="quiet" onClick={onCancel} disabled={saving}>Hủy</Button>
      <Button type="submit" disabled={saving}>{saving ? "Đang gửi…" : "Gửi phản hồi"}</Button>
    </div>
  </form>;
}

function FeedbackTab({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("status");
  const [creating, setCreating] = useState(false);
  const list = useAsyncData(`org-feedback:${page}:${status}`, (signal) => supportApi.listFeedback("user", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined }, signal), true);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  return <>
    <div className="ops-toolbar">
      <Select aria-label="Trạng thái phản hồi" style={{ width: 200 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option>{feedbackStatusOptions.map((value) => <option key={value} value={value}>{feedbackStatusLabel(value)}</option>)}
      </Select>
      <span className="ops-toolbar-grow" />
      <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Gửi phản hồi</Button>
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được phản hồi" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>}

    <Table caption="Phản hồi bạn đã gửi">
      <thead><tr><th>Phản hồi</th><th>Đánh giá</th><th>Trạng thái</th><th>Gửi lúc</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={4} label="Đang tải phản hồi…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td><span className={styles.clip} style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>{item.message}</span><span className="ops-cell-sub">{item.category}</span></td>
          <td>{item.rating === null ? "—" : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={14} aria-hidden="true" />{item.rating}/5</span>}</td>
          <td><StatusBadge tone={feedbackStatusTone(item.status)}>{feedbackStatusLabel(item.status)}</StatusBadge></td>
          <td>{formatDateTime(item.createdAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={status ? Search : MessageSquareText} title={status ? "Không có phản hồi phù hợp." : "Bạn chưa gửi phản hồi nào"} description={status ? "Thử đổi bộ lọc trạng thái." : "Chia sẻ góp ý về công cụ, mô hình hoặc trải nghiệm sử dụng để Fire3D cải thiện."} action={!status && <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Gửi phản hồi</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={creating} onOpenChange={(open) => { if (!open) setCreating(false); }} title="Gửi phản hồi" description="Phản hồi được đội Fire3D xem xét; không dùng để yêu cầu hỗ trợ khẩn.">
      <CreateFeedbackForm accessToken={accessToken} onCancel={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} />
    </Drawer>
  </>;
}

export function OrganizationSupport() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "tickets";

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 1 || !accessToken) {
    return <Alert tone="danger" title="Chỉ dành cho tài khoản tổ chức" action={user?.role === 0 ? <Link className="mt-3 inline-block underline" href={routes.adminSupport}>Mở hộp thư hỗ trợ của quản trị</Link> : undefined}>Yêu cầu và phản hồi thuộc về người tạo; PlatformAdmin xử lý chúng trong khu quản trị.</Alert>;
  }

  return <>
    <PageHeader
      title="Hỗ trợ & phản hồi"
      description="Gửi yêu cầu hỗ trợ, theo dõi trao đổi với đội Fire3D và gửi phản hồi về sản phẩm. Chỉ bạn xem được các mục do bạn tạo."
      breadcrumbs={[{ label: "Không gian tổ chức", href: routes.workspaceBuildings }, { label: "Hỗ trợ & phản hồi" }]}
    />
    <Tabs value={tab} onValueChange={(value) => { if (isTab(value) && value !== tab) setParams({ tab: value === "tickets" ? null : value, ticket: null, status: null, page: null }); }}>
      <TabsList aria-label="Hỗ trợ và phản hồi">
        <TabsTrigger value="tickets">Yêu cầu hỗ trợ</TabsTrigger>
        <TabsTrigger value="feedback">Phản hồi</TabsTrigger>
      </TabsList>
      <TabsContent value="tickets"><TicketsTab accessToken={accessToken} myId={user.id} /></TabsContent>
      <TabsContent value="feedback"><FeedbackTab accessToken={accessToken} /></TabsContent>
    </Tabs>
  </>;
}
