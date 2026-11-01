import { NextResponse } from "next/server";
import { Resend } from "resend";

import { resendConfigured } from "@/lib/config";
import { suppressionFromWebhookEvent } from "@/lib/email/suppression";
import { recordSuppressions } from "@/lib/email/suppression-store";
import { makeResendFetcher, processInboundEvent } from "@/lib/mail/inbound";

export const dynamic = "force-dynamic";

/**
 * Webhook Resend — nhận thư đến (email.received) và sự kiện gửi thư hỏng.
 *
 * - Xác minh chữ ký Svix bằng RESEND_WEBHOOK_SECRET (whsec_...) ở môi trường production;
 *   ở môi trường dev (không có secret) chấp nhận payload trần để dễ phát triển.
 * - Payload chỉ có metadata; nội dung kéo bằng Receiving API (makeResendFetcher).
 * - email.bounced (Permanent, Undetermined), email.complained và email.suppressed: ghi địa chỉ vào
 *   danh sách ngừng gửi, tắt tài khoản nhà cung cấp dùng địa chỉ đó. Bounce Transient bỏ qua.
 * - Luôn trả 2xx khi đã xử lý xong để Resend không phát lại; chống trùng bằng email_id.
 */
export async function POST(req: Request) {
  const payload = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const isProd = process.env.NODE_ENV === "production";

  let event: { type?: string; data?: Record<string, unknown> } | null = null;

  if (secret) {
    const id = req.headers.get("svix-id");
    const timestamp = req.headers.get("svix-timestamp");
    const signature = req.headers.get("svix-signature");
    if (!id || !timestamp || !signature) {
      return NextResponse.json({ ok: false, error: "Thiếu header svix" }, { status: 400 });
    }
    try {
      const resend = new Resend(process.env.RESEND_API_KEY || "re_webhook_verify_only");
      const verified = resend.webhooks.verify({
        payload,
        headers: { id, timestamp, signature },
        webhookSecret: secret,
      }) as unknown as { type?: string; data?: Record<string, unknown> };
      event = verified;
    } catch (err) {
      console.error("[webhooks/resend] chữ ký không hợp lệ:", err instanceof Error ? err.message : err);
      return NextResponse.json({ ok: false, error: "Chữ ký webhook không hợp lệ" }, { status: 401 });
    }
  } else {
    if (isProd) {
      return NextResponse.json(
        { ok: false, error: "Thiếu RESEND_WEBHOOK_SECRET — chép secret (whsec_...) từ Resend → Webhooks vào biến môi trường." },
        { status: 401 },
      );
    }
    console.warn("[webhooks/resend] chưa có RESEND_WEBHOOK_SECRET — chấp nhận payload KHÔNG xác minh (chỉ dev).");
    try {
      event = JSON.parse(payload);
    } catch {
      return NextResponse.json({ ok: false, error: "Payload không phải JSON" }, { status: 400 });
    }
  }

  // Bounce cứng và báo cáo thư rác: ghi vào danh sách ngừng gửi và tắt tài khoản
  // nhà cung cấp dùng địa chỉ đó. Bounce tạm (Transient) không cắt địa chỉ.
  if (event?.type === "email.bounced" || event?.type === "email.complained" || event?.type === "email.suppressed") {
    const suppression = suppressionFromWebhookEvent(event);
    if (!suppression) {
      return NextResponse.json({
        ok: true,
        matched: true,
        type: event.type,
        suppressed: [],
        reason:
          event.type === "email.bounced"
            ? "Bounce tạm (Transient): hộp thư đầy hoặc máy chủ bận, chưa cắt địa chỉ này."
            : "Không đọc được địa chỉ người nhận trong sự kiện.",
      });
    }
    const outcome = await recordSuppressions(suppression);
    return NextResponse.json({
      ok: true,
      matched: true,
      type: event.type,
      reason: suppression.reason,
      suppressed: outcome.saved,
      failed: outcome.skipped,
      deactivatedAccounts: outcome.deactivatedAccounts,
    });
  }

  if (!event || event.type !== "email.received") {
    // Các sự kiện vòng đời khác (sent/delivered/delivery_delayed...) không cần ghi
    return NextResponse.json({ ok: true, matched: false, type: event?.type ?? null });
  }

  const d = (event.data ?? {}) as Record<string, unknown>;
  const meta = {
    email_id: String(d.email_id ?? d.id ?? ""),
    from: String(d.from ?? ""),
    to: Array.isArray(d.to) ? (d.to as unknown[]).map(String) : [],
    cc: Array.isArray(d.cc) ? (d.cc as unknown[]).map(String) : [],
    subject: String(d.subject ?? ""),
  };

  const outcome = await processInboundEvent(meta, makeResendFetcher());
  return NextResponse.json({
    ok: true,
    matched: true,
    saved: outcome.saved,
    reason: outcome.reason ?? null,
    messageId: outcome.messageId ?? null,
    notified: outcome.notified ?? 0,
    resendConfigured: resendConfigured(),
  });
}

/** Probe nhanh trạng thái cấu hình (không lộ secret). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/webhooks/resend",
    webhookSecretSet: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
    resendConfigured: resendConfigured(),
    expects: "POST sự kiện email.received và email.bounced/complained từ Resend (chữ ký Svix)",
  });
}
