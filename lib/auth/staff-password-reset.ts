import "server-only";

import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import type { AppUserRecord } from "@/lib/types";

/**
 * Nhân viên Vexim gửi link đặt lại mật khẩu cho tài khoản nhà cung cấp quên mật khẩu.
 *
 * Dùng đúng cơ chế của trang "Quên mật khẩu" (`/auth/reset-password`): token ký HMAC,
 * dùng một lần (đổi mật khẩu xong là token cũ hết hiệu lực), đổi mật khẩu cả bên Supabase
 * Auth. Nhân viên không bao giờ thấy hay đặt mật khẩu của doanh nghiệp: chỉ doanh nghiệp
 * mở link mới tự đặt được.
 *
 * Link sống 24 giờ thay vì 30 phút vì thường phải nhắn lại qua Zalo, doanh nghiệp không
 * mở ngay. Gửi link mới không làm link cũ hết hạn sớm; link nào dùng trước thì các link
 * còn lại vô hiệu.
 */
export const STAFF_RESET_TTL_SECONDS = 24 * 60 * 60;

/** Cùng quy tắc với trang Quên mật khẩu: tên miền cổng nhà cung cấp nếu có cấu hình. */
export function passwordResetOrigin(): string {
  try {
    const configured = process.env.SUPPLIER_SIGNUP_REDIRECT_URL?.trim();
    if (configured) {
      const url = new URL(configured);
      if (url.protocol === "https:" && !url.username && !url.password) return url.origin;
    }
  } catch {
    /* Dùng SITE_URL */
  }
  return SITE_URL;
}

export type StaffResetResult = { emailed: boolean; url: string; expiresAt: string };

export async function sendStaffPasswordReset(
  user: Pick<AppUserRecord, "id" | "email" | "name" | "password_hash">,
  nowMs = Date.now(),
): Promise<StaffResetResult> {
  const token = createPasswordResetToken({
    uid: user.id, email: user.email, passwordHash: user.password_hash, nowMs, ttlSeconds: STAFF_RESET_TTL_SECONDS,
  });
  const url = `${passwordResetOrigin()}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const expiresAt = new Date(nowMs + STAFF_RESET_TTL_SECONDS * 1000).toISOString();
  const greeting = (user.name ?? "").trim() || user.email;
  const subject = "Đặt lại mật khẩu tài khoản Vexim Trade";
  const body = `<p>Xin chào ${escapeHtml(greeting)},</p>
    <p>Theo yêu cầu hỗ trợ, đội ngũ Vexim Trade gửi bạn liên kết đặt lại mật khẩu cho tài khoản <strong>${escapeHtml(user.email)}</strong> trên cổng nhà cung cấp.</p>
    <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#0f766e;color:#ffffff;font-weight:600;text-decoration:none;">Đặt lại mật khẩu</a></p>
    <p>Liên kết có hiệu lực trong <strong>24 giờ</strong> và chỉ dùng được một lần. Vexim không biết và không lưu mật khẩu bạn đặt. Nếu bạn không nhờ hỗ trợ, hãy bỏ qua thư này: mật khẩu hiện tại vẫn giữ nguyên.</p>`;
  const result = await transport({
    to: [user.email],
    subject,
    html: wrapPlainEmail({ title: subject, body }),
    text: `${subject}\n\nXin chào ${greeting},\nMở liên kết sau để đặt lại mật khẩu (hiệu lực 24 giờ, dùng một lần):\n${url}\n\nNếu bạn không nhờ hỗ trợ, hãy bỏ qua thư này.`,
  });
  if (!result.ok) console.error("[staff-password-reset] email send failed", result.error);
  return { emailed: result.ok, url, expiresAt };
}
