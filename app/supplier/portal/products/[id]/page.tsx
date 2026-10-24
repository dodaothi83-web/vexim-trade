import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierVisibleProductMedia } from "@/lib/supplier-portal/product-view";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { PageHeader } from "@/components/page-header";
import { SupplierProductEditor } from "../product-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý sản phẩm", robots: { index: false, follow: false } };

/** `?step=2|3` cho phép mở thẳng một bước sau khi lưu sản phẩm mới. */
function readStep(raw: string | undefined): 1 | 2 | 3 {
  const value = Number(raw);
  return value === 2 ? 2 : value === 3 ? 3 : 1;
}

export default async function OwnProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { id } = await params;
  const step = readStep((await searchParams).step);
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) notFound();
  const [allMedia, allCategories] = await Promise.all([
    access.store.listMedia("product", id), access.store.listCategories({ publishedOnly: true }),
  ]);
  const media = supplierVisibleProductMedia(allMedia, access.supplier.id, access.user.id);
  const options = categoryProposalOptions(allCategories);
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const categories = allowedSupplierCategories(access.supplier, options, linked);
  return <>
    <PageHeader
      eyebrow="Cổng nhà cung cấp · riêng tư"
      title={product.name}
      sub="Hoàn thiện thông tin, kiểm tra tệp đã tải và theo dõi phản hồi duyệt."
      breadcrumbs={<nav aria-label="Đường dẫn" className="flex min-w-0 items-center gap-1.5 text-xs text-ink-500"><Link href="/supplier/portal/products" className="shrink-0 hover:text-brand-700">Sản phẩm</Link><ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate font-semibold text-ink-800">{product.name}</span></nav>}
    />
    <SupplierProductEditor product={product} media={media} userId={access.user.id} categories={categories} supplier={access.supplier} initialStep={step} />
  </>;
}
