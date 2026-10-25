"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { routes } from "@/configs/routes";
import { cn } from "@/utils/cn";

const TOUR_KEY = "fire3d-trainee-tour";

export const TOUR_STEPS = [
  { title: "Đọc bài học", text: "Bài viết, mẹo và video công khai về thoát hiểm và phòng cháy. Đọc để chuẩn bị, không bắt buộc trước khi luyện tập.", action: { label: "Mở thư viện bài học", href: routes.learn } },
  { title: "Luyện tập trên ứng dụng", text: "Cài ứng dụng Android, quét mã công trình rồi chọn Learn, Luyện có hướng dẫn hoặc Đánh giá. Bạn có thể bắt đầu ở bước này ngay.", action: { label: "Tải ứng dụng", href: routes.download } },
  { title: "Xem kết quả", text: "Sau khi đồng bộ, lịch sử hiển thị riêng trạng thái phiên và kết quả đánh giá. Hoàn thành phiên không có nghĩa là đạt.", action: { label: "Mở lịch sử luyện tập", href: "/learning-hub?view=history" } },
] as const;

function rememberTour() {
  try { window.localStorage.setItem(TOUR_KEY, "done"); } catch { /* blocked storage: the tour is simply offered again */ }
}

/**
 * Short, skippable walkthrough opened from the first-visit card. A Radix dialog supplies the focus trap, Escape and focus
 * return to the opener; motion follows `prefers-reduced-motion` through the shared dialog styles. Every step links to a real
 * page and none is a prerequisite for the next: no points, levels, badges or progress is invented here.
 */
export function IntroTour({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;
  const close = (next: boolean) => {
    if (!next) { rememberTour(); setIndex(0); }
    onOpenChange(next);
  };
  return <Modal
    open={open}
    onOpenChange={close}
    title="Hướng dẫn nhanh"
    description={`Bước ${index + 1} trên ${TOUR_STEPS.length}. Bỏ qua bất cứ lúc nào, không bước nào là điều kiện để luyện tập.`}
    className="ov-tour"
    footer={<>
      <Button type="button" variant="ghost" onClick={() => close(false)}>Bỏ qua</Button>
      {index > 0 && <Button type="button" variant="secondary" onClick={() => setIndex(index - 1)}>Quay lại</Button>}
      {last ? <Button type="button" onClick={() => close(false)}>Xong</Button> : <Button type="button" onClick={() => setIndex(index + 1)}>Tiếp</Button>}
    </>}
  >
    <div className="ov-tour-step" data-testid="tour-step">
      <ol className="ov-tour-dots" aria-label="Các bước">
        {TOUR_STEPS.map((item, position) => <li key={item.title} aria-current={position === index ? "step" : undefined} data-active={position <= index}><span className="sr-only">{`Bước ${position + 1}: ${item.title}`}</span></li>)}
      </ol>
      <h3>{index + 1}. {step.title}</h3>
      <p>{step.text}</p>
      <Link className={cn(buttonVariants({ variant: "secondary" }), "self-start")} href={step.action.href} onClick={rememberTour}>{step.action.label}</Link>
    </div>
  </Modal>;
}
