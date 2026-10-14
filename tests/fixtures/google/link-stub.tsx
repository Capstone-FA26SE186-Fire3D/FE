// Plain anchor in place of next/link inside the isolated browser fixture.
import type { AnchorHTMLAttributes, ReactNode } from "react";

export default function Link({ href, children, ...rest }: { href: string; children?: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <a href={href} {...rest}>{children}</a>;
}
