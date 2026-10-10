/*
 * SAMPLE DATA — development prototype only (loaded through the prototype chunk, never in production).
 * In-memory imitation of the Learn CMS gates described in Docs v7: ETag/If-Match, Idempotency-Key receipts,
 * Draft -> Published versions, post lifecycle Unpublished/Published/Hidden/Deleted.
 */
import { ApiError, type PageResponse } from "@/api/types/common";
import { sampleHash } from "@/features/admin-reviews/sample-store";
import { toWireContent } from "./api";
import type { ContentBlock, CreatePostInput, DraftContent, LearnCatalog, LearnCmsPort, LearnListFilters, LearnPost, LearnPostSummary, LearnVersion, LifecycleAction, PostStatus, WithEtag } from "./types";
import { validateDraft, validateSlug } from "./validate";

export const sampleCatalog: LearnCatalog = {
  situations: [
    { id: "sit-high-rise", name: "Cháy nhà cao tầng" },
    { id: "sit-smoke", name: "Khói và thoát nạn" },
    { id: "sit-extinguisher", name: "Dùng bình chữa cháy" },
    { id: "sit-kitchen", name: "Cháy bếp gia đình" },
    { id: "sit-route", name: "Chọn lối thoát hiểm" },
    { id: "sit-assist", name: "Hỗ trợ người di chuyển chậm" },
  ],
  sources: [
    { id: "src-qcvn", title: "QCVN 06:2022/BXD — An toàn cháy cho nhà và công trình (mẫu)", status: "Approved" },
    { id: "src-tcvn", title: "TCVN 3890 — Phương tiện PCCC cho nhà và công trình (mẫu)", status: "Approved" },
    { id: "src-guide", title: "Hướng dẫn thoát nạn của cơ quan PCCC địa phương (mẫu)", status: "Approved" },
    { id: "src-draft", title: "Tài liệu nội bộ chờ thẩm định (mẫu)", status: "Pending" },
  ],
};

let blockSeq = 0;
const block = {
  heading: (text: string): ContentBlock => ({ id: `b-${(blockSeq += 1)}`, type: "heading", text }),
  paragraph: (text: string): ContentBlock => ({ id: `b-${(blockSeq += 1)}`, type: "paragraph", text }),
  video: (url: string, title: string, fallbackSummary: string): ContentBlock => ({ id: `b-${(blockSeq += 1)}`, type: "video", url, title, fallbackSummary }),
};

const hashOf = (content: DraftContent) => sampleHash(JSON.stringify(toWireContent(content)));
const day = (n: number) => new Date(Date.UTC(2026, 9, 10 - n, 8, 0)).toISOString();

type PostSeed = { slug: string; status: PostStatus; kind: DraftContent["kind"]; title: string; summary: string; blocks: ContentBlock[]; situations: string[]; sources: string[]; days: number; draftTitle?: string; wasPublic?: boolean };

