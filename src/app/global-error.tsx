"use client";

import { useEffect } from "react";
import { reloadForChunkError } from "@/features/errors/chunk-reload";

/** The root layout itself failed: no app styles are loaded here, so the page carries its own minimal look. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reloadForChunkError(error);
  }, [error]);
  const button = { padding: "10px 16px", borderRadius: 10, border: "1px solid #d4d4d8", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" } as const;
  return <html lang="vi">
    <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", colorScheme: "light dark" }}>
      <main role="alert" style={{ maxWidth: 460 }}>
        <title>Lỗi — FET3D</title>
        <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>FET3D chưa mở được trang</h1>
        <p style={{ margin: "0 0 16px", lineHeight: 1.5 }}>Hãy thử lại. Nếu vẫn lỗi, tải lại trang hoặc quay lại sau ít phút.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={{ ...button, background: "#e8590c", borderColor: "#e8590c", color: "#fff" }} onClick={() => retry()}>Thử lại</button>
          <button type="button" style={button} onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>
      </main>
    </body>
  </html>;
}
