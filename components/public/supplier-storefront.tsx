import Link from "next/link";
import { ArrowRight, Clock3, MapPin, Package, Users } from "lucide-react";
import { supplierTypeIcon } from "@/components/brand/vexim-icons";
import type { CSSProperties, ReactNode } from "react";

import { cardTitleGrades, PublicProductCard } from "@/components/public-product-card";
import { SupplierProductRail } from "@/components/public/supplier-product-rail";
import { SupplierWebsiteLink } from "@/components/public/supplier-website-link";
import { VERIFICATION_LEVEL_ICONS } from "@/components/verification-tier";
import { supplierShortName } from "@/lib/public/supplier-name";
import type { PublicSupplierCertificate } from "@/lib/public/certificates";
import { supplierTypeLabel, type PublicSupplierCard } from "@/lib/public/catalog";
import type { Category } from "@/lib/types";
import { verificationLabel, type PublicL2Scope } from "@/lib/verification-status";
import { publicProductTitle } from "@/lib/public/display-name";
import { formatMoney, priceRangeText } from "@/lib/products/price-display";
import { productBelongsToCategory, publicProductPrice, withoutDirectContacts } from "@/lib/public/product-selection";
import { supplierExportMarketsDisplay, supplierProductsDisplay, supplierProvinceDisplay } from "@/lib/public/supplier-english";
import { VERIFICATION_DISPLAY_ORDER } from "@/lib/types";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { publicShowcaseBlocks, type ShowcaseBlock } from "@/lib/supplier-showcase";
import { storefrontStatValue } from "@/components/public/premium-storefront";
import { PremiumHeader } from "@/components/public/premium-header";
import { CertificatesSection, ChecksSection, CompanyDetailsSection, CompanySection, GallerySection, TradeSection } from "@/components/public/storefront-sections";
import { StorefrontBlocks, type StorefrontBlockProduct } from "@/components/public/storefront-blocks";
import { defaultCommonBlocks, layoutForPlan, readStorefrontLayout, type StorefrontLayout } from "@/lib/storefront-layout";
import { normalizeStorefrontTheme, STOREFRONT_STATS, STOREFRONT_TONE_COLORS, type StorefrontTheme } from "@/lib/storefront-theme";

