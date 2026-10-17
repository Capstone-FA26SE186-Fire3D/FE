import type { Page } from "@playwright/test";

/**
 * Stateful route mock of the Trainee AI endpoints (BE `docs/organization-ai.md` #77): daily quota, idempotent submit with
 * context, own request list/detail with polling and `resultWithheld`. Mock evidence only.
 */
type Rec = Record<string, unknown>;
export type TraineeCall = { method: string; path: string; search: string; headers: Record<string, string>; body: unknown };

export class TraineeAiBackend {
  calls: TraineeCall[] = [];
  requests: Rec[] = [];
  receipts = new Map<string, { hash: string; id: string }>();
  quota: Rec = { policyActive: true, quotaUnit: "tokens", dailyUnits: 200, usedUnits: 40, reservedUnits: 0, remainingUnits: 160, estimatedReserve: 50, maxInputChars: 500, resetsAt: "2026-10-18T17:00:00Z", blockedByAssessment: false, canSubmit: true };
  /** GETs of a new request that still answer Accepted before it finishes. */
  pendingPolls = 1;
  /** Next submits: the server stores the request but the response is lost. */
  submitFaults: Array<"lost-response" | { status: number; json: Rec }> = [];
  private counter = 0;

  id(n: number) { return `eeeeeeee-0000-4000-8000-${String(n).padStart(12, "0")}`; }

  seed(partial: Rec = {}): Rec {
    this.counter += 1;
    const request: Rec = {
      requestId: this.id(this.counter), audience: "trainee", operation: "TraineeAnswer", status: "Succeeded", resultType: "KnowledgeAnswer", quotaUnit: "tokens", reservedUnits: 50, consumedUnits: 30,
      input: { text: "Câu hỏi cũ", inputHash: "e".repeat(64), buildingId: null, buildingName: null, revisionId: null, requestedSources: [], context: null },
      sources: [], citations: [{ kind: "LearnPost", id: "p", versionId: "v", title: "Đọc không gian trước khi hành động", versionLabel: "1", chunkId: null, locator: null, relevance: null, link: { learnSlug: "doc-khong-gian", learnPostId: "p", libraryItemId: null, sourceUri: null } }],
      result: { status: "Answered", answer: "Không dùng thang máy vì có thể mất điện và khói vào giếng thang." }, failureCode: null, resultWithheld: false,
      createdAt: new Date(Date.now() - 60_000 * this.counter).toISOString(), completedAt: new Date().toISOString(), revision: 3, polls: 0, ...partial,
    };
    this.requests.unshift(request);
    return request;
  }

  posts() { return this.calls.filter((call) => call.method === "POST" && call.path === "/api/ai/trainee/answer"); }
}

const view = (request: Rec) => {
  const copy = { ...request };
  delete copy.polls;
  return copy;
};

export async function installTraineeAi(page: Page, backend: TraineeAiBackend) {
  await page.route("**/api/ai/trainee/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const headers = Object.fromEntries(Object.entries(request.headers()).map(([key, value]) => [key.toLowerCase(), value]));
    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    backend.calls.push({ method, path, search: url.search, headers, body });
    const problem = (status: number, code: string) => route.fulfill({ status, contentType: "application/problem+json", body: JSON.stringify({ status, title: code, code }) });

    if (method === "GET" && path === "/api/ai/trainee/quota") return route.fulfill({ json: backend.quota });
    if (method === "POST" && path === "/api/ai/trainee/answer") {
      const key = headers["idempotency-key"];
      if (!key) return problem(400, "IDEMPOTENCY_KEY_REQUIRED");
      const fault = backend.submitFaults.shift();
      if (fault && typeof fault === "object") return route.fulfill({ status: fault.status, contentType: "application/problem+json", body: JSON.stringify(fault.json) });
      const hash = JSON.stringify(body);
      const receipt = backend.receipts.get(key);
      let stored: Rec | undefined;
      if (receipt) {
        if (receipt.hash !== hash) return problem(409, "IDEMPOTENCY_KEY_CONFLICT");
        stored = backend.requests.find((item) => item.requestId === receipt.id);
      } else {
        if (backend.quota.blockedByAssessment) return problem(409, "AI_BLOCKED_DURING_ASSESSMENT");
        if (!backend.quota.canSubmit) return problem(409, "AI_DAILY_QUOTA_EXHAUSTED");
        const input = body as { question: string; context?: Rec };
        stored = backend.seed({ status: "Accepted", resultType: null, result: null, citations: [], consumedUnits: undefined, completedAt: undefined, input: { text: input.question, inputHash: "e".repeat(64), buildingId: null, buildingName: null, revisionId: null, requestedSources: [], context: input.context ?? null } });
        backend.receipts.set(key, { hash, id: stored.requestId as string });
        backend.quota = { ...backend.quota, reservedUnits: 50, remainingUnits: Number(backend.quota.remainingUnits) - 50 };
      }
      if (fault === "lost-response") return route.abort("timedout");
      return route.fulfill({ status: 202, json: view(stored!) });
    }
    if (method === "GET" && path === "/api/ai/trainee/requests") {
      const page = Number(url.searchParams.get("page") ?? 1);
      const size = Number(url.searchParams.get("pageSize") ?? 20);
      return route.fulfill({ json: { items: backend.requests.slice((page - 1) * size, page * size).map(view), total: backend.requests.length, page, pageSize: size } });
    }
    const one = /^\/api\/ai\/trainee\/requests\/([0-9a-f-]{36})$/.exec(path);
    if (method === "GET" && one) {
      const found = backend.requests.find((item) => item.requestId === one[1]);
      if (!found) return problem(404, "NOT_FOUND");
      if (found.status === "Accepted") {
        found.polls = Number(found.polls) + 1;
        if (Number(found.polls) > backend.pendingPolls) Object.assign(found, { status: "Succeeded", resultType: "KnowledgeAnswer", consumedUnits: 30, completedAt: new Date().toISOString(), result: { status: "Answered", answer: "Không dùng thang máy khi có cháy." }, citations: backend.requests.at(-1)?.citations ?? [] });
      }
      return route.fulfill({ json: view(found) });
    }
    return route.fallback();
  });
}
