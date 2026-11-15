"use server";

import { revalidatePath } from "next/cache";

import { buildServiceInquiryInternalEmail, serviceInquiryReference } from "@/lib/email/service-inquiry";
import { transport } from "@/lib/email/send";
import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { hasOpenServiceRequest, isSupplierServiceKey, SUPPLIER_SERVICE_NOTE_MAX } from "@/lib/supplier-services";

export type ServiceRequestResult = { ok: boolean; message: string } | null;

/**
 * Nhà cung cấp gửi yêu cầu tư vấn một dịch vụ Vexim.
 *
 * Danh tính lấy từ phiên đăng nhập, không từ form: form chỉ gửi mã dịch vụ và ghi chú.
 * Email báo đội Vexim lỗi thì yêu cầu vẫn được lưu, vì CRM đã thấy yêu cầu.
 */
export async function submitServiceRequestAction(_previous: ServiceRequestResult, form: FormData): Promise<ServiceRequestResult> {
  const { m, locale } = await getPortalMessages();
  const copy = m.services.result;
  const access = await supplierPortalAccess();
  if (!access) return { ok: false, message: copy.signIn };
  const { store, user, supplier } = access;
  if (!portalApproved(supplier)) return { ok: false, message: copy.notApproved };

  const serviceKey = form.get("service_key");
  if (!isSupplierServiceKey(serviceKey)) return { ok: false, message: copy.invalid };
  const note = String(form.get("note") ?? "").trim();
  if (note.length > SUPPLIER_SERVICE_NOTE_MAX) return { ok: false, message: copy.tooLong };

  try {
    const existing = await store.listSupplierServiceRequests({ supplierId: supplier.id, limit: 50 });
    if (hasOpenServiceRequest(existing, serviceKey)) return { ok: false, message: copy.duplicate };

    const submittedAt = new Date();
    const reference = serviceInquiryReference(submittedAt);
    let saved;
    try {
      saved = await store.addSupplierServiceRequest({
        supplier_id: supplier.id,
        service_key: serviceKey,
        note: note || null,
        reference,
        requested_by: user.id,
        requested_email: user.email,
      });
    } catch (error) {
      // Hai lần bấm gần nhau: chỉ mục unique trong CSDL chặn bản thứ hai.
      if (/unique|duplicate/i.test(error instanceof Error ? error.message : "")) return { ok: false, message: copy.duplicate };
      throw error;
    }

    await store.addAuditLog({
      actor_id: user.id, actor_email: user.email, entity: "supplier", entity_id: supplier.id,
      action: "supplier.service_request", before: null,
      after: { request_id: saved.id, reference, service_key: serviceKey, note: note || null },
    }).catch((error) => console.error("[service-request] audit", error));

    try {
      const users = await store.listUsers();
      const recipients = [...new Set(users
        .filter((u) => u.is_active && ["admin", "sale", "sourcing"].includes(u.role))
        .map((u) => u.email.trim().toLowerCase())
        .filter(Boolean))];
      if (recipients.length) {
        const mail = buildServiceInquiryInternalEmail({
          lang: locale === "vi" ? "vi" : "en",
          serviceKey,
          companyName: supplier.name,
          contactName: supplier.contact_name || user.name || user.email,
          phone: supplier.phone || "",
          email: user.email,
          note,
          reference,
          submittedAt,
        });
        const result = await transport({ to: recipients, subject: mail.subject, html: mail.html, text: mail.text, replyTo: user.email });
        if (!result.ok) console.error("[service-request] staff email not sent", result.error);
      }
    } catch (error) {
      console.error("[service-request] staff email failed", error);
    }

    revalidatePath("/supplier/portal/services");
    return { ok: true, message: fill(copy.sent, { reference }) };
  } catch (error) {
    console.error("[service-request] failed", error);
    return { ok: false, message: copy.failed };
  }
}
