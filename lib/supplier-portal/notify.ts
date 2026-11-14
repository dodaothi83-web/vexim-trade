import "server-only";

import { SERVICE_FROM_ADDRESS } from "@/lib/config";
import { getStore } from "@/lib/db";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import type { L2VerificationScope, Supplier } from "@/lib/types";
import { formatCertificateDate } from "@/lib/certificate-supplier-copy";

/** Origin for supplier-facing links; exported so other supplier notices reuse the same staging override. */
export function notificationOrigin(): string {
  try {
    const configured = process.env.SUPPLIER_SIGNUP_REDIRECT_URL;
    if (configured) {
      const url = new URL(configured);
      if (url.protocol === "https:" && url.pathname === "/login" && !url.search && !url.hash && !url.username && !url.password) return url.origin;
    }
  } catch { /* An invalid override must not produce links to an untrusted host. */ }
  return SITE_URL;
}

/** One notification to every active review lead and admin; requests remain in the CRM queue if mail fails. */
export async function notifySupplierRegistration(supplier: Supplier, requested: readonly number[]): Promise<"sent" | "simulated" | "failed"> {
  const users = await getStore().listUsers();
  const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "reviewer" || u.role === "admin"))
    .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return "failed";
  const choices = requested.map((n) => n === 2 ? supplier.supplier_type === "trading" ? "Đối chiếu nhà máy đối tác" : "Xác thực nhà máy" : "Lịch sử giao hàng");
  const staffOrigin = notificationOrigin();
  const url = `${staffOrigin}/crm/suppliers/${encodeURIComponent(supplier.id)}`;
  const title = `Nhà cung cấp tự đăng ký: ${supplier.name}`;
  const body = `<p>Nhà cung cấp vừa nộp hồ sơ tự khai (giấy tờ bước đầu nếu đã tải). <strong>Tài khoản chưa được Vexim xác nhận sử dụng cổng; chưa có đánh giá nào được tự động duyệt.</strong></p>
    <p>Doanh nghiệp: ${escapeHtml(supplier.name)}<br/>Liên hệ: ${escapeHtml(supplier.contact_name ?? "-")}, ${escapeHtml(supplier.email ?? "-")}, ${escapeHtml(supplier.phone ?? "-")}</p>
    <p>Yêu cầu Vexim liên hệ để xác minh thêm: <strong>${escapeHtml(choices.join(", ") || "Không chọn")}</strong>.
    Nếu có yêu cầu, nhân sự kiểm duyệt vui lòng liên hệ sớm để lên kế hoạch và tự tải bằng chứng vào đúng đợt kiểm.</p>
    <p>Chuyên viên kiểm tra hồ sơ gốc/ảnh, sửa checklist thủ công, nộp và người có quyền duyệt mới xác nhận. AI chỉ gợi ý.</p>
    <p><a href="${url}">Mở hồ sơ nhà cung cấp trong CRM</a></p>`;
  const result = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title,
    html: wrapPlainEmail({ title, body }), text: `${title}\nYêu cầu: ${choices.join(", ") || "Không chọn"}\n${url}` });
  return result.ok ? result.status : "failed";
}

/**
 * A new supplier login exists but has no business profile yet. Staff should hear about it
 * immediately so a stalled registration can be followed up; nothing is approved here.
 */
