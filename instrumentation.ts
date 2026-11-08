// Sentry — điểm nạp chính cho phía server. Next.js tự gọi register() một lần khi tiến trình
// server khởi động (cả runtime Node.js lẫn Edge), trước khi xử lý request đầu tiên.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Bắt lỗi của Server Components / Route Handlers / Server Actions mà error.tsx cục bộ
// không bắt được (ví dụ lỗi trong lúc render RSC trả luồng xuống client). Next.js gọi hàm
// này tự động cho mọi lỗi phía server không được try/catch — đây là lớp "lưới an toàn" cuối
// cùng, bổ sung cho các error.tsx/global-error.tsx đã có trong app/.
export const onRequestError = Sentry.captureRequestError;
