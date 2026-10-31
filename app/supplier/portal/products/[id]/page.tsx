import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierVisibleProductMedia } from "@/lib/supplier-portal/product-view";
import { repairAttachedBankMedia } from "@/lib/supplier-portal/bank-media";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { PageHeader } from "@/components/page-header";
import { SupplierProductEditor } from "../product-editor";
import { readQuantityEditorData } from "@/lib/products/quantity-editor-data";
import { certificateProductState } from "@/lib/products/product-certificates";
import { certificateScopeMatch, optoutKey, optoutKeys } from "@/lib/certificate-scope";
import { certificateSchemeLabel, isScopeableCertificateScheme } from "@/lib/certificate-scheme";
import { t } from "@/lib/public/i18n";
import { approvedL2Scope } from "@/lib/verification-status";
import { ProductCertificatesForm } from "../product-certificates-form";

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
  const [storedMedia, allCategories] = await Promise.all([
    access.store.listMedia("product", id), access.store.listCategories({ publishedOnly: true }),
  ]);
  // Ảnh gắn từ kho ảnh bằng bản cũ bị thiếu supplier_id / nằm sai namespace nên bị lọc mất:
  // sửa ngay khi mở trang để người bán thấy lại ảnh của mình, không phải chờ lưu.
  const allMedia = await repairAttachedBankMedia(access.store, access.supplier.id, storedMedia);
  const media = supplierVisibleProductMedia(allMedia, access.supplier.id, access.user.id);
  const options = categoryProposalOptions(allCategories);
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const categoryScope = allowedSupplierCategories(access.supplier, options, linked).map((item) => item.slug);
  /*
   * Chứng nhận áp cho sản phẩm: giấy chất lượng đã duyệt, có phạm vi phủ sản phẩm hoặc
   * danh mục của nó, trừ giấy nhà cung cấp đã bỏ tick. Giấy ngoài phạm vi vẫn hiện (mờ)
   * để nhà cung cấp xin mở rộng; giấy pháp lý/giấy theo lô chỉ đếm cho biết.
   */
  const certificateOptions = await access.store.listCertificates(access.supplier.id)
    .then(async (rows) => {
      const live = rows.filter((certificate) => certificate.review_status !== "rejected");
      if (live.length === 0) return [];
      const today = new Date().toISOString().slice(0, 10);
      const scopes = typeof access.store.listCertificateScopes === "function"
        ? await access.store.listCertificateScopes(live.map((certificate) => certificate.id)).catch(() => [])
        : [];
      const optouts = typeof access.store.listCertificateOptouts === "function"
        ? await access.store.listCertificateOptouts(access.supplier.id).catch(() => [])
        : [];
      const optedOut = optoutKeys(optouts);
      const categories = await access.store.listCategories({ publishedOnly: false }).catch(() => []);
      const category = product.reviewed_category_slug
        ? categories.find((item) => item.slug === product.reviewed_category_slug) ?? null
        : null;
      const parent = category?.parent_id ? categories.find((item) => item.id === category.parent_id) ?? null : null;
      const categoryPath = category ? [category.id, ...(parent ? [parent.id] : [])] : [];
      const categoryName = (categoryId: string | null) => {
        if (!categoryId) return null;
        const found = categories.find((item) => item.id === categoryId);
        if (!found) return null;
        return t(found.name_i18n) || found.slug;
      };
      return live.map((certificate) => {
        const match = certificateScopeMatch(
          certificate, scopes,
          { id, categoryId: category?.id ?? null, categoryPath },
          optedOut,
        );
        const categoryScope = scopes.find((scope) => scope.certificate_id === certificate.id &&
          Boolean(scope.category_id) && categoryPath.includes(scope.category_id as string));
        return {
          id: certificate.id,
          name: certificate.name,
          issuer: certificate.issuer,
          valid_until: certificate.valid_until,
          schemeLabel: certificateSchemeLabel(certificate.certificate_scheme ?? null, "vi"),
          state: certificateProductState(certificate, id),
          superseded: Boolean(certificate.superseded_by_certificate_id),
          scopeable: isScopeableCertificateScheme(certificate.certificate_scheme ?? null),
          directScope: match.direct,
          inheritedFrom: match.inherited ? categoryName(categoryScope?.category_id ?? null) : null,
          optedOut: optedOut.has(optoutKey(id, certificate.id)),
          applies: match.direct || match.inherited,
          expired: Boolean(certificate.valid_until && certificate.valid_until < today),
        };
      });
    })
    .catch((error) => {
      console.error("[product-certificate] list", error);
      return [];
    });
  // Đơn vị thương mại chỉ dùng được chứng nhận của nhà máy khác khi đã có L2 nhà máy đối tác.
  const verifications = await access.store.listVerifications(access.supplier.id).catch(() => []);
  const l2Scope = approvedL2Scope(verifications);
  const partnerContractApproved = l2Scope === "partner_contract" || l2Scope === "both";
  const partnerFactoryName = partnerContractApproved
    ? verifications
      .filter((v) => v.target_level === 2 && v.status === "approved" && v.l2_scope === "partner_contract")
      .map((v) => v.partner_factory_name?.trim() ?? "")
      .find((name) => name.length > 0) ?? null
    : null;
  const quantityEditor = await (async () => {
    if (!getSupabaseClient()) return null;
    const strictAccess = await supplierPortalAccess(supabaseStore);
    if (!strictAccess || !portalApproved(strictAccess.supplier) || strictAccess.supplier.id !== access.supplier.id) return null;
    const strictProduct = await supabaseStore.getProduct(id);
    if (!strictProduct || strictProduct.supplier_id !== strictAccess.supplier.id) return null;
    return readQuantityEditorData(strictProduct);
  })().catch((error) => {
    console.error("[quantity-pricing] supplier editor", error);
    return null;
  });
  // Bản xem trước người mua chỉ hiện chứng nhận Vexim đã duyệt gắn cho sản phẩm này.
  const approvedCertificates = certificateOptions
    .filter((certificate) => certificate.applies && !certificate.optedOut && !certificate.expired)
    .map((certificate) => ({ id: certificate.id, name: certificate.name, valid_until: certificate.valid_until ?? null }));
  return <>
    <PageHeader
      eyebrow="Cổng nhà cung cấp · riêng tư"
      title={product.name}
      sub="Hoàn thiện thông tin, kiểm tra tệp đã tải và theo dõi phản hồi duyệt."
      breadcrumbs={<nav aria-label="Đường dẫn" className="flex min-w-0 items-center gap-1.5 text-xs text-ink-500"><Link href="/supplier/portal/products" className="shrink-0 hover:text-brand-700">Sản phẩm</Link><ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate font-semibold text-ink-800">{product.name}</span></nav>}
    />
    {process.env.VEXIM_QUANTITY_PRICING_PREVIEW === "true" && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <Link href={`/supplier/portal/products/${id}/quantity-pricing`} className="font-semibold underline">Mở trang thử nghiệm giá theo số lượng</Link>. Trang thử nghiệm chưa thay đổi thông tin buyer đang thấy.
    </p>}
    <SupplierProductEditor product={product} quantityEditor={quantityEditor} media={media} userId={access.user.id} categories={options}
      categoryScope={categoryScope} supplier={access.supplier} certificates={approvedCertificates} initialStep={step} />
    <ProductCertificatesForm productId={id} certificates={certificateOptions}
      supplierType={access.supplier.supplier_type ?? null} partnerContractApproved={partnerContractApproved}
      partnerFactoryName={partnerFactoryName} />
  </>;
}