export async function notifyStaffSupplierAccount(input: { email: string; name?: string | null; provider: "email" | "google" }): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "reviewer" || u.role === "admin"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const email = input.email.trim().toLowerCase();
    const who = (input.name ?? "").trim() || email;
    const staffOrigin = notificationOrigin();
    const url = `${staffOrigin}/crm/suppliers`;
    const title = `Tài khoản nhà cung cấp mới: ${email}`;
    const body = `<p>${escapeHtml(who)} vừa tạo tài khoản nhà cung cấp bằng ${input.provider === "google" ? "Google" : "email và mật khẩu"}. <strong>Tài khoản chưa có hồ sơ doanh nghiệp và chưa được mở quyền cổng.</strong></p>
    <p>Ở bước này chưa có gì để duyệt.</p>
    <p>Khi họ nộp hồ sơ doanh nghiệp, Vexim nhận thêm thông báo kèm link tới hồ sơ.</p>
    <p>Nếu mãi không thấy hồ sơ, danh sách này là chỗ để liên hệ lại.</p>
    <p><a href="${url}">Mở danh sách nhà cung cấp trong CRM</a></p>`;
    const result = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title,
      html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n${url}` });
    return result.ok ? result.status : "failed";
  } catch (error) { console.error("[supplier-notify] account registered", error); return "failed"; }
}

/** Pending certificate claim goes to staff inbox, never directly to buyers or publication. */
export async function notifySupplierCertificateSubmission(supplier: Supplier, name: string): Promise<"sent" | "simulated" | "failed"> {
  const users = await getStore().listUsers();
  const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "reviewer"))
    .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return "failed";
  const staffOrigin = notificationOrigin();
  const url = `${staffOrigin}/crm/suppliers/${encodeURIComponent(supplier.id)}/audit/documents`;
  const title = `Chứng nhận mới chờ đối chiếu: ${supplier.name}`;
  // Thư cho nhân viên: nói "hệ thống", không nói "AI"; mỗi ý một lần.
  const intro = `${supplier.name} vừa tải chứng nhận "${name}". Hệ thống chưa tự công bố được nên giấy đang chờ đối chiếu.`;
  const next = "Mở tệp gốc để kiểm tra hoặc cho hệ thống quét lại. Chứng nhận này không thay thế Giấy chứng nhận đăng ký kinh doanh.";
  const body = `<p>${escapeHtml(intro)}</p>
    <p>${escapeHtml(next)}</p>
    <p><a href="${url}">Mở chứng nhận trong CRM</a></p>`;
  const result = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title,
    html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n\n${intro}\n${next}\n${url}` });
  return result.ok ? result.status : "failed";
}

/** Cron reminder at 60 / 30 / 7 / 1 days before a certificate on file expires, and once just after (threshold 0). */
export async function notifySupplierCertificateExpiry(input: {
  supplierId: string;
  certificateName: string;
  validUntil: string;
  daysLeft: number;
  threshold: 60 | 30 | 7 | 1 | 0;
}): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && u.role === "supplier" && u.supplier_id === input.supplierId)
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const name = (input.certificateName || "Chứng nhận").replace(/[\r\n]/g, " ").slice(0, 140);
    const url = `${notificationOrigin()}/supplier/portal/documents`;
    const date = formatCertificateDate(input.validUntil, "vi");
    const expired = input.threshold === 0;
    const title = expired ? `Chứng nhận đã hết hạn: ${name}` : `Chứng nhận sắp hết hạn (còn ${input.daysLeft} ngày): ${name}`;
    const explanation = expired
      ? `Chứng nhận "${name}" đã hết hạn ngày ${date} và tạm không hiện với người mua. Tải bản đã gia hạn để hiện lại.`
      : `Chứng nhận "${name}" sẽ hết hạn ngày ${date}. Sau ngày này, chứng nhận tạm không hiện với người mua cho tới khi bạn tải bản gia hạn.`;
    const body = `<p>${escapeHtml(explanation)}</p><p><a href="${url}">Tải bản gia hạn ở mục Giấy tờ và chứng nhận</a></p>`;
    const res = await transport({
      to: recipients,
      from: SERVICE_FROM_ADDRESS,
      subject: title,
      html: wrapPlainEmail({ title: escapeHtml(title), body }),
      text: `${title}\n${explanation}\n${url}`,
    });
    return res.ok ? res.status : "failed";
  } catch (error) {
    console.error("[supplier-notify] certificate expiry", error);
    return "failed";
  }
}

