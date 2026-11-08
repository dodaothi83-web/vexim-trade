// Sentry — khởi tạo cho runtime Node.js (Server Components, Route Handlers, Server Actions
// chạy trên Node, cron jobs trong app/api/cron/*). Được nạp từ instrumentation.ts khi
// NEXT_RUNTIME === "nodejs". Xem docs/sentry-setup.md để biết cách điền DSN thật.
//
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Chưa điền DSN (demo/sandbox/preview chưa gắn Sentry) → SDK vẫn nạp nhưng không gửi gì,
  // không có lỗi, không cần guard thêm ở nơi gọi.
  enabled: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),

  environment: process.env.VEXIM_DEPLOY_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,

  // Tỉ lệ lấy mẫu performance tracing. Mặc định thấp để không tốn quota trên traffic thật;
  // chỉnh qua biến môi trường khi cần xem chi tiết hơn ở một đợt cụ thể.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

  // Giảm nhiễu log cục bộ; bật lại tạm thời khi cần soi việc cấu hình Sentry có đúng không.
  debug: false,
});
