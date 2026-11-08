// Sentry — khởi tạo cho trình duyệt (client components, lỗi JS không bắt được, lỗi render
// React). Next.js tự nạp file này ở gốc dự án (quy ước instrumentation-client, ổn định từ
// Next.js 15.3) — không cần import thủ công ở đâu khác. Xem docs/sentry-setup.md để biết
// cách điền DSN thật.
//
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  // Chưa điền DSN (demo/sandbox/preview chưa gắn Sentry) → SDK vẫn nạp nhưng không gửi gì.
  enabled: Boolean(dsn),

  environment: process.env.NEXT_PUBLIC_VEXIM_DEPLOY_ENV || process.env.NODE_ENV,

  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

  // Session Replay: tắt theo mặc định (không thu dữ liệu màn hình người dùng cho tới khi
  // được bật rõ ràng). Buyer/supplier là dữ liệu B2B, cân nhắc kỹ trước khi bật thu phiên.
  replaysSessionSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE ?? 0),
  replaysOnErrorSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE ?? 0),
  integrations: [Sentry.replayIntegration()],

  debug: false,
});

// Theo dõi lỗi khi chuyển trang giữa các route App Router (ví dụ lỗi trong Server Component
// của trang đích) — Next.js gọi hook này tự động, không cần gắn thủ công ở layout.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
