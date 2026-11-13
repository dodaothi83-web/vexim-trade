"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Thanh tiến trình mảnh ở mép trên khi chuyển trang.
 *
 * App Router giữ nguyên trang cũ cho tới khi trang mới tải xong, nên bấm link mà mạng chậm
 * thì người dùng không biết đã bấm được chưa. Thanh này chạy ngay khi bấm một link nội bộ
 * (hoặc gửi form GET như ô tìm kiếm) và hoàn tất khi đường dẫn đổi. Chỉ là chỉ báo hình ảnh:
 * không chặn thao tác, không đổi nội dung, mã HTTP hay SEO.
 *
 * Bỏ qua: link mở tab mới, phím Ctrl/Cmd/Shift, tải tệp, link khác tên miền, link chỉ đổi
 * #anchor hoặc trỏ đúng trang đang mở. Quá 8 giây chưa đổi trang (ví dụ người dùng huỷ ở
 * hộp "Bỏ thay đổi chưa lưu?") thì tự ẩn để không treo thanh.
 */
const SAFETY_MS = 8_000;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);

  const clearTimers = () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; };

  // Đường dẫn đổi nghĩa là trang mới đã hiện: chạy nốt rồi ẩn.
  useEffect(() => {
    setState((current) => {
      if (current !== "loading") return current;
      clearTimers();
      timers.current.push(window.setTimeout(() => setState("idle"), 350));
      return "done";
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    const start = () => {
      clearTimers();
      setState("loading");
      timers.current.push(window.setTimeout(() => setState("idle"), SAFETY_MS));
    };
    const sameDocument = (url: URL) =>
      url.origin === window.location.origin &&
      url.pathname === window.location.pathname && url.search === window.location.search;

    const onClick = (event: MouseEvent) => {
      // Không xét defaultPrevented: <Link> của Next.js luôn gọi preventDefault để tự điều hướng.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || sameDocument(url)) return;
      start();
    };
    const onSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get" || (form.target && form.target !== "_self")) return;
      const url = new URL(form.action || window.location.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      start();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      clearTimers();
    };
  }, []);

  if (state === "idle") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div
        className={state === "loading"
          ? "h-full w-[80%] origin-left animate-[vexim-nav-progress_8s_cubic-bezier(0.1,0.7,0.2,1)_forwards] bg-brand-600 motion-reduce:animate-none"
          : "h-full w-full bg-brand-600 opacity-0 transition-opacity duration-300"}
      />
    </div>
  );
}
