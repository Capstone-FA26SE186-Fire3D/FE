import { env } from "@/configs/env";

/*
 * FastAPI `ai/rag-api` legacy routes (`app/legacy/routes.py`, schemas in `app/schemas/rag.py`). Developer demo only; the
 * production AI path is the .NET API (`features/org-ai`).
 */

/** `SourceChunk`. `source_id` / `version` are set only for chunks of a registered knowledge source. */
export type Source = { document_name: string; chunk_index: number; content: string; source_id?: string | null; version?: string | null };
/** `ChatRequest`: question 1-4000 chars; `top_k` 1-10 (server default 4). */
export type ChatRequest = { question: string; top_k?: number };
export type ChatResponse = { answer: string; sources: Source[] };
/** `DocumentIngestResponse` of `POST /documents` (201). */
export type DocumentIngestResponse = { document_name: string; chunks_indexed: number };

async function errorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { detail?: string };
    return typeof payload.detail === "string" ? payload.detail : fallback;
  } catch { return fallback; }
}

export async function ask(question: string, signal?: AbortSignal): Promise<ChatResponse> {
  const body: ChatRequest = { question };
  const response = await fetch(`${env.ragApiUrl}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error(await errorMessage(response, "Không thể hỏi tài liệu lúc này."));
  const data = await response.json() as Partial<ChatResponse>;
  if (typeof data.answer !== "string" || !Array.isArray(data.sources) || !data.sources.every(source =>
    source && typeof source.document_name === "string" && typeof source.chunk_index === "number" && typeof source.content === "string")) {
    throw new Error("Phản hồi tài liệu không đúng định dạng.");
  }
  return data as ChatResponse;
}

export async function upload(file: File, signal?: AbortSignal): Promise<DocumentIngestResponse> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${env.ragApiUrl}/documents`, { method: "POST", body: form, signal });
  if (!response.ok) throw new Error(await errorMessage(response, "Không thể nạp tài liệu lúc này."));
  return response.json() as Promise<DocumentIngestResponse>;
}
