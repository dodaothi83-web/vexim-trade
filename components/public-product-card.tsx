import type { PublicL2Scope } from "@/lib/verification-status";
import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { SponsoredDisclosure } from "@/components/sponsored-disclosure";
import { ProductCompareCheckbox } from "@/components/product-compare-checkbox";
import { VerificationPips } from "@/components/verification-tier";
import type { ProductComparisonSelection } from "@/lib/public/product-comparison";
import type { VerificationLevel } from "@/lib/types";
import { priceAmountText, priceCurrencySymbol } from "@/lib/products/price-display";

/** Giá gốc của sản phẩm và bảng grade cũ được lưu bằng USD. */
const CARD_CURRENCY = "USD";

export interface PublicProductCardGradeRow {
  grade: string;
  isCustom?: boolean;
  priceMin: number | null;
  priceMax: number | null;
  priceText?: string | null;
  incoterm?: string | null;
  moq?: string | null;
}

/** Only explicit weight MOQ is displayed; never guess container or package weight. */
function cardWeightMoq(raw: string | null | undefined): string {
  const match = raw?.trim().match(/^((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)\s*(kg|mt|metric\s+tons?|tonnes?|tons?)$/i);
  if (!match) return "On request";
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return "On request";
  return `${match[1]} ${match[2].toLowerCase() === "kg" ? "kg" : "MT"}`;
}

function normalizeGradeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Bỏ những grade đã có trong bảng Grade và giá khỏi tên hiển thị trên thẻ.
 *
 * Thẻ không còn chip grade, nên tên sản phẩm cũng không nhắc lại grade: người mua đọc
 * grade ở bộ lọc và ở trang sản phẩm. Khoảng trắng và dấu "/" được nới để "570 g/L",
 * "570g/l" và "570 g l" đều bị bỏ như nhau.
 *
 * Chỉ bỏ grade dạng quy cách, tức có số hoặc mã ngắn như "W320" hay "LP". Grade viết
 * thành chữ như "Cassia split" hay "White pepper" chính là tên mặt hàng, bỏ đi thì tên
 * còn lại chỉ là mảnh vụn ("bark, 2.5 mm"), nên giữ nguyên.
 */
function titleWithoutGrades(name: string, grades: readonly string[]): string {
  let result = name;
  const specLike = (grade: string) => /\d/.test(grade) || grade.replace(/[^\p{L}]/gu, "").length <= 3;
  for (const grade of [...grades].sort((a, b) => b.length - a.length)) {
    if (!specLike(grade)) continue;
    const parts = grade.trim().split(/\s+/).filter(Boolean)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "\\s*/?\\s*"));
    if (!parts.length) continue;
    const match = new RegExp(`(^|[^\\p{L}\\p{N}])(?:grade\\s*)?${parts.join("\\s*")}(?=$|[^\\p{L}\\p{N}])`, "giu");
    result = result.replace(match, "$1");
  }
  if (result === name) return name;
  const clean = result.replace(/\(\s*\)/g, "").replace(/\s*[,;|]\s*[,;|]+\s*/g, ", ")
    .replace(/^\s*[,;|/:-]+\s*|\s*[,;|/:-]+\s*$/g, "")
    .replace(/\s+([,;])/g, "$1").replace(/\s{2,}/g, " ").trim();
  return clean || "Product";
}

function normalizeCompactRange(raw: string): string {
  return raw
    .replace(/(\d)\s+to\s+(\d)/gi, "$1–$2")
    .replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
}

function extractUnitSuffix(priceText?: string | null, fallbackPrice?: string | null): string {
  for (const candidate of [priceText, fallbackPrice]) {
    if (!candidate) continue;
    const match = candidate.match(/(\/[A-Za-z]+)\b/);
    if (match) return match[1];
  }
  return "";
}

/** Số gọn cho thẻ: số không có phần lẻ để dòng giá không bị xuống hàng. */
function formatCardNumber(value: number): string {
  return priceAmountText(value);
}

