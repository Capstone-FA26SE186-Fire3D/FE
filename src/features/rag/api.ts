import { env } from "@/configs/env";

export type Source = { document_name: string; chunk_index: number; content: string };
export type ChatResponse = { answer: string; sources: Source[] };

async function errorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { detail?: string };
    return typeof payload.detail === "string" ? payload.detail : fallback;
  } catch { return fallback; }
}

export async function ask(question: string, signal?: AbortSignal): Promise<ChatResponse> {
  const response = await fetch(`${env.ragApiUrl}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }), signal });
  if (!response.ok) throw new Error(await errorMessage(response, "Không thể hỏi tài liệu lúc này."));
  const data = await response.json() as Partial<ChatResponse>;
  if (typeof data.answer !== "string" || !Array.isArray(data.sources) || !data.sources.every(source =>
    source && typeof source.document_name === "string" && typeof source.chunk_index === "number" && typeof source.content === "string")) {
    throw new Error("Phản hồi tài liệu không đúng định dạng.");
  }
  return data as ChatResponse;
}

export async function upload(file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${env.ragApiUrl}/documents`, { method: "POST", body: form, signal });
  if (!response.ok) throw new Error(await errorMessage(response, "Không thể nạp tài liệu lúc này."));
  return response.json() as Promise<unknown>;
}
