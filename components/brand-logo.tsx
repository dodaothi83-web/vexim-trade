import Image from "next/image";

/** Use the uploaded PNGs as-is; each is square with built-in transparent padding. */
export function Logo({
  className,
  tone = "color",
}: {
  className?: string;
  /** Blue on light surfaces, white on dark surfaces (registration, login, CRM). */
  tone?: "color" | "white";
}) {
  return (
    <Image
      src={tone === "white" ? "/logo-vexim-white-mark.png" : "/logo-vexim.png"}
      alt="Vexim Export Sales"
      width={tone === "white" ? 768 : 60}
      height={tone === "white" ? 768 : 60}
      unoptimized
      className={`block shrink-0 object-contain ${className ?? ""}`}
    />
  );
}
