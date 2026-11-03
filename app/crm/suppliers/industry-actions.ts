"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { notifyCategoryRequestDecision } from "@/lib/supplier-portal/notify";

type Result = { ok: boolean; message: string };

/**
 * Nhân viên chốt một yêu cầu mở ngành: mở (kèm danh mục thật) hoặc từ chối (kèm lý do).
 *
 * Ranh giới quyền giữ nguyên như mọi quyết định khác của NCC:
 *  - "opened" chỉ đánh dấu YÊU CẦU đã được trả lời và ghi nhớ danh mục tương ứng. Nó KHÔNG
 *    tự thêm danh mục vào phạm vi NCC, không tạo `supplier_categories`, không mở sản phẩm.
 *    Nhân viên vẫn mở danh mục trong CMS rồi NCC tự chọn phạm vi của mình;
 *  - "rejected" bắt buộc có lý do, vì lý do đó được gửi thẳng cho NCC trong email.
 */
export async function decideCategoryRequestAction(form: FormData): Promise<Result> {
  const denied = await guard("categories.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "reviewer")) {
    return { ok: false, message: "Chỉ quản trị và trưởng kiểm duyệt được trả lời yêu cầu mở ngành." };
  }
  const id = String(form.get("request_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const categorySlug = String(form.get("category_slug") ?? "").trim();
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["opened", "rejected"].includes(decision)) {
    return { ok: false, message: "Yêu cầu không hợp lệ." };
  }
  if (decision === "rejected" && !note) return { ok: false, message: "Ghi rõ lý do để nhà cung cấp hiểu và bổ sung." };

  const store = getStore();
  try {
    const pending = await store.listPendingSupplierCategoryRequests();
    const request = pending.find((row) => row.id === id);
    if (!request) return { ok: false, message: "Yêu cầu đã được xử lý ở phiên khác. Tải lại trang." };

    // Danh mục phải là danh mục đang xuất bản: mở một ngành vào danh mục nháp là hứa suông.
    let categoryLabel: string | null = null;
    if (decision === "opened" && categorySlug) {
      const options = categoryProposalOptions(await store.listCategories({ publishedOnly: true }));
      const match = options.find((option) => option.slug === categorySlug);
      if (!match) return { ok: false, message: "Danh mục chưa xuất bản. Xuất bản trong CMS trước, rồi trả lời lại." };
      categoryLabel = match.label;
    }

    const decided = await store.decideSupplierCategoryRequest({
      id, status: decision as "opened" | "rejected",
      categorySlug: decision === "opened" ? categorySlug || null : null,
      note: decision === "rejected" ? note : null,
      decidedBy: session.uid,
    });
    if (!decided) return { ok: false, message: "Yêu cầu đã được xử lý ở phiên khác. Tải lại trang." };

    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: decided.supplier_id,
      action: decision === "opened" ? "supplier.category_request_opened" : "supplier.category_request_rejected",
      before: { status: "pending", label: decided.label },
      after: { status: decision, category_slug: decided.category_slug, note: decided.note } })
      .catch((error) => console.error("[category-request] audit log failed", error));

    const mail = await notifyCategoryRequestDecision({ supplierId: decided.supplier_id, label: decided.label,
      status: decision as "opened" | "rejected", note: decided.note, categoryLabel })
      .catch((error) => { console.error("[category-request] supplier email failed", error); return "failed" as const; });

    revalidatePath("/crm/suppliers");
    revalidatePath("/crm/categories");
    revalidatePath("/supplier/portal");
    return { ok: true, message: (decision === "opened" ? "Đã trả lời: ngành đã mở." : "Đã trả lời: chưa mở ngành này.")
      + (mail === "sent" ? " Email đã gửi cho nhà cung cấp." : " Email chưa gửi được; câu trả lời vẫn hiện trên cổng nhà cung cấp.") };
  } catch (error) {
    console.error("[category-request] decision failed", error);
    return { ok: false, message: "Không lưu được quyết định. Vui lòng thử lại." };
  }
}
