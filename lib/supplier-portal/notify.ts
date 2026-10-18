import "server-only";

import { getStore } from "@/lib/db";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import type { Supplier } from "@/lib/types";

function notificationOrigin(): string {
  try {
    const configured = process.env.SUPPLIER_SIGNUP_REDIRECT_URL;
    if (configured) {
      const url = new URL(configured);
      if (url.protocol === "https:" && url.pathname === "/login" && !url.search && !url.hash && !url.username && !url.password) return url.origin;
    }
  } catch { /* An invalid override must not produce links to an untrusted host. */ }
  return SITE_URL;
}

/** One notification to every active sourcing manager and admin; requests remain in the CRM queue if mail fails. */
export async function notifySupplierRegistration(supplier: Supplier, requested: readonly number[]): Promise<"sent" | "simulated" | "failed"> {
  const users = await getStore().listUsers();
  const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "sourcing" || u.role === "admin"))
    .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return "failed";
  const choices = requested.map((n) => n === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng");
  const staffOrigin = notificationOrigin();
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

/** Pending certificate claim goes to staff inbox, never directly to buyers or publication. */
export async function notifySupplierCertificateSubmission(supplier: Supplier, name: string): Promise<"sent" | "simulated" | "failed"> {
  const users = await getStore().listUsers();
  const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "reviewer" || u.role === "sourcing"))
    .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return "failed";
  const staffOrigin = notificationOrigin();
  const url = `${staffOrigin}/crm/suppliers/${encodeURIComponent(supplier.id)}/certificates`;
  const title = `Chứng nhận chờ kiểm tra: ${supplier.name}`;
  const body = `<p>NCC ${escapeHtml(supplier.name)} vừa gửi “${escapeHtml(name)}” kèm bằng chứng nội bộ. <strong>Chưa được xác minh, chưa công bố.</strong></p>
    <p>Vexim cần đối chiếu đơn vị đứng tên, tổ chức cấp, phạm vi, ngày hết hạn, liên hệ với sản phẩm; sau đó chọn quyết định xét duyệt và công bố riêng.</p>
    <p><a href="${url}">Mở hồ sơ chứng nhận trong CRM →</a></p>`;
  const result = await transport({ to: recipients, subject: title,
    html: wrapPlainEmail({ title, body }), text: `${title}\nChứng nhận: ${name}\n${url}` });
  return result.ok ? result.status : "failed";
}

