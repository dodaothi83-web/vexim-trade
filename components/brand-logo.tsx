import type { CSSProperties } from "react";

/**
 * Logo chính thức Vexim Trade. Giữ NGUYÊN file public/logo-vexim.png (canvas 1024² với
 * viền trong suốt dày). Phần có nội dung được crop ở lớp hiển thị bằng background-size và
 * background-position, không sửa file gốc. Hộp chứa phải đúng tỉ lệ nội dung ~1.35.
 */
const LOGO_BG: CSSProperties = {
  backgroundImage: "url(/logo-vexim.png)",
  backgroundSize: "136.9% auto",
  backgroundPosition: "51.3% 41.3%",
  backgroundRepeat: "no-repeat",
};

export function Logo({ className }: { className?: string }) {
  return <span role="img" aria-label="Vexim Trade, Export Sales" className={className} style={LOGO_BG} />;
}
