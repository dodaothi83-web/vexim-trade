import "server-only";

import { getStore } from "@/lib/db";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import type { Supplier } from "@/lib/types";

/** One notification to every active sourcing manager and admin; requests remain in the CRM queue if mail fails. */
export async function notifySupplierRegistration(supplier: Supplier, requested: readonly number[]): Promise<"sent" | "simulated" | "failed"> {
  const users = await getStore().listUsers();
  const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "sourcing" || u.role === "admin"))
    .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return "failed";
  const choices = requested.map((n) => n === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng");
  const staffOrigin = process.env.SUPPLIER_SIGNUP_REDIRECT_URL
    ? new URL(process.env.SUPPLIER_SIGNUP_REDIRECT_URL).origin : SITE_URL;
  const url = `${staffOrigin}/crm/suppliers/${encodeURIComponent(supplier.id)}`;
  const title = `NCC tự đăng ký: ${supplier.name}`;
  const body = `<p>NCC vừa nộp hồ sơ tự khai (giấy tờ bước đầu nếu đã tải). <strong>Tài khoản chưa được Vexim xác nhận sử dụng cổng; chưa có đánh giá nào được tự động duyệt.</strong></p>
    <p>Doanh nghiệp: ${escapeHtml(supplier.name)}<br/>Liên hệ: ${escapeHtml(supplier.contact_name ?? "—")} · ${escapeHtml(supplier.email ?? "—")} · ${escapeHtml(supplier.phone ?? "—")}</p>
    <p>Yêu cầu Vexim liên hệ để xác minh thêm: <strong>${escapeHtml(choices.join(", ") || "Không chọn")}</strong>.
    Nếu có yêu cầu, nhân viên thu mua vui lòng liên hệ sớm để lên kế hoạch và tự tải bằng chứng vào đúng đợt kiểm.</p>
    <p>Chuyên viên kiểm tra hồ sơ gốc/ảnh, sửa checklist thủ công, nộp và người có quyền duyệt mới xác nhận. AI chỉ gợi ý.</p>
    <p><a href="${url}">Mở hồ sơ NCC trong CRM →</a></p>`;
  const result = await transport({ to: recipients, subject: title,
    html: wrapPlainEmail({ title, body }), text: `${title}\nYêu cầu: ${choices.join(", ") || "Không chọn"}\n${url}` });
  return result.ok ? result.status : "failed";
}
