# Giám sát lỗi — Sentry

## Vì sao không chạy `npx @sentry/wizard`

Wizard chính thức (`npx @sentry/wizard@latest -i nextjs`) cần một terminal tương tác thật
(đăng nhập Sentry qua trình duyệt, chọn org/project) — không chạy được trong môi trường agent
không có TTY (lỗi `ERR_TTY_INIT_FAILED` dù đã thử các cờ `--non-interactive --skip-connect
--saas`). Vì vậy phần tích hợp này được cấu hình **thủ công theo đúng cấu trúc wizard tạo ra**
cho Next.js App Router (không dùng `src/`), dùng `@sentry/nextjs`.

Khi có tài khoản Sentry thật, bạn có thể chạy wizard từ máy của mình (có terminal thật) để xác
nhận/đồng bộ lại cấu hình — nó sẽ nhận ra các file đã có và chỉ hỏi DSN/org/project.

## File đã thêm

| File | Vai trò |
|---|---|
| `instrumentation.ts` | Next.js tự gọi `register()` lúc server khởi động; nạp `sentry.server.config.ts` (runtime Node.js) hoặc `sentry.edge.config.ts` (runtime Edge) tuỳ `NEXT_RUNTIME`. Export `onRequestError` — Next.js tự gọi cho MỌI lỗi phía server không được try/catch (Server Components, Route Handlers, Server Actions) kể cả khi không có `error.tsx` cục bộ nào bắt. |
| `sentry.server.config.ts` | `Sentry.init()` cho runtime Node.js. |
| `sentry.edge.config.ts` | `Sentry.init()` cho runtime Edge (`middleware.ts` và route nào khai `runtime = "edge"`). |
| `instrumentation-client.ts` | `Sentry.init()` cho trình duyệt — quy ước ổn định từ Next.js 15.3, Next.js tự nạp, không cần import thủ công. Cũng export `onRouterTransitionStart` để theo dõi lỗi khi chuyển trang giữa các route App Router. |
| `app/global-error.tsx` | Lưới an toàn cuối cùng: Next.js chỉ dựng file này khi lỗi xảy ra ngay trong root layout hoặc không `error.tsx` nào bắt được. Gọi `Sentry.captureException` rồi hiện màn hình lỗi tối giản. |
| `app/(public)/buyer/account/error.tsx` | Error boundary có sẵn — trước đây không nhận prop `error` nên không báo được gì đi đâu; đã thêm `Sentry.captureException(error)`. |
| `next.config.ts` | Bọc `withSentryConfig()` — upload source map + gắn release lúc build. **Không đổi hành vi runtime.** Thiếu `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` → bước upload tự bỏ qua, build vẫn chạy bình thường (đã xác nhận qua `npm run build` không có 3 biến này). |

## Cách bật thật (khi có tài khoản Sentry)

1. Tạo project Next.js trên [sentry.io](https://sentry.io) (hoặc self-hosted).
2. Lấy DSN: Settings → Projects → (project) → Client Keys (DSN).
3. Thêm vào `.env.local` (dev) hoặc Environment Variables trên Vercel (production/preview):
   ```
   NEXT_PUBLIC_SENTRY_DSN=https://xxxx@o000000.ingest.us.sentry.io/000000
   ```
4. (Tuỳ chọn, để build tự upload source map — đọc được stack trace đã minify) thêm:
   ```
   SENTRY_ORG=...
   SENTRY_PROJECT=...
   SENTRY_AUTH_TOKEN=...   # Sentry → Settings → Auth Tokens, quyền project:releases
   ```
   `SENTRY_AUTH_TOKEN` là bí mật — chỉ đặt ở biến môi trường build (Vercel/CI), **không**
   commit, không thêm tiền tố `NEXT_PUBLIC_`.
5. Deploy lại. Không cần đổi gì khác trong code.

## Xác nhận đã bắt lỗi đúng chưa

Sau khi điền DSN thật, kiểm tra 3 lớp:

- **Client**: thêm tạm một nút `onClick={() => { throw new Error("sentry test client") }}` ở
  bất kỳ trang nào, bấm thử, xem Sentry có nhận event không, rồi xoá nút đi.
- **Server/Route Handler**: gọi thử một route handler `throw`, xác nhận `onRequestError` bắt
  được (event có tag `nextjs` + đúng route).
- **Edge/middleware**: tương tự, với một route khai `export const runtime = "edge"`.

## Giới hạn đã biết

- Chưa bật Session Replay (`NEXT_PUBLIC_SENTRY_REPLAY_*SAMPLE_RATE` mặc định `0`) vì buyer/NCC
  là dữ liệu B2B — cân nhắc chính sách bảo mật kỹ trước khi bật.
- `tracesSampleRate` mặc định 0.1 (10%) để không tốn quota performance tracing trên traffic
  thật — chỉnh qua `SENTRY_TRACES_SAMPLE_RATE` khi cần soi kỹ một đợt cụ thể.
- Chưa cấu hình Vercel Cron Monitors tự động (`automaticVercelMonitors`) vì repo chưa có
  `vercel.json` khai báo `crons` (lịch cron hiện cấu hình trực tiếp trên Vercel Dashboard) —
  bật lại tuỳ chọn này trong `next.config.ts` nếu sau này thêm `vercel.json`.
