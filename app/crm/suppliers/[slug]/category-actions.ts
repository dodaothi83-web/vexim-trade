"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";

type Result = { ok: boolean; message: string };

/** Staff-curated supplier industries; suggestions from signup never write to supplier_categories. */
export async function confirmSupplierCategoriesAction(form: FormData): Promise<Result> {
  const denied = await guard("suppliers.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "sourcing")) return { ok: false, message: "Chỉ quản trị/thu mua Vexim được chốt danh mục NCC." };
  const id = String(form.get("supplier_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Hồ sơ NCC không hợp lệ." };
  const chosen = form.getAll("category_id");
  const primary = String(form.get("primary_id") ?? "");
  try {
    const store = getStore();
    const supplier = await store.getSupplier(id);
    if (!supplier) return { ok: false, message: "Không tìm thấy NCC." };
    const options = categoryProposalOptions(await store.listCategories({ publishedOnly: false }));
    const ids = chosen.map(String);
    if (ids.length > 8 || new Set(ids).size !== ids.length || !ids.every((item) => options.some((c) => c.id === item)) ||
      (ids.length ? !ids.includes(primary) : !!primary)) return { ok: false, message: "Danh mục hoặc danh mục chính không hợp lệ." };
    const before = await store.listSupplierCategories(id);
    await store.setSupplierCategories(id, ids, primary || null);
    await store.updateSupplier(id, { categories_reviewed_at: new Date().toISOString() });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "supplier", entity_id: id,
      action: "supplier.categories_confirmed", before: { categories: before.map((c) => c.category_id) },
      after: { categories: ids, primary } }).catch((error) => console.error("[supplier-categories] audit", error));
    revalidatePath(`/crm/suppliers/${id}`);
    revalidatePath(`/crm/suppliers/${id}/edit`);
    return { ok: true, message: "Đã chốt danh mục NCC trong CRM. Không tự duyệt sản phẩm hoặc công khai NCC." };
  } catch (error) { console.error("[supplier-categories]", error); return { ok: false, message: "Không lưu được danh mục NCC." }; }
}
