import { Smartphone } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { routes } from "@/configs/routes";

/**
 * "Mở trên điện thoại". The web cannot know whether the app is installed and does not promise a deep link across an
 * install, so it only explains the steps; there is deliberately no "open app" or store button here. The app is in
 * testing on Google Play (no public store page), so step 1 points to /download, which explains the invitation.
 * `canStart` false (the Building's service is not running): the steps that end in starting a lesson are not offered.
 */
export function MobileGuide({ canStart = true }: { canStart?: boolean }) {
  const install = <>Ứng dụng đang thử nghiệm trên Google Play: bạn nhận lời mời cài từ tổ chức của mình hoặc nhóm FET3D. Xem <Link href={routes.download}>cách nhận ứng dụng</Link>.</>;
  if (!canStart) {
    return <Panel title="Mở trên điện thoại" description="Bài tập huấn chạy trong ứng dụng FET3D, không chạy trên trang web này." bodyClassName="ops-stack">
      <p className="ops-muted" data-testid="qr-guide-blocked">Hiện chưa bắt đầu được bài của công trình này trong ứng dụng. Khi dịch vụ của công trình có hiệu lực trở lại, hãy quét lại mã QR này.</p>
      <p className="ops-muted qrl-note">Bạn vẫn có thể cài sẵn ứng dụng FET3D trên Android (chỉ cần cài một lần). {install}</p>
    </Panel>;
  }
  return <Panel title="Mở trên điện thoại" description="Bài tập huấn chạy trong ứng dụng FET3D, không chạy trên trang web này." bodyClassName="ops-stack">
    <ol className="qrl-steps">
      <li><span><strong>Cài ứng dụng FET3D trên Android</strong> (chỉ cần cài một lần). {install}</span></li>
      <li><span><strong>Mở ứng dụng và đăng nhập</strong>, rồi quét lại mã QR của công trình bằng chức năng quét trong ứng dụng.</span></li>
      <li><span><strong>Chọn bài</strong> trong danh sách. Ứng dụng tải bài về máy; điện thoại cần có mạng khi bắt đầu bài.</span></li>
    </ol>
    <p className="ops-muted"><Smartphone size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />Trang này không tự mở ứng dụng và không biết ứng dụng đã được cài hay chưa. Nếu chưa cài, hãy cài rồi quét lại mã QR.</p>
  </Panel>;
}