function resolveCardOfferDisplay({
  test,
  price,
  incoterm,
  fob,
  moq,
  gradeRows,
  highlightedGrades,
}: {
  test: boolean;
  price: string | null;
  incoterm?: string | null;
  fob?: boolean;
  moq: string;
  gradeRows?: readonly PublicProductCardGradeRow[];
  highlightedGrades?: readonly string[];
}): {
  pricePrimary: string;
  incotermText: string;
  gradeCountLabel: string;
  priceTitle: string;
  hasPrice: boolean;
  moqText: string;
} {
  const defaultMoq = moq || "On request";
  if (test) {
    return {
      pricePrimary: "Test data · not a price",
      incotermText: "",
      gradeCountLabel: "",
      priceTitle: "Test data · not a price",
      hasPrice: false,
      moqText: defaultMoq,
    };
  }

  const fallbackTerm = (incoterm || (fob ? "FOB" : ""))?.trim().toUpperCase() || "";

  if (gradeRows && gradeRows.length > 0) {
    const activeKeys = new Set(
      (highlightedGrades ?? []).map(normalizeGradeKey).filter(Boolean),
    );
    const standardRows = gradeRows.filter((row) => !row.isCustom);
    const pool = standardRows.length > 0 ? standardRows : [...gradeRows];
    const matchedRows = activeKeys.size > 0
      ? pool.filter((row) => activeKeys.has(normalizeGradeKey(row.grade)))
      : [];
    const targetRows = matchedRows.length > 0 ? matchedRows : pool;
    const moqText =
      matchedRows.length === 1 ? (matchedRows[0].moq || "On request") : defaultMoq;

    const pricedRows = targetRows.filter(
      (row) =>
        typeof row.priceMin === "number" &&
        typeof row.priceMax === "number" &&
        Number.isFinite(row.priceMin) &&
        Number.isFinite(row.priceMax) &&
        row.priceMin > 0 &&
        row.priceMax >= row.priceMin,
    );

    if (pricedRows.length === 0) {
      return {
        pricePrimary: "Price on request",
        incotermText: "",
        gradeCountLabel: "",
        priceTitle: "Price on request",
        hasPrice: false,
        moqText,
      };
    }

    const unitSuffix = extractUnitSuffix(pricedRows[0].priceText, price) || "/MT";
    const term = (pricedRows[0].incoterm || fallbackTerm).trim().toUpperCase();

    if (targetRows.length === 1) {
      const row = pricedRows[0];
      const low = formatCardNumber(row.priceMin!);
      const high = formatCardNumber(row.priceMax!);
      const money = priceCurrencySymbol(CARD_CURRENCY);
      const amount = low === high ? `${money}${low}${unitSuffix}` : `${money}${low}–${high}${unitSuffix}`;
      return {
        pricePrimary: amount,
        incotermText: term,
        gradeCountLabel: "",
        priceTitle: term ? `${amount} ${term}` : amount,
        hasPrice: true,
        moqText,
      };
    }

    const minVal = Math.min(...pricedRows.map((row) => row.priceMin!));
    const low = formatCardNumber(minVal);
    const pricePrimary = `From ${priceCurrencySymbol(CARD_CURRENCY)}${low}${unitSuffix}`;
    const gradeCountLabel = `${targetRows.length} grades`;
    const summaryParts = [pricePrimary, term, gradeCountLabel].filter(Boolean);
    return {
      pricePrimary,
      incotermText: term,
      gradeCountLabel,
      priceTitle: summaryParts.join(" · "),
      hasPrice: true,
      moqText,
    };
  }

  if (!price || !price.trim()) {
    return {
      pricePrimary: "Price on request",
      incotermText: "",
      gradeCountLabel: "",
      priceTitle: "Price on request",
      hasPrice: false,
      moqText: defaultMoq,
    };
  }

  const compact = normalizeCompactRange(price.trim());
  const trailingTermMatch = compact.match(
    /^(.*?)\s+(?:·\s*)?((?:EXW|FCA|FAS|FOB|CFR|CNF|CIF|CPT|CIP|DAP|DPU|DDP)(?:\s*[,/]\s*(?:EXW|FCA|FAS|FOB|CFR|CNF|CIF|CPT|CIP|DAP|DPU|DDP))*)\s*$/i,
  );
  const pricePrimary = trailingTermMatch ? trailingTermMatch[1].trim() : compact;
  const embeddedTerm = trailingTermMatch ? trailingTermMatch[2].trim().toUpperCase() : "";
  const incotermText = embeddedTerm || fallbackTerm;
  return {
    pricePrimary,
    incotermText,
    gradeCountLabel: "",
    priceTitle: incotermText ? `${pricePrimary} ${incotermText}` : pricePrimary,
    hasPrice: true,
    moqText: defaultMoq,
  };
}

/**
 * Grade nào cần bỏ khỏi tên trên thẻ: grade chuẩn của bảng Grade và giá, cộng grade chính
 * của sản phẩm cũ (sản phẩm chưa có bảng nhiều grade chỉ lưu grade trong tên).
 */
export function cardTitleGrades(product: {
  cardGrades?: readonly string[];
  grade?: string | null;
}): string[] {
  const list = [...(product.cardGrades ?? [])];
  const primary = product.grade?.trim();
  if (primary) list.push(primary);
  return list;
}

