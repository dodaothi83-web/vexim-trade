import "server-only";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { displayUnitsForCategory } from "@/lib/public/price-units";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { readQuantityRevisionV2, v2InputTiers } from "@/lib/products/quantity-revision-v2";
import type { SupplierQuantityUnit } from "@/lib/products/quantity-entry";
import { normalizePriceCurrency, type QuantityPricingInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import type { SupplierProduct } from "@/lib/types";

export type QuantityEditorData = {
  productId: string; updatedAt: string; nameVi: string; nameEn: string;
  pendingPriceId: string | null; pendingNameId: string | null; hasApprovedPrice: boolean; hasApprovedName: boolean;
  grade: string; incoterm: string; currency: string; tiers: QuantityPricingInput["tiers"];
  /** Raw supplier-unit values. Older editors must not treat these as kg prices. */
  v2?: { unit: SupplierQuantityUnit; customGrade: boolean; tiers: Array<{ quantity: string; price: string }> } | null;
  standardGrades: string[]; policy: QuantityPricingPolicy; buyerPriceUnit: "kg" | "mt"; pricePubliclyVisible: boolean;
  buyerPreviewEnabled: boolean;
};

/** Caller must authorize the product before requesting any private revision. */
export async function readQuantityEditorData(product: SupplierProduct): Promise<QuantityEditorData> {
  const db = getSupabaseClient();
  if (!db || !product.updated_at) throw new Error("Quantity pricing database unavailable");
  const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
  const category = slug ? await supabaseStore.getCategoryBySlug(slug) : null;
  if (!category || category.status !== "published" || !category.is_published) throw new Error("Published category required");
  const [policy, priceResult, nameResult] = await Promise.all([
    readQuantityPricingPolicy(category.id),
    db.from("product_quantity_price_revisions").select("id,status,grade,incoterm,tiers").eq("product_id", product.id).in("status", ["pending", "approved"]),
    db.from("product_english_name_revisions").select("id,status,english_name").eq("product_id", product.id).in("status", ["pending", "approved"]),
  ]);
  if (priceResult.error || nameResult.error || !priceResult.data || !nameResult.data) throw new Error("Revision reads failed");
  const pendingPrice = priceResult.data.find((row) => row.status === "pending") ?? null;
  const approvedPrice = priceResult.data.find((row) => row.status === "approved") ?? null;
  const pendingName = nameResult.data.find((row) => row.status === "pending") ?? null;
  const approvedName = nameResult.data.find((row) => row.status === "approved") ?? null;
  const price = pendingPrice || approvedPrice;
  const rawTiers = Array.isArray(price?.tiers) ? price.tiers : [];
  const versioned = rawTiers.some((row: unknown) => !!row && typeof row === "object" && "version" in row);
  const revisionV2 = versioned ? readQuantityRevisionV2(rawTiers) : null;
  if (price && (versioned ? !revisionV2 : !rawTiers.length || rawTiers.length > 100 || !rawTiers.every((row: unknown) => row && typeof row === "object" &&
      typeof (row as { minKg?: unknown }).minKg === "number" && typeof (row as { priceUsdPerKg?: unknown }).priceUsdPerKg === "number"))) {
    throw new Error("Invalid saved quantity price revision");
  }
  const fallbackIncoterm = typeof price?.incoterm === "string" ? price.incoterm : "";
  const tiers = revisionV2 ? [] : price
    ? rawTiers.map((row: { minKg: number; priceUsdPerKg: number; incoterm?: unknown; currency?: unknown }) => ({
      minKg: String(row.minKg), priceUsdPerKg: String(row.priceUsdPerKg),
      incoterm: typeof row.incoterm === "string" ? row.incoterm : fallbackIncoterm,
    }))
    : [{ minKg: "", priceUsdPerKg: "", incoterm: fallbackIncoterm }];
  // Rows written before the currency field existed are USD by definition.
  const storedCurrency = rawTiers.find((row) => !!row && typeof row === "object" && "currency" in row) as { currency?: unknown } | undefined;
  const currency = normalizePriceCurrency(typeof storedCurrency?.currency === "string" ? storedCurrency.currency : "USD") ?? "USD";
  const primary = displayUnitsForCategory(category.slug, category.price_unit).primary;
  return {
    productId: product.id, updatedAt: product.updated_at, nameVi: product.name,
    nameEn: pendingName?.english_name || approvedName?.english_name || product.name_i18n?.en || "",
    pendingPriceId: pendingPrice?.id ?? null, pendingNameId: pendingName?.id ?? null,
    hasApprovedPrice: !!approvedPrice, hasApprovedName: !!approvedName,
    grade: typeof price?.grade === "string" ? price.grade : "", incoterm: fallbackIncoterm, currency,
    tiers, v2: revisionV2 ? { unit: revisionV2.unit, customGrade: revisionV2.customGrade, tiers: v2InputTiers(revisionV2) } : null,
    standardGrades: standardGradesForCategory(category), policy,
    buyerPriceUnit: primary === "mt" ? "mt" : "kg", pricePubliclyVisible: product.price_publicly_visible === true,
    buyerPreviewEnabled: process.env.VEXIM_QUANTITY_BUYER_PREVIEW === "true",
  };
}
