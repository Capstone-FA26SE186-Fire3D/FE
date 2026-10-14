import { Smartphone } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { routes } from "@/configs/routes";

/**
 * "Mở trên điện thoại". The web cannot know whether the app is installed and does not promise a deep link across an
 * install, so it only explains the steps; there is deliberately no "open app" or store button here.
 */
export function MobileGuide() {
  return <Panel title="Mở trên điện thoại" description="Bài tập huấn chạy trong ứng dụng FET3D, không chạy trên trang web này." bodyClassName="ops-stack">
    <ol className="qrl-steps">
      <li><span><strong>Cài ứng dụng FET3D trên Android</strong> (chỉ cần cài một lần). Xem <Link href={routes.download}>trạng thái tải ứng dụng</Link>.</span></li>
      <li><span><strong>Mở ứng dụng và đăng nhập</strong>, rồi quét lại mã QR của công trình bằng chức năng quét trong ứng dụng.</span></li>
      <li><span><strong>Chọn bài</strong> trong danh sách. Ứng dụng tải và kiểm tra gói bài; máy chủ chỉ cho bắt đầu khi có kết nối.</span></li>
    </ol>
    <p className="ops-muted"><Smartphone size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />Trang này không tự mở ứng dụng và không biết ứng dụng đã được cài hay chưa. Nếu chưa cài, hãy cài rồi quét lại mã QR.</p>
  </Panel>;
}
