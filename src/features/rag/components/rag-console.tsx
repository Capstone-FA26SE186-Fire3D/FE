"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ask, upload, type ChatResponse } from "../api";

export function RagConsole() {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<"upload" | "chat" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function run(kind: "upload" | "chat", file?: File) {
    if (pending.current || (kind === "chat" && !question.trim()) || (kind === "upload" && !file)) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(kind); setMessage(""); setError(false);
    if (kind === "chat") setResponse(null);
    try {
      if (file) { await upload(file, controller.signal); setMessage(`Đã nạp “${file.name}”.`); }
      else setResponse(await ask(question.trim(), controller.signal));
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(true);
        setMessage(cause instanceof TypeError ? "Không kết nối được dịch vụ tài liệu. Hãy kiểm tra API và thử lại." : cause instanceof SyntaxError ? "Dịch vụ trả về dữ liệu không hợp lệ." : cause instanceof Error ? cause.message : "Không thể xử lý yêu cầu lúc này.");
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
    }
  }

  return <Card className="rag-panel" aria-busy={busy !== null}>
    <label className="rag-file flex flex-col gap-3">Tài liệu thử nghiệm (.txt, .md, .pdf)
      <input ref={fileRef} className="block min-h-11 w-full min-w-0 text-xs text-[var(--muted)]" type="file" accept=".txt,.md,.pdf" disabled={busy !== null} onChange={event => void run("upload", event.target.files?.[0])} />
    </label>
    <textarea aria-label="Câu hỏi RAG" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Hỏi về tài liệu đã nạp..." disabled={busy !== null} />
    <div className="flex flex-wrap items-center gap-3"><Button disabled={busy !== null || !question.trim()} onClick={() => void run("chat")}>{busy === "upload" ? "Đang nạp tài liệu..." : busy === "chat" ? "Đang hỏi..." : "Hỏi tài liệu"}</Button>
      {message && <p role={error ? "alert" : "status"} className="text-sm text-[var(--muted)]">{message}</p>}
    </div>
    {response && <section aria-label="Câu trả lời và nguồn"><div className="rag-answer">{response.answer}</div><h2 className="mt-5 mb-2 text-sm font-semibold">Nguồn</h2>
      {response.sources.length ? <ul className="rag-sources">{response.sources.map((source, index) => <li key={index}><strong>{source.document_name} · chunk {source.chunk_index}</strong><p className="whitespace-pre-wrap break-words">{source.content}</p></li>)}</ul> : <p className="text-sm text-[var(--muted)]">Dịch vụ chưa cung cấp nguồn cho câu trả lời này.</p>}
    </section>}
  </Card>;
}
