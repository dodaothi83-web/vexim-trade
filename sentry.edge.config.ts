// Sentry — khởi tạo cho Edge runtime (middleware.ts, các route/pages khai báo
// `export const runtime = "edge"`). Được nạp từ instrumentation.ts khi
// NEXT_RUNTIME === "edge". Xem docs/sentry-setup.md để biết cách điền DSN thật.
//
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.VEXIM_DEPLOY_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  debug: false,
});
