import Link from "next/link";
import { Flame } from "lucide-react";
import { routes } from "@/configs/routes";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="brand-mark"><span className="brand-icon" aria-hidden="true"><Flame size={17} /></span>Fire3D</div>
      <p>Học bằng cách bước vào tình huống.</p>
      <div className="footer-links"><Link href={routes.learn}>Learn</Link><Link href={routes.organizations}>Tổ chức</Link><Link href={routes.about}>Về chúng tôi</Link></div>
    </footer>
  );
}
