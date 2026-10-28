import type { PublicL2Scope } from "@/lib/verification-status";
import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { SponsoredDisclosure } from "@/components/sponsored-disclosure";
import { ProductCompareCheckbox } from "@/components/product-compare-checkbox";
import { VerificationPips } from "@/components/verification-tier";
import type { ProductComparisonSelection } from "@/lib/public/product-comparison";
import type { VerificationLevel } from "@/lib/types";

export interface PublicProductCardGradeRow {
  grade: string;
  isCustom?: boolean;
  priceMin: number | null;
  priceMax: number | null;
  priceText?: string | null;
  incoterm?: string | null;
  moq?: string | null;
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

function formatCardNumber(value: number, unitSuffix: string): string {
  if (unitSuffix.toUpperCase() === "/MT") {
    return Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return value
    .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\.00$/, "");
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
}): { pricePrimary: string; priceSecondary: string; priceTitle: string; hasPrice: boolean; moqText: string } {
  const defaultMoq = moq || "On request";
  if (test) {
    return {
      pricePrimary: "Test data · not a price",
      priceSecondary: "",
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
      matchedRows.length === 1 && matchedRows[0].moq && matchedRows[0].moq !== "On request"
        ? matchedRows[0].moq
        : defaultMoq;

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
        priceSecondary: "",
        priceTitle: "Price on request",
        hasPrice: false,
        moqText,
      };
    }

    const unitSuffix = extractUnitSuffix(pricedRows[0].priceText, price) || "/MT";
    const term = (pricedRows[0].incoterm || fallbackTerm).trim().toUpperCase();

    if (targetRows.length === 1) {
      const row = pricedRows[0];
      const low = formatCardNumber(row.priceMin!, unitSuffix);
      const high = formatCardNumber(row.priceMax!, unitSuffix);
      const amount = low === high ? `USD ${low}${unitSuffix}` : `USD ${low}–${high}${unitSuffix}`;
      return {
        pricePrimary: amount,
        priceSecondary: term,
        priceTitle: term ? `${amount} ${term}` : amount,
        hasPrice: true,
        moqText,
      };
    }

    const minVal = Math.min(...pricedRows.map((row) => row.priceMin!));
    const low = formatCardNumber(minVal, unitSuffix);
    const pricePrimary = `From USD ${low}${unitSuffix}`;
    const gradeCountLabel = `${targetRows.length} grades`;
    const priceSecondary = term ? `${term} · ${gradeCountLabel}` : `· ${gradeCountLabel}`;
    return {
      pricePrimary,
      priceSecondary,
      priceTitle: `${pricePrimary} ${priceSecondary}`,
      hasPrice: true,
      moqText,
    };
  }

  if (!price || !price.trim()) {
    return {
      pricePrimary: "Price on request",
      priceSecondary: "",
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
  const priceSecondary = embeddedTerm || fallbackTerm;
  return {
    pricePrimary,
    priceSecondary,
    priceTitle: priceSecondary ? `${pricePrimary} ${priceSecondary}` : pricePrimary,
    hasPrice: true,
    moqText: defaultMoq,
  };
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
  incoterm,
  fob,
  leadTimeDays,
  supplierName,
  supplierHref,
  verificationSteps,
  l2Scope,
  quoteHref,
  test = false,
  linkable = true,
  comparison,
  sponsored = false,
}: {
  href: string;
  imagePath?: string | null;
  name: string;
  /** Standard grades strictly from the Grade & giá table in canonical category order. */
  grades?: readonly string[];
  /** Optional per-grade rows for multi-grade vs filtered-grade price rendering. */
  gradeRows?: readonly PublicProductCardGradeRow[];
  /** Active grade filter(s) selected by the buyer: moved first and highlighted. */
  highlightedGrades?: readonly string[];
  moq: string;
  price: string | null;
  incoterm?: string | null;
  fob?: boolean;
  leadTimeDays: number | null;
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
}) {
  const quote = !test && linkable ? quoteHref : undefined;

  const activeGradeKeys = new Set(
    (highlightedGrades ?? []).map(normalizeGradeKey).filter(Boolean),
  );
  const dedupedGrades: string[] = [];
  const seenGrades = new Set<string>();
  if (!test) {
    for (const raw of grades ?? []) {
      const clean = raw?.trim();
      if (!clean) continue;
      const key = normalizeGradeKey(clean);
      if (seenGrades.has(key)) continue;
      seenGrades.add(key);
      dedupedGrades.push(clean);
    }
  }
  const orderedGrades =
    activeGradeKeys.size > 0
      ? [
          ...dedupedGrades.filter((g) => activeGradeKeys.has(normalizeGradeKey(g))),
          ...dedupedGrades.filter((g) => !activeGradeKeys.has(normalizeGradeKey(g))),
        ]
      : dedupedGrades;

  const canFitThreeWhenWide =
    orderedGrades.length >= 3 &&
    orderedGrades[0].length + orderedGrades[1].length + orderedGrades[2].length <= 18;
  const allGradesText = orderedGrades.join(", ");

  const { pricePrimary, priceSecondary, priceTitle, hasPrice, moqText } = resolveCardOfferDisplay({
    test,
    price,
    incoterm,
    fob,
    moq,
    gradeRows,
    highlightedGrades,
  });

  // This is a supplier contract check, not a claim about product quality or factory ownership.
  const partnerContractReviewed =
    !test && verificationSteps.includes(2) && (l2Scope === "partner_contract" || l2Scope === "both");

  const comparisonItem: ProductComparisonSelection | null =
    comparison && linkable && !test
      ? {
          id: comparison.id,
          categorySlug: comparison.categorySlug,
          name,
          href,
          imagePath: imagePath ?? null,
        }
      : null;

  const image = imagePath ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/public-media/${imagePath.replace(/^\//, "")}`}
        alt={name}
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
          aria-label={`View details of ${name}`}
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
      title={name}
      className="line-clamp-2 h-9 overflow-hidden break-words text-[13px] font-semibold leading-[18px] text-ink-900 group-hover/card:text-brand-700 sm:h-10 sm:text-sm sm:leading-5"
    >
      {name}
    </h3>
  );

  const renderGradeBadge = (gradeItem: string, extraClass = "") => {
    const isHighlighted = activeGradeKeys.has(normalizeGradeKey(gradeItem));
    return (
      <span
        key={gradeItem}
        className={`inline-flex h-5 max-w-[96px] shrink-0 items-center truncate rounded px-1.5 text-[10.5px] font-semibold leading-none ${
          isHighlighted
            ? "bg-brand-100 text-brand-900 ring-1 ring-inset ring-brand-400"
            : "bg-ink-100 text-ink-700"
        }${extraClass ? ` ${extraClass}` : ""}`}
      >
        <span className="truncate">{gradeItem}</span>
      </span>
    );
  };

  return (
    <article
      className={`@container group/card relative flex h-full min-w-0 flex-row overflow-visible rounded-xl border border-ink-200 bg-white shadow-card transition focus-within:border-brand-500 sm:flex-col ${
        linkable ? "cursor-pointer hover:border-brand-400 hover:shadow-md" : ""
      }`}
    >
      <div className="w-[38%] shrink-0 self-start sm:w-full">{thumb}</div>
      <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:px-3.5 sm:pb-3 sm:pt-3">
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

        {/* Fixed 1-row grade slot so every card in a row keeps identical vertical alignment */}
        <div className="mt-1.5 flex h-6 items-center gap-1 sm:mt-2">
          {orderedGrades.slice(0, 2).map((gradeItem) => renderGradeBadge(gradeItem))}
          {canFitThreeWhenWide && orderedGrades[2] && renderGradeBadge(orderedGrades[2], "hidden @[220px]:inline-flex")}
          {orderedGrades.length > 2 && (
            <span
              className={`group/grades relative z-20 inline-flex shrink-0 ${
                canFitThreeWhenWide && orderedGrades.length === 3 ? "@[220px]:hidden" : ""
              }`}
            >
              <button
                type="button"
                title={allGradesText}
                aria-label={`All grades: ${allGradesText}`}
                className="inline-flex h-5 cursor-pointer items-center rounded bg-ink-100 px-1.5 text-[10.5px] font-semibold leading-none text-ink-700 hover:bg-ink-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700"
              >
                {canFitThreeWhenWide && orderedGrades.length > 3 ? (
                  <>
                    <span className="@[220px]:hidden">+{orderedGrades.length - 2}</span>
                    <span className="hidden @[220px]:inline">+{orderedGrades.length - 3}</span>
                  </>
                ) : (
                  `+${orderedGrades.length - 2}`
                )}
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 hidden w-max max-w-52 rounded-md bg-ink-900 px-2.5 py-1.5 text-left text-[11px] font-medium leading-4 text-white shadow-xl group-hover/grades:block group-focus-within/grades:block"
              >
                {allGradesText}
              </span>
            </span>
          )}
        </div>

        {/* Fixed 1-line price: bold accent primary price + smaller muted regular-weight Incoterm/grade suffix */}
        <p
          title={priceTitle}
          className={`mt-1 h-5 truncate whitespace-nowrap tabular-nums leading-5 sm:mt-1.5 ${
            test
              ? "text-xs font-semibold text-ink-500"
              : hasPrice
                ? "text-sm font-bold text-brand-800 sm:text-[15px]"
                : "text-xs font-medium text-ink-500"
          }`}
        >
          <span>{pricePrimary}</span>
          {priceSecondary && (
            <span className="ml-1.5 text-[10.5px] font-normal text-ink-500 sm:text-[11px]">
              {priceSecondary}
            </span>
          )}
        </p>

        {/* Fixed single-line MOQ & Lead time */}
        <dl className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-ink-600 sm:mt-2 sm:grid sm:grid-cols-2 sm:gap-x-2">
          <div className="flex min-w-0 items-baseline gap-1 sm:block">
            <dt className="text-[9px] font-medium uppercase tracking-wide text-ink-500 sm:text-[10px]">MOQ</dt>
            <dd title={moqText} className="mt-0 truncate text-[11px] font-semibold leading-4 text-ink-800 sm:mt-0.5 sm:text-xs">
              {moqText}
            </dd>
          </div>
          <div className="flex min-w-0 items-baseline gap-1 sm:block">
            <dt className="text-[9px] font-medium uppercase tracking-wide text-ink-500 sm:text-[10px]">Lead time</dt>
            <dd className="mt-0 truncate text-[11px] font-semibold leading-4 text-ink-800 sm:mt-0.5 sm:text-xs">
              {leadTimeDays != null ? `${leadTimeDays} days` : "On request"}
            </dd>
          </div>
        </dl>

        {/* Bottom-pinned Supplier + single Verification + compact outlined Quote button */}
        <div className="mt-auto border-t border-ink-100 pt-2 sm:pt-2.5">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 sm:text-xs">
            <span className="shrink-0 text-ink-500">Supplied by</span>
            {supplierHref && linkable ? (
              <Link
                href={supplierHref}
                title={supplierName}
                className="relative z-20 min-w-0 flex-1 truncate font-semibold text-brand-700 hover:underline"
              >
                {supplierName}
              </Link>
            ) : (
              <span title={supplierName} className="min-w-0 flex-1 truncate font-semibold text-ink-800">
                {supplierName}
              </span>
            )}
          </p>
          <div className="mt-1.5 flex min-h-7 items-center justify-between gap-2">
            <div className="relative z-20 flex min-w-0 flex-wrap items-center gap-1.5">
              <VerificationPips levels={test ? [] : verificationSteps} l2Scope={l2Scope} compact shortTooltips />
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
                aria-label={`Request a quote for ${name}`}
                className="relative z-20 inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-brand-600/80 bg-white px-2.5 text-xs font-semibold text-brand-800 transition hover:border-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
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
