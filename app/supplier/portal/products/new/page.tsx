import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { PageHeader } from "@/components/page-header";
import { SupplierProductEditor } from "../product-editor";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { readNewQuantityPolicies } from "@/lib/products/quantity-new-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thêm sản phẩm", robots: { index: false, follow: false } };

export default async function NewSupplierProductPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const options = categoryProposalOptions(await access.store.listCategories({ publishedOnly: true }));
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const categoryScope = allowedSupplierCategories(access.supplier, options, linked).map((item) => item.slug);
  const quantityPolicies = await (async () => {
    if (!getSupabaseClient()) throw new Error("Database unavailable");
    const strictAccess = await supplierPortalAccess(supabaseStore);
    if (!strictAccess || !portalApproved(strictAccess.supplier) || strictAccess.supplier.id !== access.supplier.id) throw new Error("Supplier verification failed");
    return readNewQuantityPolicies(options);
  })().catch((error) => { console.error("[quantity-pricing] new product settings", error); return null; });
  // Kho ảnh: ảnh nhà cung cấp đã tải lên nhưng chưa gắn sản phẩm nào.
  const bankMedia = (await access.store.listMedia("supplier", access.supplier.id).catch((error) => {
    console.error("[supplier-product] media bank", error);
    return [];
  })).filter((asset) => asset.kind === "image" && !!asset.storage_path);
  return <>
    <PageHeader
      eyebrow="Cổng nhà cung cấp · riêng tư"
      title="Thêm sản phẩm"
      sub="Điền theo thứ tự từ trên xuống. Trường có dấu * là bắt buộc để gửi duyệt; bạn lưu nháp bất cứ lúc nào."
      breadcrumbs={<nav aria-label="Đường dẫn" className="flex items-center gap-1.5 text-xs text-ink-500"><Link href="/supplier/portal/products" className="hover:text-brand-700">Sản phẩm</Link><ChevronRight className="size-3.5" aria-hidden="true" /><span className="font-semibold text-ink-800">Thêm mới</span></nav>}
    />
    <SupplierProductEditor categories={options} categoryScope={categoryScope} supplier={access.supplier} quantityPolicies={quantityPolicies} bankMedia={bankMedia} />
  </>;
}
