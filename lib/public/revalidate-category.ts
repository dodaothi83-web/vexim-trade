import "server-only";

import { revalidatePath } from "next/cache";

import { CATEGORY_RENDER_LANGS, categoryRenderPath } from "@/lib/public/category-route";
import { revalidatePublicCatalog } from "@/lib/public/revalidate-public";

/**
 * Làm mới một trang danh mục: bản động /products/<slug> VÀ hai bản dựng sẵn theo ngôn ngữ mà
 * middleware viết lại từ đó (lib/public/category-route.ts). revalidatePath("/products/<slug>") một
 * mình KHÔNG xoá bản dựng sẵn; revalidatePath("/products", "layout") thì đã phủ cả hai.
 */
export function revalidateCategoryPage(slug: string): void {
  revalidatePublicCatalog();
  revalidatePath(`/products/${slug}`);
  for (const lang of CATEGORY_RENDER_LANGS) revalidatePath(categoryRenderPath(slug, lang));
}
