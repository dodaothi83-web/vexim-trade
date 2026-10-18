import type { CSSProperties } from "react";

/**
 * Both transparent masks are cropped, aspect-ratio-preserving derivatives of the
 * supplied public/logo-vexim-white.jpg. The source is a white-on-white opaque JPEG;
 * see scripts/generate-brand-assets.mjs for the extraction. Use the full lockup in
 * headers/footers, and the mark-only version for small square brand icons.
 */
export function Logo({
  className,
  tone = "color",
  variant = "wordmark",
}: {
  className?: string;
  /** Dark artwork on light surfaces; white artwork on navy surfaces. */
  tone?: "color" | "white";
  variant?: "wordmark" | "mark";
}) {
  const mask = variant === "mark" ? "/logo-vexim-white-mark.png" : "/logo-vexim-white-wordmark.png";
  const style: CSSProperties = {
    display: "block",
    flexShrink: 0,
    backgroundColor: tone === "white" ? "#ffffff" : "#102349",
    maskImage: `url(${mask})`,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
  };
  return (
    <span
      role="img"
      aria-label="Vexim Trade, Export Sales"
      className={className}
      style={style}
    />
  );
}