/** A submitted human inspection enters the independent review queue; never an automatic approval. */
export async function notifyStaffVerificationSubmission(supplierId: string, level: number): Promise<"sent" | "simulated" | "failed"> {
  try {
    const store = getStore();
    const users = await store.listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "reviewer"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const supplier = await store.getSupplier(supplierId);
    const label = level === 1 ? "Kiểm tra giấy tờ" : level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng";
    const step = level === 1 ? "documents" : level === 2 ? "factory" : "delivery";
    const url = `${notificationOrigin()}/crm/suppliers/${encodeURIComponent(supplierId)}/audit/${step}`;
    const title = `${label} chờ xét duyệt: ${supplier?.name ?? "NCC"}`;
    const body = `<p>Chuyên viên đã nộp bản kiểm ${escapeHtml(label)} của ${escapeHtml(supplier?.name ?? "NCC")}. Người khác phải tự xem bằng chứng của đúng đợt kiểm và quyết định; nộp không tự phê duyệt.</p><p><a href="${url}">Mở bản kiểm trong CRM →</a></p>`;
    const res = await transport({ to: recipients, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] verification submission", error); return "failed"; }
}

/** Staff gets a reminder only when a supplier explicitly submits a product, never on draft saves. */
export async function notifyStaffProductSubmission(supplier: Supplier, product: { id: string; name: string }): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "sourcing"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const url = `${notificationOrigin()}/crm/products/${encodeURIComponent(product.id)}/edit`;
    const title = `Sản phẩm chờ kiểm tra: ${product.name.replace(/[\r\n]/g, " ").slice(0, 140)}`;
    const body = `<p>${escapeHtml(supplier.name)} đã gửi sản phẩm ${escapeHtml(product.name)} để Vexim kiểm tra. <strong>Chưa được duyệt hay công khai.</strong></p><p><a href="${url}">Mở hàng chờ CRM →</a></p>`;
    const res = await transport({ to: recipients, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] product submission", error); return "failed"; }
}

export type SupplierDecision =
  | "onboarding_approved" | "onboarding_changes_requested"
  | "product_approved" | "product_changes_requested"
  | "certificate_approved" | "certificate_changes_requested" | "certificate_rejected" | "certificate_published" | "certificate_withdrawn"
  | "verification_approved" | "verification_returned";

/** A decision is emailed only to an active supplier account linked to this supplier ID.
 * The email never contains internal evidence, buyer identity or staff-only notes. */
export async function notifySupplierDecision(input: {
  supplierId: string; decision: SupplierDecision; name?: string; entityId?: string; note?: string;
}): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && u.role === "supplier" && u.supplier_id === input.supplierId)
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const name = (input.name || "Hồ sơ").replace(/[\r\n]/g, " ").slice(0, 140);
    const config: Record<SupplierDecision, { title: string; explanation: string; path: string; showNote?: boolean }> = {
      onboarding_approved: { title: "Đã mở quyền sử dụng cổng NCC", explanation: "Vexim đã xác nhận tài khoản. Các đánh giá xác minh, sản phẩm và việc công khai hồ sơ vẫn cần quyết định riêng.", path: "/supplier/portal" },
      onboarding_changes_requested: { title: "Vui lòng bổ sung hồ sơ doanh nghiệp", explanation: "Vexim đã xem hồ sơ và yêu cầu bạn bổ sung trước khi mở quyền cổng.", path: "/supplier/portal", showNote: true },
      product_approved: { title: `Đã kiểm tra nội dung sản phẩm: ${name}`, explanation: "Vexim đã xác nhận nội dung; sản phẩm chưa tự động sẵn sàng chia sẻ buyer hoặc công khai.", path: `/supplier/portal/products/${encodeURIComponent(input.entityId || "")}` },
      product_changes_requested: { title: `Sản phẩm cần chỉnh sửa: ${name}`, explanation: "Vexim yêu cầu chỉnh sửa rồi gửi lại sản phẩm.", path: `/supplier/portal/products/${encodeURIComponent(input.entityId || "")}`, showNote: true },
      certificate_approved: { title: `Đã kiểm bản sao chứng nhận: ${name}`, explanation: "Vexim đã xét duyệt bản sao. Chứng nhận chưa được công bố; việc hiển thị công khai là quyết định riêng.", path: "/supplier/portal/certificates" },
      certificate_changes_requested: { title: `Chứng nhận cần bổ sung: ${name}`, explanation: "Vexim yêu cầu bổ sung thông tin chứng nhận.", path: "/supplier/portal/certificates", showNote: true },
      certificate_rejected: { title: `Chứng nhận không được chấp thuận: ${name}`, explanation: "Vexim chưa thể chấp thuận chứng nhận này.", path: "/supplier/portal/certificates", showNote: true },
      certificate_published: { title: `Chứng nhận được phép hiển thị: ${name}`, explanation: "Vexim đã cho phép hiển thị nhãn trên sản phẩm thuộc phạm vi đã duyệt nếu sản phẩm công khai và chứng nhận còn hạn. Bằng chứng nội bộ không được công khai.", path: "/supplier/portal/certificates" },
      certificate_withdrawn: { title: `Đã thu hồi hiển thị chứng nhận: ${name}`, explanation: "Vexim đã ngừng hiển thị nhãn chứng nhận trên trang buyer.", path: "/supplier/portal/certificates" },
      verification_approved: { title: `Đã duyệt đánh giá: ${name}`, explanation: "Chỉ đánh giá này được Vexim duyệt; không tự động xác nhận các đánh giá khác hoặc công khai hồ sơ.", path: "/supplier/portal#profile" },
      verification_returned: { title: `Đánh giá cần bổ sung: ${name}`, explanation: "Vui lòng xem phản hồi và liên hệ nhân viên Vexim để bổ sung đúng đợt kiểm.", path: "/supplier/portal#profile", showNote: true },
    };
    const item = config[input.decision];
    const url = `${notificationOrigin()}${item.path}`;
    const note = item.showNote ? input.note?.trim().slice(0, 1000) : null;
    const body = `<p>${escapeHtml(item.explanation)}</p>${note ? `<p>Phản hồi Vexim: ${escapeHtml(note)}</p>` : ""}<p><a href="${url}">Mở cổng NCC →</a></p>`;
    const res = await transport({ to: recipients, subject: item.title, html: wrapPlainEmail({ title: escapeHtml(item.title), body }), text: `${item.title}\n${item.explanation}${note ? `\nPhản hồi Vexim: ${note}` : ""}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] decision", error); return "failed"; }
}