/** A submitted human inspection enters the independent review queue; never an automatic approval. */
export async function notifyStaffVerificationSubmission(supplierId: string, level: number, scope?: L2VerificationScope | null, reviewId?: string | null): Promise<"sent" | "simulated" | "failed"> {
  try {
    const store = getStore();
    const users = await store.listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "reviewer"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const supplier = await store.getSupplier(supplierId);
    const label = level === 1 ? "Kiểm tra giấy tờ" : level === 2 ? scope === "partner_contract" ? "Nhà máy đối tác" : "Xác thực nhà máy" : "Lịch sử giao hàng";
    const step = level === 1 ? "documents" : level === 2 ? "factory" : "deliveries";
    const url = `${notificationOrigin()}/crm/suppliers/${encodeURIComponent(supplierId)}/audit/${step}${reviewId ? `?review=${encodeURIComponent(reviewId)}` : ""}`;
    const title = `${label} chờ xét duyệt: ${supplier?.name ?? "nhà cung cấp"}`;
    const body = `<p>Chuyên viên đã nộp bản kiểm ${escapeHtml(label)} của ${escapeHtml(supplier?.name ?? "nhà cung cấp")}. Nhân sự có quyền duyệt cần tự xem bằng chứng của đúng đợt kiểm và quyết định; nộp không tự phê duyệt.</p><p><a href="${url}">Mở bản kiểm trong CRM</a></p>`;
    const res = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] verification submission", error); return "failed"; }
}

/** An L2/L3 self-submission just entered the staff review queue, not an approval. */
export async function notifyStaffSupplierSubmission(supplierId: string, level: 2 | 3, scope?: L2VerificationScope | null): Promise<"sent" | "simulated" | "failed"> {
  try {
    const store = getStore();
    const users = await store.listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "reviewer"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const supplier = await store.getSupplier(supplierId);
    const label = level === 2 ? scope === "partner_contract" ? "lịch hẹn xác minh nhà máy đối tác (kèm hợp đồng)" : "lịch hẹn xác minh nhà máy" : "hồ sơ lịch sử giao hàng";
    const url = `${notificationOrigin()}/crm/verifications/submissions`;
    const title = level === 2
      ? `Lịch hẹn xác minh nhà máy chờ chốt giờ: ${supplier?.name ?? "nhà cung cấp"}`
      : `Hồ sơ nhà cung cấp tự gửi chờ đối chiếu: ${supplier?.name ?? "nhà cung cấp"}`;
    const body = `<p>${escapeHtml(supplier?.name ?? "nhà cung cấp")} vừa nộp ${escapeHtml(label)}. <strong>Chưa duyệt và chưa công khai.</strong></p>
    <p>${level === 2 ? "Liên hệ nhà cung cấp để chốt một khung giờ, rồi mở lịch hẹn để tạo đợt kiểm qua cuộc gọi." : "Mở hồ sơ và tự kiểm tra chứng từ, căn cứ xuất khẩu và vai trò của doanh nghiệp."}</p>
    <p><a href="${url}">Mở hàng chờ hồ sơ tự gửi</a></p>`;
    const res = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] supplier submission", error); return "failed"; }
}

/**
 * Nhà cung cấp vừa bổ sung/thay giấy tờ L1 trong lúc đợt kiểm còn mở. Đây KHÔNG phải nộp duyệt:
 * nhân viên cần biết có tệp mới để đối chiếu, nhưng không có gì tự chuyển trạng thái.
 * Chiều còn lại (nhân viên duyệt/trả về) đã có email + chuông trong cổng nhà cung cấp.
 */
