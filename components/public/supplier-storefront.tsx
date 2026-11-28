import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Info, MapPin, Package, Users } from "lucide-react";
import { supplierTypeIcon, VeximInspectionIcon as Factory, VeximDocumentIcon as FileCheck2, VeximDeliveryIcon as Truck } from "@/components/brand/vexim-icons";
import { VeximMinimumOrderIcon, VeximExportPortIcon, VeximLeadTimeIcon, VeximCapacityIcon, VeximPaymentIcon, VeximMarketsIcon } from "@/components/brand/vexim-icons";
import type { ReactNode } from "react";

import { cardTitleGrades, PublicProductCard } from "@/components/public-product-card";
import { SupplierProductRail } from "@/components/public/supplier-product-rail";
import { SUPPLIER_RAIL_ITEM } from "@/components/public/supplier-rail-item";
import { FeaturedProductTile } from "@/components/public/featured-product-tile";
import { SupplierWebsiteLink } from "@/components/public/supplier-website-link";
import { SupplierCertificateRail } from "@/components/public/supplier-certificate-rail";
import { VERIFICATION_LEVEL_ICONS } from "@/components/verification-tier";
import { supplierShortName } from "@/lib/public/supplier-name";
import type { PublicSupplierCertificate } from "@/lib/public/certificates";
import { supplierTypeLabel, type PublicSupplierCard } from "@/lib/public/catalog";
import type { Category } from "@/lib/types";
import { factoryReviewLabel, verificationLabel, type PublicL2Scope } from "@/lib/verification-status";
import { publicProductTitle } from "@/lib/public/display-name";
import { formatMoney, priceRangeText } from "@/lib/products/price-display";
import { productBelongsToCategory, publicProductPrice, withoutDirectContacts } from "@/lib/public/product-selection";
import { supplierAddressDisplay, supplierCapacityDisplay, supplierAnnualFigureLabel, supplierAnnualOutputDisplay, supplierExportMarketsDisplay, supplierIncotermsDisplay, supplierLegalNameDisplay, supplierMarketsDisplay, supplierMoqDisplay, supplierPaymentTermsDisplay, supplierPortsDisplay, supplierProductsDisplay, supplierProvinceDisplay, supplierSummaryDisplay } from "@/lib/public/supplier-english";
import { VERIFICATION_DISPLAY_ORDER } from "@/lib/types";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { publicShowcaseBlocks } from "@/lib/supplier-showcase";
import { ProductAplus } from "@/components/public/product-aplus";
import { PremiumProductGrid } from "@/components/public/premium-product-grid";
import { aplusImagePaths, COMPANY_APLUS_ID, readAplusModules } from "@/lib/products/aplus";
import { normalizeStorefrontTheme, STOREFRONT_MAX_FEATURED } from "@/lib/storefront-theme";
import { PremiumStorefront } from "@/components/public/premium-storefront";
import { publicMediaUrl, publicMediaUrlAt } from "@/lib/media/public-url";
import { SupplierActivityBadge } from "@/components/public/supplier-activity";

const mediaUrl = publicMediaUrl;
const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");

// Keep structured MOQ authoritative on storefront cards, including unsupported
// or incomplete container/package units. Never substitute a conflicting text weight.
function storefrontStructuredMoq(source: { moq_qty?: unknown; moq_unit?: unknown }): string | null {
  if (source.moq_qty == null && source.moq_unit == null) return null;
  const qty = source.moq_qty;
  const unit = source.moq_unit;
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0 || (unit !== "kg" && unit !== "mt")) return "On request";
  return `${qty} ${unit === "mt" ? "MT" : "kg"}`;
}

const VERIFICATION_ITEMS = [
  { level: 1, label: "Documents checked", pending: "Covers business registration evidence.", Icon: FileCheck2 },
  // Thứ tự hiển thị 11/2026: lịch sử giao hàng trước, nhà máy sau (mã level giữ nguyên).
  { level: 3, label: "Delivery history", pending: "Covers delivery documents and the reviewed shipment scope.", Icon: Truck },
  { level: 2, label: "Factory verification", pending: "Covers a specific facility associated with the supplier.", Icon: Factory },
] as const;

