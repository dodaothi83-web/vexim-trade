import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { displayUnitsForCategory } from "@/lib/public/price-units";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { PageHeader } from "@/components/page-header";
import { QuantityPricingPreviewForm } from "./preview-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thử nghiệm giá theo số lượng", robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Internal opt-in only; the production editor and buyer pages are not yet cut over. */
export default async function QuantityPricingPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.VEXIM_QUANTITY_PRICING_PREVIEW !== "true") notFound();
  const access = await supplierPortalAccess(supabaseStore);
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const product = await supabaseStore.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) notFound();
  if (!["draft", "approved", "changes_requested", "paused"].includes(product.supplier_review_status ?? "approved")) {
    return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">Sản phẩm đang chờ duyệt nội dung và chưa thể sửa. <Link href={`/supplier/portal/products/${id}`} className="underline">Quay lại sản phẩm</Link></p>;
  }
  try {
    const db = getSupabaseClient();
    if (!db) throw new Error("Database unavailable");
    const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
    const category = slug ? await supabaseStore.getCategoryBySlug(slug) : null;
    if (!category || category.status !== "published" || !category.is_published) throw new Error("Published category required");
    const [policy, priceResult, nameResult] = await Promise.all([
      readQuantityPricingPolicy(category.id),
      db.from("product_quantity_price_revisions").select("id,status,grade,incoterm,tiers").eq("product_id", id).in("status", ["pending", "approved"]),
      db.from("product_english_name_revisions").select("id,status,english_name").eq("product_id", id).in("status", ["pending", "approved"]),
    ]);
    if (priceResult.error || nameResult.error || !priceResult.data || !nameResult.data) throw new Error("Revision reads failed");
    const pendingPrice = priceResult.data.find((row) => row.status === "pending") ?? null;
    const approvedPrice = priceResult.data.find((row) => row.status === "approved") ?? null;
    const pendingName = nameResult.data.find((row) => row.status === "pending") ?? null;
    const approvedName = nameResult.data.find((row) => row.status === "approved") ?? null;
    const price = pendingPrice || approvedPrice;
    const rawTiers = Array.isArray(price?.tiers) ? price.tiers : [];
    const validLegacy = rawTiers.length > 0 && rawTiers.length <= 100 && rawTiers.every((row: unknown) => row && typeof row === "object" &&
      typeof (row as { minKg?: unknown }).minKg === "number" && typeof (row as { priceUsdPerKg?: unknown }).priceUsdPerKg === "number");
    // This older editor cannot represent v2 units or malformed revisions. Never
    // silently turn them into an empty table that can replace a pending price.
    if (price && !validLegacy) throw new Error("Unsupported saved quantity revision");
    const fallbackIncoterm = typeof price?.incoterm === "string" ? price.incoterm : "";
    const tiers = price ? rawTiers.map((row: { minKg: number; priceUsdPerKg: number; incoterm?: unknown }) => ({
      minKg: String(row.minKg), priceUsdPerKg: String(row.priceUsdPerKg),
      incoterm: typeof row.incoterm === "string" ? row.incoterm : fallbackIncoterm,
    })) : [{ minKg: "", priceUsdPerKg: "", incoterm: fallbackIncoterm }];
    const storedCurrency = rawTiers.find((row: unknown) => !!row && typeof row === "object" && typeof (row as { currency?: unknown }).currency === "string") as
      { currency?: string } | undefined;
    const currency = (storedCurrency?.currency ?? "USD").toUpperCase();
    const primary = displayUnitsForCategory(category.slug, category.price_unit).primary;
    return <>
      <PageHeader title="Thử nghiệm giá theo số lượng" sub={product.name} />
      <Link href={`/supplier/portal/products/${id}`} className="text-sm font-semibold text-brand-700">← Về sản phẩm</Link>
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Đây là trang thử nghiệm nội bộ. Bản gửi đi vào hàng duyệt riêng, nhưng chưa thay đổi sản phẩm hoặc giá buyer đang thấy. Form sản phẩm chính vẫn dùng cơ chế cũ.</p>
      <QuantityPricingPreviewForm productId={id} updatedAt={product.updated_at} nameVi={product.name} currency={currency}
        nameEn={pendingName?.english_name || approvedName?.english_name || product.name_i18n?.en || ""}
        pendingPriceId={pendingPrice?.id ?? null} pendingNameId={pendingName?.id ?? null}
        hasApprovedPrice={!!approvedPrice} hasApprovedName={!!approvedName}
        grade={typeof price?.grade === "string" ? price.grade : ""} incoterm={typeof price?.incoterm === "string" ? price.incoterm : ""}
        tiers={tiers} standardGrades={standardGradesForCategory(category)} policy={policy}
        buyerPriceUnit={primary === "mt" ? "mt" : "kg"} pricePubliclyVisible={product.price_publicly_visible === true} />
    </>;
  } catch (error) {
    console.error("[quantity-pricing-preview]", error);
    return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Chưa tải được cấu hình hoặc bản giá. Kiểm tra kết nối, danh mục và các migration 20261053–20261056. <Link href={`/supplier/portal/products/${id}`} className="underline">Quay lại sản phẩm</Link></p>;
  }
}
