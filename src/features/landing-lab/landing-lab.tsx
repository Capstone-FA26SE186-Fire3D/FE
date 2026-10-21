"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Tier } from "@/features/landing/scene/budget";
import { beatAt } from "@/features/landing/scene/layout";
import type { Features, LabStats, LandingRuntime } from "@/features/landing/scene/runtime";
import styles from "./landing-lab.module.css";

type Mode = "journey" | "trainee" | "organization";
declare global { interface Window { __landingLab?: { stats: LabStats | null; error: string | null; ready: boolean; setProgress(p: number): void; setMode(m: Mode): void; setLineup(on: boolean): void; debugPlay(clip: string): void; setTier(t: Tier | "auto"): void; remount(): void; snapshot(): string; orbit(yaw: number, pitch: number): void; seekDamage(seconds: number): void } } }

const TARGET_FRAME_MS = 1000 / 60;
const BEAT_LABEL = { aerial: "Toàn cảnh", door: "Cửa chính", fire: "1 · Nhận biết cháy", evac: "2 · Gặp người sơ tán", junction: "3 · Sảnh phân nhánh" } as const;

/** Developer measurement page for the circular glass landing: same runtime as the landing, plus switches and numbers. */
export function LandingLab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<LandingRuntime | null>(null);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<Mode>("journey");
  const [tier, setTier] = useState<Tier | "auto">("auto");
  const [features, setFeatures] = useState<Features>({ glass: true, smoke: true, characters: true });
  const [stats, setStats] = useState<LabStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const live = useRef({ progress, mode, tier, features, playing, orbit: { yaw: 0, pitch: 0 } });
  useEffect(() => { live.current = { ...live.current, progress, mode, tier, features, playing }; }, [progress, mode, tier, features, playing]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas; canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "Bản thử tòa nhà kính tròn, khói, nhân vật và điện thoại ngang");
    let disposed = false, frame = 0, visible = true, last = 0, skip = 1, tick = 0, estimated = false, lastTick = 0, statsAt = 0;
    let cleanup = () => {};
    const gaps: number[] = [];
    const timer = setTimeout(async () => {
      try {
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        const { createLandingRuntime } = await import("@/features/landing/scene/runtime");
        host.appendChild(canvas);
        const runtime = await createLandingRuntime(canvas, mobile, { tier: live.current.tier, features: live.current.features });
        if (disposed) { runtime.dispose(); return; }
        runtimeRef.current = runtime; setLoading(false);
        const resize = () => runtime.resize(canvas.clientWidth, canvas.clientHeight);
        const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
        const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); }); intersection.observe(canvas);
        let drag: { x: number; y: number } | null = null;
        const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
        const move = (e: PointerEvent) => { if (!drag) return; const o = live.current.orbit; o.yaw += (drag.x - e.clientX) * 0.006; o.pitch = Math.max(-0.6, Math.min(0.7, o.pitch + (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; };
        const up = () => { drag = null; };
        canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up);
        const loop = (now: number) => {
          if (disposed || document.hidden || !visible) return;
          if (!estimated) {
            if (lastTick) { const gap = now - lastTick; if (gap > 1 && gap < 50) gaps.push(gap); }
            lastTick = now;
            if (gaps.length >= 24) { estimated = true; const median = [...gaps].sort((a, b) => a - b)[gaps.length >> 1]; skip = Math.max(1, Math.floor(TARGET_FRAME_MS / median + 0.15)); }
          }
          if (skip > 1 && ++tick % skip !== 0) { frame = requestAnimationFrame(loop); return; }
          const delta = last ? Math.min((now - last) / 1000, 0.25) : 0; last = now;
          const l = live.current;
          if (l.playing) { const next = l.progress >= 1 ? 0 : Math.min(1, l.progress + delta / 70); live.current.progress = next; setProgress(next); }
          runtime.update(delta, live.current.progress, l.mode === "journey" ? null : l.mode, live.current.orbit);
          if (now - statsAt > 500) { statsAt = now; const s = runtime.stats(); setStats(s); if (window.__landingLab) window.__landingLab.stats = s; }
          frame = requestAnimationFrame(loop);
        };
        function resume() { cancelAnimationFrame(frame); last = 0; lastTick = 0; if (!document.hidden && visible && !disposed) frame = requestAnimationFrame(loop); }
        document.addEventListener("visibilitychange", resume); resume();
        cleanup = () => { observer.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", resume); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e); console.error("[landing-lab]", e); setError(message); setLoading(false);
        if (window.__landingLab) window.__landingLab.error = message;
      }
    }, 0);
    return () => { disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); cleanup(); runtimeRef.current?.dispose(); runtimeRef.current = null; canvas.remove(); };
  }, [mountKey]);

  useEffect(() => { runtimeRef.current?.setFeatures(features); }, [features]);
  useEffect(() => { if (tier !== "auto") runtimeRef.current?.setTier(tier); }, [tier]);

  const remount = useCallback(() => { setLoading(true); setMountKey(k => k + 1); }, []);
  useEffect(() => {
    window.__landingLab = {
      stats: null, error: null, ready: false,
      setProgress: p => { live.current.progress = p; setProgress(p); }, setMode: m => { live.current.mode = m; setMode(m); },
      setLineup: on => runtimeRef.current?.setLineup(on), debugPlay: c => runtimeRef.current?.debugPlay(c), setTier, remount,
      snapshot: () => runtimeRef.current?.snapshot() ?? "", orbit: (yaw, pitch) => { live.current.orbit = { yaw, pitch }; }, seekDamage: s => runtimeRef.current?.seekDamage(s),
    };
    return () => { delete window.__landingLab; };
  }, [remount]);
  useEffect(() => { if (window.__landingLab) window.__landingLab.ready = !loading && !error; }, [loading, error]);

  const beat = mode === "trainee" ? "junction" : beatAt(progress);
  const toggle = (key: keyof Features) => setFeatures(f => ({ ...f, [key]: !f[key] }));
  return (
    <main className={styles.page} data-mode={mode} data-ready={!loading && !error} data-tier={stats?.tier ?? ""}>
      <div ref={hostRef} className={styles.host} />
      {(loading || error) && <p className={styles.status} role="status">{error ? `Không chạy được WebGL: ${error}` : "Đang tải mô hình nhân vật…"}</p>}
      <div className={styles.beat} aria-live="polite"><span>{mode === "organization" ? "Tổ chức · toàn cảnh" : BEAT_LABEL[beat]}</span>{mode === "trainee" && <span> · Điện thoại ngang</span>}</div>
      <section className={styles.panel} aria-label="Bảng đo bản thử">
        <h1>Bản thử 3D · kính tròn, khói, nhân vật, điện thoại ngang, sập</h1>
        <label className={styles.row}>Hành trình <input type="range" min={0} max={1000} value={Math.round(progress * 1000)} onChange={e => { setPlaying(false); setProgress(Number(e.target.value) / 1000); }} aria-label="Tiến độ cuộn" /></label>
        <div className={styles.row}>
          <button onClick={() => setPlaying(p => !p)}>{playing ? "Dừng" : "Tự chạy"}</button>
          <button aria-pressed={mode === "journey"} onClick={() => setMode("journey")}>Hành trình</button>
          <button aria-pressed={mode === "trainee"} onClick={() => setMode("trainee")}>Trainee</button>
          <button aria-pressed={mode === "organization"} onClick={() => { setProgress(1); setMode("organization"); }}>Tổ chức</button>
        </div>
        <div className={styles.row}>
          {(["glass", "smoke", "characters"] as const).map(k => <label key={k}><input type="checkbox" checked={features[k]} onChange={() => toggle(k)} /> {{ glass: "Kính", smoke: "Khói", characters: "Nhân vật" }[k]}</label>)}
          <select value={tier} onChange={e => setTier(e.target.value as Tier | "auto")} aria-label="Mức chất lượng"><option value="auto">Tự động</option><option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option></select>
          <button onClick={remount}>Dựng lại cảnh</button>
        </div>
        <dl className={styles.stats} data-testid="lab-stats">
          <dt>FPS</dt><dd>{stats ? stats.fps.toFixed(1) : "–"}</dd>
          <dt>Khung (p95)</dt><dd>{stats ? `${stats.frameMs.toFixed(1)} (${stats.p95Ms.toFixed(1)}) ms` : "–"}</dd>
          <dt>Draw / tam giác</dt><dd>{stats ? `${stats.drawCalls} / ${(stats.triangles / 1000).toFixed(0)}k` : "–"}</dd>
          <dt>DPR · mức</dt><dd>{stats ? `${stats.dpr.toFixed(2)} · ${stats.tier}` : "–"}</dd>
          <dt>Nhân vật (anim)</dt><dd>{stats ? `${stats.characters} (${stats.animated})` : "–"}</dd>
          <dt>Sập · giây</dt><dd>{stats ? `${(stats.collapse * 100).toFixed(0)}% · ${stats.damageTime.toFixed(1)}s` : "–"}</dd>
          <dt>Renderer · hình học · texture</dt><dd>{stats ? `${stats.renderers} · ${stats.geometries} · ${stats.textures}` : "–"}</dd>
        </dl>
        <p className={styles.note}>Số đo chỉ hợp lệ trên GPU thật; renderer phần mềm không dùng để kết luận hiệu năng.</p>
      </section>
    </main>
  );
}
