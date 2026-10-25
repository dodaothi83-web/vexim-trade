import { NextResponse } from "next/server";

import { COMPANY } from "@/lib/config";
import { getStore } from "@/lib/db";
import {
  buildServiceInquiryAcknowledgement,
  buildServiceInquiryInternalEmail,
  serviceDisplayTitle,
  serviceInquiryReference,
} from "@/lib/email/service-inquiry";
import { transport } from "@/lib/email/send";
import { isOwnMailAddress } from "@/lib/email/sender";
import { protectPublicRequest } from "@/lib/auth/abuse-protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) {
    return NextResponse.json({ ok: false, message: "Form data is too large." }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = (await request.json()) as Record<string, unknown>;
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid request data." },
      { status: 400 },
    );
  }

  const lang = clean(body.lang, 10) === "vi" ? "vi" : "en";
  const isVi = lang === "vi";
  if (clean(body.website_hp, 200)) {
    return NextResponse.json({ ok: true, message: isVi ? "Đã ghi nhận đăng ký." : "Registration received." });
  }
  const serviceKey = clean(body.service_key, 60);
  // Tên dịch vụ do server quyết định theo mã dịch vụ; chỉ dùng tiêu đề form khi mã lạ.
  const serviceTitle = serviceDisplayTitle(serviceKey, lang, clean(body.service_title, 140));
  const companyName = clean(body.company_name, 160);
  const contactName = clean(body.contact_name, 120);
  const phone = clean(body.phone, 50);
  const email = clean(body.email, 140).toLowerCase();
  const productsText = clean(body.products_text, 240);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1200) : "";

  if (!companyName || !contactName || !phone || !email) {
    return NextResponse.json(
      {
        ok: false,
        message: isVi
          ? "Vui lòng nhập đầy đủ Tên doanh nghiệp, Người liên hệ, Số điện thoại và Email."
          : "Please fill in your Company Name, Contact Name, Phone Number, and Work Email.",
      },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      {
        ok: false,
        message: isVi ? "Địa chỉ email không hợp lệ." : "Invalid email address.",
      },
      { status: 400 },
    );
  }

  const protection = await protectPublicRequest({
    flow: "service-inquiry",
    headers: request.headers,
    email,
    token: clean(body.turnstile_token, 5000),
  });
  if (!protection.ok) {
    return NextResponse.json({
      ok: false,
      message: isVi
        ? protection.message
        : protection.status === 429
          ? "Too many attempts. Please try again later."
          : "We couldn't complete the security check. Please try again.",
    }, { status: protection.status });
  }

  const store = getStore();
  const submittedAt = new Date();
  const reference = serviceInquiryReference(submittedAt);

  await store
    .addAuditLog({
      actor_id: null,
      actor_email: email,
      entity: "supplier",
      entity_id: "service-inquiry",
      action: "public.service_inquiry",
      before: null,
      after: {
        reference,
        lang,
        service_key: serviceKey || "general",
        service_title: serviceTitle,
        company_name: companyName,
        contact_name: contactName,
        phone,
        email,
        products_text: productsText || null,
        note: note || null,
        submitted_at: submittedAt.toISOString(),
      },
    })
    .catch((err) => console.error("[service-inquiry] audit log failed", err));

  const input = {
    lang,
    serviceKey,
    serviceTitle,
    companyName,
    contactName,
    phone,
    email,
    productsText,
    note,
    reference,
    submittedAt,
  } as const;

  // 1) Báo đội Vexim. Reply-To là địa chỉ khách để bấm Trả lời là tới đúng người.
  try {
    const users = await store.listUsers();
    const recipients = [
      ...new Set(
        users
          .filter((u) => u.is_active && ["admin", "sale", "sourcing"].includes(u.role))
          .map((u) => u.email.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (recipients.length > 0) {
      const mail = buildServiceInquiryInternalEmail(input);
      const result = await transport({
        to: recipients,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: email,
      });
      if (!result.ok) console.error("[service-inquiry] internal email not sent", result.error);
    }
  } catch (err) {
    console.error("[service-inquiry] email notify failed", err);
  }

  // 2) Xác nhận cho doanh nghiệp đã đăng ký (đúng ngôn ngữ họ dùng trên form).
  //    Không gửi nếu địa chỉ thuộc domain của Vexim (tránh thư tự quay vòng).
  let acknowledged = false;
  if (!isOwnMailAddress(email)) {
    try {
      const ack = buildServiceInquiryAcknowledgement(input);
      const result = await transport({
        to: [email],
        subject: ack.subject,
        html: ack.html,
        text: ack.text,
        replyTo: COMPANY.email,
      });
      acknowledged = result.ok;
      if (!result.ok) console.error("[service-inquiry] acknowledgement not sent", result.error);
    } catch (err) {
      console.error("[service-inquiry] acknowledgement failed", err);
    }
  }

  return NextResponse.json({
    ok: true,
    reference,
    acknowledged,
    message: isVi
      ? `Đã nhận đăng ký "${serviceTitle}" của ${companyName}. Mã yêu cầu ${reference}. Chuyên viên Vexim Trade sẽ gọi cho ${contactName} qua số ${phone} trong vòng 1 ngày làm việc.`
      : `Registration received for "${serviceTitle}" — reference ${reference}. A Vexim Trade consultant will contact ${contactName} on ${phone} within one business day.`,
  });
}
