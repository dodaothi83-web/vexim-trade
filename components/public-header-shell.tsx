"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Khung header công khai: trong suốt nhẹ ở đầu trang, khi cuộn thì nổi lên bằng một bóng mảnh
 * và thu gọn chiều cao. Chỉ đổi hiển thị, không đổi nội dung hay điều hướng.
 */
export function PublicHeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <header data-scrolled={scrolled ? "true" : "false"}
    className={`sticky top-0 z-30 border-b bg-white/85 backdrop-blur-xl transition-[box-shadow,border-color] duration-200 supports-[backdrop-filter]:bg-white/75 ${scrolled
      ? "border-ink-200/80 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)]"
      : "border-ink-100"}`}>
    <div className={`mx-auto flex max-w-7xl items-center gap-2 px-3 transition-[padding] duration-200 sm:gap-4 sm:px-6 lg:px-8 ${scrolled ? "py-2" : "py-3"}`}>
      {children}
    </div>
  </header>;
}
