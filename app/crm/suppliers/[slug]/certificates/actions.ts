"use server";

import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { guard, getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { isExpired } from "@/lib/media/readiness";
import { getObject } from "@/lib/media/storage";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const result = (message: string, ok = false) => ({ ok, message });
function refresh(id: string) {
  revalidatePath(`/crm/suppliers/${id}/certificates`);
  revalidatePath(`/supplier/portal/certificates`);
  revalidatePath(`/crm/suppliers/${id}`);
  revalidatePath(`/suppliers`);
  revalidatePath(`/products`);
}

/** Approving a copy does not publish it. Only staff with explicit verification approval rights may act. */
export async function reviewCertificateAction(form: FormData) {
  const denied = await guard("verifications.approve");
  if (denied) return result(denied.message);
  const session = await getSession();
  if (!session || !hasPermission(session.role, "verifications.approve")) return result("Chỉ người có quyền duyệt được xét chứng nhận.");
  const id = String(form.get("certificate_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  const chosen = [...new Set(form.getAll("product_ids").map(String))];
  if (!uuid.test(id) || !["approved", "changes_requested", "rejected"].includes(decision) ||
      chosen.length > 30 || chosen.some((p) => !uuid.test(p))) return result("Yêu cầu không hợp lệ.");
  if (decision !== "approved" && !note) return result("Ghi lý do để NCC biết cần bổ sung hoặc vì sao không chấp thuận.");
  if (decision === "approved" && form.get("confirmed_review") !== "yes") return result("Vui lòng tự đối chiếu tệp và xác nhận đã kiểm bản sao trước khi chấp thuận.");
  try {
    const store = getStore();
    const cert = await store.getCertificate(id);
    if (!cert || !["pending", "unreviewed"].includes(cert.review_status ?? "unreviewed")) return result("Chứng nhận không còn chờ xét duyệt.");
    let approvedProducts: string[] = [];
    if (decision === "approved") {
      if (!chosen.length) return result("Chọn ít nhất một sản phẩm thực sự thuộc phạm vi chứng nhận; nếu chưa xác định được, yêu cầu bổ sung.");
      const asset = cert.file_media_id ? await store.getMedia(cert.file_media_id) : null;
      if (!asset || asset.owner_type !== "supplier" || asset.supplier_id !== cert.supplier_id ||
          asset.kind !== "certificate" || asset.audience !== "internal" || !asset.storage_path || isExpired(asset))
        return result("Thiếu tệp chứng nhận nội bộ hợp lệ của đúng NCC.");
      const proof = await getObject(asset.storage_path);
      if (!proof?.data.length) return result("Tệp chứng nhận không còn trong kho; cần NCC nộp lại.");
      if (!cert.holder_name?.trim() || !cert.scope_text?.trim() || !cert.issuer?.trim() ||
          !cert.valid_until || cert.valid_until < new Date().toISOString().slice(0, 10))
        return result("Thiếu đơn vị đứng tên, tổ chức cấp, phạm vi hoặc chứng nhận đã hết hạn.");
      const products = await store.listProductsBySupplier(cert.supplier_id);
      if (chosen.some((p) => !products.some((row) => row.id === p))) return result("Sản phẩm không thuộc đúng NCC.");
      approvedProducts = chosen;
      await store.updateMedia(asset.id, { status: "checked" }); // Copy reviewed, NOT issuer-verified or published.
    }
    await store.updateCertificate(id, {
      review_status: decision as "approved" | "changes_requested" | "rejected", review_note: note || null,
      approved_product_ids: approvedProducts, publicly_visible: false,
      checked_at: decision === "approved" ? new Date().toISOString() : null,
      checked_by: decision === "approved" ? session.uid : null,
      check_status: "on_file", // Never claim to have seen the original or contacted the issuer.
    });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: cert.supplier_id, action: `certificate.${decision}`,
      before: { id, review: cert.review_status, visible: cert.publicly_visible },
      after: { id, review: decision, products: approvedProducts, visible: false, note: note || null } })
      .catch((error) => console.error("[certificate] audit", error));
    const mail = await notifySupplierDecision({ supplierId: cert.supplier_id, entityId: id, name: cert.name,
      decision: decision === "approved" ? "certificate_approved" : decision === "rejected" ? "certificate_rejected" : "certificate_changes_requested", note });
    if (mail !== "sent") console.warn("[certificate] supplier review email not sent; decision saved", mail);
    refresh(cert.supplier_id);
    return result((decision === "approved" ? "Đã kiểm bản sao. Chưa công bố; Vexim cần quyết định hiển thị riêng." : "Đã ghi quyết định; chứng nhận không công khai.") + (mail === "sent" ? "" : " Email NCC chưa gửi được; quyết định đã lưu trên cổng."), true);
  } catch (error) { console.error("[certificate] review", error); return result("Không lưu được quyết định. Kiểm tra migration/tệp và thử lại."); }
}

/** A second, explicit publication action. Rechecks evidence and date at write time; public reads do so again. */
export async function publishCertificateAction(form: FormData) {
  const denied = await guard("suppliers.publish");
  if (denied) return result(denied.message);
  const session = await getSession();
  if (!session || !hasPermission(session.role, "suppliers.publish")) return result("Chỉ người có quyền công khai được quyết định hiển thị.");
  const id = String(form.get("certificate_id") ?? "");
  const visible = String(form.get("visible") ?? "") === "yes";
  if (!uuid.test(id)) return result("Mã chứng nhận không hợp lệ.");
  try {
    const store = getStore();
    const cert = await store.getCertificate(id);
    if (!cert) return result("Không tìm thấy chứng nhận.");
    if (Boolean(cert.publicly_visible) === visible) return result("Trạng thái hiển thị không thay đổi.", true);
    if (visible) {
      if (cert.review_status !== "approved" || !cert.checked_by || !cert.checked_at ||
          !cert.valid_until || cert.valid_until < new Date().toISOString().slice(0, 10) ||
          !cert.approved_product_ids?.length) return result("Cần Vexim kiểm duyệt chứng nhận còn hạn và chọn ít nhất một sản phẩm trước khi công bố.");
      const asset = cert.file_media_id ? await store.getMedia(cert.file_media_id) : null;
      if (!asset || asset.owner_type !== "supplier" || asset.supplier_id !== cert.supplier_id ||
          asset.kind !== "certificate" || asset.audience !== "internal" || asset.status !== "checked" ||
          !asset.storage_path || isExpired(asset)) return result("Bản sao đã kiểm không còn hợp lệ hoặc đã bị thu hồi.");
      const products = await store.listProductsBySupplier(cert.supplier_id);
      if (cert.approved_product_ids.some((p) => !products.some((row) => row.id === p))) return result("Danh sách sản phẩm đã duyệt không còn hợp lệ.");
    }
    await store.updateCertificate(id, { publicly_visible: visible });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: cert.supplier_id, action: visible ? "certificate.published" : "certificate.withdrawn",
      before: { id, visible: cert.publicly_visible }, after: { id, visible } })
      .catch((error) => console.error("[certificate] audit", error));
    const mail = await notifySupplierDecision({ supplierId: cert.supplier_id, entityId: id, name: cert.name,
      decision: visible ? "certificate_published" : "certificate_withdrawn" });
    if (mail !== "sent") console.warn("[certificate] supplier publication email not sent; decision saved", mail);
    refresh(cert.supplier_id);
    return result((visible ? "Đã cho phép hiển thị nhãn chứng nhận trên sản phẩm đã duyệt (nếu sản phẩm công khai và tệp còn hạn)." : "Đã thu hồi nhãn khỏi trang buyer.") + (mail === "sent" ? "" : " Email NCC chưa gửi được; quyết định đã lưu trên cổng."), true);
  } catch (error) { console.error("[certificate] publication", error); return result("Không lưu được trạng thái công bố."); }
}
