import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SERVICES: Record<string, string> = {
  free_listing: "1. Đăng ký lên sàn Miễn phí",
  international_website: "2. Thiết kế website chuẩn thương mại quốc tế",
  featured_ads: "3. Quảng cáo nổi bật",
  fda_compliance: "4. Tuân thủ pháp lý FDA",
};

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

export async function POST(request: Request) {
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
      { ok: false, message: "Không đọc được dữ liệu biểu mẫu." },
      { status: 400 },
    );
  }

  const serviceKey = clean(body.service_key, 60);
  const serviceTitle = VALID_SERVICES[serviceKey] ?? clean(body.service_title, 140) ?? "Dịch vụ doanh nghiệp";
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
        message: "Vui lòng nhập đầy đủ Tên doanh nghiệp, Người liên hệ, Số điện thoại và Email.",
      },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, message: "Địa chỉ email không hợp lệ." },
      { status: 400 },
    );
  }

  const store = getStore();
  const submittedAt = new Date().toISOString();

  await store
    .addAuditLog({
      actor_id: null,
      actor_email: email,
      entity: "supplier",
      entity_id: "service-inquiry",
      action: "public.service_inquiry",
      before: null,
      after: {
        service_key: serviceKey || "general",
        service_title: serviceTitle,
        company_name: companyName,
        contact_name: contactName,
        phone,
        email,
        products_text: productsText || null,
        note: note || null,
        submitted_at: submittedAt,
      },
    })
    .catch((err) => console.error("[service-inquiry] audit log failed", err));

  try {
    const users = await store.listUsers();
    const recipients = [
      ...new Set(
        users
          .filter((u) => u.is_active && (u.role === "admin" || u.role === "sourcing"))
          .map((u) => u.email.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (recipients.length > 0) {
      const subject = `[Đăng ký dịch vụ] ${serviceTitle} — ${companyName}`;
      const htmlBody = [
        `<p>Doanh nghiệp vừa gửi yêu cầu đăng ký dịch vụ từ trang chủ Vexim Trade:</p>`,
        `<ul>`,
        `<li><strong>Dịch vụ đăng ký:</strong> ${escapeHtml(serviceTitle)}</li>`,
        `<li><strong>Doanh nghiệp:</strong> ${escapeHtml(companyName)}</li>`,
        `<li><strong>Người liên hệ:</strong> ${escapeHtml(contactName)}</li>`,
        `<li><strong>Điện thoại / Zalo:</strong> ${escapeHtml(phone)}</li>`,
        `<li><strong>Email:</strong> ${escapeHtml(email)}</li>`,
        productsText ? `<li><strong>Ngành hàng / Sản phẩm:</strong> ${escapeHtml(productsText)}</li>` : "",
        note ? `<li><strong>Ghi chú:</strong> ${escapeHtml(note)}</li>` : "",
        `</ul>`,
      ].join("");
      await transport({
        to: recipients,
        subject,
        html: wrapPlainEmail({ title: escapeHtml(subject), body: htmlBody }),
        text: `${subject}\nDoanh nghiệp: ${companyName}\nLiên hệ: ${contactName} - ${phone} - ${email}\nSản phẩm: ${productsText}\nGhi chú: ${note}`,
      });
    }
  } catch (err) {
    console.error("[service-inquiry] email notify failed", err);
  }

  return NextResponse.json({
    ok: true,
    message: `Đã gửi đăng ký "${serviceTitle}" thành công! Đội ngũ Vexim Trade sẽ liên hệ với ${contactName} qua số ${phone} trong vòng 1 ngày làm việc.`,
  });
}