const mediaUrl = (path: string) => `/public-media/${path.replace(/^\//, "")}`;
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
  showcaseImageUrl, nameAside, ownerActions, coverHint, layoutOverride,
}: {
  /**
   * Chỉ cổng nhà cung cấp: xem trước bản nháp "Thiết kế trang" thay cho bản đang công khai.
   * undefined thì dùng bản đang công khai.
   */
  layoutOverride?: StorefrontLayout | null;
  /** Chỉ cổng nhà cung cấp: badge gói + nút xem trang, đặt cạnh tên công ty. */
  nameAside?: ReactNode;
  /** Chỉ cổng nhà cung cấp: nút nâng cấp gói, đặt dưới link website. */
  ownerActions?: ReactNode;
  /** Chỉ cổng nhà cung cấp: nhãn và kích thước gợi ý cạnh nút thêm ảnh bìa. */
  coverHint?: ReactNode;
  /** Đường dẫn ảnh khối nội dung; cổng nhà cung cấp dùng bản xem trước có đăng nhập. */
  showcaseImageUrl?: (path: string) => string;
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
  const statedProducts = safe(supplierProductsDisplay(s));
  const steps = s.approved_verification_steps;
  const l2Scope: PublicL2Scope = s.approved_l2_scope ?? null;
  const SupplierTypeIcon = supplierTypeIcon(s.supplier_type);
  // Giao diện cao cấp và khối nội dung chỉ khi gói Premium/Pro còn hiệu lực; hết hạn thì
  // về bản thường, nội dung vẫn giữ trong hồ sơ.
  const premium = supplierPlanRules(s).premiumStorefront;
  const showcase = premium ? publicShowcaseBlocks(s.showcase_blocks) : [];
  // Một kiểu đầu trang chung cho mọi trang Premium/Pro, rồi các khối "Thiết kế trang" đã áp dụng.
  // Nhà cung cấp chưa áp dụng bố cục mới: số liệu và khối ảnh cũ hiện thành khối tương ứng.
  const savedTheme = normalizeStorefrontTheme(s.storefront_theme);
  const layout: StorefrontLayout | null = !premium ? null
    : (layoutOverride !== undefined ? layoutOverride : readStorefrontLayout(s.storefront_layout, s.id)) ?? legacyLayout(savedTheme, showcase);
  const tone = STOREFRONT_TONE_COLORS[layout?.tone ?? savedTheme.tone];
  const toneStyle = { "--sf-accent": tone.accent, "--sf-dark": tone.dark, "--sf-tint": tone.tint } as CSSProperties;
  // Ảnh nền đầu trang: ảnh bìa, chưa có thì ảnh banner đầu tiên.
  const firstBanner = layout?.blocks.find((block) => block.type === "banner" && !block.hidden);
  const heroUrl = coverUrl ?? (firstBanner?.type === "banner" && firstBanner.images[0] ? (showcaseImageUrl ?? mediaUrl)(firstBanner.images[0]) : null);
  // Sản phẩm nổi bật đã gồm mọi sản phẩm thì không lặp lại danh mục sản phẩm bên dưới.
  const featuredBlock = layout?.blocks.find((block) => block.type === "products" && !block.hidden);
  const featuredAll = featuredBlock?.type === "products" && s.main_products.length > 0 &&
    s.main_products.every((p) => featuredBlock.product_ids.includes(p.id));
  // Trang Premium/Pro: mục lục chỉ trỏ tới khối đang hiện; trang Basic luôn có đủ các mục.
  const shown = (type: StorefrontLayout["blocks"][number]["type"]) => !layout || layout.blocks.some((block) => block.type === type && !block.hidden);
  const sectionNav = <nav aria-label="Supplier sections" className="mt-5 flex gap-2 overflow-x-auto border-b border-ink-200 pb-3 text-sm font-semibold text-ink-600">
      {[
        ["Products", featuredAll ? "featured" : "products"],
        ...(shown("company") ? [["About", "about"] as const] : []),
        ["Supplier checks", "verification"],
        ...(certificates.length > 0 && shown("certificates") ? [["Certificates", "certificates"] as const] : []),
        ...(shown("trade") ? [["Trade terms", "trade"] as const] : []),
        ...(!synthetic && shown("details") ? [["Company details", "company-details"] as const] : []),
      ].map(([label, id]) =>
        <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 hover:bg-white hover:text-brand-700">{label}</a>)}
    </nav>;
  const productCategory = (p: typeof s.main_products[number]) =>
    categories.find((c) => productBelongsToCategory(p, c, categories));

  return <>
    {premium ? <div style={toneStyle}><PremiumHeader
      name={name}
      tagline={safe(layout?.tagline ?? "")}
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
        {rfqActions
          ? <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--sf-dark)]">Request a quote <ArrowRight className="h-4 w-4" /></Link>
          : <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-bold text-white">Request a quote <ArrowRight className="h-4 w-4" /></span>}
        {chatAction && <div className="flex-1 rounded-lg bg-white text-ink-900 [&>*]:w-full">{chatAction}</div>}
      </> : null}
      coverUrl={heroUrl}
      avatarUrl={avatarUrl}
      coverAction={coverAction}
      avatarAction={avatarAction}
      coverHint={coverHint}
      nameAside={nameAside}
      ownerActions={ownerActions}
    /></div> : <>
    <section className="mt-5 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card" aria-labelledby="supplier-name">
      {(coverUrl || coverAction) && <div className={`relative bg-ink-50 ${coverUrl ? "h-32 sm:h-44" : "h-16"}`}>
        {coverUrl && <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {coverAction}
        {coverHint}
      </div>}
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-6 sm:p-8">
        <div className="flex w-fit shrink-0 flex-col items-center">
          <div className="relative w-fit">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-ink-200 bg-ink-50 text-3xl font-bold text-ink-400 sm:h-24 sm:w-24">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
            </div>
            {avatarAction}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700"><SupplierTypeIcon className="h-5 w-5 shrink-0" aria-hidden="true" />{supplierTypeLabel(s)}</span>
            {s.private_label && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">Private label stated</span>}
          </div>
          {nameAside
            ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <NameTag id="supplier-name" className="break-words text-left text-xl font-bold leading-7 tracking-tight text-ink-900 sm:text-2xl sm:leading-8">{name}</NameTag>
              {nameAside}
            </div>
            : <NameTag id="supplier-name" className="mt-2 break-words text-left text-xl font-bold leading-7 tracking-tight text-ink-900 sm:text-2xl sm:leading-8">{name}</NameTag>}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
            {supplierProvinceDisplay(s) && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand-700" />{safe(supplierProvinceDisplay(s))}, Vietnam</span>}
            {s.founded_year && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-brand-700" />Founded {s.founded_year}</span>}
            {typeof s.employees === "number" && s.employees > 0 && <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-brand-700" />{s.employees} employees</span>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Published supplier checks">
            {VERIFICATION_DISPLAY_ORDER.filter((level) => steps.includes(level)).map((level) => {
              const Icon = VERIFICATION_LEVEL_ICONS[level];
              return <span key={level} className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-3 py-1 text-xs font-semibold text-success">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />{level === 1 ? "Business registration checked" : verificationLabel(level, l2Scope)}
              </span>;
            })}
            <a href="#verification" className="text-xs font-semibold text-brand-700 underline underline-offset-4">View supplier checks</a>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {rfqActions && !synthetic && <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800">Request a quote <ArrowRight className="h-4 w-4" /></Link>}
          {!rfqActions && !synthetic && <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white">Request a quote <ArrowRight className="h-4 w-4" /></span>}
          {!synthetic && chatAction}
          {!synthetic && <SupplierWebsiteLink website={s.website} plain className="justify-center sm:max-w-64" />}
          {ownerActions}
        </div>
      </div>
    </section>
    </>}

    {premium && sectionNav}
    {layout && <StorefrontBlocks layout={sanitizeLayout(layoutForPlan(layout, supplierPlanRules(s).plan === "pro"))} data={{
      categories: storefrontCategoryGroups(s.main_products, productCategory, productLinks && !synthetic,
        (id) => { const form = s.form_product_cards?.[id]; const image = form ? form.cardImagePath ?? form.imagePaths[0] : s.product_card_image_paths[id]; return image ? mediaUrl(image) : null; }),
      sections: {
        company: <CompanySection s={s} />,
        checks: <ChecksSection s={s} reportAction={reportAction} />,
        trade: <TradeSection s={s} rfqActions={rfqActions} synthetic={synthetic} premium />,
        companyDetails: synthetic ? undefined : <CompanyDetailsSection s={s} rfqActions={rfqActions} premium />,
        certificates: certificates.length ? <CertificatesSection certificates={certificates} /> : undefined,
        gallery: s.gallery_images.length ? <GallerySection s={s} /> : undefined,
      },
      certificates: certificates.map((c) => ({ name: safe(c.shortName || c.name),
        detail: [c.holderMatch === "partner" ? "Held by a partner facility" : "", c.validUntil ? `Valid until ${c.validUntil}` : ""].filter(Boolean).join(" · ") })),
      statValues: Object.fromEntries(STOREFRONT_STATS.map((stat) => [stat, storefrontStatValue(s, stat)])),
      markets: supplierExportMarketsDisplay(s).map((market) => safe(market)).filter(Boolean),
      products: Object.fromEntries(s.main_products.map((p): [string, StorefrontBlockProduct] => {
        const category = productCategory(p);
        const href = !productLinks ? null : synthetic
          ? `/suppliers/${encodeURIComponent(s.slug || s.id)}/products/${encodeURIComponent(p.id)}`
          : category ? `/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}` : null;
        const form = s.form_product_cards?.[p.id];
        const image = form ? form.cardImagePath ?? form.imagePaths[0] : s.product_card_image_paths[p.id];
        return [p.id, { name: safe(form ? form.name : publicProductTitle(p)), imageUrl: image ? mediaUrl(image) : null, href,
          detail: category ? safe(category.name_i18n?.en || "") : undefined }];
      })),
      imageUrl: showcaseImageUrl ?? mediaUrl,
    }} />}

    {!premium && sectionNav}

    {!(premium && featuredAll) && <section id="products" style={premium ? toneStyle : undefined}
      className={premium ? "mt-10 scroll-mt-24" : "mt-10 scroll-mt-24 border-t border-ink-200 pt-10"} aria-labelledby="products-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className={`text-xs font-bold uppercase tracking-widest ${premium ? "text-[var(--sf-accent)]" : "text-brand-700"}`}>{premium ? "Catalogue" : "Supplier catalogue"}</p>
          <h2 id="products-title" className="mt-1 text-2xl font-bold tracking-tight text-ink-900">{premium ? "All products" : "Products"} <span className="text-base font-medium text-ink-500">({s.main_products.length})</span></h2>
          <p className="mt-1 text-sm text-ink-600">{synthetic ? "Test entries on this profile are not commercial offers." : "Listings ready to share with buyers. Prices, where shown, are references; request a quote for current terms."}</p></div>
      </div>
      {s.main_products.length ? <SupplierProductRail productCount={s.main_products.length}>
        {s.main_products.map((p) => {
          const category = productCategory(p);
          const href = synthetic
            ? `/suppliers/${encodeURIComponent(s.slug || s.id)}/products/${encodeURIComponent(p.id)}`
            : category ? `/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}` : null;
          if (!href) return null;
          const approvedForm = s.form_product_cards?.[p.id];
          if (approvedForm) {
            const productName = safe(approvedForm.name);
            return <li key={p.id} className="min-w-0 lg:w-[calc((100%_-_4rem)/5)] lg:shrink-0">
              <PublicProductCard href={href} imagePath={approvedForm.cardImagePath ?? approvedForm.imagePaths[0]}
                name={productName} grades={cardTitleGrades(approvedForm)} gradeRows={approvedForm.gradeRows}
                moq={approvedForm.moq} price={synthetic ? null : approvedForm.price} incoterm={approvedForm.incoterm}
                fob={approvedForm.incoterm?.toUpperCase() === "FOB"} volumePricing={approvedForm.quantityOffer?.hasVolumePricing}
                leadTimeDays={approvedForm.leadTimeDays} leadTimeText={approvedForm.leadTimeText} supplierName={name}
                supplierHref={productLinks ? `/suppliers/${encodeURIComponent(s.slug || s.id)}` : undefined}
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
          return <li key={p.id} className="min-w-0 lg:w-[calc((100%_-_4rem)/5)] lg:shrink-0">
            <PublicProductCard href={href} imagePath={s.product_card_image_paths?.[p.id] ?? s.product_image_paths[p.id]}
              name={productName} grades={[...storefrontGrades, ...(legacyGradeText ? [legacyGradeText] : [])]} gradeRows={storefrontGradeRows} moq={storefrontMoq}
              price={storefrontPrice} incoterm={storefrontIncoterm} fob={storefrontIncoterm?.toUpperCase() === "FOB"}
              leadTimeDays={p.lead_time_days ?? null} leadTimeText={storefrontLeadTime} supplierName={name}
              supplierHref={productLinks ? `/suppliers/${encodeURIComponent(s.slug || s.id)}` : undefined}
              verificationSteps={steps} l2Scope={l2Scope} certificates={productCertificates[p.id]} test={synthetic} linkable={productLinks} />
          </li>;
        })}
      </SupplierProductRail> : <div className="mt-5 flex items-center gap-4 rounded-xl border border-dashed border-ink-300 bg-white p-6 text-sm text-ink-600"><Package className="h-8 w-8 shrink-0 text-ink-400" /><p>{statedProducts && !synthetic
        ? "No individual product listings are available yet. See the main products below or ask Vexim about specifications and availability."
        : "No buyer-ready products are available on this profile yet. Products appear here only after the listing and shareable media meet publication requirements."}</p></div>}
    </section>}

    {/* Trang Basic: các mục chung trong khung cố định. Trang Premium/Pro: các mục này là khối
        "Thiết kế trang" ở trên; chỉ còn khung bước xác minh mà riêng nhà cung cấp thấy. */}
    {premium ? verificationActions && <div className="mt-8">{verificationActions}</div>
      : <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section id="about" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="about-title">
          <h2 id="about-title" className="text-lg font-bold text-ink-900">About this supplier</h2>
          <CompanySection s={s} />
        </section>
        <section id="verification" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="verification-title">
          <h2 id="verification-title" className="text-lg font-bold text-ink-900">Supplier checks</h2>
          <p className="mt-1 text-sm leading-6 text-ink-600">See what has been reviewed and what each check covers.</p>
          <ChecksSection s={s} reportAction={reportAction} />
        </section>
        {verificationActions}
        {certificates.length > 0 && (
          <section id="certificates" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="certificates-title">
            <h2 id="certificates-title" className="text-lg font-bold text-ink-900">Certificates on file</h2>
            <CertificatesSection certificates={certificates} />
          </section>
        )}
        {s.gallery_images.length > 0 && <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="gallery-title">
          <h2 id="gallery-title" className="text-lg font-bold text-ink-900">Supplier gallery</h2>
          <GallerySection s={s} />
        </section>}
      </div>
      <aside id="trade" className="scroll-mt-24 space-y-4 lg:sticky lg:top-24" aria-label="Trade details and enquiry">
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-card">
          <h2 className="text-base font-bold text-ink-900">Trade overview</h2>
          <TradeSection s={s} rfqActions={rfqActions} synthetic={synthetic} />
        </div>
        {!synthetic && <div id="company-details" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 shadow-card">
          <h2 className="text-base font-bold text-ink-900">Company details</h2>
          <CompanyDetailsSection s={s} rfqActions={rfqActions} />
        </div>}
      </aside>
    </div>}
  </>;
}

/** Chữ trong bố cục đã kiểm khi lưu; lọc liên hệ thêm một lần lúc hiển thị như mọi chữ công khai. */
function sanitizeLayout(layout: StorefrontLayout): StorefrontLayout {
  return { ...layout, tagline: safe(layout.tagline), blocks: layout.blocks.map((block) =>
    block.type === "banner" ? { ...block, eyebrow: safe(block.eyebrow), headline: safe(block.headline) }
      : block.type === "about" ? { ...block, title: safe(block.title), body: safe(block.body) } : block) };
}

/** Trang Premium/Pro chưa áp dụng bố cục mới: số liệu đã chọn và khối ảnh cũ hiện thành khối. */
function legacyLayout(theme: StorefrontTheme, showcase: ShowcaseBlock[]): StorefrontLayout {
  return { v: 2, tone: theme.tone, tagline: theme.tagline, blocks: [
    ...(theme.stats.length ? [{ id: "legacy-stats", type: "stats" as const, stats: theme.stats }] : []),
    ...showcase.map((block) => ({ id: `legacy-${block.id}`.slice(0, 40), type: "about" as const, image_path: block.image_path, title: block.title, body: block.body })),
    ...defaultCommonBlocks(),
  ] };
}

/** Nhóm sản phẩm đang đăng theo danh mục cho khối Nhóm sản phẩm (gói Pro). */
function storefrontCategoryGroups<P extends { id: string }>(products: P[], categoryOf: (p: P) => Category | undefined, linkable: boolean,
  imageOf: (id: string) => string | null): { name: string; href: string | null; count: number; imageUrl: string | null }[] {
  const groups = new Map<string, { name: string; href: string | null; count: number; imageUrl: string | null }>();
  for (const p of products) {
    const category = categoryOf(p);
    if (!category) continue;
    const group = groups.get(category.slug) ?? { name: safe(category.name_i18n?.en || category.slug), href: linkable ? `/products/${encodeURIComponent(category.slug)}` : null, count: 0, imageUrl: null };
    group.count++;
    group.imageUrl ??= imageOf(p.id);
    groups.set(category.slug, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