/** Standardized responsive product offer card shared across Category, Home, Search, Supplier Profile, and PDP. */
export function PublicProductCard({
  href,
  imagePath,
  name,
  grades,
  gradeRows,
  highlightedGrades,
  moq,
  price,
  volumePricing = false,
  incoterm,
  fob,
  leadTimeDays,
  leadTimeText,
  supplierName,
  supplierHref,
  verificationSteps,
  l2Scope,
  quoteHref,
  test = false,
  linkable = true,
  comparison,
  sponsored = false,
  stalePriceDays,
}: {
  href: string;
  imagePath?: string | null;
  name: string;
  /** Grade chuẩn từ bảng Grade và giá; dùng để bỏ grade khỏi tên vì thẻ không hiện grade. */
  grades?: readonly string[];
  /** Optional per-grade rows for multi-grade vs filtered-grade price rendering. */
  gradeRows?: readonly PublicProductCardGradeRow[];
  /** Grade người mua đang lọc: quyết định dòng giá nào được hiện trên thẻ. */
  highlightedGrades?: readonly string[];
  moq: string;
  price: string | null;
  /** A visible, approved quantity-tier range, not an unverified legacy range. */
  volumePricing?: boolean;
  incoterm?: string | null;
  fob?: boolean;
  leadTimeDays: number | null;
  leadTimeText?: string | null;
  supplierName: string;
  supplierHref?: string;
  verificationSteps: readonly VerificationLevel[];
  l2Scope?: PublicL2Scope;
  quoteHref: string | undefined;
  oem?: boolean;
  odm?: boolean;
  samples?: boolean;
  test?: boolean;
  /** Disable navigation links in unapproved portal previews so cards never point to 404 routes. */
  linkable?: boolean;
  /** Only public, non-demo offers receive a comparison checkbox. */
  comparison?: { id: string; categorySlug: string };
  /** Paid placement disclosure belongs inside each sponsored card. */
  sponsored?: boolean;
  /** Present only for a visible stale reference price; null means its date is unknown. */
  stalePriceDays?: number | null;
}) {
  const quote = !test && linkable ? quoteHref : undefined;

  // Thẻ không hiện grade ở đâu cả: không chip, không nhắc trong tên, không trong tooltip.
  const displayName = titleWithoutGrades(name, [
    ...(grades ?? []),
    ...(gradeRows ?? []).map((row) => row.grade),
  ]);

  const {
    pricePrimary,
    incotermText,
    gradeCountLabel,
    priceTitle,
    hasPrice,
    moqText: rawMoqText,
  } = resolveCardOfferDisplay({
    test,
    price,
    incoterm,
    fob,
    moq,
    gradeRows,
    highlightedGrades,
  });
  const moqText = cardWeightMoq(rawMoqText);
  const leadTimeDisplay = leadTimeText?.trim() || (leadTimeDays != null ? `${leadTimeDays} days` : "On request");
  const fullPriceTitle = hasPrice && volumePricing ? `${priceTitle} · Volume pricing` : priceTitle;

  // This is a supplier contract check, not a claim about product quality or factory ownership.
  const partnerContractReviewed =
    !test && verificationSteps.includes(2) && (l2Scope === "partner_contract" || l2Scope === "both");

  const comparisonItem: ProductComparisonSelection | null =
    comparison && linkable && !test
      ? {
          id: comparison.id,
          categorySlug: comparison.categorySlug,
          name: displayName,
          href,
          imagePath: imagePath ?? null,
        }
      : null;

  const image = imagePath ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/public-media/${imagePath.replace(/^\//, "")}`}
        alt={displayName}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </>
  ) : (
    <div className="flex h-full items-center justify-center text-ink-300">
      <ImageIcon className="size-10" aria-hidden="true" />
    </div>
  );

  const thumb = (
    <div className="relative aspect-square w-full overflow-hidden rounded-l-xl bg-ink-50 sm:rounded-l-none sm:rounded-t-xl">
      {linkable ? (
        <Link
          href={href}
          aria-label={`View details of ${displayName}`}
          className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          {image}
        </Link>
      ) : (
        image
      )}
      {test && (
        <span className="absolute left-2 top-2 z-20 rounded bg-amber-200 px-2 py-1 text-[10px] font-bold text-amber-950">
          TEST · Not an offer
        </span>
      )}
      {comparisonItem && <ProductCompareCheckbox product={comparisonItem} />}
    </div>
  );

  const title = (
    <h3
      title={displayName}
      className="line-clamp-2 h-9 overflow-hidden break-words text-[13px] font-semibold leading-[18px] text-ink-900 group-hover/card:text-brand-700 sm:h-10 sm:text-sm sm:leading-5"
    >
      {displayName}
    </h3>
  );

  return (
    <article
      className={`group/card relative flex h-full min-w-0 flex-row overflow-visible rounded-xl border border-ink-200 bg-white shadow-card transition focus-within:border-brand-500 sm:flex-col ${
        linkable ? "cursor-pointer hover:border-brand-400 hover:shadow-md" : ""
      }`}
    >
      <div className="w-[38%] shrink-0 self-start sm:w-full">{thumb}</div>
      <div className="@container flex min-w-0 flex-1 flex-col p-2.5 sm:px-3.5 sm:pb-3.5 sm:pt-3">
        {sponsored && (
          <div className="relative z-20">
            <SponsoredDisclosure />
          </div>
        )}

        {linkable ? (
          <Link
            href={href}
            className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 after:absolute after:inset-0 after:z-10 after:rounded-xl after:content-['']"
          >
            {title}
          </Link>
        ) : (
          title
        )}

        {/* Prominent price with inline Incoterm (e.g. USD 7.55–7.80/kg FOB) */}
        <div title={fullPriceTitle} className="mt-2">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums">
            <span
              className={
                test
                  ? "text-xs font-semibold leading-5 text-ink-500"
                  : hasPrice
                    ? "break-words text-[16px] font-extrabold leading-6 tracking-[-0.01em] text-brand-900 @[19rem]:text-[19px] @[19rem]:leading-7"
                    : "text-sm font-semibold leading-5 text-ink-500"
              }
            >
              {pricePrimary}
            </span>
            {hasPrice && incotermText && (
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
                {incotermText}
              </span>
            )}
          </p>
          {(gradeCountLabel || (hasPrice && volumePricing)) && (
            <p className="mt-0.5 truncate text-[11px] font-medium leading-4 text-ink-500">
              {gradeCountLabel && <span>{gradeCountLabel}</span>}
              {hasPrice && volumePricing && (
                <span className={gradeCountLabel ? "ml-1.5" : undefined}>
                  {gradeCountLabel ? `· Volume pricing` : "Volume pricing"}
                </span>
              )}
            </p>
          )}
        </div>

        {hasPrice && stalePriceDays !== undefined && (
          <p className="mt-0.5 text-[10px] leading-4 text-ink-500">
            {stalePriceDays === null ? "Confirmation date unavailable" : `Last updated ${stalePriceDays} days ago`}
          </p>
        )}

        {/* Two-column commercial terms: MOQ & Lead time */}
        <dl className="mt-2 grid grid-cols-2 gap-x-3 text-ink-600 sm:mt-2.5">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-ink-500">MOQ</dt>
            <dd title={moqText} className="mt-0.5 truncate text-[13px] font-bold leading-5 tabular-nums text-ink-900">
              {moqText}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-ink-500">Lead time</dt>
            <dd className="mt-0.5 truncate text-[13px] font-bold leading-5 tabular-nums text-ink-900">
              {leadTimeDisplay}
            </dd>
          </div>
        </dl>

        {/* Bottom-pinned divider + Supplied by + tiered circular shields + Quote CTA */}
        <div className="mt-2 border-t border-ink-100 pt-2 sm:mt-auto sm:pt-2.5">
          <p className="flex min-w-0 items-baseline gap-1 text-[11px] leading-4 sm:text-xs">
            <span className="shrink-0 text-ink-500">Supplied by</span>
            {supplierHref && linkable ? (
              <Link
                href={supplierHref}
                title={supplierName}
                className="relative z-20 min-w-0 flex-1 truncate font-bold text-brand-700 hover:underline"
              >
                {supplierName}
              </Link>
            ) : (
              <span title={supplierName} className="min-w-0 flex-1 truncate font-bold text-ink-800">
                {supplierName}
              </span>
            )}
          </p>
          <div className="mt-2 flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <div className="relative z-20 flex min-w-0 flex-wrap items-center gap-1.5">
              <VerificationPips levels={test ? [] : verificationSteps} l2Scope={l2Scope} variant="marketplace" shortTooltips />
              {partnerContractReviewed && (
                <span
                  title="The supplier's partner factory contract was reviewed; this is not a factory inspection."
                  className="inline-flex items-center rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-brand-800 ring-1 ring-brand-200"
                >
                  <span aria-hidden="true">Partner contract</span>
                  <span className="sr-only">Partner factory contract reviewed</span>
                </span>
              )}
            </div>
            {quote && (
              <Link
                href={quote}
                aria-label={`Request a quote for ${displayName}`}
                className="relative z-20 inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-brand-400 bg-white px-2.5 text-[13px] font-bold text-brand-800 transition hover:border-brand-600 hover:bg-brand-50/70 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 @[11.5rem]:px-3.5"
              >
                Quote
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
