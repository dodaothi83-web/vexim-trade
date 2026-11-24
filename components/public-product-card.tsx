import { cdnVariant, publicMediaUrl, publicMediaUrlAt } from "@/lib/media/public-url";

import type { PublicL2Scope } from "@/lib/verification-status";
import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { SponsoredDisclosure } from "@/components/sponsored-disclosure";
import { ProductCompareCheckbox } from "@/components/product-compare-checkbox";
import { VerifiedBadge } from "@/components/verified-badge";
import { VeximLeadTimeIcon } from "@/components/brand/vexim-icons";
import type { ProductComparisonSelection } from "@/lib/public/product-comparison";
import type { VerificationLevel } from "@/lib/types";
import { priceAmountText, priceCurrencySymbol } from "@/lib/products/price-display";

/** Ảnh CDN: srcset 400w/1024w cho thẻ; ảnh chưa chép lên CDN thì null. */
const cardSrcSet = (path: string) => {
  const small = cdnVariant(path, 400);
  return small ? `${publicMediaUrl(small)} 400w, ${publicMediaUrl(cdnVariant(path, 1024)!)} 1024w` : null;
};

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
 * Grade metadata retained for callers. Product titles are displayed without removing grades.
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
  test = false,
  linkable = true,
  comparison,
  sponsored = false,
  certificates = [],
}: {
  /** Chứng nhận đã duyệt áp cho sản phẩm; thẻ hiện tối đa 3, còn lại gộp thành "+N". */
  certificates?: readonly string[];
  href: string;
  imagePath?: string | null;
  name: string;
  /** Grade chuẩn từ bảng Grade và giá, độc lập với tên sản phẩm. */
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
}) {

  // Preserve the supplied public title, including any grade codes.
  const displayName = name;

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
        src={publicMediaUrlAt(imagePath, 400)}
        // Ảnh CDN: màn hình thường lấy bản 400px, màn hình độ nét cao lấy bản 1024px.
        {...(cardSrcSet(imagePath) ? { srcSet: cardSrcSet(imagePath)!, sizes: "(max-width: 639px) 50vw, 280px" } : {})}
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

  const mobileCertificateCount = certificates.length > 2 ? 1 : 2;
  const thumb = (
    // Điện thoại (thẻ ngang): ảnh vuông, phần chữ được thu gọn để vừa chiều cao ảnh (không cắt ảnh,
    // không hở dưới ảnh). Nếu chữ vẫn cao hơn (màn rất hẹp + Volume pricing) khung giãn theo thẻ
    // thay vì để hở trắng. Từ sm (thẻ dọc): khung vuông như cũ.
    <div className="relative aspect-square h-full w-full overflow-hidden rounded-tl-xl rounded-bl-xl bg-ink-50 sm:rounded-bl-none sm:rounded-tr-xl sm:h-auto">
      {linkable ? (
        <Link prefetch={false}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View details of ${displayName} (opens in a new tab)`}
          className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          {image}
        </Link>
      ) : (
        image
      )}
      {test && (
        <span className="absolute left-2 top-2 z-20 rounded bg-brand-100 px-2 py-1 text-[10px] font-bold text-brand-700">
          TEST · Not an offer
        </span>
      )}
      {comparisonItem && <ProductCompareCheckbox product={comparisonItem} />}
      {/* Nhãn chứng nhận nằm đè góc dưới ảnh ở mọi cỡ màn hình, để mọi thẻ có cùng hai dòng tiêu đề
          và giá thẳng hàng. Điện thoại: hai chứng nhận thì hiện cả hai, từ ba trở lên hiện nhãn đầu + "+N".
          Từ sm: tối đa ba nhãn, còn lại gộp "+N". */}
      {certificates.length > 0 && (
        <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-10 flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden sm:inset-x-2 sm:bottom-2" aria-label={`Certificates: ${certificates.join(", ")}`}>
          {certificates.slice(0, 3).map((label, index) => (
            <span key={label} title={`${label} certified`} className={`pointer-events-auto min-w-0 truncate rounded bg-white/95 px-1 text-[9.5px] font-bold leading-[14px] text-emerald-800 shadow-sm ring-1 ring-emerald-300 sm:px-1.5 sm:text-[10.5px] sm:leading-4 ${
              index >= mobileCertificateCount ? "max-sm:hidden" : ""}`}>
              {label}
            </span>
          ))}
          {certificates.length > mobileCertificateCount && (
            <span title={certificates.slice(mobileCertificateCount).join(", ")} className="pointer-events-auto shrink-0 rounded bg-emerald-600 px-1 text-[9.5px] font-bold leading-[14px] text-white shadow-sm sm:hidden">
              +{certificates.length - mobileCertificateCount}
            </span>
          )}
          {certificates.length > 3 && (
            <span title={certificates.slice(3).join(", ")} className="pointer-events-auto shrink-0 rounded bg-emerald-600 px-1.5 text-[10.5px] font-bold leading-4 text-white shadow-sm max-sm:hidden">
              +{certificates.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );

  const title = (
    <h3
      title={displayName}
      // Mọi cỡ màn hình: tối đa hai dòng rồi "…" (tên đầy đủ ở thuộc tính title và trang chi tiết).
      // Wrapper bên ngoài giữ đúng hai dòng để giá trên lưới thẳng hàng.
      className="line-clamp-2 overflow-hidden break-words text-[13px] font-semibold leading-4 text-ink-900 group-hover/card:text-brand-700 sm:text-sm sm:leading-5"
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
      <div className="w-[40%] shrink-0 self-stretch sm:w-full sm:self-auto">{thumb}</div>
      {/* Điện thoại: ảnh vuông cao hơn chữ thì khoảng dư chia đều giữa các nhóm (justify-between), không dồn một chỗ. */}
      <div className="@container flex min-w-0 flex-1 flex-col px-2 py-1.5 max-sm:justify-between sm:px-3 sm:pb-3 sm:pt-2.5">
        {sponsored && (
          <div className="relative z-20">
            <SponsoredDisclosure />
          </div>
        )}

        {/* Tiêu đề: wrapper giữ đúng hai dòng để mọi thẻ cao bằng nhau và giá thẳng hàng. */}
        <div className="flex min-h-8 flex-col sm:min-h-10">

          {linkable ? (
            <Link prefetch={false}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${displayName} (opens in a new tab)`}
              className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 after:absolute after:inset-0 after:z-10 after:rounded-xl after:content-['']"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </div>

        {/* Prominent price with inline Incoterm (e.g. USD 7.55–7.80/kg FOB) */}
        <div title={fullPriceTitle} className="mt-1 sm:mt-1.5">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums">
            <span
              className={
                test
                  ? "text-xs font-semibold leading-5 text-ink-500"
                  : hasPrice
                    ? "break-words text-[15px] font-extrabold leading-[18px] tracking-[-0.01em] text-brand-900 sm:text-[16px] sm:leading-6 @[19rem]:text-[19px] @[19rem]:leading-7"
                    : "text-[13px] font-semibold leading-[18px] text-ink-500 sm:text-sm sm:leading-5"
              }
            >
              {pricePrimary}
            </span>
            {hasPrice && incotermText && (
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400 sm:text-[10px]">
                {incotermText}
              </span>
            )}
            {/* Điện thoại: "N grades" đứng ngay sau giá (đủ chỗ thì không tốn thêm một dòng). */}
            {gradeCountLabel && (
              <span className="text-[10px] font-medium text-ink-500 sm:hidden">· {gradeCountLabel}</span>
            )}
          </p>
          {(gradeCountLabel || (hasPrice && volumePricing)) && (
            <p className={`truncate text-[10px] font-medium leading-[14px] text-ink-500 sm:mt-0.5 sm:text-[11px] sm:leading-4 ${
              hasPrice && volumePricing ? "" : "max-sm:hidden"}`}>
              {gradeCountLabel && <span className="max-sm:hidden">{gradeCountLabel}</span>}
              {hasPrice && volumePricing && (
                <span className={gradeCountLabel ? "sm:ml-1.5" : undefined}>
                  {gradeCountLabel ? <><span className="max-sm:hidden">· </span>Volume pricing</> : "Volume pricing"}
                </span>
              )}
            </p>
          )}
        </div>


        {/* MOQ và thời gian giao trên một dòng: "MOQ 5 MT · (đồng hồ) 18 days". */}
        <dl className="mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-ink-900 max-sm:mb-1.5 sm:mb-1 sm:mt-1.5">
          <div title={`MOQ: ${moqText}`} className="flex min-w-0 items-baseline gap-1">
            <dt className="shrink-0 text-[11px] font-semibold leading-4 text-ink-500 sm:leading-5">MOQ</dt>
            <dd className="truncate text-[11px] font-bold leading-4 tabular-nums sm:text-[13px] sm:leading-5">{moqText}</dd>
          </div>
          <span aria-hidden="true" className="shrink-0 text-ink-300">·</span>
          <div title={`Lead time: ${leadTimeDisplay}`} className="flex shrink-0 items-center gap-1">
            <dt className="shrink-0 text-ink-500">
              <VeximLeadTimeIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={3} />
              <span className="sr-only">Lead time</span>
            </dt>
            <dd className="text-[11px] font-bold leading-4 tabular-nums sm:text-[13px] sm:leading-5">{leadTimeDisplay}</dd>
          </div>
        </dl>

        {/* Đáy thẻ: một đường kẻ, rồi nhà cung cấp và nhãn "Verified L1/L2/L3" trên cùng một hàng. */}
        {/* Thẻ dọc (sm+): mt-auto đẩy hàng nhà cung cấp xuống đáy thẻ. Điện thoại: justify-between ở trên. */}
        <div className="border-t border-ink-100 pt-1.5 sm:mt-auto sm:pt-2">
          {/* Tên giữ một dòng và tự cắt bằng dấu ba chấm; nhãn xác minh đứng ngay sau tên, không xuống hàng. */}
          <div className="relative z-20 flex min-w-0 items-center gap-1.5 sm:gap-2">
            {supplierHref && linkable ? (
              <Link prefetch={false}
                href={supplierHref}
                target="_blank"
                rel="noopener noreferrer"
                title={supplierName}
                aria-label={`${supplierName} (opens in a new tab)`}
                className="min-w-0 flex-1 truncate text-[11px] font-bold leading-4 text-brand-700 hover:underline sm:text-xs sm:leading-5"
              >
                {supplierName}
              </Link>
            ) : (
              <span title={supplierName} className="min-w-0 flex-1 truncate text-[11px] font-bold leading-4 text-ink-800 sm:text-xs sm:leading-5">
                {supplierName}
              </span>
            )}
            {/* Một nhãn thay cho ba khiên; bấm/di chuột để xem từng bước kiểm tra. */}
            <span className="flex shrink-0">
              <VerifiedBadge levels={test ? [] : verificationSteps} l2Scope={l2Scope} />
            </span>
          </div>
          {partnerContractReviewed && (
            <p className="relative z-20 mt-1">
              <span
                title="The supplier's partner factory contract was reviewed; this is not a factory inspection."
                className="inline-flex items-center rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-brand-800 ring-1 ring-brand-200"
              >
                <span aria-hidden="true">Partner contract</span>
                <span className="sr-only">Partner factory contract reviewed</span>
              </span>
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
