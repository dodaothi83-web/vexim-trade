"use client";

import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";

/**
 * Render HTML của email (đặc biệt thư ĐẾN — nội dung KHÔNG đáng tin) thẳng vào trang
 * theo kiểu Gmail, nhưng đã khử độc bằng DOMPurify: bỏ script/iframe/handler sự kiện/
 * javascript: URL. Render trong useEffect nên chỉ chạy ở trình duyệt.
 */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["style", "align", "bgcolor"],
      });
    }
  }, [html]);
  return <div ref={ref} className={className} />;
}
