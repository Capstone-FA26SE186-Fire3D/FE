"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Building2, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/layouts/site-header";
import { useAuthSession } from "@/features/auth/auth-session";
import { routes } from "@/configs/routes";
import { setSceneHandoff } from "../handoff";
import type { LandingBranch } from "../types";
import type { JourneyInput } from "./building-scene";
import styles from "./landing.module.css";
import { OrbitSurface } from "./orbit-surface";

const BuildingScene = dynamic(() => import("./building-scene").then(m => m.BuildingScene), { ssr: false });
type Mode = "loading" | "motion" | "static";
type Status = "ready" | "transitioning" | "settled" | "error";
const locations = ["Tầng trệt / hành lang phía đông", "Tầng trệt / khu phòng học", "Tầng trệt / điểm tập dượt", "Tầng trệt / sảnh cầu thang", "Sảnh kết nối / chọn hành trình"];

export function LandingExperience({ panels }: { panels: ReactNode[] }) {
  const router = useRouter();
  const session = useAuthSession();
  const journey = useRef<HTMLElement>(null);
  const input = useRef<JourneyInput>({ progress: 0, branch: null });
  const snapshot = useRef<(() => string) | null>(null);
  const choiceRefs = useRef<Partial<Record<NonNullable<LandingBranch>, HTMLButtonElement | null>>>({});
  const progressBar = useRef<HTMLElement>(null);
  const stepRef = useRef(0);
  const [step, setStep] = useState(0);
  const [branch, setBranch] = useState<LandingBranch>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [status, setStatus] = useState<Status>("ready");
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMode(preference.matches ? "static" : "motion");
    const timer = window.setTimeout(apply, 0);
    preference.addEventListener("change", apply);
    return () => { clearTimeout(timer); preference.removeEventListener("change", apply); };
  }, []);

  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      const element = journey.current;
      if (!element) return;
      const progress = Math.max(0, Math.min(1, -element.getBoundingClientRect().top / Math.max(1, element.offsetHeight - window.innerHeight)));
      input.current.progress = progress;
      if (progressBar.current) progressBar.current.style.transform = `scaleX(${Math.max(.015, progress)})`;
      const next = progress < .14 ? 0 : progress < .34 ? 1 : progress < .54 ? 2 : progress < .82 ? 3 : 4;
      if (next !== stepRef.current) {
        stepRef.current = next; setStep(next);
        if (next < 4) { input.current.branch = null; setBranch(null); }
      }
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);

  function choose(value: LandingBranch) {
    input.current.branch = value; setBranch(value);
    setStatus(mode === "static" ? "settled" : value ? "transitioning" : "ready");
  }
  function handleStatus(value: Status, detail?: string) {
    setStatus(value);
    if (value === "error") { setFailure(true); setMode("static"); console.warn("[Fire3D:fallback]", detail); }
  }
  function continueJourney() {
    if (!branch || (mode !== "static" && status !== "settled")) return;
    if (branch === "organization") {
      if (snapshot.current) setSceneHandoff({ image: snapshot.current(), width: innerWidth, height: innerHeight });
      router.push(routes.organizations);
    } else router.push(session.isAuthenticated ? routes.learningHub : `${routes.login}?next=${encodeURIComponent(routes.learningHub)}&intent=training`);
  }
  const staticMode = mode === "static";
  const choice = <div className={styles.choice}>
    <p className={styles.eyebrow}>MỘT ĐIỂM BẮT ĐẦU. HAI HƯỚNG ĐI.</p>
    <h2>{branch === "organization" ? "Dành cho tổ chức" : branch === "trainee" ? "Mang sự chủ động theo bạn." : "Bạn muốn bắt đầu từ đâu?"}</h2>
    <p>{branch === "organization" ? "Từ một công trình, xây dựng những lượt tập huấn có bối cảnh và nhìn lại kết quả." : branch === "trainee" ? "Làm quen, tập dượt và xem lại. Một hành trình học tập, tiếp nối trên điện thoại." : "Chọn một hướng để khám phá. Bạn có thể đổi lựa chọn trước khi tiếp tục."}</p>
    {(staticMode || branch) && <div className={styles.choices}>
      <button className={styles.choiceButton} onClick={() => choose("trainee")} aria-pressed={branch === "trainee"}><Smartphone size={20} /> Tôi muốn tập huấn</button>
      <button className={styles.choiceButton} onClick={() => choose("organization")} aria-pressed={branch === "organization"}><Building2 size={20} /> Tôi muốn tổ chức tập huấn</button>
    </div>}
    <div className={styles.actions}>
      <Button disabled={!branch || (!staticMode && status !== "settled")} onClick={continueJourney}>Tiếp tục <ArrowUpRight size={16} /></Button>
      {branch && <button className={styles.back} onClick={() => choose(null)}><ArrowLeft size={15} /> Quay lại điểm lựa chọn</button>}
    </div>
  </div>;

  return <main className={`${styles.page} ${staticMode ? styles.static : ""}`} data-scene-mode={mode} data-stage={step} data-branch={branch ?? "none"}>
    <div className={styles.header}><SiteHeader /></div>
    <section ref={journey} className={styles.journey} aria-label="Hành trình làm quen FET3D">
      <div className={styles.stage}>
        <div className={styles.world}>{mode === "motion" && <BuildingScene input={input} onStatus={handleStatus} snapshotRef={snapshot} choiceRefs={choiceRefs} />}</div>
        {!staticMode && step === 4 && !branch && <div className={styles.wallTargets}>
          <button ref={node => { choiceRefs.current.trainee = node; }} className={styles.wallTarget} onPointerDown={event => event.preventDefault()} onClick={() => choose("trainee")} aria-label="Tôi muốn tập huấn" />
          <button ref={node => { choiceRefs.current.organization = node; }} className={styles.wallTarget} onPointerDown={event => event.preventDefault()} onClick={() => choose("organization")} aria-label="Tôi muốn tổ chức tập huấn" />
        </div>}
        <div className={styles.scrim} aria-hidden="true" />
        {!staticMode && branch === "organization" && <OrbitSurface onMove={(dx, dy) => {
          const current = input.current.orbit ?? { yaw: 0, pitch: 0 };
          input.current.orbit = { yaw: current.yaw + dx, pitch: Math.max(-.6, Math.min(.7, current.pitch + dy)) };
        }} onReset={() => { input.current.orbit = { yaw: 0, pitch: 0 }; }} />}
        <div className={styles.copy}>
          {staticMode ? <>{panels.map((panel, i) => <section className={styles.panel} key={i}>{panel}</section>)}{choice}</> :
            <div className={styles.panel} key={step === 4 ? "choice" : step}>{step < 4 ? panels[step] : choice}</div>}
        </div>
        {(mode === "loading" || failure) && <p className={styles.status} role="status">{failure ? "Chế độ ảnh tĩnh · trải nghiệm 3D hiện chưa khả dụng" : "Đang chuẩn bị không gian…"}</p>}
        <div className={styles.hud}>
          <span>0{Math.min(step + 1, 4)} <span className={styles.track}><i ref={progressBar} /></span> 04</span>
          <span><Building2 size={14} />{branch === "organization" ? "Toàn cảnh / 03 tầng" : branch === "trainee" ? "Trải nghiệm trên Android" : locations[step]}</span>
        </div>
      </div>
    </section>
  </main>;
}
