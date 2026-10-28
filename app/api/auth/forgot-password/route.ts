import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { protectPasswordAuth } from "@/lib/auth/abuse-protection";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCEPTED_MESSAGE =
  "Nếu email này đã đăng ký trong hệ thống, liên kết đặt lại mật khẩu đã được gửi tới hộp thư của bạn (hiệu lực 30 phút).";
const NO_STORE = { "Cache-Control": "no-store" };

const accepted = () =>
  NextResponse.json({ ok: true, message: ACCEPTED_MESSAGE }, { headers: NO_STORE });
const fail = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });

function resetOrigin(request: Request): string {
  try {
    const configured = process.env.SUPPLIER_SIGNUP_REDIRECT_URL?.trim();
    if (configured) {
      const url = new URL(configured);
      if (url.protocol === "https:" && !url.username && !url.password) {
        return url.origin;
      }
    }
  } catch {
    /* Fall back to SITE_URL or dev request origin */
  }
  if (process.env.NODE_ENV === "development") {
    try {
      return new URL(request.url).origin;
    } catch {
      /* Ignore */
    }
  }
  return SITE_URL;
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 4096) {
    return fail("Biểu mẫu quá lớn.", 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Không đọc được biểu mẫu.");
  }

  if (String(form.get("website_hp") ?? "")) return accepted();

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const challengeToken = String(form.get("challenge_token") ?? "").trim();
  if (email.length > 254 || !EMAIL.test(email)) {
    return fail("Email không hợp lệ.");
  }

  const protection = await protectPasswordAuth({
    flow: "password-reset",
    headers: request.headers,
    email,
    token: challengeToken,
  });
  if (!protection.ok) return fail(protection.message, protection.status);

  try {
    const store = getStore();
    const user = await store.getUserByEmail(email);
    if (!user || !user.is_active || user.role === "sourcing") {
      return accepted();
    }

    const token = createPasswordResetToken({
      uid: user.id,
      email: user.email,
      passwordHash: user.password_hash,
    });
    const resetUrl = `${resetOrigin(request)}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const greeting = (user.name ?? "").trim() || user.email;
    const subject = "Đặt lại mật khẩu tài khoản Vexim Trade";
    const body = `<p>Xin chào ${escapeHtml(greeting)},</p>
      <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>${escapeHtml(user.email)}</strong> trên Cổng nhà cung cấp Vexim Trade.</p>
      <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#0f766e;color:#ffffff;font-weight:600;text-decoration:none;">Đặt lại mật khẩu</a></p>
      <p>Liên kết có hiệu lực trong <strong>30 phút</strong> và chỉ dùng được một lần. Nếu bạn không yêu cầu thay đổi mật khẩu, hãy bỏ qua thư này.</p>`;

    const result = await transport({
      to: [user.email],
      subject,
      html: wrapPlainEmail({ title: subject, body }),
      text: `${subject}\n\nXin chào ${greeting},\nMở liên kết sau để đặt lại mật khẩu (hiệu lực 30 phút):\n${resetUrl}\n\nNếu bạn không yêu cầu, hãy bỏ qua thư này.`,
    });

    if (!result.ok) {
      console.error("[forgot-password] email send failed", result.error);
      return fail("Chưa gửi được email đặt lại mật khẩu. Vui lòng thử lại sau.", 503);
    }
  } catch (err) {
    console.error("[forgot-password] unexpected error", err);
    return fail("Chưa xử lý được yêu cầu lúc này. Vui lòng thử lại sau.", 503);
  }

  return accepted();
}