export async function notifyStaffDocumentUpload(input: {
  supplierId: string; supplierName?: string | null; label: string;
}): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "reviewer"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const url = `${notificationOrigin()}/crm/suppliers/${encodeURIComponent(input.supplierId)}/audit/documents`;
    const who = (input.supplierName ?? "").trim() || "nhà cung cấp";
    const title = `Nhà cung cấp bổ sung giấy tờ L1: ${who}`;
    const body = `<p>${escapeHtml(who)} vừa tải/thay <strong>${escapeHtml(input.label)}</strong> trong đợt kiểm giấy tờ.</p>
    <p><strong>Chưa có gì được duyệt.</strong> Đợt kiểm giữ nguyên trạng thái cho tới khi nhân viên đối chiếu bằng chứng và tự quyết định.</p>
    <p><a href="${url}">Mở đợt kiểm giấy tờ trong CRM</a></p>`;
    const res = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] document upload", error); return "failed"; }
}

/** Staff gets a reminder only when a supplier explicitly submits a product, never on draft saves. */
export async function notifyStaffProductSubmission(supplier: Supplier, product: { id: string; name: string }): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "reviewer"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const url = `${notificationOrigin()}/crm/products/${encodeURIComponent(product.id)}/edit`;
    const title = `Sản phẩm chờ duyệt: ${product.name.replace(/[\r\n]/g, " ").slice(0, 140)}`;
    const body = `<p>${escapeHtml(supplier.name)} đã gửi duyệt sản phẩm ${escapeHtml(product.name)}. <strong>Sản phẩm chưa được đăng.</strong></p><p><a href="${url}">Mở sản phẩm trong CRM</a></p>`;
    const res = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] product submission", error); return "failed"; }
}

/**
 * Nhà cung cấp gửi bảng giá mới: báo Quản trị và Trưởng kiểm duyệt như khi gửi sản phẩm mới.
 * Giá cũ vẫn hiển thị cho tới khi Vexim duyệt, nên thư chỉ dẫn tới trang rà soát giá.
 */
export async function notifyStaffPriceRevision(supplier: Supplier, product: { id: string; name: string }): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "admin" || u.role === "reviewer"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const url = `${notificationOrigin()}/crm/products/quantity-review?product_id=${encodeURIComponent(product.id)}`;
    const name = product.name.replace(/[\r\n]/g, " ").slice(0, 140);
    const title = `Giá mới chờ rà soát: ${name}`;
    const body = `<p>${escapeHtml(supplier.name)} vừa cập nhật bảng giá cho sản phẩm ${escapeHtml(name)}. <strong>Giá cũ vẫn hiển thị cho tới khi Vexim duyệt.</strong></p><p><a href="${url}">Rà soát giá trong CRM</a></p>`;
    const res = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body }), text: `${title}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] price revision", error); return "failed"; }
}

export type SupplierDecision =
  | "onboarding_approved" | "onboarding_changes_requested"
  | "product_approved" | "product_changes_requested"
  | "certificate_approved" | "certificate_changes_requested" | "certificate_rejected" | "certificate_published" | "certificate_withdrawn"
  | "verification_approved" | "verification_returned";

/** A decision is emailed only to an active supplier account linked to this supplier ID.
 * The email never contains internal evidence, buyer identity or staff-only notes. */
/**
 * Thư trả lời cho NCC khi Vexim mở hoặc từ chối ngành họ đề nghị.
 *
 * Đây là lời hứa "3 ngày làm việc, báo qua email" trong form: không có thư này thì NCC chỉ
 * biết kết quả nếu tự vào cổng xem, và lời hứa thành sai. Thư đi qua `transport()` như mọi
 * thư khác, gửi tới đúng tài khoản đang gắn hồ sơ, không gửi cho người khác.
 */
export async function notifyCategoryRequestDecision(input: {
  supplierId: string;
  label: string;
  status: "opened" | "rejected";
  note?: string | null;
  categoryLabel?: string | null;
}): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && u.role === "supplier" && u.supplier_id === input.supplierId)
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const label = (input.label || "Ngành").replace(/[\r\n]/g, " ").slice(0, 140);
    const opened = input.status === "opened";
    const title = opened ? `Đã mở ngành: ${label}` : `Chưa mở được ngành: ${label}`;
    const where = input.categoryLabel ? ` Danh mục tương ứng: ${escapeHtml(input.categoryLabel)}.` : "";
    const explanation = opened
      ? `Ngành này đã được mở.${where} Bạn chọn danh mục đó trong mục Danh mục kinh doanh để đăng sản phẩm; sản phẩm vẫn được duyệt trước khi hiển thị.`
      // Thư trả lời: nhiều vế cần đọc liền mạch nên để nguyên một câu dài (copy-allow bên dưới).
        : `Ngành này chưa được mở.${input.note ? ` Lý do: ${escapeHtml(input.note.trim().slice(0, 1000))}` : ""} Hồ sơ doanh nghiệp của bạn vẫn được xét bình thường; nếu ngành của bạn còn thiếu, bạn có thể bổ sung cách gọi khác trong mục Danh mục kinh doanh.`; // copy-allow: câu của thư trả lời cho nhà cung cấp
    const url = `${notificationOrigin()}/supplier/portal/categories`;
    const body = `<p>${explanation}</p><p><a href="${url}">Mở mục danh mục kinh doanh</a></p>`;
    const res = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title,
      html: wrapPlainEmail({ title: escapeHtml(title), body }),
      text: `${title}\n${explanation}\n${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] category request decision", error); return "failed"; }
}

