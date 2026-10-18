"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

/**
 * Kéo–thả sắp xếp danh mục ở màn hình danh sách.
 * Chỉ ghi `sort_order` cho các danh mục được gửi lên (thường là một nhóm anh em
 * cùng danh mục cha); giữ nguyên mọi nội dung và trạng thái công khai.
 * Client gửi kèm các giá trị sort_order cũ đã hoán vị cho nhau nên thứ tự toàn
 * cục trên website không bị xáo trộn ngoài nhóm được kéo.
 */
export async function reorderCategoriesAction(updates: Array<{ id: string; sort_order: number }>) {
  const denied = await guard("categories.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || !Array.isArray(updates) || updates.length === 0 || updates.length > 100) {
    return { ok: false, message: "Yêu cầu sắp xếp không hợp lệ." };
  }
  for (const u of updates) {
    if (!u || typeof u.id !== "string" || !u.id || typeof u.sort_order !== "number" || !Number.isFinite(u.sort_order)) {
      return { ok: false, message: "Yêu cầu sắp xếp không hợp lệ." };
    }
  }
  try {
    const store = getStore();
    for (const u of updates) {
      const category = await store.getCategory(u.id);
      if (!category) return { ok: false, message: "Không tìm thấy danh mục cần sắp xếp." };
      if ((category.sort_order ?? 0) === u.sort_order) continue;
      await store.updateCategory(u.id, { sort_order: u.sort_order });
      await store.addAuditLog({
        actor_id: session.uid, actor_email: session.email,
        entity: "category", entity_id: u.id, action: "reorder",
        before: { sort_order: category.sort_order ?? 0 },
        after: { sort_order: u.sort_order },
      }).catch((error) => console.error("[category-reorder] audit log failed", error));
    }
    revalidatePath("/crm/categories");
    revalidatePath("/");
    return { ok: true, message: "Đã lưu thứ tự danh mục." };
  } catch (error) {
    console.error("[category-reorder] failed", error);
    return { ok: false, message: "Không lưu được thứ tự. Vui lòng thử lại." };
  }
}
