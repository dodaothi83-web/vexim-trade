import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { readAplusModules } from "@/lib/products/aplus";
import { publicProductCategorySlug } from "@/lib/public/product-selection";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { CrmAplusWorkspace } from "../../../aplus-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soạn A+ sản phẩm", robots: { index: false, follow: false } };

/** CRM: soạn A+ hộ nhà cung cấp cho một sản phẩm (lưu là đăng ngay). */
export default async function CrmProductAplusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: id } = await params;
  await requirePagePermission("products.manage", "/crm/products");
  const store = getStore();
  const product = await store.getProduct(id);
  if (!product?.supplier_id) notFound();
  const supplier = await store.getSupplier(product.supplier_id);
  if (!supplier) notFound();
  const visible = supplierPlanRules(supplier, new Date(), await readPlanCatalog()).richContent;
  const categories = product.supplier_review_status === "approved" ? await store.listCategories({ publishedOnly: true }).catch(() => []) : [];
  const slug = categories.length ? publicProductCategorySlug(product, categories) : null;
  return <>
    <PageHeader eyebrow={supplier.name} title="Soạn A+ sản phẩm" sub={product.display_name || product.name} />
    <CrmAplusWorkspace kind="product" id={product.id} backHref={`/crm/products/${product.id}/edit`} backLabel="Về sản phẩm"
      initial={readAplusModules(product.aplus_content, { supplierId: product.supplier_id, productId: product.id })}
      publicHref={slug ? `/products/${encodeURIComponent(slug)}/${encodeURIComponent(product.id)}` : null}
      visible={visible} planNote="Nhà cung cấp chưa có gói Premium hoặc Pro: A+ lưu được nhưng chưa hiện cho người mua cho tới khi nâng gói." />
  </>;
}
