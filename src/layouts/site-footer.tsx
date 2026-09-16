import Link from "next/link";
import { routes } from "@/configs/routes";
import { FET3DLogo } from "@/components/brand/fet3d-logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="brand-mark"><FET3DLogo /></div>
      <p>Học bằng cách bước vào tình huống.</p>
      <div className="footer-links"><Link href={routes.learn}>Learn</Link><Link href={routes.organizations}>Tổ chức</Link><Link href={routes.about}>Về chúng tôi</Link></div>
    </footer>
  );
}
