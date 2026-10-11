import { NextResponse } from "next/server";
import { Resend } from "resend";

import { resendConfigured } from "@/lib/config";
import { makeResendFetcher, processInboundEvent } from "@/lib/mail/inbound";

export const dynamic = "force-dynamic";

/**
 * Webhook Resend — nhận sự kiện email.received (Resend Inbound).
 *
 * - Xác minh chữ ký Svix bằng RESEND_WEBHOOK_SECRET (whsec_...) ở môi trường production;
 *   ở môi trường dev (không có secret) chấp nhận payload trần để dễ phát triển.
 * - Payload chỉ có metadata; nội dung kéo bằng Receiving API (makeResendFetcher).
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

  if (!event || event.type !== "email.received") {
    // Các sự kiện vòng đời gửi (sent/delivered/bounced...) chưa xử lý ở đây
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
    expects: "POST sự kiện email.received từ Resend (chữ ký Svix)",
  });
}