function Fact({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return <div className="flex gap-3 border-b border-ink-100 py-3 last:border-0">
    <Icon aria-hidden size={20} strokeWidth={2.6} className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
    <div className="min-w-0"><dt className="text-xs text-ink-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(value) || "On request"}</dd></div>
  </div>;
}

/**
 * Toàn bộ phần nội dung trang nhà cung cấp mà buyer nhìn thấy.
 *
 * Dùng chung cho trang công khai `/suppliers/[slug]` và bản “Trang của tôi” trong cổng
 * NCC, để hai nơi không bao giờ lệch nhau. Trang công khai tự lo SEO, JSON-LD, đếm lượt
 * xem và danh sách nhà cung cấp liên quan; khung này chỉ vẽ hồ sơ.
 *
 * Cổng NCC truyền thêm `coverAction` và `avatarAction` để đặt nút thêm ảnh đúng vị trí
 * buyer nhìn thấy, và tắt các nút gửi RFQ để nhà cung cấp không tự gửi yêu cầu cho mình.
 */
export function SupplierStorefront({
  supplier: s, certificates, productCertificates = {}, categories, coverUrl, avatarUrl, synthetic,
  productLinks = true, rfqActions = true, chatAction, coverAction, avatarAction, verificationActions, nameTag = "h1", reportAction,
  showcaseImageUrl, companyAplusImageUrl, nameAside, ownerActions, avatarHint,
}: {
  /** Chỉ cổng nhà cung cấp: badge gói + nút xem trang, đặt cạnh tên công ty. */
  nameAside?: ReactNode;
  /** Chỉ cổng nhà cung cấp: nút nâng cấp gói, đặt dưới link website. */
  ownerActions?: ReactNode;
  /** Chỉ cổng nhà cung cấp: nhãn và kích thước gợi ý dưới ảnh đại diện. */
  avatarHint?: ReactNode;
  /** Đường dẫn ảnh khối nội dung; cổng nhà cung cấp dùng bản xem trước có đăng nhập. */
  showcaseImageUrl?: (path: string) => string;
  /** Cổng nhà cung cấp: ảnh A+ doanh nghiệp đi qua bản xem trước có đăng nhập. */
  companyAplusImageUrl?: (path: string) => string;
  /** Nút tải báo cáo xác minh nhà máy (PDF) cho từng mã báo cáo; trang công khai truyền vào. */
  reportAction?: (code: string) => ReactNode;
  supplier: PublicSupplierCard;
  certificates: PublicSupplierCertificate[];
  /** Tên chứng nhận áp cho từng sản phẩm (theo id), hiện trên thẻ sản phẩm. */
  productCertificates?: Record<string, string[]>;
  categories: Category[];
  coverUrl: string | null;
  avatarUrl: string | null;
  synthetic: boolean;
  /** Tắt đường dẫn sản phẩm khi hồ sơ chưa công khai để không dẫn tới trang 404. */
  productLinks?: boolean;
  /** Tắt nút gửi RFQ ở bản xem trước của chính nhà cung cấp. */
  rfqActions?: boolean;
  /** Nút Chat with supplier; trang công khai chỉ truyền khi nhà cung cấp trả lời chat được. */
  chatAction?: ReactNode;
  coverAction?: ReactNode;
  avatarAction?: ReactNode;
  /**
   * Khối chỉ nhà cung cấp thấy, chèn ngay dưới phần “Verification Status”.
   * Trang công khai không truyền prop này nên buyer không bao giờ thấy nút nộp bằng chứng.
   */
  verificationActions?: ReactNode;
  /** Cấp thẻ cho tên nhà cung cấp. Trang xem trước đã có h1 riêng nên dùng h2. */
  nameTag?: "h1" | "h2";
}) {
  const NameTag = nameTag;
  const name = safe(supplierShortName(s));
  const summary = safe(supplierSummaryDisplay(s));
  const statedProducts = safe(supplierProductsDisplay(s));
  const businessDetails = [
    { label: "Main products", value: statedProducts, wide: false },
    { label: "Markets served or targeted", value: safe(supplierMarketsDisplay(s)), wide: false },
  ].filter((item) => item.value);
  const steps = s.approved_verification_steps;
  // Nút ở đầu trang Premium: cao 44px; điện thoại xếp dọc, rộng cả hàng; desktop mỗi nút đúng nửa
  // hàng, có hay không có nút Chat (bản xem trước trong cổng không có) đều cùng kích thước.
  const rfqWidth = "h-11 w-full sm:w-auto sm:flex-none sm:basis-[calc(50%-0.25rem)]";
  const l2Scope: PublicL2Scope = s.approved_l2_scope ?? null;
  const SupplierTypeIcon = supplierTypeIcon(s.supplier_type);
  const plannedL2Scope: PublicL2Scope = s.supplier_type === "trading" ? "partner_contract" : s.supplier_type === "manufacturer" || s.supplier_type === "cooperative" ? "factory" : null;
  // Giao diện cao cấp và khối nội dung chỉ khi gói Premium/Pro còn hiệu lực; hết hạn thì
  // về bản thường, nội dung vẫn giữ trong hồ sơ.
  const premium = supplierPlanRules(s).premiumStorefront;
  // A+ doanh nghiệp (gói cao cấp) hiện ngay dưới About; có A+ thì không hiện khối Showcase cũ nữa.
  const companyAplus = premium ? readAplusModules(s.company_aplus, { supplierId: s.id, productId: COMPANY_APLUS_ID }) : [];
  const showcase = premium && !companyAplus.length ? publicShowcaseBlocks(s.showcase_blocks) : [];
  const theme = normalizeStorefrontTheme(s.storefront_theme);
  const productCategory = (p: typeof s.main_products[number]) =>
    categories.find((c) => productBelongsToCategory(p, c, categories));

  /**
   * Thẻ một sản phẩm (dùng chung cho dải ngang gói Basic và lưới gói cao cấp). Không truyền
   * `supplierHref`: tên nhà cung cấp trên thẻ chỉ là chữ, không phải link mở tab mới về chính trang này.
   */
  // Thứ tự ghim trong các sản phẩm đang hiện (giống thanh "Featured products"): #1, #2…
  const visibleFeatured = theme.featured.filter((id) => s.main_products.some((p) => p.id === id)).slice(0, STOREFRONT_MAX_FEATURED);
  const featuredRank = (id: string) => visibleFeatured.indexOf(id) + 1 || undefined;
  /** `featured`: thẻ nhỏ cho thanh sản phẩm ghim (gói cao cấp) thay cho thẻ đầy đủ. */
  const productCard = (p: typeof s.main_products[number], itemClass: string, featured = false) => {
          const rank = featured ? featuredRank(p.id) : undefined;
          const category = productCategory(p);
          const href = synthetic
            ? `/suppliers/${encodeURIComponent(s.slug || s.id)}/products/${encodeURIComponent(p.id)}`
            : category ? `/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}` : null;
          if (!href) return null;
          const approvedForm = s.form_product_cards?.[p.id];
          if (approvedForm) {
            const productName = safe(approvedForm.name);
            if (featured) return <FeaturedProductTile key={p.id} href={href} name={productName} imagePath={approvedForm.cardImagePath ?? approvedForm.imagePaths[0]}
              moq={approvedForm.moq || "On request"} leadTime={approvedForm.leadTimeText || (approvedForm.leadTimeDays ? `${approvedForm.leadTimeDays} days` : "On request")} linkable={productLinks} rank={rank} />;
            return <li key={p.id} className={itemClass}>
              <PublicProductCard href={href} imagePath={approvedForm.cardImagePath ?? approvedForm.imagePaths[0]}
                name={productName} grades={cardTitleGrades(approvedForm)} gradeRows={approvedForm.gradeRows}
                moq={approvedForm.moq} price={synthetic ? null : approvedForm.price} incoterm={approvedForm.incoterm}
                fob={approvedForm.incoterm?.toUpperCase() === "FOB"} volumePricing={approvedForm.quantityOffer?.hasVolumePricing}
                leadTimeDays={approvedForm.leadTimeDays} leadTimeText={approvedForm.leadTimeText} supplierName={name}
                verificationSteps={steps} l2Scope={l2Scope} certificates={productCertificates[p.id]} test={synthetic} linkable={productLinks} />
            </li>;
          }
          const productName = safe(publicProductTitle(p));
          const translateMoq = (rawMoq: string | null | undefined) => {
            const val = (rawMoq ?? "").replace(/\s+/g, " ").trim();
            if (!val) return "";
            const m = val.match(/^(\d+(?:[.,]\d+)?)\s*(tấn|tan|thùng|thung|bộ|bo|túi|tui|bao)(?=\s|$|[,;])(.*)$/i);
            if (!m) return val;
            const unitMap: Record<string, [string, string]> = {
              "tấn": ["metric ton", "metric tons"],
              tan: ["metric ton", "metric tons"],
              "thùng": ["carton", "cartons"],
              thung: ["carton", "cartons"],
              "bộ": ["set", "sets"],
              bo: ["set", "sets"],
              "túi": ["bag", "bags"],
              tui: ["bag", "bags"],
              bao: ["bag", "bags"],
            };
            const pair = unitMap[m[2].toLowerCase()];
            if (!pair) return val;
            const qty = Number(m[1].replace(",", "."));
            return `${m[1]} ${qty === 1 ? pair[0] : pair[1]}${m[3]}`;
          };
          const slugText = (category?.slug || "").toLowerCase();
          const configuredUnit = (category?.price_unit || "").toLowerCase();
          const isMtCategory = configuredUnit === "mt" || configuredUnit === "t" || (!configuredUnit && /rice|coffee|pepper|cassia|cinnamon|anise|spice|coconut|fruit|bean|tea|sugar/.test(slugText));
          const unitSuffix = isMtCategory ? "/MT" : "/kg";
          const canonicalOptions = (() => {
            const fromFields = category?.product_fields?.find((f) => f.key === "grade" || f.key === "product_type")?.options;
            if (fromFields?.length) return fromFields;
            const fromFilters = category?.filters?.find((f) => f.key === "grade")?.options?.map((o) => o.value);
            if (fromFilters?.length) return fromFilters;
            if (/cashew/.test(slugText)) return ["W180", "W210", "W240", "W320", "W450", "SW", "WS", "LP", "SP"];
            if (/pepper/.test(slugText)) return ["500 g/L", "550 g/L", "570 g/L", "580 g/L", "White pepper"];
            if (/rice/.test(slugText)) return ["ST25", "Jasmine", "Japonica", "5% Broken", "15% Broken", "25% Broken", "Glutinous"];
            if (/coffee/.test(slugText)) return ["Robusta G1", "Robusta G2", "Arabica G1", "Wet Polished", "Instant"];
            if (/cassia|cinnamon/.test(slugText)) return ["Cassia split", "Cassia cigarette", "Cassia whole", "Cassia powder"];
            return [];
          })();
          const optionOrder = new Map(canonicalOptions.map((opt, idx) => [opt.trim().toLowerCase(), idx]));
          const rawGradeRows = Array.isArray((p.specs as Record<string, unknown> | undefined)?.grade_rows)
            ? ((p.specs as Record<string, unknown>).grade_rows as Array<Record<string, unknown>>)
            : [];
          // Giữ metadata grade của sản phẩm cũ; tên hiển thị không bị xóa grade.
          const legacyGradeText = typeof (p.specs as Record<string, unknown> | undefined)?.grade === "string"
            ? String((p.specs as Record<string, unknown>).grade).trim()
            : "";
          const rawPrice = synthetic ? null : publicProductPrice(p, s);
          const canShowPrice = Boolean(rawPrice);
          const storefrontGradeRows = rawGradeRows
            .filter((row) => row && typeof row.grade === "string" && String(row.grade).trim() !== "")
            .map((row) => {
              const gradeText = safe(String(row.grade)).trim();
              const isCustom = row.is_custom === true;
              const minRaw = typeof row.price_min === "number" && Number.isFinite(row.price_min) ? row.price_min : null;
              const maxRaw = typeof row.price_max === "number" && Number.isFinite(row.price_max) ? row.price_max : null;
              const validPrice = canShowPrice && minRaw !== null && maxRaw !== null && minRaw > 0 && maxRaw >= minRaw;
              const rowMoq = storefrontStructuredMoq(row) ?? (safe(translateMoq(typeof row.moq === "string" ? row.moq : null)).trim() || "On request");
              const rowIncoterm = typeof row.incoterm === "string" && row.incoterm.trim() ? safe(row.incoterm).trim() : null;
              return {
                grade: gradeText,
                isCustom,
                priceMin: validPrice ? minRaw : null,
                priceMax: validPrice ? maxRaw : null,
                priceText: validPrice ? `${formatMoney(minRaw!, "USD")}${unitSuffix}` : null,
                incoterm: rowIncoterm,
                moq: rowMoq,
              };
            });
          const seenStorefrontGrades = new Set<string>();
          const storefrontGrades = storefrontGradeRows
            .filter((row) => !row.isCustom && row.grade)
            .map((row) => row.grade)
            .filter((g) => {
              const k = g.toLowerCase();
              if (seenStorefrontGrades.has(k)) return false;
              seenStorefrontGrades.add(k);
              return true;
            })
            .sort((a, b) => (optionOrder.get(a.toLowerCase()) ?? 999) - (optionOrder.get(b.toLowerCase()) ?? 999));
          const storefrontPrice = (() => {
            if (!rawPrice) return null;
            const rawCurrency = (p.currency || "USD").trim().toUpperCase();
            const unitSource = `${p.unit || ""} ${p.currency || ""}`.toLowerCase();
            const sourceIsLb = /(^|[^a-z])lb(s)?([^a-z]|$)|pound/.test(unitSource);
            const sourceIsKg = !sourceIsLb && (/(^|[^a-z])kg([^a-z]|$)|kilogram|kilo/.test(unitSource));
            const sourceIsMt = !sourceIsLb && !sourceIsKg && (/(^|[^a-z])(mt|t|ton|tonne|tons|tonnes|tấn|tan)([^a-z]|$)/.test(unitSource));
            if ((rawCurrency === "USD" || rawCurrency.startsWith("USD/")) && typeof p.ref_price === "number" && p.ref_price > 0 && (sourceIsLb || sourceIsKg || sourceIsMt)) {
              const kgFactor = sourceIsLb ? 0.45359237 : sourceIsMt ? 1000 : 1;
              const lowKg = p.ref_price / kgFactor;
              const highRaw = typeof p.ref_price_max === "number" && p.ref_price_max >= p.ref_price ? p.ref_price_max : p.ref_price;
              const highKg = highRaw / kgFactor;
              const targetFactor = isMtCategory ? 1000 : 1;
              const lowVal = lowKg * targetFactor;
              const highVal = highKg * targetFactor;
              return `${priceRangeText(lowVal, highVal, "USD")}${unitSuffix}`;
            }
            return rawPrice
              .replace(/\/\s*(mt|tonnes?|tons?|t|tấn|tan)(?=\s|$|[,;])/gi, "/MT")
              .replace(/\/\s*(thùng|thung)(?=\s|$|[,;])/gi, "/carton")
              .replace(/\/\s*(bộ|bo)(?=\s|$|[,;])/gi, "/set")
              .replace(/\/\s*(túi|tui|bao)(?=\s|$|[,;])/gi, "/bag");
          })();
          const storefrontMoq = storefrontGradeRows.length
            ? (storefrontGradeRows.find((r) => r.moq !== "On request")?.moq || "On request")
            : (storefrontStructuredMoq(p) ?? (safe(translateMoq(p.moq)).trim() || "On request"));
          const storefrontIncoterm = storefrontGradeRows[0]?.incoterm || (p.incoterm ? safe(p.incoterm).trim() : null);
          const storefrontLeadTime = (() => {
            const rawLt = p.specs && typeof p.specs === "object" ? (p.specs as Record<string, unknown>).lead_time : null;
            if (rawLt && typeof rawLt === "object") {
              const rec = rawLt as Record<string, unknown>;
              const val = typeof rec.value === "number" && Number.isFinite(rec.value) && rec.value > 0 ? Math.round(rec.value) : null;
              if (rec.unit === "on_request") return "On request";
              if (rec.unit === "weeks" && val !== null) return val === 1 ? "1 week" : `${val} weeks`;
              if (rec.unit === "days" && val !== null) return val === 1 ? "1 day" : `${val} days`;
            }
            if (typeof p.lead_time_days === "number" && p.lead_time_days > 0) {
              return p.lead_time_days === 1 ? "1 day" : `${p.lead_time_days} days`;
            }
            return "On request";
          })();
          if (featured) return <FeaturedProductTile key={p.id} href={href} name={productName} imagePath={s.product_card_image_paths?.[p.id] ?? s.product_image_paths[p.id]}
            moq={storefrontMoq} leadTime={storefrontLeadTime} linkable={productLinks} rank={rank} />;
          return <li key={p.id} className={itemClass}>
            <PublicProductCard href={href} imagePath={s.product_card_image_paths?.[p.id] ?? s.product_image_paths[p.id]}
              name={productName} grades={[...storefrontGrades, ...(legacyGradeText ? [legacyGradeText] : [])]} gradeRows={storefrontGradeRows} moq={storefrontMoq}
              price={storefrontPrice} incoterm={storefrontIncoterm} fob={storefrontIncoterm?.toUpperCase() === "FOB"}
              leadTimeDays={p.lead_time_days ?? null} leadTimeText={storefrontLeadTime} supplierName={name}
              verificationSteps={steps} l2Scope={l2Scope} certificates={productCertificates[p.id]} test={synthetic} linkable={productLinks} />
          </li>;
  };

  return <>
    {premium ? <PremiumStorefront
      supplier={s}
      theme={theme}
      name={name}
      nameTag={nameTag}
      typeBadge={<span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-700"><SupplierTypeIcon className="h-5 w-5 shrink-0" aria-hidden="true" />{supplierTypeLabel(s)}{s.private_label ? " · Private label stated" : ""}</span>}
      location={safe(supplierProvinceDisplay(s)) ? `${safe(supplierProvinceDisplay(s))}, Vietnam` : "Vietnam"}
      checks={<div className="flex flex-wrap items-center gap-2" aria-label="Published supplier checks">
        {VERIFICATION_DISPLAY_ORDER.filter((level) => steps.includes(level)).map((level) => {
          const Icon = VERIFICATION_LEVEL_ICONS[level];
          return <span key={level} className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-3 py-1 text-xs font-semibold text-success">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />{level === 1 ? "Business registration checked" : verificationLabel(level, l2Scope)}
          </span>;
        })}
        <a href="#verification" className="text-xs font-semibold text-brand-700 underline underline-offset-4">View supplier checks</a>
      </div>}
      actions={!synthetic ? <>
        {/* Hai nút mỗi nút nửa hàng; không có nút Chat thì nút báo giá vẫn nửa hàng, không kéo hết khung. */}
        {rfqActions
          ? <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className={`inline-flex ${rfqWidth} items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[var(--sf-dark)] shadow-sm transition hover:bg-white/90`}>Request a quote <ArrowRight className="h-4 w-4" /></Link>
          : <span className={`inline-flex ${rfqWidth} items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[var(--sf-dark)] shadow-sm`}>Request a quote <ArrowRight className="h-4 w-4" /></span>}
        {/* Nút phụ trên nền ảnh: viền trắng, chữ trắng, để không lẫn với nút báo giá (nền trắng). */}
        {chatAction && <div className={`${rfqWidth} [&>button]:h-full [&>button]:w-full [&>button]:border-white/70 [&>button]:bg-transparent [&>button]:text-white [&>button]:hover:border-white [&>button]:hover:bg-white/10 [&>button]:hover:text-white`}>{chatAction}</div>}
      </> : null}
      coverUrl={coverUrl}
      avatarUrl={avatarUrl}
      coverAction={coverAction}
      avatarAction={avatarAction}
      avatarHint={avatarHint}
      nameAside={nameAside}
      ownerActions={ownerActions}
      showcase={showcase}
      fallbackImageUrl={aplusImagePaths(companyAplus).slice(0, 1).map(companyAplusImageUrl ?? ((path) => `/public-media/${path}`))[0] ?? null}
      imageUrl={showcaseImageUrl ?? mediaUrl}
    /> : <>
    <section className="mt-5 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card" aria-labelledby="supplier-name">
      {(coverUrl || coverAction) && <div className={`relative bg-ink-50 ${coverUrl ? "h-32 sm:h-44" : "h-16"}`}>
        {coverUrl && <img src={coverUrl} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
        {coverAction}
      </div>}
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-6 sm:p-8">
        <div className="min-w-0 flex-1">
          {/* Logo gọn bên trái (44px điện thoại, 56px desktop), căn giữa theo cụm tên công ty + địa chỉ. */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative w-fit shrink-0">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50 text-lg font-semibold text-ink-400 sm:h-14 sm:w-14 sm:rounded-xl sm:text-xl">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
              </div>
              {avatarAction}
            </div>
            <div className="min-w-0 flex-1">
              {nameAside
                ? <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <NameTag id="supplier-name" className="break-words text-left text-[21px] font-semibold leading-7 tracking-tight text-ink-900 sm:text-[30px] sm:leading-[38px]">{name}</NameTag>
                  {nameAside}
                </div>
                : <NameTag id="supplier-name" className="break-words text-left text-[21px] font-semibold leading-7 tracking-tight text-ink-900 sm:text-[30px] sm:leading-[38px]">{name}</NameTag>}
              {supplierProvinceDisplay(s) && <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-ink-600"><MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />{safe(supplierProvinceDisplay(s))}, Vietnam</p>}
            </div>
          </div>
          {avatarHint}
          {(s.founded_year || (typeof s.employees === "number" && s.employees > 0) || !synthetic) && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
            {!synthetic && <SupplierActivityBadge supplierId={s.id} />}
            {s.founded_year && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-brand-700" />Founded {s.founded_year}</span>}
            {typeof s.employees === "number" && s.employees > 0 && <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-brand-700" />{s.employees} employees</span>}
          </div>}
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Published supplier checks">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700"><SupplierTypeIcon className="h-5 w-5 shrink-0" aria-hidden="true" />{supplierTypeLabel(s)}</span>
            {s.private_label && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">Private label stated</span>}
            {VERIFICATION_DISPLAY_ORDER.filter((level) => steps.includes(level)).map((level) => {
              const Icon = VERIFICATION_LEVEL_ICONS[level];
              return <span key={level} className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-3 py-1 text-xs font-medium text-success">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />{level === 1 ? "Business registration checked" : verificationLabel(level, l2Scope)}
              </span>;
            })}
            <a href="#verification" className="text-xs font-medium text-brand-700 underline underline-offset-4">View supplier checks</a>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-56">
          {rfqActions && !synthetic && <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition hover:bg-brand-800">Request a quote <ArrowRight className="h-4 w-4" /></Link>}
          {!rfqActions && !synthetic && <span className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white">Request a quote <ArrowRight className="h-4 w-4" /></span>}
          {!synthetic && chatAction && <div className="[&>button]:h-11 [&>button]:w-full">{chatAction}</div>}
          {!synthetic && <SupplierWebsiteLink website={s.website} plain className="justify-center sm:max-w-64" />}
          {ownerActions}
        </div>
      </div>
    </section>
    </>}

    {/* Thanh mục: điện thoại cuộn ngang sát mép màn hình (không cắt chữ ở lề), ẩn thanh cuộn để không
        lộ vệt lạ bên dưới, mờ dần ở mép phải cho biết còn mục để cuộn. */}
    <nav aria-label="Supplier sections" className="-mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-ink-200 px-4 pb-2 text-sm font-medium text-ink-600 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [scrollbar-width:none] sm:mx-0 sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden">
      {[
        ["Products", "products"],
        ...(showcase.length > 0 ? [["Showcase", "showcase"] as const] : []),
        ["About", "about"],
        ...(companyAplus.length > 0 ? [["Capabilities", "capabilities"] as const] : []),
        ["Supplier checks", "verification"],
        ...(certificates.length > 0 ? [["Certificates", "certificates"] as const] : []),
        ...(!synthetic ? [["Company details", "company-details"] as const] : []),
      ].map(([label, id]) =>
        <a key={id} href={`#${id}`} className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 leading-5 hover:bg-white hover:text-brand-700">{label}</a>)}
      <span className="w-4 shrink-0 sm:hidden" aria-hidden="true" />
    </nav>

    {/* Hai cột từ mục Sản phẩm: cột phải (Trade overview, hỏi giá) đứng ngay đầu, bám theo khi cuộn. */}
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <section id="products" className="min-w-0 scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="products-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-brand-700">Supplier catalogue</p>
          <h2 id="products-title" className="mt-1 text-xl font-bold tracking-tight text-ink-900">Products <span className="text-base font-medium text-ink-500">({s.main_products.length})</span></h2>
          <p className="mt-1 text-sm text-ink-600">{synthetic ? "Test entries on this profile are not commercial offers." : "Listings ready to share with buyers. Prices, where shown, are references; request a quote for current terms."}</p></div>
      </div>
      {s.main_products.length ? (premium
        // Gói cao cấp: sản phẩm ghim, lọc theo danh mục khi nhiều sản phẩm, lưới tự cân đối.
        ? <PremiumProductGrid featuredIds={theme.featured} items={s.main_products.map((p) => {
            const category = productCategory(p);
            return { id: p.id, category: category ? { key: category.slug, label: category.name_i18n?.en || category.name_i18n?.vi || category.slug } : null,
              node: productCard(p, `min-w-0 ${SUPPLIER_RAIL_ITEM}`), featuredNode: productCard(p, "", true) };
          })} />
        : <SupplierProductRail productCount={s.main_products.length}>
          {s.main_products.map((p) => productCard(p, `min-w-0 ${SUPPLIER_RAIL_ITEM}`))}
        </SupplierProductRail>) : <div className="mt-5 flex items-center gap-4 rounded-xl border border-dashed border-ink-300 bg-white p-6 text-sm text-ink-600"><Package className="h-8 w-8 shrink-0 text-ink-400" /><p>{statedProducts && !synthetic
        ? "No individual product listings are available yet. See the main products below or ask Vexim about specifications and availability."
        : "No buyer-ready products are available on this profile yet. Products appear here only after the listing and shareable media meet publication requirements."}</p></div>}
    </section>

        <section id="about" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="about-title">
          <h2 id="about-title" className="text-lg font-bold text-ink-900">About this supplier</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{summary || (businessDetails.length
            ? "This supplier has not added an introduction yet. See the business details below or ask Vexim for more information."
            : "Supplier information has not been provided yet. Ask Vexim for details before making a sourcing decision.")}</p>
          {businessDetails.length > 0 && <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50/70 p-4 sm:p-5">
            <div className="border-b border-ink-200 pb-3">
              <h3 className="text-sm font-bold text-ink-900">Business details</h3>
              <p className="mt-0.5 text-xs leading-5 text-ink-500">Provided by the supplier. Confirm details when requesting a quote.</p>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {businessDetails.map((item) => <div key={item.label} className={item.wide ? "sm:col-span-2" : undefined}>
                <dt className="text-xs text-ink-500">{item.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-6 text-ink-900">{item.value}</dd>
              </div>)}
            </dl>
          </div>}
        </section>
        {companyAplus.length > 0 && <section id="capabilities" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="capabilities-title">
          <h2 id="capabilities-title" className="text-lg font-bold text-ink-900">Inside the company</h2>
          <ProductAplus modules={companyAplus} productName={name} imageUrl={companyAplusImageUrl ?? ((path) => `/public-media/${path}`)} />
          <p className="mt-6 text-xs leading-5 text-ink-500">Content provided by the supplier. It is not evidence of a Vexim check; see Supplier checks for what has been reviewed.</p>
        </section>}
        <section id="verification" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="verification-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="verification-title" className="text-lg font-bold text-ink-900">Supplier checks</h2>
              <p className="mt-1 text-sm leading-6 text-ink-600">See what has been reviewed and what each check covers.</p>
            </div>
            <span className="shrink-0 rounded-full border border-success/25 bg-success-surface px-3 py-1 text-xs font-semibold text-success">
              {VERIFICATION_ITEMS.filter(({ level }) => steps.includes(level)).length} of {VERIFICATION_ITEMS.length} checks completed</span>
          </div>
          {/* Ba thẻ ngang (điện thoại xếp dọc); nội dung, phạm vi từng bước xác minh giữ nguyên. */}
          <div className="mt-5 grid gap-3 md:grid-cols-3">
              {VERIFICATION_ITEMS.map(({ level, label: defaultLabel, pending: defaultPending, Icon }) => {
                const approvedStep = steps.includes(level);
                const scope = level === 2 ? approvedStep ? l2Scope : plannedL2Scope : null;
                const label = level === 2 ? verificationLabel(2, scope) : defaultLabel;
                const pending = level === 2 && scope === "partner_contract" ? "Covers a contract with a partner factory; not a factory inspection." : level === 2 && scope === null ? "The review scope is not specified." : defaultPending;
                const reviewStatus = approvedStep ? "Checked" : "No completed check shown";
                return <article key={level} id={level === 2 ? scope === "partner_contract" ? "partner-factory-contract" : "factory-visit" : level === 3 ? "delivery-history" : undefined}
                  className={`min-w-0 scroll-mt-24 rounded-xl border p-4 ${approvedStep ? "border-success/30 bg-success-surface/60" : "border-ink-200 bg-white"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${approvedStep ? "border-success/30 bg-white text-success" : "border-ink-200 bg-ink-50 text-ink-500"}`}>
                      <Icon aria-hidden="true" className="size-5" /></span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${approvedStep ? "bg-success text-white" : "bg-ink-100 text-ink-500"}`}>
                      {approvedStep ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : <Info aria-hidden="true" className="h-3.5 w-3.5" />}{reviewStatus}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-ink-900">{level === 1 ? "Business registration" : label}</h3>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-ink-600">
                    {level === 1 && (approvedStep ? "Business registration documents reviewed by Vexim." : pending)}
                    {level === 2 && !approvedStep && pending}
                    {level === 2 && approvedStep && (scope === "factory" || scope === "both") && <span className="block">{scope === "both" && <strong className="block">Factory review</strong>}{safe(s.public_review_summaries[2]) || "Detailed factory review scope is available on request."}</span>}
                    {level === 2 && approvedStep && (scope === "partner_contract" || scope === "both") && <span id={scope === "both" ? "partner-factory-contract" : undefined} className="mt-2 block scroll-mt-24">{scope === "both" && <strong className="block">Partner factory contract</strong>}{safe(s.partner_review_summary) || "The supplier's contract with a partner factory was reviewed. Details are available on request."}</span>}
                    {level === 2 && approvedStep && scope === null && "Review scope is available on request."}
                    {level === 3 && (approvedStep ? (safe(s.public_review_summaries[3]) || "Detailed delivery scope is available on request.") : pending)}
                  </p>
                  {level === 2 && approvedStep && (s.factory_reviews ?? []).map((review) => <div key={review.code} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white/80 px-3 py-2 ring-1 ring-ink-200">
                    <span className="text-xs font-semibold text-ink-800">{factoryReviewLabel(review)}</span>
                    <span className="text-xs text-ink-500">Reviewed by {safe(review.inspectorName)}</span>
                    {reportAction?.(review.code)}
                  </div>)}
                  {approvedStep && level !== 1 && <p className="mt-2 text-xs leading-5 text-ink-500">{level === 2 ? scope === "partner_contract" ? "The contract review does not establish ownership or a factory inspection." : scope === "both" ? "Each result applies only to its separately reviewed scope." : scope === "factory" ? "Applies only to the reviewed facility." : "Ask for the review scope." : "Applies only to the evidence reviewed; it does not by itself prove an end buyer received the goods."}</p>}
                </article>;
              })}
          </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50 px-4 py-3 text-xs leading-5 text-ink-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              <p>These checks cover specific documents or activities. Confirm product requirements before ordering.</p>
            </div>
        </section>
        {verificationActions}
        {certificates.length > 0 && (
          <section id="certificates" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="certificates-title">
            <h2 id="certificates-title" className="text-lg font-bold text-ink-900">Certificates on file</h2>
            <p className="mt-1 text-xs leading-5 text-ink-600">Images are the document copies shared by the supplier. Holder names and expiry dates come from these copies. Issuer authentication is a separate check.</p>
            <SupplierCertificateRail certificates={certificates} />
          </section>
        )}
        {s.gallery_images.length > 0 && <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="gallery-title">
          <h2 id="gallery-title" className="text-lg font-bold text-ink-900">Supplier gallery</h2>
          <p className="mt-1 text-xs text-ink-500">Shared supplier images; not evidence of factory verification.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{s.gallery_images.map((path) => <a key={path} href={publicMediaUrlAt(path, 1600)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-ink-50 ring-1 ring-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={publicMediaUrlAt(path, 400)} alt={`${name} gallery`} loading="lazy" className="h-32 w-full object-cover transition hover:scale-105 sm:h-40" />
          </a>)}</div>
        </section>}
      </div>
      <aside id="trade" className="scroll-mt-24 space-y-4 lg:sticky lg:top-24" aria-label="Trade details and enquiry">
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-card">
          <h2 className="text-base font-bold text-ink-900">Trade overview</h2>
          <p className="mt-2 text-xs leading-5 text-ink-500">Provided by the supplier. Confirm terms when requesting a quote.</p>
          <dl className="mt-2"><Fact icon={VeximMinimumOrderIcon} label="Minimum order" value={supplierMoqDisplay(s)} />
            <Fact icon={VeximExportPortIcon} label="Export ports / Incoterms" value={[...supplierPortsDisplay(s), ...supplierIncotermsDisplay(s)].join(" · ")} />
            <Fact icon={VeximLeadTimeIcon} label="Lead time" value={s.lead_time_days ? `${s.lead_time_days} days` : ""} />
            <Fact icon={VeximCapacityIcon} label={s.annual_output?.trim() ? supplierAnnualFigureLabel(supplierAnnualOutputDisplay(s)) : "Monthly capacity"} value={s.annual_output?.trim() ? supplierAnnualOutputDisplay(s) : supplierCapacityDisplay(s)} />
            <Fact icon={VeximPaymentIcon} label="Payment terms" value={supplierPaymentTermsDisplay(s)} />
            <Fact icon={VeximMarketsIcon} label="Export markets" value={supplierExportMarketsDisplay(s).join(", ")} /></dl>
          {rfqActions && !synthetic && <div className="mt-4 space-y-2"><Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className="flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-800">Request a quote <ArrowRight className="h-4 w-4" /></Link>
            <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}&sample=1`} className="flex items-center justify-center rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">Ask about samples</Link></div>}
          {!rfqActions && !synthetic && <div className="mt-4 space-y-2"><span className="flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white">Request a quote <ArrowRight className="h-4 w-4" /></span>
            <span className="flex items-center justify-center rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800">Ask about samples</span></div>}
          <p className="mt-3 text-xs leading-5 text-ink-500">Enquiries go through Vexim Trade. Supplier email and phone are not displayed publicly.</p>
        </div>
        {!synthetic && <div id="company-details" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 shadow-card">
          <h2 className="text-base font-bold text-ink-900">Company details</h2>
          <dl className="mt-2">
            <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Legal name</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(supplierLegalNameDisplay(s))}</dd></div>
            {s.trade_name && s.trade_name !== s.name && <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Trade name</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(s.trade_name)}</dd></div>}
            <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Registered address</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(supplierAddressDisplay(s)) || (supplierProvinceDisplay(s) ? `${safe(supplierProvinceDisplay(s))}, Vietnam` : "Ask Vexim for the registered address before contracting.")}</dd></div>
            <div className="py-3"><dt className="text-xs text-ink-500">Contact</dt><dd className="mt-0.5 text-sm font-semibold text-ink-800">Request an introduction through Vexim</dd></div>
          </dl>
          <p className="text-xs leading-5 text-ink-500">Legal name and registered address come from the supplier record held by Vexim. The company website is supplier-provided, not verified by Vexim. Email, phone and internal verification documents are not published.</p>
          {rfqActions
            ? <Link href={`/khieu-nai?supplier=${encodeURIComponent(s.slug || s.id)}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Report this supplier</Link>
            : <span className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Report this supplier</span>}
        </div>}
      </aside>
    </div>


  </>;
}
