import type { Page, Route } from "@playwright/test";

/*
 * Stateful MOCK of the Learn backend (BE docs/learn-library.md, ContentController, learn_*_gate SQL). It keeps posts,
 * versions, receipts and bookmarks across requests so a reload "recovers from the server", and it enforces the same
 * rules the real gates do (If-Match revisions, Idempotency-Key replay, lifecycle table, content validation, source
 * approval at publish). It is mock evidence only: nothing here proves the deployed API behaves this way.
 */

export const admin = { id: "learn-admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
export const trainee = { id: "learner", email: "learner@fire3d.test", fullName: "Học viên", role: 2, organizationId: null };
export const orgUser = { id: "org-owner", email: "owner@fire3d.test", fullName: "Chủ tổ chức", role: 1, organizationId: "org-1", profileRevision: 1 };

export type Actor = "admin" | "trainee" | "org" | "guest";
export type PostStatus = "Unpublished" | "Published" | "Hidden" | "Deleted";
export type Call = { method: string; path: string; search: string; headers: Record<string, string>; body: unknown };
type Json = Record<string, unknown>;
type Reply = { status: number; json?: unknown; headers?: Record<string, string>; delayMs?: number; /** Run the real handler first (the command IS applied) and only then answer with this reply: a lost response. */ applyFirst?: boolean };

type Version = {
  id: string; postId: string; versionNumber: number; kind: string; title: string; summary: string; coverImageUrl: string | null; blocks: Json[];
  contentHash: string; status: "Draft" | "Published"; publishedAt: string | null; revision: number; createdAt: string; updatedAt: string;
  situationIds: string[]; sources: Array<{ sourceId: string; role: string; locator: Json }>;
};
type Post = { id: string; slug: string; status: PostStatus; publishedVersionId: string | null; revision: number; createdAt: string; updatedAt: string };
export type Source = {
  id: string; visibility: string; title: string; versionLabel: string; jurisdiction: string | null; sourceUri: string | null;
  approvalStatus: "Draft" | "Approved" | "Retired"; effectiveFrom: string | null; effectiveUntil: string | null; revision: number; createdAt: string;
};
export type Situation = { id: string; slug: string; name: string; description: string | null; isActive: boolean; createdAt: string; updatedAt: string };

const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MARKUP = /<\s*[a-zA-Z/!?]/;
const YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const NUMERIC = /^[0-9]{8,25}$/;
const HANDLE = /^@[A-Za-z0-9._]{2,24}$/;
const MARKS = ["bold", "italic", "underline", "strike"];
const TONES = ["default", "ember", "danger", "warning", "success", "info"];
/** A 1×1 PNG: what uploaded Learn images answer with. */
export const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
/** Host of the presigned PUT URLs the model hands out for Learn image uploads. */
export const STORAGE_HOST = "https://storage.test";

export function canonicalize(input: string): { provider: string; videoId: string; canonicalUrl: string } | null {
  let uri: URL;
  try { uri = new URL(input.trim()); } catch { return null; }
  if (uri.protocol !== "https:" || uri.username || uri.port) return null;
  let host = uri.hostname.toLowerCase();
  for (const prefix of ["www.", "m."]) if (host.startsWith(prefix)) host = host.slice(prefix.length);
  const segments = uri.pathname.split("/").filter(Boolean);
  if (host === "youtube.com") {
    const id = segments.length === 1 && segments[0] === "watch" ? uri.searchParams.get("v") : segments.length === 2 && ["shorts", "embed", "live"].includes(segments[0]) ? segments[1] : null;
    return id && YOUTUBE.test(id) ? { provider: "YouTube", videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === "youtu.be") return segments.length === 1 && YOUTUBE.test(segments[0]) ? { provider: "YouTube", videoId: segments[0], canonicalUrl: `https://www.youtube.com/watch?v=${segments[0]}` } : null;
  if (host === "tiktok.com") return segments.length === 3 && HANDLE.test(segments[0]) && segments[1] === "video" && NUMERIC.test(segments[2]) ? { provider: "TikTok", videoId: segments[2], canonicalUrl: `https://www.tiktok.com/${segments[0]}/video/${segments[2]}` } : null;
  if (host === "facebook.com") {
    const id = segments.length === 1 && segments[0] === "watch" ? uri.searchParams.get("v") : segments.length >= 3 && segments[1] === "videos" ? segments[2] : segments.length === 2 && segments[0] === "reel" ? segments[1] : null;
    return id && NUMERIC.test(id) ? { provider: "Facebook", videoId: id, canonicalUrl: `https://www.facebook.com/watch/?v=${id}` } : null;
  }
  return null;
}

/** learn_fold_text: NFC, lower case, Vietnamese diacritics removed, đ/Đ become d. */
export const fold = (text: string) => text.normalize("NFC").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/g, "d");

type Issue = { code: string; path: string; message: string };

export class LearnBackend {
  actor: Actor = "admin";
  calls: Call[] = [];
  posts = new Map<string, Post>();
  versions = new Map<string, Version>();
  situations: Situation[] = [];
  sources: Source[] = [];
  bookmarks: Array<{ postId: string; at: string }> = [];
  /** Learn image uploads (BE#171): intent → PUT to STORAGE_HOST → complete. */
  uploads: Array<{ id: string; contentType: string; sizeBytes: number; put: boolean; completed: boolean }> = [];
  private receipts = new Map<string, { hash: string; reply: { status: number; json: unknown; etag?: string } }>();
  private overrides: Array<{ method: string; pattern: RegExp; reply: Reply }> = [];
  private counter = 1;
  private clock = Date.parse("2026-10-01T08:00:00Z");

  private tick() { this.clock += 60_000; return new Date(this.clock).toISOString(); }
  private id(prefix: string) { return uuid(prefix, this.counter++); }

  /** The next matching request gets this reply instead of the real handler (it is still logged). */
  failNext(method: string, pattern: RegExp, reply: Reply) { this.overrides.push({ method, pattern, reply }); }
  takeOverride(method: string, path: string): Reply | undefined {
    const index = this.overrides.findIndex((item) => item.method === method && item.pattern.test(path));
    return index >= 0 ? this.overrides.splice(index, 1)[0].reply : undefined;
  }

  seedSituation(slug: string, name: string, options: { isActive?: boolean; description?: string } = {}): Situation {
    const stamp = this.tick();
    const situation: Situation = { id: this.id("5170a710"), slug, name, description: options.description ?? null, isActive: options.isActive ?? true, createdAt: stamp, updatedAt: stamp };
    this.situations.push(situation);
    return situation;
  }

  seedSource(title: string, options: Partial<Source> = {}): Source {
    const source: Source = { id: this.id("50c0ce00"), visibility: "Common", title, versionLabel: "2024", jurisdiction: "VN", sourceUri: null, approvalStatus: "Approved", effectiveFrom: null, effectiveUntil: null, revision: 1, createdAt: this.tick(), ...options };
    this.sources.push(source);
    return source;
  }

  /** A post created through the same path the API uses, optionally published / hidden / deleted. */
  seedPost(slug: string, content: Partial<Pick<Version, "kind" | "title" | "summary" | "blocks" | "coverImageUrl" | "situationIds" | "sources">> & { status?: PostStatus } = {}): { post: Post; version: Version } {
    const stamp = this.tick();
    const post: Post = { id: this.id("9057a000"), slug, status: "Unpublished", publishedVersionId: null, revision: 1, createdAt: stamp, updatedAt: stamp };
    this.posts.set(post.id, post);
    const version = this.newVersion(post, { kind: content.kind ?? "Article", title: content.title ?? `Bài ${slug}`, summary: content.summary ?? `Tóm tắt của ${slug}.`, coverImageUrl: content.coverImageUrl ?? null, blocks: content.blocks ?? [{ type: "paragraph", text: `Nội dung của ${slug}.` }], situationIds: content.situationIds ?? [], sources: content.sources ?? [] });
    const wanted = content.status ?? "Unpublished";
    if (wanted !== "Unpublished") {
      this.publish(post, version);
      if (wanted === "Hidden") { post.status = "Hidden"; post.revision += 1; }
      if (wanted === "Deleted") { post.status = "Deleted"; post.revision += 1; }
    }
    return { post, version };
  }

  addBookmark(slug: string) { this.bookmarks.push({ postId: this.bySlug(slug)!.id, at: this.tick() }); }

  /** Another admin edits a Draft behind the UI's back: revision moves, so the UI's If-Match goes stale. */
  externalEdit(versionId: string, patch: Partial<Pick<Version, "title" | "summary">>) {
    const version = this.versions.get(versionId)!;
    Object.assign(version, patch, { revision: version.revision + 1, updatedAt: this.tick() });
  }
  externalLifecycle(postId: string, status: PostStatus) { const post = this.posts.get(postId)!; post.status = status; post.revision += 1; post.updatedAt = this.tick(); }

  callsTo(method: string, pattern: RegExp) { return this.calls.filter((call) => call.method === method && pattern.test(call.path)); }
  versionsOf(postId: string) { return [...this.versions.values()].filter((version) => version.postId === postId).sort((a, b) => a.versionNumber - b.versionNumber); }
  bySlug(slug: string) { return [...this.posts.values()].find((post) => post.slug === slug); }

  // ---- model --------------------------------------------------------------------------------------------------------

  private newVersion(post: Post, content: Pick<Version, "kind" | "title" | "summary" | "coverImageUrl" | "blocks" | "situationIds" | "sources">): Version {
    const stamp = this.tick();
    const number = Math.max(0, ...this.versionsOf(post.id).map((version) => version.versionNumber)) + 1;
    const version: Version = { id: this.id("7e251000"), postId: post.id, versionNumber: number, ...content, contentHash: `${this.counter}`.padStart(64, "0"), status: "Draft", publishedAt: null, revision: 1, createdAt: stamp, updatedAt: stamp };
    this.versions.set(version.id, version);
    return version;
  }

  private publish(post: Post, version: Version) {
    const stamp = this.tick();
    version.status = "Published"; version.publishedAt = stamp; version.revision += 1; version.updatedAt = stamp;
    post.publishedVersionId = version.id;
    post.status = post.status === "Hidden" ? "Hidden" : "Published";
    post.revision += 1; post.updatedAt = stamp;
  }

  private versionJson(version: Version): Json {
    return {
      id: version.id, postId: version.postId, versionNumber: version.versionNumber, contentSchemaVersion: "fet3d.learn/1", kind: version.kind, title: version.title, summary: version.summary,
      coverImageUrl: version.coverImageUrl, blocks: version.blocks, contentHash: version.contentHash, status: version.status, publishedAt: version.publishedAt, revision: version.revision,
      createdAt: version.createdAt, updatedAt: version.updatedAt,
      situations: version.situationIds.map((id) => this.situations.find((item) => item.id === id)).filter(Boolean).sort((a, b) => a!.slug.localeCompare(b!.slug)).map((item) => ({ id: item!.id, slug: item!.slug, name: item!.name })),
      sources: version.sources.map((entry) => { const source = this.sources.find((item) => item.id === entry.sourceId)!; return { sourceId: source.id, title: source.title, versionLabel: source.versionLabel, role: entry.role, locator: entry.locator }; }),
    };
  }

  private postJson(post: Post, admin: boolean): Json {
    const published = post.publishedVersionId ? this.versions.get(post.publishedVersionId) : undefined;
    const base: Json = { id: post.id, slug: post.slug, publicationStatus: post.status, publishedVersionId: post.publishedVersionId, revision: post.revision, createdAt: post.createdAt, updatedAt: post.updatedAt, publishedVersion: published ? this.versionJson(published) : null };
    if (admin) base.versions = this.versionsOf(post.id).reverse().map((version) => ({ id: version.id, versionNumber: version.versionNumber, status: version.status, title: version.title, revision: version.revision, updatedAt: version.updatedAt }));
    return base;
  }

  private sourceJson(source: Source): Json {
    const now = this.clock;
    const common = source.visibility === "Common";
    return {
      id: source.id, visibility: source.visibility, organizationId: null, title: source.title, sourceUri: source.sourceUri, versionLabel: source.versionLabel, sourceHash: "a".repeat(64), jurisdiction: source.jurisdiction,
      effectiveFrom: source.effectiveFrom, effectiveUntil: source.effectiveUntil, approvalStatus: source.approvalStatus, approvedAt: source.approvalStatus === "Draft" ? null : source.createdAt, createdAt: source.createdAt, revision: source.revision,
      canUseInDraft: common && (source.approvalStatus === "Draft" || source.approvalStatus === "Approved"),
      canPublishReference: common && source.approvalStatus === "Approved" && (!source.effectiveFrom || Date.parse(source.effectiveFrom) <= now) && (!source.effectiveUntil || Date.parse(source.effectiveUntil) > now),
    };
  }

  private normalize(input: unknown): { issues: Issue[]; content?: Pick<Version, "kind" | "title" | "summary" | "coverImageUrl" | "blocks" | "situationIds" | "sources"> } {
    const issues: Issue[] = [];
    const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
    const body = (typeof input === "object" && input !== null ? input : {}) as Json;
    const text = (value: unknown, path: string, max: number): string | null => {
      if (typeof value !== "string") { add("FIELD_REQUIRED", path, "Text is required."); return null; }
      const trimmed = value.trim();
      if (!trimmed || trimmed.length > max) { add("STRING_INVALID", path, `Use 1-${max} characters.`); return null; }
      if (MARKUP.test(trimmed)) { add("MARKUP_NOT_ALLOWED", path, "HTML, iframe and script are not accepted; use plain text."); return null; }
      return trimmed;
    };
    const https = (value: unknown, path: string, required: boolean): string | null => {
      if (value === null || value === undefined) { if (required) add("FIELD_REQUIRED", path, "An https URL is required."); return null; }
      try { const url = new URL(String(value)); if (url.protocol === "https:" && !url.username) return url.href; } catch { /* below */ }
      add("URL_INVALID", path, "Use an absolute https URL without credentials.");
      return null;
    };
    const kind = String(body.kind);
    if (!["Article", "Tip", "Video"].includes(kind)) add("VALUE_UNSUPPORTED", "$.kind", "Use Article, Tip or Video.");
    const title = text(body.title, "$.title", 255);
    const summary = text(body.summary, "$.summary", 2000);
    const cover = https(body.coverImageUrl, "$.coverImageUrl", false);
    const blocks: Json[] = [];
    let videos = 0;
    const raw = Array.isArray(body.blocks) ? body.blocks : [];
    if (raw.length === 0 || raw.length > 200) add("FIELD_REQUIRED", "$.blocks", "Use 1-200 blocks.");
    // BE#172: `text` or `runs` (both is TEXT_OR_RUNS); stored as the joined `text` plus `runs` only when formatted.
    const rich = (block: Json, path: string, max: number): Json | null => {
      if (block.runs === undefined) { const t = text(block.text, `${path}.text`, max); return t ? { text: t } : null; }
      if (block.text !== undefined) { add("TEXT_OR_RUNS", path, "Use text or runs, not both."); return null; }
      return runs(block.runs, `${path}.runs`, max);
    };
    const runs = (value: unknown, path: string, max: number): Json | null => {
      if (!Array.isArray(value) || value.length === 0 || value.length > 200) { add("RUNS_INVALID", path, "Use 1-200 runs."); return null; }
      const clean: Json[] = [];
      value.forEach((entry, position) => {
        const run = (typeof entry === "object" && entry !== null ? entry : {}) as Json;
        const at = `${path}[${position}]`;
        if (typeof run.text !== "string" || !run.text) { add("STRING_INVALID", `${at}.text`, "Run text is required."); return; }
        if (MARKUP.test(run.text)) { add("MARKUP_NOT_ALLOWED", `${at}.text`, "HTML is not accepted."); return; }
        const out: Json = { text: run.text };
        const marks = Array.isArray(run.marks) ? run.marks : [];
        if (marks.some((mark) => !MARKS.includes(String(mark)))) add("MARK_UNSUPPORTED", `${at}.marks`, "Unsupported mark.");
        else if (marks.length) out.marks = MARKS.filter((mark) => marks.includes(mark));
        for (const key of ["color", "highlight"]) {
          if (run[key] === undefined) continue;
          if (!TONES.includes(String(run[key]))) add("COLOR_UNSUPPORTED", `${at}.${key}`, "Use a theme token.");
          else if (run[key] !== "default") out[key] = run[key];
        }
        if (run.link !== undefined) { const link = https(run.link, `${at}.link`, true); if (link) out.link = link; }
        clean.push(out);
      });
      const joined = clean.map((run) => String(run.text)).join("").trim();
      if (!joined || joined.length > max) { add("STRING_INVALID", path, `Use 1-${max} characters.`); return null; }
      const formatted = clean.some((run) => Object.keys(run).length > 1);
      return formatted ? { text: joined, runs: clean } : { text: joined };
    };
    raw.forEach((item, index) => {
      const path = `$.blocks[${index}]`;
      const block = (typeof item === "object" && item !== null ? item : null) as Json | null;
      if (!block || typeof block.type !== "string") { add("TYPE_INVALID", path, "Each block is an object with a type."); return; }
      const allowed: Record<string, string[]> = { heading: ["type", "text", "runs", "level"], paragraph: ["type", "text", "runs"], list: ["type", "ordered", "items"], callout: ["type", "tone", "text", "runs"], image: ["type", "url", "alt"], video: ["type", "url"], divider: ["type"] };
      const fields = allowed[block.type];
      if (!fields) { add("VALUE_UNSUPPORTED", `${path}.type`, "Use heading, paragraph, list, callout, image, video or divider."); return; }
      for (const name of Object.keys(block)) if (!fields.includes(name)) add("FIELD_UNKNOWN", `${path}.${name}`, "Field is not defined for this block type.");
      if (block.type === "heading") { const level = Number(block.level); if (!(level >= 2 && level <= 4)) add("VALUE_UNSUPPORTED", `${path}.level`, "Heading level is 2, 3 or 4."); const t = rich(block, path, 200); if (t) blocks.push({ type: "heading", ...t, level }); }
      else if (block.type === "paragraph") { const t = rich(block, path, 5000); if (t) blocks.push({ type: "paragraph", ...t }); }
      else if (block.type === "divider") blocks.push({ type: "divider" });
      else if (block.type === "callout") { const tone = block.tone; if (!["info", "warning", "danger"].includes(String(tone))) add("VALUE_UNSUPPORTED", `${path}.tone`, "Tone is info, warning or danger."); const t = rich(block, path, 2000); if (t && tone) blocks.push({ type: "callout", tone, ...t }); }
      else if (block.type === "list") {
        const items = Array.isArray(block.items) ? block.items : [];
        if (items.length === 0 || items.length > 50) add("FIELD_REQUIRED", `${path}.items`, "Use 1-50 items.");
        const clean = items.map((entry, position) => (typeof entry === "object" && entry !== null ? runs((entry as Json).runs, `${path}.items[${position}].runs`, 1000) : (() => { const t = text(entry, `${path}.items[${position}]`, 1000); return t ? { text: t } : null; })())).filter((entry): entry is Json => entry !== null);
        const itemRuns = clean.some((entry) => entry.runs) ? { itemRuns: clean.map((entry) => entry.runs ?? [{ text: entry.text }]) } : {};
        blocks.push({ type: "list", ordered: block.ordered === true, items: clean.map((entry) => entry.text), ...itemRuns });
      } else if (block.type === "image") { const url = https(block.url, `${path}.url`, true); const alt = text(block.alt, `${path}.alt`, 300); if (url && alt) blocks.push({ type: "image", url, alt }); }
      else if (block.type === "video") {
        const media = typeof block.url === "string" ? canonicalize(block.url) : null;
        if (!media) add("LEARN_MEDIA_INVALID", `${path}.url`, "Use a YouTube, Facebook or TikTok video URL in its full form.");
        else { videos += 1; blocks.push({ type: "video", provider: media.provider, videoId: media.videoId, url: media.canonicalUrl }); }
      }
    });
    if (kind === "Video" && videos === 0) add("VIDEO_REQUIRED", "$.blocks", "A Video post needs at least one video block.");
    const situationIds = Array.isArray(body.situationIds) ? (body.situationIds as string[]) : [];
    if (situationIds.length > 20 || new Set(situationIds).size !== situationIds.length) add("SITUATIONS_INVALID", "$.situationIds", "Use up to 20 distinct situations.");
    const sources = (Array.isArray(body.sources) ? body.sources : []) as Array<{ sourceId: string; role: string; locator?: Json }>;
    if (sources.length > 20 || sources.some((entry) => !["Primary", "Reference", "Transcript"].includes(entry.role))) add("SOURCES_INVALID", "$.sources", "Use up to 20 distinct sources with role Primary, Reference or Transcript.");
    if (issues.length) return { issues };
    return { issues, content: { kind, title: title!, summary: summary!, coverImageUrl: cover, blocks, situationIds: [...situationIds].sort(), sources: sources.map((entry) => ({ sourceId: entry.sourceId, role: entry.role, locator: entry.locator ?? {} })) } };
  }

  /**
   * GET /api/learn/posts as the BE implements it (ContentController.Posts + learn_public_gate): `search` is trimmed and must be 2-100 characters,
   * matched anywhere in title+" "+summary ignoring case and Vietnamese diacritics; `situation` repeats (<=10 slugs of <=120 chars, OR, only ACTIVE
   * situations match, an unknown slug just matches nothing); `kind` repeats (Article/Tip/Video, OR, case-insensitive); the filters combine with AND.
   * Only Published posts whose published version is Published appear, newest first (publishedAt desc, id), filters run before paging and `total` is exact.
   * Invalid values answer 400 VALIDATION_ERROR with `errors` per field; page < 1 or pageSize outside 1-100 answers 400 without `errors`.
   */
  private publicList(query: URLSearchParams): Reply {
    const errors: Record<string, string[]> = {};
    const rawSearch = query.get("search");
    const search = rawSearch && rawSearch.trim() ? rawSearch.trim() : null;
    if (search !== null && (search.length < 2 || search.length > 100)) errors.search = ["search must be 2-100 characters after trimming."];
    const slugs = [...new Set(query.getAll("situation").filter((value) => value.trim()).map((value) => value.trim()))];
    if (slugs.length > 10 || slugs.some((value) => value.length > 120)) errors.situation = ["Use at most 10 situation slugs of up to 120 characters."];
    const kinds: string[] = [];
    for (const value of query.getAll("kind").filter((item) => item.trim())) {
      const known = ["Article", "Tip", "Video"].find((kind) => kind.toLowerCase() === value.trim().toLowerCase());
      if (known) { if (!kinds.includes(known)) kinds.push(known); } else errors.kind = ["kind must be Article, Tip or Video."];
    }
    if (Object.keys(errors).length) return { status: 400, json: { status: 400, title: "Learn filters are invalid.", detail: "Kiểm tra các trường được liệt kê.", code: "VALIDATION_ERROR", errors } };
    const page = Number(query.get("page") ?? 1);
    const pageSize = Number(query.get("pageSize") ?? 20);
    if (!Number.isInteger(page) || !Number.isInteger(pageSize) || page < 1 || pageSize < 1 || pageSize > 100) return this.problem(400, "VALIDATION_ERROR", "page >= 1 and pageSize 1-100.");
    const wanted = search === null ? null : fold(search);
    const activeSlugs = new Map(this.situations.filter((item) => item.isActive).map((item) => [item.slug, item.id]));
    const matches = [...this.posts.values()].flatMap((post) => {
      const version = post.status === "Published" && post.publishedVersionId ? this.versions.get(post.publishedVersionId) : undefined;
      if (!version || version.status !== "Published") return [];
      if (kinds.length && !kinds.includes(version.kind)) return [];
      if (slugs.length && !slugs.some((slug) => activeSlugs.has(slug) && version.situationIds.includes(activeSlugs.get(slug)!))) return [];
      if (wanted !== null && !fold(`${version.title} ${version.summary}`).includes(wanted)) return [];
      return [{ post, version }];
    }).sort((a, b) => Date.parse(b.version.publishedAt!) - Date.parse(a.version.publishedAt!) || a.post.id.localeCompare(b.post.id));
    const slice = matches.slice((page - 1) * pageSize, page * pageSize);
    return { status: 200, json: { items: slice.map(({ post, version }) => ({ id: post.id, slug: post.slug, kind: version.kind, title: version.title, summary: version.summary, coverImageUrl: version.coverImageUrl, publishedAt: version.publishedAt })), total: matches.length, page, pageSize } };
  }

  // ---- HTTP ---------------------------------------------------------------------------------------------------------

  private problem(status: number, code: string, title: string, extra: Json = {}): Reply { return { status, json: { status, title, code, ...extra } }; }

  /** Optional-key replay for If-Match commands, mandatory for creates, like the real gates. */
  private withKey(key: string | undefined, operation: string, hashInput: unknown, required: boolean, run: () => Reply): Reply {
    if (required && (!key || key.length > 128 || /\s/.test(key))) return this.problem(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    if (!key) return run();
    const hash = JSON.stringify(hashInput);
    const id = `${operation}:${key}`;
    const found = this.receipts.get(id);
    if (found) return found.hash === hash ? { status: found.reply.status, json: found.reply.json, headers: found.reply.etag ? { ETag: found.reply.etag } : undefined } : this.problem(409, "IDEMPOTENCY_KEY_CONFLICT", "The key was used with another input.");
    const reply = run();
    if (reply.status < 300) this.receipts.set(id, { hash, reply: { status: reply.status, json: reply.json, etag: reply.headers?.ETag } });
    return reply;
  }

  private ifMatch(header: string | undefined): number | Reply {
    if (!header) return this.problem(428, "PRECONDITION_REQUIRED", "If-Match is required.");
    const match = /^"(\d+)"$/.exec(header);
    return match && Number(match[1]) >= 1 ? Number(match[1]) : this.problem(400, "INVALID_IF_MATCH", "If-Match must be the quoted revision from the ETag.");
  }

  private page<T>(items: T[], query: URLSearchParams) {
    const page = Number(query.get("page") ?? 1);
    const pageSize = Number(query.get("pageSize") ?? 20);
    return { bad: page < 1 || pageSize < 1 || pageSize > 100, page, pageSize, slice: items.slice((page - 1) * pageSize, page * pageSize), total: items.length };
  }

  handle(method: string, path: string, query: URLSearchParams, headers: Record<string, string>, body: unknown): Reply | null {
    const bearer = headers.authorization?.startsWith("Bearer ");
    const isAdmin = this.actor === "admin";
    const forbidAdmin = (): Reply | null => (!bearer ? this.problem(401, "UNAUTHORIZED", "Unauthorized") : !isAdmin ? this.problem(403, "FORBIDDEN", "Forbidden") : null);
    const etagFor = (revision: number) => ({ ETag: `"${revision}"` });

    // Public reads
    if (method === "GET" && path === "/api/learn/situations") return { status: 200, json: this.situations.filter((item) => item.isActive).sort((a, b) => a.name.localeCompare(b.name)).map(({ id, slug, name, description }) => ({ id, slug, name, description })) };
    if (method === "GET" && path === "/api/learn/posts") return this.publicList(query);
    const publicPost = /^\/api\/learn\/posts\/([^/]+)$/.exec(path);
    if (method === "GET" && publicPost) {
      const post = this.bySlug(decodeURIComponent(publicPost[1]));
      if (!post || post.status === "Unpublished" || post.status === "Deleted") return this.problem(404, "NOT_FOUND", "Not found");
      if (post.status === "Hidden") return this.problem(410, "LEARN_POST_UNAVAILABLE", "This post is not available.");
      return { status: 200, json: this.postJson(post, false) };
    }

    // Trainee bookmarks
    if (path === "/api/learn/bookmarks" && method === "GET") {
      if (!bearer) return this.problem(401, "UNAUTHORIZED", "Unauthorized");
      if (this.actor !== "trainee") return this.problem(403, "FORBIDDEN", "Forbidden");
      const ordered = [...this.bookmarks].sort((a, b) => b.at.localeCompare(a.at));
      const paged = this.page(ordered, query);
      if (paged.bad) return this.problem(400, "VALIDATION_ERROR", "page >= 1 and pageSize 1-100.");
      return { status: 200, json: { items: paged.slice.map((entry) => { const post = this.posts.get(entry.postId)!; const v = post.publishedVersionId ? this.versions.get(post.publishedVersionId) : undefined; return post.status === "Published" && v ? { postId: post.id, available: true, bookmarkedAt: entry.at, slug: post.slug, title: v.title, summary: v.summary, kind: v.kind } : { postId: post.id, available: false, bookmarkedAt: entry.at }; }), total: paged.total, page: paged.page, pageSize: paged.pageSize } };
    }
    const bookmark = /^\/api\/learn\/bookmarks\/([^/]+)$/.exec(path);
    if (bookmark && (method === "PUT" || method === "DELETE")) {
      if (!bearer) return this.problem(401, "UNAUTHORIZED", "Unauthorized");
      if (this.actor !== "trainee") return this.problem(403, "FORBIDDEN", "Forbidden");
      const post = this.posts.get(bookmark[1]);
      if (method === "PUT") {
        if (!post || post.status !== "Published") return this.problem(404, "NOT_FOUND", "Not found");
        if (!this.bookmarks.some((entry) => entry.postId === post.id)) this.bookmarks.push({ postId: post.id, at: this.tick() });
        return { status: 200, json: { postId: post.id, bookmarked: true } };
      }
      this.bookmarks = this.bookmarks.filter((entry) => entry.postId !== bookmark[1]);
      return { status: 200, json: { postId: bookmark[1], bookmarked: false } };
    }

    // Admin
    if (!path.startsWith("/api/admin/learn/") && !path.startsWith("/api/admin/knowledge-sources")) return null;
    const denied = forbidAdmin();
    if (denied) return denied;

    if (method === "GET" && path === "/api/admin/knowledge-sources") {
      const visibility = query.get("visibility"); const status = query.get("status"); const search = (query.get("search") ?? "").toLowerCase();
      const items = this.sources.filter((source) => (!visibility || source.visibility === visibility) && (!status || source.approvalStatus === status) && (!search || `${source.title} ${source.versionLabel} ${source.jurisdiction ?? ""}`.toLowerCase().includes(search))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const paged = this.page(items, query);
      return { status: 200, json: { items: paged.slice.map((source) => this.sourceJson(source)), total: paged.total, page: paged.page, pageSize: paged.pageSize } };
    }
    const sourceById = /^\/api\/admin\/knowledge-sources\/([^/]+)$/.exec(path);
    if (method === "GET" && sourceById) {
      const source = this.sources.find((item) => item.id === sourceById[1]);
      return source ? { status: 200, json: this.sourceJson(source), headers: etagFor(source.revision) } : this.problem(404, "NOT_FOUND", "The knowledge source was not found.");
    }
    if (method === "GET" && path === "/api/admin/learn/situations") {
      const search = (query.get("search") ?? "").toLowerCase(); const active = query.get("isActive");
      const items = this.situations.filter((item) => (!search || `${item.slug} ${item.name}`.toLowerCase().includes(search)) && (active === null || item.isActive === (active === "true"))).sort((a, b) => a.name.localeCompare(b.name));
      const paged = this.page(items, query);
      return { status: 200, json: { items: paged.slice, total: paged.total, page: paged.page, pageSize: paged.pageSize } };
    }
    if (method === "POST" && path === "/api/admin/learn/situations") {
      const input = (body ?? {}) as Json;
      return this.withKey(headers["idempotency-key"], "CreateSituation", input, true, () => {
        const slug = String(input.slug ?? ""); const name = String(input.name ?? "").trim();
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !name) return this.problem(400, "VALIDATION_ERROR", "Invalid situation.");
        if (this.situations.some((item) => item.slug === slug)) return this.problem(409, "SLUG_EXISTS", "Slug exists.");
        const stamp = this.tick();
        const created: Situation = { id: this.id("5170a710"), slug, name, description: typeof input.description === "string" && input.description.trim() ? input.description.trim() : null, isActive: true, createdAt: stamp, updatedAt: stamp };
        this.situations.push(created);
        return { status: 201, json: { id: created.id, slug: created.slug, name: created.name, description: created.description } };
      });
    }
    if (method === "POST" && path === "/api/admin/learn/media/images/upload-intent") {
      const input = (body ?? {}) as Json;
      return this.withKey(headers["idempotency-key"], "LearnImage", input, true, () => {
        const contentType = String(input.contentType ?? ""); const sizeBytes = Number(input.sizeBytes);
        if (!["image/jpeg", "image/png", "image/webp"].includes(contentType) || !(sizeBytes >= 1 && sizeBytes <= 5 * 1024 * 1024) || !/^[0-9a-f]{64}$/.test(String(input.sha256 ?? ""))) return this.problem(400, "VALIDATION_ERROR", "The image does not meet the upload rules.");
        const upload = { id: this.id("1a6e0000"), contentType, sizeBytes, put: false, completed: false };
        this.uploads.push(upload);
        return { status: 200, json: { uploadId: upload.id, uploadUrl: `${STORAGE_HOST}/learn/staging/${upload.id}?signature=test`, headers: { "Content-Type": contentType }, expiresAt: "2099-01-01T00:00:00Z" } };
      });
    }
    const completeUpload = /^\/api\/admin\/learn\/media\/images\/([^/]+)\/complete$/.exec(path);
    if (method === "POST" && completeUpload) {
      const upload = this.uploads.find((item) => item.id === completeUpload[1]);
      if (!upload) return this.problem(404, "NOT_FOUND", "Upload not found.");
      if (!upload.put) return this.problem(409, "LEARN_UPLOAD_MISSING", "PUT the file to uploadUrl before completing.");
      upload.completed = true;
      return { status: 200, json: { imageId: upload.id, url: `https://api.test/api/learn/media/images/${upload.id}`, width: 1, height: 1, contentType: upload.contentType, sizeBytes: upload.sizeBytes } };
    }
    if (method === "POST" && path === "/api/admin/learn/media/validate") {
      const media = typeof (body as Json | undefined)?.url === "string" ? canonicalize((body as Json).url as string) : null;
      return media ? { status: 200, json: media } : this.problem(422, "LEARN_MEDIA_INVALID", "Use a full YouTube, Facebook or TikTok video URL.");
    }

    if (method === "GET" && path === "/api/admin/learn/posts") {
      const status = query.get("status");
      const items = [...this.posts.values()].filter((post) => !status || post.status === status).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const paged = this.page(items, query);
      if (paged.bad) return this.problem(400, "VALIDATION_ERROR", "page >= 1 and pageSize 1-100.");
      return { status: 200, json: { items: paged.slice.map((post) => this.postJson(post, false)), total: paged.total, page: paged.page, pageSize: paged.pageSize } };
    }
    if (method === "POST" && path === "/api/admin/learn/posts") {
      const input = (body ?? {}) as Json;
      const { issues, content } = this.normalize(input.version);
      if (!content) return this.problem(422, "CONTENT_INVALID", "Content does not satisfy its schema.", { issues });
      return this.withKey(headers["idempotency-key"], "CreatePost", input, true, () => {
        const slug = String(input.slug ?? "").trim();
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 180) return this.problem(400, "VALIDATION_ERROR", "Invalid slug.");
        if (this.bySlug(slug)) return this.problem(409, "SLUG_EXISTS", "Slug exists.");
        const problem = this.checkRefs(content);
        if (problem) return problem;
        if (input.publish === true) { const unapproved = this.unapproved(content.sources); if (unapproved) return unapproved; }
        const stamp = this.tick();
        const post: Post = { id: this.id("9057a000"), slug, status: "Unpublished", publishedVersionId: null, revision: 1, createdAt: stamp, updatedAt: stamp };
        this.posts.set(post.id, post);
        const version = this.newVersion(post, content);
        if (input.publish === true) this.publish(post, version);
        return { status: 201, json: this.postJson(post, true) };
      });
    }
    const adminPost = /^\/api\/admin\/learn\/posts\/([^/]+)$/.exec(path);
    if (method === "GET" && adminPost) {
      const post = this.posts.get(adminPost[1]);
      return post ? { status: 200, json: this.postJson(post, true), headers: etagFor(post.revision) } : this.problem(404, "NOT_FOUND", "Not found");
    }
    const createVersion = /^\/api\/admin\/learn\/posts\/([^/]+)\/versions$/.exec(path);
    if (method === "POST" && createVersion) {
      const { issues, content } = this.normalize(body);
      if (!content) return this.problem(422, "CONTENT_INVALID", "Content does not satisfy its schema.", { issues });
      return this.withKey(headers["idempotency-key"], "CreateVersion", { id: createVersion[1], body }, true, () => {
        const post = this.posts.get(createVersion[1]);
        if (!post) return this.problem(404, "NOT_FOUND", "Not found");
        if (post.status === "Deleted") return this.problem(409, "LEARN_POST_DELETED", "Post is deleted.");
        const problem = this.checkRefs(content);
        if (problem) return problem;
        const version = this.newVersion(post, content);
        post.updatedAt = this.tick();
        return { status: 201, json: this.versionJson(version), headers: etagFor(version.revision) };
      });
    }
    const adminVersion = /^\/api\/admin\/learn\/versions\/([^/]+)$/.exec(path);
    if (method === "GET" && adminVersion) {
      const version = this.versions.get(adminVersion[1]);
      return version ? { status: 200, json: this.versionJson(version), headers: etagFor(version.revision) } : this.problem(404, "NOT_FOUND", "Not found");
    }
    if (method === "PUT" && adminVersion) {
      const expected = this.ifMatch(headers["if-match"]);
      if (typeof expected !== "number") return expected;
      const { issues, content } = this.normalize(body);
      if (!content) return this.problem(422, "CONTENT_INVALID", "Content does not satisfy its schema.", { issues });
      return this.withKey(headers["idempotency-key"], "UpdateVersion", { id: adminVersion[1], body, expected }, false, () => {
        const version = this.versions.get(adminVersion[1]);
        if (!version) return this.problem(404, "NOT_FOUND", "Not found");
        const post = this.posts.get(version.postId)!;
        if (version.revision !== expected) return this.problem(412, "PRECONDITION_FAILED", "Stale revision.");
        if (version.status !== "Draft") return this.problem(409, "LEARN_VERSION_PUBLISHED", "Published versions are immutable.");
        if (post.status === "Deleted") return this.problem(409, "LEARN_POST_DELETED", "Post is deleted.");
        const problem = this.checkRefs(content);
        if (problem) return problem;
        Object.assign(version, content, { revision: version.revision + 1, updatedAt: this.tick() });
        post.updatedAt = this.tick();
        return { status: 200, json: this.versionJson(version), headers: etagFor(version.revision) };
      });
    }
    const publishMatch = /^\/api\/admin\/learn\/versions\/([^/]+)\/publish$/.exec(path);
    if (method === "POST" && publishMatch) {
      const expected = this.ifMatch(headers["if-match"]);
      if (typeof expected !== "number") return expected;
      return this.withKey(headers["idempotency-key"], "PublishVersion", { id: publishMatch[1], expected }, false, () => {
        const version = this.versions.get(publishMatch[1]);
        if (!version) return this.problem(404, "NOT_FOUND", "Not found");
        const post = this.posts.get(version.postId)!;
        if (version.revision !== expected) return this.problem(412, "PRECONDITION_FAILED", "Stale revision.");
        if (version.status !== "Draft") return this.problem(409, "LEARN_VERSION_PUBLISHED", "Published versions are immutable.");
        if (post.status === "Deleted") return this.problem(409, "LEARN_POST_DELETED", "Post is deleted.");
        const unapproved = this.unapproved(version.sources);
        if (unapproved) return unapproved;
        if (version.situationIds.some((id) => !this.situations.find((item) => item.id === id)?.isActive)) return this.problem(409, "LEARN_SITUATION_INVALID", "Situation inactive.");
        this.publish(post, version);
        return { status: 200, json: this.postJson(post, true), headers: etagFor(post.revision) };
      });
    }
    const lifecycle = /^\/api\/admin\/learn\/posts\/([^/]+)\/(hide|show|delete|restore)$/.exec(path);
    if (method === "POST" && lifecycle) {
      const expected = this.ifMatch(headers["if-match"]);
      if (typeof expected !== "number") return expected;
      return this.withKey(headers["idempotency-key"], `Lifecycle:${lifecycle[2]}`, { id: lifecycle[1], expected }, false, () => {
        const post = this.posts.get(lifecycle[1]);
        if (!post) return this.problem(404, "NOT_FOUND", "Not found");
        if (post.revision !== expected) return this.problem(412, "PRECONDITION_FAILED", "Stale revision.");
        const operation = lifecycle[2];
        const conflict = this.problem(409, "LEARN_STATE_CONFLICT", "State does not allow it.");
        if (operation === "hide") { if (post.status !== "Published") return conflict; post.status = "Hidden"; }
        else if (operation === "show") { if (post.status !== "Hidden") return conflict; post.status = "Published"; }
        else if (operation === "delete") { if (post.status === "Deleted") return conflict; post.status = "Deleted"; }
        else { if (post.status !== "Deleted") return conflict; post.status = post.publishedVersionId ? "Hidden" : "Unpublished"; }
        post.revision += 1; post.updatedAt = this.tick();
        return { status: 200, json: this.postJson(post, true), headers: etagFor(post.revision) };
      });
    }
    return this.problem(404, "NOT_FOUND", `No mock for ${method} ${path}`);
  }

  private checkRefs(content: Pick<Version, "situationIds" | "sources">): Reply | null {
    if (content.situationIds.some((id) => !this.situations.find((item) => item.id === id && item.isActive))) return this.problem(422, "LEARN_SITUATION_INVALID", "Situation missing or inactive.");
    if (content.sources.some((entry) => !this.sources.find((item) => item.id === entry.sourceId && item.visibility === "Common"))) return this.problem(422, "LEARN_SOURCE_INVALID", "Only Common sources can be cited.");
    return null;
  }

  private unapproved(sources: Array<{ sourceId: string }>): Reply | null {
    return sources.some((entry) => this.sources.find((item) => item.id === entry.sourceId)?.approvalStatus !== "Approved") ? this.problem(409, "LEARN_SOURCE_NOT_APPROVED", "A cited source is not approved.") : null;
  }
}

function lower(headers: Record<string, string>) { return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])); }

