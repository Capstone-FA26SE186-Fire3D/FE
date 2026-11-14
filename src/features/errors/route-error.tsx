"use client";

import { useEffect, useState } from "react";
import "@/assets/styles/ops.css";
import { Button } from "@/components/ui/button";
import { ThemeScope } from "@/features/theme/theme-scope";
import { reloadForChunkError, shouldReloadForChunkError } from "./chunk-reload";

/**
 * Fallback for an unexpected error while a page renders (FE#100): says what happened and offers a retry instead of
 * leaving a blank page or a spinner. A chunk that failed to load after a deploy reloads the page once by itself.
 */
export function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [reloading] = useState(() => shouldReloadForChunkError(error));
  useEffect(() => {
    console.error(error);
    if (reloading) reloadForChunkError(error);
  }, [error, reloading]);

  return <ThemeScope>
    <main className="ops-access" role="alert">
      <div className="ops-panel ops-panel-body">
        <h1>{reloading ? "Đang tải phiên bản mới…" : "Trang gặp lỗi khi hiển thị"}</h1>
        <p>{reloading
          ? "FET3D vừa được cập nhật, trang đang tải lại."
          : "Dữ liệu của bạn không bị ảnh hưởng. Hãy thử lại; nếu vẫn lỗi, tải lại trang."}</p>
        {!reloading && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Button onClick={() => retry()}>Thử lại</Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>Tải lại trang</Button>
        </div>}
        {error.digest && <p style={{ marginTop: 12, fontSize: 12, opacity: .7 }}>Mã lỗi: {error.digest}</p>}
      </div>
    </main>
  </ThemeScope>;
}
