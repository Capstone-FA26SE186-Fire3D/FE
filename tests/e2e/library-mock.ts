import type { Page, Route } from "@playwright/test";

import { RUBRIC_CATALOG } from "../fixtures/scenario-editor/v1-fixtures";

/*
 * Stateful MOCK of the Organization Library backend (BE docs/learn-library.md, ContentController `LibraryController`,
 * `library_gate` SQL, `LibraryContent.Validate`). It keeps items, versions and idempotency receipts across requests so a
 * reload "recovers from the server", and it enforces the rules the real gate enforces: roles, visibility (organizations see
 * only active items with a Published version and only Published versions), If-Match revisions, Idempotency-Key replay,
 * Draft-only PUT, payload validation with `CONTENT_INVALID` + `issues[{code,path,message}]`. Mock evidence only.
 */

export const admin = { id: "lib-admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
export const orgUser = { id: "org-owner", email: "owner@fire3d.test", fullName: "Chủ tổ chức", role: 1, organizationId: "org-1", profileRevision: 1 };
export const trainee = { id: "learner", email: "learner@fire3d.test", fullName: "Học viên", role: 2, organizationId: null };

export type Actor = "admin" | "org" | "trainee" | "guest";
export type Kind = "ScenarioTemplate" | "RubricSample" | "Equipment";
type Json = Record<string, unknown>;
export type Call = { method: string; path: string; search: string; headers: Record<string, string>; body: unknown };
type Reply = { status: number; json?: unknown; headers?: Record<string, string>; delayMs?: number; /** Run the real handler first (the command IS applied) and answer with this reply: a lost response. */ applyFirst?: boolean };
type Issue = { code: string; path: string; message: string };

type Item = { id: string; kind: Kind; code: string; isActive: boolean; revision: number; createdAt: string; updatedAt: string };
export type Version = { id: string; itemId: string; versionNumber: number; name: string; payload: Json; requiredCapabilities: string[]; payloadHash: string; status: "Draft" | "Published"; publishedAt: string | null; revision: number; createdAt: string; updatedAt: string };

const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CODE = /^[A-Z0-9][A-Z0-9_-]{0,79}$/;
const CAPABILITY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const METRICS = RUBRIC_CATALOG.metrics.map((metric) => metric.id);
const etag = (revision: number) => ({ ETag: `"${revision}"` });

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

export class LibraryBackend {
  actor: Actor = "admin";
  calls: Call[] = [];
  items: Item[] = [];
  versions: Version[] = [];
  /** `GET /api/scenario-rubrics/catalog` answer; null answers 503. */
  rubricCatalog: unknown | null = RUBRIC_CATALOG;
  private receipts = new Map<string, { hash: string; reply: { status: number; json: unknown; headers?: Record<string, string> } }>();
  private overrides: Array<{ method: string; pattern: RegExp; reply: Reply }> = [];
  private counter = 1;
  private clock = Date.parse("2026-10-01T08:00:00Z");

  private tick() { this.clock += 60_000; return new Date(this.clock).toISOString(); }
  private id(prefix: string) { return uuid(prefix, this.counter++); }

  failNext(method: string, pattern: RegExp, reply: Reply) { this.overrides.push({ method, pattern, reply }); }
  takeOverride(method: string, path: string): Reply | undefined {
    const index = this.overrides.findIndex((entry) => entry.method === method && entry.pattern.test(path));
    return index >= 0 ? this.overrides.splice(index, 1)[0].reply : undefined;
  }

  callsTo(method: string, pattern: RegExp) { return this.calls.filter((call) => call.method === method && pattern.test(call.path)); }
  item(code: string) { return this.items.find((entry) => entry.code === code)!; }
  versionsOf(itemId: string) { return this.versions.filter((entry) => entry.itemId === itemId).sort((a, b) => a.versionNumber - b.versionNumber); }

  // ---- seeding -------------------------------------------------------------------------------------------------------

  seedItem(kind: Kind, code: string, options: { isActive?: boolean } = {}): Item {
    const stamp = this.tick();
    const item: Item = { id: this.id("11b7a000"), kind, code, isActive: options.isActive ?? true, revision: 1, createdAt: stamp, updatedAt: stamp };
    this.items.push(item);
    return item;
  }

  /** A version created through the same path the API uses, optionally Published. */
  seedVersion(code: string, input: { name: string; payload: Json; requiredCapabilities?: string[]; publish?: boolean }): Version {
    const item = this.item(code);
    const stamp = this.tick();
    const number = Math.max(0, ...this.versionsOf(item.id).map((entry) => entry.versionNumber)) + 1;
    const version: Version = { id: this.id("7e251b00"), itemId: item.id, versionNumber: number, name: input.name, payload: input.payload, requiredCapabilities: input.requiredCapabilities ?? [], payloadHash: `${this.counter}`.padStart(64, "a").slice(-64), status: "Draft", publishedAt: null, revision: 1, createdAt: stamp, updatedAt: stamp };
    this.versions.push(version);
    if (input.publish) this.publish(item, version);
    return version;
  }

  /** Another admin edits a Draft behind the UI's back: the revision moves, so the UI's If-Match goes stale. */
  externalEdit(versionId: string, patch: Partial<Pick<Version, "name" | "payload" | "requiredCapabilities">>) {
    const version = this.versions.find((entry) => entry.id === versionId)!;
    Object.assign(version, patch, { revision: version.revision + 1, updatedAt: this.tick() });
  }
  externalPublish(versionId: string) {
    const version = this.versions.find((entry) => entry.id === versionId)!;
    this.publish(this.items.find((entry) => entry.id === version.itemId)!, version);
  }
  externalDeactivate(code: string) { const item = this.item(code); item.isActive = false; item.revision += 1; item.updatedAt = this.tick(); }

  private publish(item: Item, version: Version) {
    const stamp = this.tick();
    version.status = "Published"; version.publishedAt = stamp; version.revision += 1; version.updatedAt = stamp;
    item.revision += 1; item.updatedAt = stamp;
  }

  // ---- representations (library_*_representation) --------------------------------------------------------------------

  private versionJson(version: Version) {
    const item = this.items.find((entry) => entry.id === version.itemId)!;
    return { id: version.id, itemId: item.id, kind: item.kind, code: item.code, versionNumber: version.versionNumber, name: version.name, payload: version.payload, requiredCapabilities: version.requiredCapabilities, payloadHash: version.payloadHash, status: version.status, publishedAt: version.publishedAt, revision: version.revision, createdAt: version.createdAt, updatedAt: version.updatedAt };
  }

  private itemJson(item: Item, admin: boolean) {
    const published = this.versionsOf(item.id).filter((entry) => entry.status === "Published");
    const latest = published[published.length - 1];
    const shown = this.versionsOf(item.id).filter((entry) => admin || entry.status === "Published").reverse();
    return {
      id: item.id, kind: item.kind, code: item.code, isActive: item.isActive, revision: item.revision, createdAt: item.createdAt, updatedAt: item.updatedAt,
      latestPublished: latest ? this.versionJson(latest) : null,
      versions: shown.map((entry) => ({ id: entry.id, versionNumber: entry.versionNumber, name: entry.name, status: entry.status, revision: entry.revision, publishedAt: entry.publishedAt })),
    };
  }

  private visibleToOrg(item: Item) { return item.isActive && this.versionsOf(item.id).some((entry) => entry.status === "Published"); }

  // ---- validation (LibraryContent.Validate) --------------------------------------------------------------------------

  private validate(kind: Kind, body: unknown): Issue[] {
    const issues: Issue[] = [];
    const input = isObject(body) ? body : {};
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 255) issues.push({ code: "STRING_INVALID", path: "$.name", message: "Name is 1-255 characters." });
    const payload = input.payload;
    if (!isObject(payload)) return [...issues, { code: "FIELD_REQUIRED", path: "$.payload", message: "Payload is an object." }];
    const caps = Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [];
    if (caps.length > 50 || new Set(caps).size !== caps.length || caps.some((cap) => typeof cap !== "string" || !CAPABILITY.test(cap))) issues.push({ code: "CAPABILITIES_INVALID", path: "$.requiredCapabilities", message: "Use up to 50 distinct capability IDs." });
    const allowed = kind === "ScenarioTemplate" ? ["state", "description"] : kind === "RubricSample" ? ["rubric", "description"] : ["description", "properties"];
    for (const key of Object.keys(payload)) if (!allowed.includes(key)) issues.push({ code: "FIELD_UNKNOWN", path: `$.payload.${key}`, message: "Field is not defined for this library kind." });
    if (payload.description !== undefined && (typeof payload.description !== "string" || payload.description.length === 0 || payload.description.length > 2000)) issues.push({ code: "STRING_INVALID", path: "$.payload.description", message: "Description is 1-2000 characters." });
    if (kind === "ScenarioTemplate") {
      const state = payload.state;
      if (!isObject(state) || state.schemaVersion !== "fet3d.editor/1") issues.push({ code: "EDITOR_SCHEMA_VERSION_UNSUPPORTED", path: "$.payload.state", message: "Templates use the fet3d.editor/1 draft state." });
      else if (isObject(state.rubric)) issues.push(...this.rubricIssues(state.rubric, "$.payload.state.rubric"));
    } else if (kind === "RubricSample") {
      if (!isObject(payload.rubric)) issues.push({ code: "FIELD_REQUIRED", path: "$.payload.rubric", message: "Required." });
      else issues.push(...this.rubricIssues(payload.rubric, "$.payload.rubric"));
    } else if (isObject(payload.properties)) {
      const entries = Object.values(payload.properties);
      if (entries.length > 50 || entries.some((value) => !["string", "number", "boolean"].includes(typeof value))) issues.push({ code: "PROPERTIES_INVALID", path: "$.payload.properties", message: "Properties are up to 50 string, number or boolean values." });
    }
    return issues;
  }

  private rubricIssues(rubric: Json, base: string): Issue[] {
    const out: Issue[] = [];
    if (rubric.schema_version === undefined) out.push({ code: "FIELD_REQUIRED", path: `${base}.schema_version`, message: "Required." });
    else if (rubric.schema_version !== "1") out.push({ code: "RUBRIC_SCHEMA_VERSION_UNSUPPORTED", path: `${base}.schema_version`, message: "Unsupported rubric schema_version." });
    if (typeof rubric.pass_threshold !== "number") out.push({ code: "NUMBER_INVALID", path: `${base}.pass_threshold`, message: "Must be a number." });
    const criteria = Array.isArray(rubric.criteria) ? rubric.criteria : null;
    if (!criteria) out.push({ code: "FIELD_REQUIRED", path: `${base}.criteria`, message: "Required." });
    else {
      if (criteria.length === 0) out.push({ code: "FIELD_REQUIRED", path: `${base}.criteria`, message: "At least one criterion is required." });
      criteria.forEach((criterion, index) => {
        if (isObject(criterion) && typeof criterion.metric === "string" && !METRICS.includes(criterion.metric)) out.push({ code: "RUBRIC_METRIC_UNSUPPORTED", path: `${base}.criteria[${index}].metric`, message: `Use a server-computed metric: ${METRICS.join(", ")}.` });
      });
    }
    return out;
  }

  // ---- routing -------------------------------------------------------------------------------------------------------

  private problem(status: number, code: string, title: string, extra: Json = {}): Reply {
    return { status, json: { status, title, code, ...extra }, headers: { "content-type": "application/problem+json" } };
  }
  private invalid(issues: Issue[]): Reply { return this.problem(422, "CONTENT_INVALID", "Content does not satisfy its schema.", { issues }); }

  private expected(headers: Record<string, string>): { error: Reply } | { value: number } {
    const raw = headers["if-match"];
    if (!raw) return { error: this.problem(428, "PRECONDITION_REQUIRED", "If-Match is required.") };
    const match = /^"(\d+)"$/.exec(raw);
    if (!match || Number(match[1]) < 1) return { error: this.problem(400, "INVALID_IF_MATCH", "If-Match must be the quoted revision from the ETag.") };
    return { value: Number(match[1]) };
  }

  private page<T>(rows: T[], params: URLSearchParams) {
    const page = Number(params.get("page") ?? 1);
    const size = Number(params.get("pageSize") ?? 20);
    return { page, size, slice: rows.slice((page - 1) * size, page * size) };
  }

  /** Replays a stored first success for the same key + input; another input under the key is 409. */
  private idempotent(operation: string, headers: Record<string, string>, input: unknown, run: () => Reply, optional: boolean): Reply {
    const key = headers["idempotency-key"];
    if (!key) return optional ? run() : this.problem(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
    const id = `${operation}|${key}`;
    const hash = JSON.stringify(input);
    const found = this.receipts.get(id);
    if (found) return found.hash === hash ? found.reply : this.problem(409, "IDEMPOTENCY_KEY_CONFLICT", "Another input was stored under this key.");
    const reply = run();
    if (reply.status < 300) this.receipts.set(id, { hash, reply: { status: reply.status, json: reply.json, headers: reply.headers } });
    return reply;
  }

  handle(method: string, path: string, params: URLSearchParams, headers: Record<string, string>, body: unknown): Reply | null {
    if (path === "/api/scenario-rubrics/catalog" && method === "GET") {
      if (this.actor === "guest") return this.problem(401, "UNAUTHORIZED", "Sign in.");
      if (this.actor === "trainee") return this.problem(403, "FORBIDDEN", "Forbidden.");
      return this.rubricCatalog === null ? this.problem(503, "SERVICE_UNAVAILABLE", "Catalog unavailable.") : { status: 200, json: this.rubricCatalog };
    }
    const isAdminRoute = path.startsWith("/api/admin/library");
    if (!isAdminRoute && !path.startsWith("/api/library")) return null;
    if (this.actor === "guest") return this.problem(401, "UNAUTHORIZED", "Sign in.");
    if (this.actor === "trainee") return this.problem(403, "FORBIDDEN", "Forbidden.");
    if (isAdminRoute && this.actor !== "admin") return this.problem(403, "FORBIDDEN", "Forbidden.");
    const admin = isAdminRoute;

    const items = /^\/api\/(?:admin\/)?library\/items$/.exec(path);
    if (items && method === "GET") {
      const kind = params.get("kind");
      const search = (params.get("search") ?? "").toLowerCase();
      const rows = this.items.filter((entry) => (!kind || entry.kind === kind) && (!search || entry.code.toLowerCase().includes(search)) && (admin || this.visibleToOrg(entry))).sort((a, b) => a.code.localeCompare(b.code));
      const { page, size, slice } = this.page(rows, params);
      return { status: 200, json: { items: slice.map((entry) => this.itemJson(entry, admin)), total: rows.length, page, pageSize: size } };
    }
    if (items && method === "POST") {
      const input = isObject(body) ? body : {};
      const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
      return this.idempotent("CreateItem", headers, { kind: input.kind, code }, () => {
        if (!["ScenarioTemplate", "RubricSample", "Equipment"].includes(input.kind as string) || !CODE.test(code)) return this.problem(400, "VALIDATION_ERROR", "Invalid kind or code.");
        if (this.items.some((entry) => entry.code === code)) return this.problem(409, "LIBRARY_CODE_EXISTS", "Library code already exists.");
        const created = this.seedItem(input.kind as Kind, code);
        return { status: 201, json: this.itemJson(created, true) };
      }, false);
    }

    const item = /^\/api\/(?:admin\/)?library\/items\/([^/]+)$/.exec(path);
    if (item && method === "GET") {
      const found = this.items.find((entry) => entry.id === item[1]);
      if (!found || (!admin && !this.visibleToOrg(found))) return this.problem(404, "NOT_FOUND", "Not found.");
      return { status: 200, json: this.itemJson(found, admin), headers: admin ? etag(found.revision) : undefined };
    }
    if (item && method === "PATCH") {
      const found = this.items.find((entry) => entry.id === item[1]);
      if (!found) return this.problem(404, "NOT_FOUND", "Not found.");
      const check = this.expected(headers);
      if ("error" in check) return check.error;
      return this.idempotent("UpdateItem", headers, { id: found.id, body, expected: check.value }, () => {
        if (found.revision !== check.value) return this.problem(412, "PRECONDITION_FAILED", "Revision does not match.");
        found.isActive = (body as Json).isActive === true; found.revision += 1; found.updatedAt = this.tick();
        return { status: 200, json: this.itemJson(found, true), headers: etag(found.revision) };
      }, true);
    }

    const create = /^\/api\/admin\/library\/items\/([^/]+)\/versions$/.exec(path);
    if (create && method === "POST") {
      const found = this.items.find((entry) => entry.id === create[1]);
      if (!found) return this.problem(404, "NOT_FOUND", "Not found.");
      const issues = this.validate(found.kind, body);
      if (issues.length > 0) return this.invalid(issues);
      const input = body as { name: string; payload: Json; requiredCapabilities?: string[] };
      return this.idempotent("CreateVersion", headers, { id: found.id, body }, () => ({ status: 201, json: this.versionJson(this.seedVersion(found.code, { name: input.name.trim(), payload: input.payload, requiredCapabilities: input.requiredCapabilities ?? [] })) }), false);
    }

    const version = /^\/api\/(?:admin\/)?library\/versions\/([^/]+)$/.exec(path);
    if (version && method === "GET") {
      const found = this.versions.find((entry) => entry.id === version[1]);
      if (!found || (!admin && found.status !== "Published")) return this.problem(404, "NOT_FOUND", "Not found.");
      return { status: 200, json: this.versionJson(found), headers: admin ? etag(found.revision) : undefined };
    }
    if (version && method === "PUT") {
      const found = this.versions.find((entry) => entry.id === version[1]);
      if (!found) return this.problem(404, "NOT_FOUND", "Not found.");
      const check = this.expected(headers);
      if ("error" in check) return check.error;
      const kind = this.items.find((entry) => entry.id === found.itemId)!.kind;
      const issues = this.validate(kind, body);
      if (issues.length > 0) return this.invalid(issues);
      const input = body as { name: string; payload: Json; requiredCapabilities?: string[] };
      return this.idempotent("UpdateVersion", headers, { id: found.id, body, expected: check.value }, () => {
        if (found.revision !== check.value) return this.problem(412, "PRECONDITION_FAILED", "Revision does not match.");
        if (found.status !== "Draft") return this.problem(409, "LIBRARY_VERSION_PUBLISHED", "Published versions are immutable.");
        Object.assign(found, { name: input.name.trim(), payload: input.payload, requiredCapabilities: input.requiredCapabilities ?? [], revision: found.revision + 1, updatedAt: this.tick() });
        return { status: 200, json: this.versionJson(found), headers: etag(found.revision) };
      }, true);
    }

    const publish = /^\/api\/admin\/library\/versions\/([^/]+)\/publish$/.exec(path);
    if (publish && method === "POST") {
      const found = this.versions.find((entry) => entry.id === publish[1]);
      if (!found) return this.problem(404, "NOT_FOUND", "Not found.");
      const check = this.expected(headers);
      if ("error" in check) return check.error;
      return this.idempotent("PublishVersion", headers, { id: found.id, expected: check.value }, () => {
        if (found.revision !== check.value) return this.problem(412, "PRECONDITION_FAILED", "Revision does not match.");
        if (found.status !== "Draft") return this.problem(409, "LIBRARY_VERSION_PUBLISHED", "Already published.");
        this.publish(this.items.find((entry) => entry.id === found.itemId)!, found);
        return { status: 200, json: this.versionJson(found), headers: etag(found.revision) };
      }, true);
    }
    return this.problem(404, "NOT_FOUND", `No mock for ${method} ${path}`);
  }
}

const lower = (headers: Record<string, string>) => Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

/** Routes every Library request (and the rubric catalog) to the backend model. Auth endpoints and everything else fall through. */
export async function installLibraryBackend(page: Page, backend: LibraryBackend) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!/^\/api\/(admin\/library|library|scenario-rubrics\/catalog)/.test(path)) return route.fallback();
    const headers = lower(request.headers());
    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    const method = request.method();
    backend.calls.push({ method, path, search: url.search, headers, body });
    const forced = backend.takeOverride(method, path);
    if (forced) {
      if (forced.applyFirst) backend.handle(method, path, url.searchParams, headers, body);
      if (forced.delayMs) await new Promise((resolve) => setTimeout(resolve, forced.delayMs));
      return route.fulfill({ status: forced.status, json: forced.json, headers: forced.headers });
    }
    const reply = backend.handle(method, path, url.searchParams, headers, body);
    if (!reply) return route.fallback();
    return route.fulfill({ status: reply.status, json: reply.json, headers: reply.headers });
  });
}

const userFor = (actor: Actor) => (actor === "admin" ? admin : actor === "org" ? orgUser : actor === "trainee" ? trainee : null);

/** Session for the Library screens: /api/auth/me answers for whoever the backend model currently is (guest = 401). */
export async function signIn(page: Page, backend: LibraryBackend, who: Actor) {
  backend.actor = who;
  if (who !== "guest") await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "library-access", refreshToken: "library-refresh" })));
  await page.route("**/api/auth/me", (route) => {
    const user = userFor(backend.actor);
    return user ? route.fulfill({ json: user, headers: { ETag: '"1"' } }) : route.fulfill({ status: 401, body: "" });
  });
}
