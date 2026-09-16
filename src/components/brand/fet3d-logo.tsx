import Image from "next/image";

type FET3DLogoProps = {
  variant?: "lockup" | "mark";
  className?: string;
};

const assets = {
  lockup: "/brand/fet3d-lockup.png",
  mark: "/icon.png",
} as const;

/**
 * Image-based FET3D identity using the selected Axonometric Grid concept.
 * The lockup artwork includes the wordmark below the mark; the mark asset is
 * intentionally icon-only for compact surfaces such as a favicon.
 */
export function FET3DLogo({ variant = "lockup", className = "" }: FET3DLogoProps) {
  const classes = ["fet3d-logo", `fet3d-logo--${variant}`, className].filter(Boolean).join(" ");
  const isMark = variant === "mark";

  return (
    <span className={classes}>
      <Image
        className="fet3d-logo__asset"
        src={assets[variant]}
        alt={isMark ? "" : "FET3D"}
        aria-hidden={isMark}
        width={1024}
        height={1024}
        priority={variant === "lockup"}
      />
    </span>
  );
}
