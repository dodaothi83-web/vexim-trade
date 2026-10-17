"use server";

import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { categoryProposalOptions, parseSupplierCategoryProposals } from "@/lib/supplier-portal/category-proposals";

export async function saveSupplierCategoriesAction(form: FormData): Promise<{ ok: boolean; message: string }> {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return { ok: false, message: "Tài khoản nhà cung cấp chưa được Vexim mở quyền." };
  try {
    const options = categoryProposalOptions(await access.store.listCategories({ publishedOnly: true }));
    const selected = parseSupplierCategoryProposals(form, options).requested_category_slugs;
    const products = await access.store.listProductsBySupplier(access.supplier.id);
    const outside = products.find((p) => {
      const slug = p.reviewed_category_slug || p.supplier_category_proposal || p.category;
      return slug && !selected.includes(slug);
    });
    if (outside) return { ok: false, message: `Sản phẩm “${outside.name}” còn thuộc danh mục sẽ bỏ. Liên hệ Vexim để xử lý sản phẩm trước khi bỏ danh mục.` };
    const before = access.supplier.requested_category_slugs ?? [];
    await access.store.updateSupplier(access.supplier.id, {
      requested_category_slugs: selected, requested_category_other: null,
    });
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "supplier", entity_id: access.supplier.id, action: "supplier.categories_selected",
      before: { slugs: before }, after: { slugs: selected } })
      .catch((error) => console.error("[supplier-categories] audit", error));
    revalidatePath("/supplier/portal/categories");
    revalidatePath("/supplier/portal/products");
    revalidatePath("/supplier/portal/products/new");
    return { ok: true, message: "Đã lưu danh mục được phép chọn. Không tự duyệt hoặc công khai sản phẩm." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Không lưu được danh mục." }; }
}
