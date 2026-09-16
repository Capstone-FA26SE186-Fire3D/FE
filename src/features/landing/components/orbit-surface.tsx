"use client";
import { useRef } from "react";
import styles from "./landing.module.css";

export function OrbitSurface({ onMove, onReset }: { onMove: (dx: number, dy: number) => void; onReset: () => void }) {
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  function move(dx: number, dy: number) {
    onMove(dx, dy);
  }
  return <div className={styles.orbit} role="group" aria-label="Điều khiển góc nhìn công trình" tabIndex={0}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { const previous = drag.current; if (!previous || previous.id !== event.pointerId) return; move((previous.x - event.clientX) * .006, (event.clientY - previous.y) * .004); drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onKeyDown={event => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowLeft") move(.12, 0);
      if (event.key === "ArrowRight") move(-.12, 0);
      if (event.key === "ArrowUp") move(0, .08);
      if (event.key === "ArrowDown") move(0, -.08);
      if (event.key === "Home") onReset();
    }}><span>Kéo để xoay · Phím mũi tên đổi góc · Home đặt lại</span></div>;
}