const postSeeds: PostSeed[] = [
  { slug: "thoat-nan-khoi-khoi", status: "Published", kind: "Article", title: "Thoát nạn khi có khói dày", summary: "Cách hạ thấp người, che mũi miệng và chọn hướng thoát khi hành lang đầy khói.", blocks: [block.heading("Nguyên tắc đầu tiên"), block.paragraph("Khói nguy hiểm hơn lửa. Hạ thấp người, di chuyển sát tường và đếm cửa trên đường thoát.")], situations: ["sit-smoke", "sit-route"], sources: ["src-qcvn"], days: 3, draftTitle: "Thoát nạn khi có khói dày (bản cập nhật)" },
  { slug: "dung-binh-chua-chay-pass", status: "Published", kind: "Tip", title: "Nhớ nhanh quy tắc PASS", summary: "Giật chốt, hướng vòi, bóp cò, quét đều.", blocks: [block.paragraph("Giật chốt an toàn. Hướng vòi vào gốc lửa. Bóp cò. Quét đều từ bên này sang bên kia.")], situations: ["sit-extinguisher"], sources: ["src-tcvn"], days: 6 },
  { slug: "video-thoat-hiem-chung-cu", status: "Published", kind: "Video", title: "Thoát hiểm khỏi chung cư khi mất điện", summary: "Hướng dẫn minh họa đi cầu thang bộ khi thang máy ngừng.", blocks: [block.video("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "Thoát hiểm chung cư", "Video minh họa cách dùng cầu thang bộ khi mất điện: giữ tay vịn, không chen lấn và không quay lại lấy đồ.")], situations: ["sit-high-rise", "sit-route"], sources: ["src-guide"], days: 9 },
  { slug: "an-toan-bep-gia-dinh", status: "Hidden", kind: "Article", title: "An toàn khi nấu ăn", summary: "Xử lý dầu mỡ bốc cháy và khi nào nên rời khỏi bếp.", blocks: [block.paragraph("Không dùng nước dập lửa dầu mỡ. Đậy vung và tắt bếp nếu an toàn.")], situations: ["sit-kitchen"], sources: ["src-qcvn"], days: 12, wasPublic: true },
  { slug: "ho-tro-nguoi-gia", status: "Unpublished", kind: "Article", title: "Hỗ trợ người lớn tuổi khi sơ tán", summary: "Bản nháp đang chờ nguồn được duyệt.", blocks: [block.paragraph("Giữ bình tĩnh, nói rõ hướng đi và đi theo tốc độ của người cần hỗ trợ.")], situations: ["sit-assist"], sources: ["src-draft"], days: 2 },
  { slug: "tiktok-meo-thoat-nan", status: "Unpublished", kind: "Video", title: "Mẹo thoát nạn trong 30 giây", summary: "", blocks: [block.video("https://www.tiktok.com/@pccc.viet/video/7312345678901234567", "Mẹo thoát nạn", "")], situations: [], sources: [], days: 1 },
  { slug: "huong-dan-cu", status: "Deleted", kind: "Tip", title: "Hướng dẫn đã lỗi thời", summary: "Đã xóa mềm, vẫn giữ lịch sử.", blocks: [block.paragraph("Nội dung cũ không còn đúng quy định.")], situations: ["sit-route"], sources: ["src-tcvn"], days: 30, wasPublic: true },
  ...Array.from({ length: 6 }, (_, index): PostSeed => ({ slug: `bai-mau-${index + 1}`, status: (["Published", "Published", "Hidden", "Unpublished", "Published", "Hidden"] as PostStatus[])[index], kind: (["Article", "Tip", "Article", "Article", "Tip", "Video"] as const)[index], title: `Bài mẫu số ${index + 1}`, summary: "Nội dung mẫu để minh họa danh sách và phân trang.", blocks: [block.paragraph("Đoạn văn mẫu.")], situations: ["sit-route"], sources: ["src-qcvn"], days: 15 + index, wasPublic: index % 2 === 0 })),
];

function seedPost(seed: PostSeed, index: number): LearnPost {
  const content: DraftContent = { title: seed.title, summary: seed.summary, coverImageUrl: "", kind: seed.kind, blocks: seed.blocks, situationIds: seed.situations, sourceIds: seed.sources };
  const versions: LearnVersion[] = [];
  const publishedAt = seed.status === "Unpublished" ? null : day(seed.days);
  if (seed.status === "Unpublished") {
    versions.push({ ...content, id: `lv-${index}-1`, versionNumber: 1, status: "Draft", contentHash: hashOf(content), updatedAt: day(seed.days), publishedAt: null });
  } else {
    versions.push({ ...content, id: `lv-${index}-1`, versionNumber: 1, status: "Published", contentHash: hashOf(content), updatedAt: day(seed.days), publishedAt });
  }
  if (seed.draftTitle) {
    const draft = { ...content, title: seed.draftTitle };
    versions.push({ ...draft, id: `lv-${index}-2`, versionNumber: 2, status: "Draft", contentHash: hashOf(draft), updatedAt: day(1), publishedAt: null });
  }
  return { id: `lp-${index + 1}`, slug: seed.slug, status: seed.status, publishedVersionId: seed.status === "Published" || seed.status === "Hidden" ? versions[0].id : seed.status === "Deleted" && seed.wasPublic ? versions[0].id : null, createdAt: day(seed.days + 2), updatedAt: day(seed.days), versions };
}

const contentOf = (version: DraftContent): DraftContent => ({ title: version.title, summary: version.summary, coverImageUrl: version.coverImageUrl, kind: version.kind, blocks: version.blocks, situationIds: version.situationIds, sourceIds: version.sourceIds });
const nowIso = () => new Date().toISOString();
const clone = <T,>(value: T): T => structuredClone(value);

/** Failure injection for reviewing error states. */
export type LearnSimulation = { networkFailure: boolean };

export class SampleLearnStore implements LearnCmsPort {
  private posts = new Map<string, LearnPost>();
  private revisions = new Map<string, number>();
  private receipts = new Map<string, { fingerprint: string; result: LearnPost }>();
  private wasPublic = new Set<string>();
  private seq = 100;
  /** Read at call time so the UI can flip it without re-creating the store. */
  simulation: LearnSimulation = { networkFailure: false };

  constructor() {
    postSeeds.forEach((seed, index) => {
      const post = seedPost(seed, index);
      this.posts.set(post.id, post);
      this.revisions.set(post.id, 1);
      if (seed.wasPublic || seed.status === "Published") this.wasPublic.add(post.id);
    });
  }

  private etag(id: string) { return `"${this.revisions.get(id) ?? 1}"`; }
  private bump(post: LearnPost) { this.revisions.set(post.id, (this.revisions.get(post.id) ?? 1) + 1); post.updatedAt = nowIso(); }
  /** Writes take a visible moment so pending states can be reviewed; reads get theirs from `useSampleQuery`. */
  private async latency() {
    await new Promise((resolve) => setTimeout(resolve, 380));
    this.failIfOffline();
  }
  private failIfOffline() {
    if (this.simulation.networkFailure) throw new TypeError("Failed to fetch (mô phỏng mất kết nối)");
  }
  private require(id: string) {
    const post = this.posts.get(id);
    if (!post) throw new ApiError("Not found.", 404, undefined, undefined, "NOT_FOUND");
    return post;
  }
  private checkEtag(post: LearnPost, etag: string | undefined) {
    if (!etag) throw new ApiError("If-Match required.", 428, undefined, undefined, "PRECONDITION_REQUIRED");
    if (etag !== this.etag(post.id)) throw new ApiError("Precondition failed.", 412, undefined, undefined, "PRECONDITION_FAILED");
  }
  private replay(operation: string, key: string, fingerprint: string): LearnPost | null {
    const receipt = this.receipts.get(`${operation}:${key}`);
    if (!receipt) return null;
    if (receipt.fingerprint !== fingerprint) throw new ApiError("Conflict.", 409, undefined, undefined, "IDEMPOTENCY_KEY_CONFLICT");
    return clone(receipt.result);
  }
  private remember(operation: string, key: string, fingerprint: string, post: LearnPost) {
    this.receipts.set(`${operation}:${key}`, { fingerprint, result: clone(post) });
  }
  private snapshot(post: LearnPost): WithEtag<LearnPost> { return { data: clone(post), etag: this.etag(post.id) }; }

  setOffline(value: boolean) { this.simulation = { networkFailure: value }; }

  /** Test/demo hook: another admin edits the draft, so the caller's ETag becomes stale. */
  editElsewhere(postId: string) {
    const post = this.posts.get(postId);
    const draft = post?.versions.find((version) => version.status === "Draft");
    if (!post || !draft) return false;
    draft.title = `${draft.title.replace(/ \(sửa ở nơi khác\)$/, "")} (sửa ở nơi khác)`;
    draft.updatedAt = nowIso();
    this.bump(post);
    return true;
  }

  async catalog() { this.failIfOffline(); return clone(sampleCatalog); }

  async list(filters: LearnListFilters): Promise<PageResponse<LearnPostSummary>> {
    this.failIfOffline();
    const q = filters.q.trim().toLowerCase();
    const summaries = [...this.posts.values()].map((post): LearnPostSummary => {
      const published = post.versions.find((version) => version.id === post.publishedVersionId);
      const draft = post.versions.find((version) => version.status === "Draft");
      const latest = draft ?? published ?? post.versions[post.versions.length - 1];
      return { id: post.id, slug: post.slug, title: latest.title, kind: latest.kind, status: post.status, publishedVersionNumber: published?.versionNumber ?? null, draftVersionNumber: draft?.versionNumber ?? null, updatedAt: post.updatedAt };
    }).filter((item) => (!q || item.title.toLowerCase().includes(q) || item.slug.includes(q)) && (!filters.kind || item.kind === filters.kind) && (!filters.status || item.status === filters.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = (filters.page - 1) * filters.pageSize;
    return { items: summaries.slice(start, start + filters.pageSize), totalCount: summaries.length, page: filters.page, pageSize: filters.pageSize };
  }

  async get(postId: string) { this.failIfOffline(); return this.snapshot(this.require(postId)); }

  async create(input: CreatePostInput, key: string) {
    await this.latency();
    const fingerprint = JSON.stringify({ slug: input.slug, publishImmediately: input.publishImmediately, content: toWireContent(input.content) });
    const replayed = this.replay("create", key, fingerprint);
    if (replayed) return this.snapshot(this.posts.get(replayed.id) ?? replayed);
    const slugError = validateSlug(input.slug);
    if (slugError) throw new ApiError("Invalid.", 422, undefined, undefined, "INVALID_CONTENT", [{ code: "INVALID_SLUG", path: "slug", message: slugError }]);
    if ([...this.posts.values()].some((post) => post.slug === input.slug)) throw new ApiError("Conflict.", 409, undefined, undefined, "LEARN_SLUG_TAKEN", [{ code: "LEARN_SLUG_TAKEN", path: "slug", message: "Slug này đã được dùng cho bài khác." }]);
    this.assertValid(input.content, input.publishImmediately);
    this.seq += 1;
    const id = `lp-${this.seq}`;
    const version: LearnVersion = { ...clone(input.content), id: `lv-${this.seq}-1`, versionNumber: 1, status: input.publishImmediately ? "Published" : "Draft", contentHash: hashOf(input.content), updatedAt: nowIso(), publishedAt: input.publishImmediately ? nowIso() : null };
    const post: LearnPost = { id, slug: input.slug, status: input.publishImmediately ? "Published" : "Unpublished", publishedVersionId: input.publishImmediately ? version.id : null, createdAt: nowIso(), updatedAt: nowIso(), versions: [version] };
    this.posts.set(id, post);
    this.revisions.set(id, 1);
    if (input.publishImmediately) this.wasPublic.add(id);
    this.remember("create", key, fingerprint, post);
    return this.snapshot(post);
  }

  async saveDraft(postId: string, versionId: string, content: DraftContent, etag: string) {
    await this.latency();
    const post = this.require(postId);
    this.checkEtag(post, etag);
    const version = post.versions.find((item) => item.id === versionId);
    if (!version) throw new ApiError("Not found.", 404, undefined, undefined, "NOT_FOUND");
    if (version.status !== "Draft" || post.status === "Deleted") throw new ApiError("Conflict.", 409, undefined, undefined, "LEARN_VERSION_IMMUTABLE");
    this.assertValid(content, false);
    Object.assign(version, clone(content), { contentHash: hashOf(content), updatedAt: nowIso() });
    this.bump(post);
    return { etag: this.etag(post.id) };
  }

  async newDraft(postId: string, fromVersionId: string, etag: string, key: string) {
    await this.latency();
    const post = this.require(postId);
    const fingerprint = JSON.stringify({ postId, fromVersionId, etag });
    const replayed = this.replay("newDraft", key, fingerprint);
    if (replayed) return this.snapshot(post);
    this.checkEtag(post, etag);
    const from = post.versions.find((item) => item.id === fromVersionId);
    if (!from) throw new ApiError("Not found.", 404, undefined, undefined, "NOT_FOUND");
    if (post.versions.some((item) => item.status === "Draft")) throw new ApiError("Conflict.", 409, undefined, undefined, "LEARN_DRAFT_EXISTS");
    const next = Math.max(...post.versions.map((item) => item.versionNumber)) + 1;
    this.seq += 1;
    const content = contentOf(clone(from));
    post.versions.push({ ...content, id: `lv-${this.seq}-${next}`, versionNumber: next, status: "Draft", contentHash: hashOf(content), updatedAt: nowIso(), publishedAt: null });
    this.bump(post);
    this.remember("newDraft", key, fingerprint, post);
    return this.snapshot(post);
  }

  async transition(postId: string, action: LifecycleAction, versionId: string | null, etag: string, key: string) {
    await this.latency();
    const post = this.require(postId);
    const fingerprint = JSON.stringify({ postId, action, versionId, etag });
    const replayed = this.replay(`t-${action}`, key, fingerprint);
    if (replayed) return this.snapshot(post);
    this.checkEtag(post, etag);
    const conflict = (code: string) => new ApiError("Conflict.", 409, undefined, undefined, code);
    switch (action) {
      case "publish": {
        if (post.status === "Deleted" || post.status === "Hidden") throw conflict("LEARN_STATE_NOT_ALLOWED");
        const draft = post.versions.find((item) => item.id === versionId && item.status === "Draft");
        if (!draft) throw conflict("LEARN_DRAFT_REQUIRED");
        this.assertValid(draft, true);
        draft.status = "Published";
        draft.publishedAt = nowIso();
        post.publishedVersionId = draft.id;
        post.status = "Published";
        this.wasPublic.add(post.id);
        break;
      }
      case "hide":
        if (post.status !== "Published") throw conflict("LEARN_STATE_NOT_ALLOWED");
        post.status = "Hidden";
        break;
      case "show": {
        if (post.status !== "Hidden" || !post.publishedVersionId) throw conflict("LEARN_STATE_NOT_ALLOWED");
        const pinned = post.versions.find((item) => item.id === post.publishedVersionId);
        if (pinned) this.assertSources(pinned);
        post.status = "Published";
        break;
      }
      case "delete":
        if (post.status === "Deleted") throw conflict("LEARN_STATE_NOT_ALLOWED");
        post.status = "Deleted";
        break;
      case "restore":
        if (post.status !== "Deleted") throw conflict("LEARN_STATE_NOT_ALLOWED");
        post.status = this.wasPublic.has(post.id) && post.publishedVersionId ? "Hidden" : "Unpublished";
        break;
    }
    this.bump(post);
    this.remember(`t-${action}`, key, fingerprint, post);
    return this.snapshot(post);
  }

  private assertSources(content: DraftContent) {
    const unapproved = sampleCatalog.sources.filter((source) => content.sourceIds.includes(source.id) && source.status !== "Approved");
    if (unapproved.length > 0) throw new ApiError("Conflict.", 409, undefined, undefined, "LEARN_SOURCE_NOT_APPROVED");
  }

  private assertValid(content: DraftContent, forPublish: boolean) {
    const issues = validateDraft(content, { forPublish: false });
    if (issues.length > 0) throw new ApiError("Invalid content.", 422, undefined, undefined, "INVALID_CONTENT", issues.map((issue) => ({ code: "INVALID_CONTENT", ...issue })));
    if (forPublish) {
      const publishIssues = validateDraft(content, { forPublish: true }).filter((issue) => issue.path !== "sourceIds");
      if (publishIssues.length > 0) throw new ApiError("Invalid content.", 422, undefined, undefined, "INVALID_CONTENT", publishIssues.map((issue) => ({ code: "INVALID_CONTENT", ...issue })));
      this.assertSources(content);
    }
  }
}