/** Routes every Learn/knowledge-source request to the backend model. Auth endpoints and everything else fall through. */
export async function installLearnBackend(page: Page, backend: LearnBackend) {
  // Presigned PUT of a Learn image upload: the browser sends the file with exactly the intent's Content-Type.
  await page.route(`${STORAGE_HOST}/**`, async (route: Route) => {
    const request = route.request();
    const id = /\/learn\/staging\/([^/?]+)/.exec(new URL(request.url()).pathname)?.[1];
    const upload = backend.uploads.find((item) => item.id === id);
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "PUT", "Access-Control-Allow-Headers": "Content-Type" } });
    if (request.method() !== "PUT" || !upload || request.headers()["content-type"] !== upload.contentType) return route.fulfill({ status: 403, body: "" });
    upload.put = true;
    return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "" });
  });
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!/^\/api\/(learn|admin\/learn|admin\/knowledge-sources)/.test(path)) return route.fallback();
    // A completed Learn image: the real API redirects to a signed S3 URL; the model serves the bytes directly.
    const image = /^\/api\/learn\/media\/images\/([^/]+)$/.exec(path);
    if (request.method() === "GET" && image) return backend.uploads.some((item) => item.id === image[1] && item.completed) ? route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 }) : route.fulfill({ status: 404, body: "" });
    const headers = lower(request.headers());
    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    const method = request.method();
    backend.calls.push({ method, path, search: url.search, headers, body });
    const forced = backend.takeOverride(method, path);
    if (forced) {
      if (forced.applyFirst) backend.handle(method, path, url.searchParams, headers, body);
      if (forced.delayMs) await new Promise((resolve) => setTimeout(resolve, forced.delayMs));
      return route.fulfill({ status: forced.status, json: forced.json, headers: forced.headers }).catch(() => undefined); // the page may have aborted this request meanwhile
    }
    const reply = backend.handle(method, path, url.searchParams, headers, body);
    if (!reply) return route.fallback();
    return route.fulfill({ status: reply.status, json: reply.json, headers: reply.headers });
  });
}

const userFor = (actor: Actor) => (actor === "admin" ? admin : actor === "trainee" ? trainee : actor === "org" ? orgUser : null);

/** Session for the Learn screens: /api/auth/me answers for whoever the backend model currently is (guest = 401). */
export async function signIn(page: Page, backend: LearnBackend, who: Actor) {
  backend.actor = who;
  if (who !== "guest") await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "learn-access", refreshToken: "learn-refresh" })));
  await page.route("**/api/auth/me", (route) => {
    const user = userFor(backend.actor);
    return user ? route.fulfill({ json: user, headers: { ETag: '"1"' } }) : route.fulfill({ status: 401, body: "" });
  });
}

/** Email/password login as the Trainee: the backend model becomes that Trainee from then on. */
export async function mockTraineeLogin(page: Page, backend: LearnBackend) {
  await page.route("**/api/auth/login", (route) => {
    backend.actor = "trainee";
    return route.fulfill({ json: { accessToken: "learn-access", refreshToken: "learn-refresh", user: trainee } });
  });
}
