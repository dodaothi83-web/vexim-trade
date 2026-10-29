import { formatQuantityBuyer, referencePriceAge, type QuantityPriceTier } from "@/lib/products/quantity-pricing";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { readQuantityRevisionV2, v2PriceLabel, v2PriceUsdPerKg, v2QuantityLabel } from "@/lib/products/quantity-revision-v2";

/** Only already-approved, public-facing fields are returned from this projection. */
export type PublicQuantityOffer = {
  title: string | null;
  grade: string;
  incoterm: string;
  moq: string;
  /** Whole kilograms from the approved first tier, for structured MOQ filters. */
  moqKg: number;
  price: string | null;
  /** Custom grades are shown, but are not included in standard-grade filters. */
  customGrade?: boolean;
  moqUnit?: "kg" | "mt";
  tiers: Array<{ from: string; to: string | null; price: string }>;
  confirmedAt: string | null;
  daysSinceConfirmed: number | null;
  stale: boolean;
  priceRankingEligible: boolean;
  pricePoint: { value: number; highValue: number; currency: "USD"; unit: "kg" | "mt"; updatedAt: string } | null;
};

export type PriceRevision = { status: string; product_id: string; grade: unknown; incoterm: unknown; tiers: unknown; confirmed_at: unknown };
export type NameRevision = { status: string; product_id: string; english_name: unknown };

function validTiers(raw: unknown): QuantityPriceTier[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) return null;
  const tiers: QuantityPriceTier[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const kg = (row as Record<string, unknown>).minKg;
    const price = (row as Record<string, unknown>).priceUsdPerKg;
    if (typeof kg !== "number" || !Number.isSafeInteger(kg) || kg < 1 || kg > 1_000_000_000 ||
        typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 1_000_000_000 ||
        Math.abs(price * 100 - Math.round(price * 100)) > 1e-5) return null;
    const previous = tiers[tiers.length - 1];
    if (previous && (kg <= previous.minKg || price > previous.priceUsdPerKg)) return null;
    tiers.push({ minKg: kg, priceUsdPerKg: price });
  }
  return tiers;
}

/**
 * Fail closed on pending/rejected/wrong-product or malformed records. Caller must
 * separately enforce supplier/product/media public gates and consent. No pending
 * name, warning, private metadata or legacy price may pass through this helper.
 */
export function projectApprovedQuantityOffer(input: {
  productId: string;
  priceRevision: PriceRevision | null;
  nameRevision: NameRevision | null;
  pricePubliclyVisible: boolean;
  priceUnit: "kg" | "mt";
  now: number;
  staleAfterDays: number;
}): PublicQuantityOffer | null {
  const revision = input.priceRevision;
  if (!revision || revision.status !== "approved" || revision.product_id !== input.productId ||
      typeof revision.grade !== "string" || !revision.grade.trim() ||
      typeof revision.incoterm !== "string" || !["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"].includes(revision.incoterm)) return null;
  const version2 = Array.isArray(revision.tiers) && revision.tiers.some((row) => row && typeof row === "object" && "version" in row);
  const v2 = version2 ? readQuantityRevisionV2(revision.tiers) : null;
  const tiers = version2 ? null : validTiers(revision.tiers);
  if (version2 ? !v2 : !tiers) return null;
  const approvedName = input.nameRevision && input.nameRevision.status === "approved" && input.nameRevision.product_id === input.productId &&
    typeof input.nameRevision.english_name === "string" ? withoutDirectContacts(input.nameRevision.english_name).trim() : "";
  const grade = withoutDirectContacts(revision.grade).trim();
  if (!grade) return null;
  const title = approvedName ? `${approvedName} ${grade}` : null;
  const confirmedAt = typeof revision.confirmed_at === "string" && Number.isFinite(Date.parse(revision.confirmed_at)) ? revision.confirmed_at : null;
  const age = referencePriceAge(confirmedAt, input.now, input.staleAfterDays);
  const visible = input.pricePubliclyVisible;
  if (v2) {
    const first = v2.tiers[0], last = v2.tiers[v2.tiers.length - 1];
    const unit = v2.unit === "mt" ? "MT" : v2.unit;
    const amount = (cents: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
    const price = visible ? `USD ${amount(last.priceCentsPerUnit)}${first.priceCentsPerUnit !== last.priceCentsPerUnit ? `–${amount(first.priceCentsPerUnit)}` : ""}/${unit}` : null;
    const kgFactor = input.priceUnit === "mt" ? 1000 : 1;
    return {
      title, grade, incoterm: revision.incoterm, customGrade: v2.customGrade, moqUnit: v2.unit,
      moq: v2QuantityLabel(first.quantityGrams, v2), moqKg: first.quantityGrams / 1000, price,
      tiers: visible ? v2.tiers.map((tier, index) => ({
        from: v2QuantityLabel(tier.quantityGrams, v2),
        to: v2.tiers[index + 1] ? v2QuantityLabel(v2.tiers[index + 1].quantityGrams - 1, v2) : null,
        price: v2PriceLabel(tier.priceCentsPerUnit, v2.unit),
      })) : [],
      confirmedAt: visible ? confirmedAt : null, daysSinceConfirmed: visible ? age.days : null,
      stale: visible && age.stale, priceRankingEligible: visible && !age.stale,
      pricePoint: visible && !age.stale && confirmedAt ? { value: v2PriceUsdPerKg(last) * kgFactor, highValue: v2PriceUsdPerKg(first) * kgFactor, currency: "USD", unit: input.priceUnit, updatedAt: confirmedAt } : null,
    };
  }
  if (!tiers) return null;
  const factor = input.priceUnit === "mt" ? 1000 : 1;
  const decimals = input.priceUnit === "mt" ? 0 : 2;
  const unitLabel = input.priceUnit === "mt" ? "MT" : "kg";
  const format = (perKg: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(perKg * factor);
  const low = tiers[tiers.length - 1].priceUsdPerKg;
  const high = tiers[0].priceUsdPerKg;
  const price = visible ? `USD ${format(low)}${low !== high ? `–${format(high)}` : ""}/${unitLabel}` : null;
  return {
    title, grade, incoterm: revision.incoterm,
    moq: formatQuantityBuyer(tiers[0].minKg), moqKg: tiers[0].minKg,
    price,
    tiers: visible ? tiers.map((tier, index) => ({
      from: formatQuantityBuyer(tier.minKg),
      to: tiers[index + 1] ? formatQuantityBuyer(tiers[index + 1].minKg - 1) : null,
      price: `USD ${format(tier.priceUsdPerKg)}/${unitLabel}`,
    })) : [],
    confirmedAt: visible ? confirmedAt : null,
    daysSinceConfirmed: visible ? age.days : null,
    stale: visible && age.stale,
    priceRankingEligible: visible && !age.stale,
    pricePoint: visible && !age.stale && confirmedAt ? { value: low * factor, highValue: high * factor, currency: "USD", unit: input.priceUnit, updatedAt: confirmedAt } : null,
  };
}
