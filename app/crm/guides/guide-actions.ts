"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import { buildGuideInput, ensureUniqueGuideSlug, GUIDE_MIN_PUBLISH_CHARS } from "@/lib/guides/guide-payload";
import type { SupplierGuide } from "@/lib/types";

export type GuideActionResult = { ok: true; guide: SupplierGuide } | { ok: false; message: string };

/** Hướng dẫn chỉ hiện trong cổng nhà cung cấp: làm mới đúng các trang đó, không đụng blog công khai. */
function refreshGuidePages(slug?: string) {
  revalidatePath("/crm/guides");
  revalidatePath("/supplier/portal/huong-dan");
  if (slug) revalidatePath(`/supplier/portal/huong-dan/${slug}`);
}

/** Tạo hoặc sửa bài hướng dẫn. Cùng nhóm quyền nội dung với blog (blog.manage). */
export async function saveGuideAction(id: string | null, body: Record<string, unknown>): Promise<GuideActionResult> {
  const gate = await guard("blog.manage");
  if (gate) return gate;
  const built = buildGuideInput(body);
  if (built.errors.length) return { ok: false, message: built.errors.join(". ") };
  if (built.input.status === "published" && built.plainTextLength < GUIDE_MIN_PUBLISH_CHARS)
    return { ok: false, message: `Nội dung quá ngắn để xuất bản (cần tối thiểu ${GUIDE_MIN_PUBLISH_CHARS} ký tự)` };
  const store = getStore();
  try {
    if (id === null) {
      const slug = await ensureUniqueGuideSlug(store, built.input.slug);
      const guide = await store.createSupplierGuide({ ...built.input, slug,
        published_at: built.input.status === "published" ? new Date().toISOString() : null });
      refreshGuidePages(guide.slug);
      return { ok: true, guide };
    }
    const current = await store.getSupplierGuide(id);
    if (!current) return { ok: false, message: "Không tìm thấy bài hướng dẫn." };
    const slug = await ensureUniqueGuideSlug(store, built.input.slug, id);
    // Lần đầu xuất bản thì ghi ngày; lưu nháp lại vẫn giữ ngày cũ.
    const published_at = built.input.status === "published" && !current.published_at ? new Date().toISOString() : current.published_at;
    const guide = await store.updateSupplierGuide(id, { ...built.input, slug, published_at });
    refreshGuidePages(current.slug);
    refreshGuidePages(guide.slug);
    return { ok: true, guide };
  } catch (error) {
    console.error("[supplier-guides] save", error);
    return { ok: false, message: "Không lưu được bài hướng dẫn. Kiểm tra bảng supplier_guides đã được tạo chưa." };
  }
}

export async function deleteGuideAction(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const gate = await guard("blog.manage");
  if (gate) return gate;
  const store = getStore();
  try {
    const current = await store.getSupplierGuide(id);
    await store.deleteSupplierGuide(id);
    refreshGuidePages(current?.slug);
    return { ok: true };
  } catch (error) {
    console.error("[supplier-guides] delete", error);
    return { ok: false, message: "Không xóa được bài hướng dẫn." };
  }
}