/** Thư cho nhân viên khi NCC khai một ngành chưa mở: đây là việc có hạn 3 ngày làm việc. */
export async function notifyStaffCategoryRequest(input: {
  supplierId: string; supplierName: string; labels: readonly string[]; note?: string | null;
}): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && (u.role === "reviewer" || u.role === "admin"))
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length || !input.labels.length) return "failed";
    const staffOrigin = notificationOrigin();
    const title = `Ngành cần mở: ${input.labels.join(", ")}`;
    // copy-allow: câu của thư nội bộ, nêu cam kết 3 ngày làm việc
    const body = `<p>Nhà cung cấp ${escapeHtml(input.supplierName)} vừa khai ngành chưa có trong danh mục: <strong>${escapeHtml(input.labels.join(", "))}</strong>.</p>
    <p>Cam kết với nhà cung cấp: xem xét trong 3 ngày làm việc và trả lời qua email.
    Hồ sơ doanh nghiệp vẫn được duyệt bình thường; họ chỉ đăng được sản phẩm sau khi ngành được mở.</p>
    <p><a href="${staffOrigin}/crm/suppliers#industries">Mở danh sách ngành được yêu cầu</a></p>`;
    const res = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: title,
      html: wrapPlainEmail({ title: escapeHtml(title), body }),
      text: `${title}\nNhà cung cấp: ${input.supplierName}\n${staffOrigin}/crm/suppliers` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] category request", error); return "failed"; }
}

