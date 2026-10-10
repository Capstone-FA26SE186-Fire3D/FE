"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastTone = "success" | "danger" | "warning" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string };

type ToastApi = { notify: (toast: Omit<ToastItem, "id">) => void };

const ToastContext = createContext<ToastApi>({ notify: () => undefined });
const icons = { success: CircleCheck, danger: CircleAlert, warning: TriangleAlert, info: Info } as const;
// Errors stay until dismissed so they are not missed; the rest clear themselves.
const lifetimeMs: Record<ToastTone, number | null> = { success: 5000, info: 6000, warning: 9000, danger: null };

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-3), { ...toast, id }]);
    const lifetime = lifetimeMs[toast.tone];
    if (lifetime) timers.current.set(id, window.setTimeout(() => dismiss(id), lifetime));
  }, [dismiss]);

  const api = useMemo(() => ({ notify }), [notify]);

  return <ToastContext.Provider value={api}>
    {children}
    <div className="ops-toasts" role="region" aria-label="Thông báo" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const Icon = icons[item.tone];
          return <motion.div key={item.id} layout className="ops-toast" data-tone={item.tone} role={item.tone === "danger" ? "alert" : "status"} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
            <Icon size={18} aria-hidden="true" />
            <div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</div>
            <button type="button" className="ops-icon-button" style={{ width: 28, height: 28, border: 0 }} aria-label="Đóng thông báo" onClick={() => dismiss(item.id)}><X size={14} aria-hidden="true" /></button>
          </motion.div>;
        })}
      </AnimatePresence>
    </div>
  </ToastContext.Provider>;
}
