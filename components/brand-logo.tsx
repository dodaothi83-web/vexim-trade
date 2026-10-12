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

/**
 * Bản màu TRẮNG để đặt trên nền tối (header navy + footer của trang /cashew).
 *
 * Vì sao không dùng thẳng public/logo-vexim-white.jpg:
 *  - file đó là JPEG (khởi đầu bằng FF D8) nên KHÔNG có kênh alpha — dù đổi tên .png thì
 *    logo-vexim.png hiện tại cũng là JPEG, nghĩa là cả hai bản đều có nền trắng đặc;
 *  - phần chữ của bản "white" lại là trắng trên nền trắng, đặt lên nền navy sẽ hiện thành
 *    một ô vuông trắng, logo bên trong gần như không nhìn thấy.
 *
 * Chỗ này "đục" nền bằng CSS, không đụng file ảnh và không thêm asset nhị phân:
 *   invert(1)   -> nền trắng thành đen, mọi nét vẽ thành sáng;
 *   grayscale(1)-> bỏ hết màu để logo không bị ám vàng/xanh sau khi đảo;
 *   brightness -> đẩy các nét sáng lên gần trắng, giữ nguyên vùng nền đã về đen;
 *   mix-blend-mode: screen -> screen(nền trang, đen) = nền trang, nên nền đen của ảnh TAN
 *                  BIẾN, chỉ còn khối logo trắng nổi trên navy.
 * Không thêm contrast() vào chuỗi: nền logo có mảng xanh nhạt, contrast cao sẽ cắt luôn
 * phần đó và làm mất cánh "V".
 *
 * Nếu sau này có bản PNG/WEBP thật sự trong suốt thì chỉ cần đổi backgroundImage ở
 * LOGO_WHITE và xoá filter/blend — một chỗ duy nhất.
 */
const LOGO_WHITE: CSSProperties = {
  filter: "invert(1) grayscale(1) brightness(1.6)",
  mixBlendMode: "screen",
};

export function Logo({
  className,
  tone = "color",
}: {
  className?: string;
  /** "color" = nguyên bản cho nền sáng; "white" = bản trắng đục bằng CSS cho nền tối */
  tone?: "color" | "white";
}) {
  return (
    <span
      role="img"
      aria-label="Vexim Trade, Export Sales"
      className={className}
      style={tone === "white" ? { ...LOGO_BG, ...LOGO_WHITE } : LOGO_BG}
    />
  );
}