export async function notifySupplierDecision(input: {
  supplierId: string; decision: SupplierDecision; name?: string; entityId?: string; note?: string;
}): Promise<"sent" | "simulated" | "failed"> {
  try {
    const users = await getStore().listUsers();
    const recipients = [...new Set(users.filter((u) => u.is_active && u.role === "supplier" && u.supplier_id === input.supplierId)
      .map((u) => u.email.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) return "failed";
    const name = (input.name || "Hồ sơ").replace(/[\r\n]/g, " ").slice(0, 140);
    const config: Record<SupplierDecision, { title: string; explanation: string; path: string; showNote?: boolean; noteLabel?: string; cta?: string }> = {
      onboarding_approved: { title: "Đã mở quyền sử dụng cổng nhà cung cấp", explanation: "Tài khoản đã được chấp thuận. Các đánh giá xác minh, sản phẩm và việc công khai hồ sơ vẫn cần quyết định riêng.", path: "/supplier/portal" },
      onboarding_changes_requested: { title: "Vui lòng bổ sung hồ sơ doanh nghiệp", explanation: "Hồ sơ đã được xem và cần bổ sung trước khi mở quyền cổng.", path: "/supplier/portal", showNote: true },
      product_approved: { title: `Sản phẩm đã đăng: ${name}`, explanation: "Sản phẩm đã được đăng và hiển thị cho người mua. Bạn có thể quản lý thông tin và hình ảnh trên cổng nhà cung cấp.", path: `/supplier/portal/products/${encodeURIComponent(input.entityId || "")}` },
      product_changes_requested: { title: `Sản phẩm cần chỉnh sửa: ${name}`, explanation: "Hãy chỉnh sửa rồi gửi duyệt lại.", path: `/supplier/portal/products/${encodeURIComponent(input.entityId || "")}`, showNote: true },
      certificate_approved: { title: `Đã kiểm bản sao chứng nhận: ${name}`, explanation: "Bản sao đã được duyệt. Chứng nhận chưa được công bố; việc hiển thị công khai là quyết định riêng.", path: "/supplier/portal/documents" },
      certificate_changes_requested: { title: `Chứng nhận cần bổ sung: ${name}`, explanation: "Cần bổ sung thông tin chứng nhận trong mục Xác thực doanh nghiệp.", path: "/supplier/portal/documents", showNote: true },
      certificate_rejected: { title: `Chứng nhận chưa được duyệt: ${name}`, explanation: `Chứng nhận "${name}" chưa được duyệt.`, path: `/supplier/portal/documents?replace=${encodeURIComponent(input.entityId ?? "")}#chung-nhan`, showNote: true, noteLabel: "Lý do", cta: "Tải lại chứng nhận" },
      certificate_published: { title: `Chứng nhận được phép hiển thị: ${name}`, explanation: "Chứng nhận đã được quét và cho phép hiển thị nhãn nếu sản phẩm công khai và chứng nhận còn hạn." + " Nhãn ghi rõ trạng thái chính chủ/đối tác và ngày hết hạn; bằng chứng nội bộ không công khai.", path: "/supplier/portal/documents" },
      certificate_withdrawn: { title: `Đã thu hồi hiển thị chứng nhận: ${name}`, explanation: "Nhãn chứng nhận đã được ngừng hiển thị trên trang người mua.", path: "/supplier/portal/documents" },
      verification_approved: { title: `Đã duyệt đánh giá: ${name}`, explanation: "Chỉ đánh giá này được duyệt; không tự động xác nhận các đánh giá khác hoặc công khai hồ sơ.", path: "/supplier/portal/profile" },
      verification_returned: { title: `Đánh giá cần bổ sung: ${name}`, explanation: "Vui lòng xem phản hồi và liên hệ bộ phận hỗ trợ để bổ sung đúng đợt kiểm.", path: "/supplier/portal/profile", showNote: true },
    };
    const item = config[input.decision];
    const url = `${notificationOrigin()}${item.path}`;
    const note = item.showNote ? input.note?.trim().slice(0, 1000) : null;
    const noteLabel = item.noteLabel ?? "Phản hồi";
    const body = `<p>${escapeHtml(item.explanation)}</p>${note ? `<p>${noteLabel}: ${escapeHtml(note)}</p>` : ""}<p><a href="${url}">${item.cta ?? "Mở cổng nhà cung cấp"}</a></p>`;
    const res = await transport({ to: recipients, from: SERVICE_FROM_ADDRESS, subject: item.title, html: wrapPlainEmail({ title: escapeHtml(item.title), body }), text: `${item.title}\n${item.explanation}${note ? `\n${noteLabel}: ${note}` : ""}\n${item.cta ? `${item.cta}: ` : ""}${url}` });
    return res.ok ? res.status : "failed";
  } catch (error) { console.error("[supplier-notify] decision", error); return "failed"; }
}
