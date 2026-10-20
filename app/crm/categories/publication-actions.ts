"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

/** Only public visibility may change; category copy and filters remain with the preparer. */
export async function decideCategoryPublicationAction(id: string, publish: boolean) {
  const denied = await guard("categories.publish");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || !/^[0-9a-f-]{36}$/i.test(id) || typeof publish !== "boolean") {
    return { ok: false, message: "Yêu cầu không hợp lệ." };
  }
  try {
    const store = getStore();
    const category = await store.getCategory(id);
    if (!category) return { ok: false, message: "Không tìm thấy danh mục." };
    if (category.is_published === publish && (category.status === "published") === publish) {
      return { ok: false, message: "Trạng thái công khai không thay đổi." };
    }
    // Quy tắc 2 người: người sửa cuối không được tự công khai bản mình sửa.
    // Admin toàn quyền là ngoại lệ — vẫn ghi audit log như mọi quyết định khác.
    if (publish && session.role !== "admin" && category.updated_by === session.uid) {
      return { ok: false, message: "Người chuẩn bị danh mục không được tự công khai; nhờ người khác kiểm duyệt." };
    }
    if (publish && (!category.slug || !category.name_i18n?.en)) {
      return { ok: false, message: "Danh mục chưa đủ tên và slug để công khai." };
    }
    await store.updateCategory(id, { status: publish ? "published" : "draft", is_published: publish });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "category", entity_id: id, action: publish ? "publish" : "unpublish",
      before: { status: category.status, is_published: category.is_published },
      after: { status: publish ? "published" : "draft", is_published: publish } })
      .catch((error) => console.error("[category-publication] audit log failed after decision", error));
    revalidatePath("/crm/categories");
    revalidatePath("/");
    revalidatePath(`/products/${category.slug}`);
    return { ok: true, message: publish ? "Đã công khai danh mục." : "Đã ẩn danh mục khỏi trang công khai." };
  } catch (error) {
    console.error("[category-publication] decision failed", error);
    return { ok: false, message: "Không lưu được quyết định. Vui lòng thử lại." };
  }
}
