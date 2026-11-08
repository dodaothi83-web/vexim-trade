"use client";

// Lưới an toàn cuối cùng của toàn site: Next.js chỉ dựng global-error.tsx khi một lỗi xảy ra
// ngay trong root layout (app/layout.tsx) hoặc không được error.tsx cục bộ nào bắt được.
// Vì vậy file này phải tự vẽ lại <html>/<body> — root layout coi như không còn hoạt động.
//
// https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errortsx
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div role="alert" style={{ maxWidth: 560, margin: "64px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: 12, fontSize: 14, color: "#57534e" }}>
            Our team has been notified. Please try again, or reload the page if the problem continues.
          </p>
          <button
            onClick={reset}
            style={{ marginTop: 20, padding: "8px 16px", borderRadius: 8, background: "#1d4ed8", color: "#fff", fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
