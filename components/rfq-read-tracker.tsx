"use client";

import { useEffect, useRef } from "react";

/** Mark only the timestamp shown on this page, never later unseen messages. */
export function RfqReadTracker({ at, markRead }: { at: string | null; markRead: (at: string) => Promise<void> }) {
  const target = useRef<HTMLSpanElement>(null);
  const marked = useRef<string | null>(null);
  useEffect(() => {
    const element = target.current;
    if (!at || !element || marked.current === at) return;
    const visible = () => {
      if (document.visibilityState === "hidden" || !element.getClientRects().length) return false;
      const rect = element.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    };
    const mark = () => {
      if (marked.current === at || !visible()) return;
      marked.current = at;
      void markRead(at).catch(() => { if (marked.current === at) marked.current = null; });
    };
    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) mark();
        }, { threshold: 0.5 })
      : null;
    if (observer) observer.observe(element);
    else {
      // Older browsers: test the same endpoint on scroll rather than treating mount as a read.
      window.addEventListener("scroll", mark, { passive: true });
      window.addEventListener("resize", mark);
      mark();
    }
    document.addEventListener("visibilitychange", mark);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", mark);
      window.removeEventListener("resize", mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [at, markRead]);
  // Placed *after* the latest visible quote or message, not at the section header:
  // merely opening a page or seeing the top of a long conversation is not a read.
  return <span ref={target} className="block h-px w-full" aria-hidden="true" />;
}
