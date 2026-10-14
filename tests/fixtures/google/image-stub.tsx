// Plain img in place of next/image inside the isolated browser fixture.
import type { ImgHTMLAttributes } from "react";

export default function Image({ alt, src, width, height, style }: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt ?? ""} src={src} width={width} height={height} style={style} />;
}
