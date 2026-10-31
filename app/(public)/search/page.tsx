import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, PackageSearch, Search, Users } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { PublicProductCard } from "@/components/public-product-card";
import { getStore } from "@/lib/db";
import { getCategoryTitle } from "@/lib/public/category-names";
import { gradeFromAttributes } from "@/lib/public/grade-resolution";
import {
  listPublicCategoryProducts,
  loadPublicProductCatalogSnapshot,
  type PublicCategoryProduct,
} from "@/lib/public/product-catalog";
import { hasProductComparisonPeer } from "@/lib/public/product-comparison";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { compareRankedProducts, SPEC_RANKING_WEIGHTS } from "@/lib/public/ranking";
import { orderSearchProducts, productSearchRelevance, type SearchRelevance } from "@/lib/public/search-ranking";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { supplierProvinceDisplay } from "@/lib/public/supplier-english";
import type { Category, Supplier } from "@/lib/types";

export const metadata: Metadata = {
  title: "Search products & suppliers | Veximtrade",
  description:
    "Search Vietnamese products, grades and suppliers, or send your requirements and we look for suppliers that match.",
  // Các trang kết quả theo từ khoá không cần lập chỉ mục.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 120;
const PRODUCT_PAGE_SIZE = 24;
const SUPPLIER_PAGE_SIZE = 12;
const CATEGORY_BATCH_SIZE = 6;

type Locale = "en" | "vi";
type Param = string | string[] | undefined;
type SearchParams = { q?: Param; cat?: Param; lang?: Param; p?: Param; s?: Param };
type SearchLinkState = { query: string; category: string; lang: Locale; productPage: number; supplierPage: number };

type ProductResult = { category: Category; categoryName: string; product: PublicCategoryProduct; relevance: SearchRelevance };
type SupplierResult = { id: string; slug: string | null; name: string; province: string; checks: number };
type Results = {
  products: ProductResult[];
  suppliers: SupplierResult[];
  directSupplierMatch: boolean;
  exactSupplierNameMatch: boolean;
  incomplete: boolean;
};

function first(value: Param): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function pageNumber(value: Param): number {
  const text = first(value);
  return /^[1-9]\d{0,5}$/.test(text) ? Number(text) : 1;
}

function categoryName(category: Category, lang: Locale): string {
  return withoutDirectContacts(getCategoryTitle(category, lang));
}

/** Không phân biệt hoa/thường hoặc dấu tiếng Việt khi tìm. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}

function searchText(values: Array<string | null | undefined>): string {
  return normalize(values.map((value) => withoutDirectContacts(value ?? "").replace(/\[contact via Vexim\]/gi, "")).join(" "));
}

function matchesTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

/** Chỉ tính danh mục con đang công khai, kể cả khi có nhiều tầng. */
function categoryScope(categories: Category[], selected: Category | undefined): Category[] {
  if (!selected) return categories;
  const included = new Set([selected.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parent_id && included.has(category.parent_id) && !included.has(category.id)) {
        included.add(category.id);
        changed = true;
      }
    }
  }
  return categories.filter((category) => included.has(category.id));
}

/** Một mặt hàng con cũng có thể được tìm bằng tên nhóm cha công khai. */
function categorySearchText(category: Category, byId: Map<string, Category>): string {
  const values: string[] = [];
  const visited = new Set<string>();
  let current: Category | undefined = category;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    values.push(current.slug, getCategoryTitle(current, "en"), getCategoryTitle(current, "vi"),
      ...Object.values(current.name_i18n ?? {}));
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return searchText(values);
}

function supplierSearchText(supplier: Pick<Supplier, "province" | "profile_translation_meta" | "display_name" | "trade_name" | "name" | "slug">): string {
  return searchText([supplier.display_name, supplier.trade_name, supplier.name, supplier.slug, supplierProvinceDisplay(supplier)]);
}

function searchHref(state: SearchLinkState): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.category) params.set("cat", state.category);
  params.set("lang", state.lang);
  if (state.productPage > 1) params.set("p", String(state.productPage));
  if (state.supplierPage > 1) params.set("s", String(state.supplierPage));
  return `/search?${params.toString()}`;
}

function localHref(path: string, lang: Locale): string {
  if (lang !== "vi") return path;
  const [base, hash] = path.split("#", 2);
  return `${base}${base.includes("?") ? "&" : "?"}lang=vi${hash ? `#${hash}` : ""}`;
}

export default async function SearchPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = first(params?.q).trim().slice(0, MAX_QUERY_LENGTH);
  const categorySlug = first(params?.cat).trim().slice(0, 200);
  const lang: Locale = first(params?.lang) === "vi" ? "vi" : "en";
  const isVi = lang === "vi";
  const tokens = normalize(query).split(/\s+/).filter(Boolean);

  let allCategories: Category[] | null = null;
  try {
    allCategories = await getStore().listCategories({ publishedOnly: false });
  } catch (error) {
    console.error("[search] could not load categories", error);
  }
  const visibleCategories = (allCategories ?? [])
    .filter((category) => category.status === "published" && category.is_published)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slug.localeCompare(b.slug));
  const selected = visibleCategories.find((category) => category.slug === categorySlug);
  const invalidCategory = !!categorySlug && !selected;
  const state: SearchLinkState = {
    query, category: categorySlug, lang,
    productPage: pageNumber(params?.p), supplierPage: pageNumber(params?.s),
  };

  let results: Results | null = null;
  let failed = !allCategories;
  if (allCategories && !invalidCategory && (query || selected)) {
    try {
      results = await findResults(tokens, visibleCategories, selected, allCategories, lang);
    } catch (error) {
      console.error("[search] could not load public catalogue", error);
      failed = true;
    }
  }

  return (
    <div lang={lang} className="mx-auto w-full max-w-7xl px-5 pb-16 pt-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: isVi ? "Trang chủ" : "Home", href: localHref("/", lang) }, { label: isVi ? "Tìm kiếm" : "Search" }]} />
      <h1 className="mt-4 text-[32px] font-black leading-[1.05] text-ink-900 sm:text-[42px]">
        {query || selected ? (isVi ? "Kết quả tìm kiếm" : "Search results") : (isVi ? "Tìm sản phẩm và nhà cung cấp" : "Search the marketplace")}
      </h1>
      <p className="mt-2 max-w-2xl break-words text-[14.5px] leading-relaxed text-ink-600">
        {query ? (isVi
          ? <>Tìm sản phẩm và nhà cung cấp cho <strong className="font-bold text-ink-900">“{query}”</strong>.</>
          : <>Products and suppliers matching <strong className="font-bold text-ink-900">“{query}”</strong>.</>)
          : (isVi ? "Nhập tên sản phẩm, quy cách hoặc nhà cung cấp; bạn cũng có thể chọn danh mục." : "Enter a product, grade or supplier name, or choose a category to browse.")}
      </p>

      <form action="/search" method="get" role="search" aria-label={isVi ? "Tìm kiếm sản phẩm và nhà cung cấp" : "Search products and suppliers"}
        className="mt-6 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="lang" value={lang} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto] sm:items-end">
          <label className="block min-w-0 text-sm font-semibold text-ink-800">
            {isVi ? "Từ khóa" : "Search terms"}
            <input type="search" name="q" maxLength={MAX_QUERY_LENGTH} defaultValue={query}
              placeholder={isVi ? "Sản phẩm, quy cách hoặc nhà cung cấp" : "Product, grade or supplier"}
              className="mt-1.5 h-12 w-full min-w-0 rounded-xl border border-ink-200 px-3 text-sm font-normal text-ink-900 focus:border-brand-600 focus:outline-none" />
          </label>
          <label className="block min-w-0 text-sm font-semibold text-ink-800">
            {isVi ? "Danh mục" : "Category"}
            <select name="cat" defaultValue={selected?.slug ?? ""}
              className="mt-1.5 h-12 w-full min-w-0 rounded-xl border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900 focus:border-brand-600 focus:outline-none">
              <option value="">{isVi ? "Tất cả danh mục" : "All categories"}</option>
              {visibleCategories.map((category) => <option key={category.id} value={category.slug}>
                {category.parent_id ? "— " : ""}{categoryName(category, lang)}
              </option>)}
            </select>
          </label>
          <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 text-sm font-bold text-white hover:bg-brand-800">
            <Search className="h-4 w-4" aria-hidden="true" />{isVi ? "Tìm kiếm" : "Search"}
          </button>
        </div>
      </form>

      {selected && <p className="mt-4 text-sm text-ink-600">
        {isVi ? "Danh mục: " : "Category: "}<strong className="text-ink-900">{categoryName(selected, lang)}</strong>
        {isVi ? " (bao gồm danh mục con)." : " (including subcategories)."}
      </p>}
      {failed ? <SearchError lang={lang} />
        : invalidCategory ? <div role="alert" className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          {isVi ? "Danh mục này không tồn tại hoặc chưa được công khai. Hãy chọn lại danh mục để tìm kiếm." : "This category is unavailable or not public. Please choose another category and search again."}
        </div>
          : results ? <SearchResults results={results} state={state} />
            : <BrowsePrompt categories={visibleCategories} lang={lang} />}
    </div>
  );
}

function SearchError({ lang, partial = false }: { lang: Locale; partial?: boolean }) {
  const isVi = lang === "vi";
  return <div role="alert" className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
    {partial
      ? (isVi ? "Một số kết quả chưa tải được. Hãy thử tìm lại để xem đầy đủ." : "Some results could not be loaded. Please search again for a complete list.")
      : (isVi ? "Chưa tải được kết quả tìm kiếm. Vui lòng thử lại sau." : "Search results could not be loaded. Please try again.")}
  </div>;
}

function BrowsePrompt({ categories, lang }: { categories: Category[]; lang: Locale }) {
  if (!categories.length) return null;
  return <section className="mt-8" aria-label={lang === "vi" ? "Xem danh mục" : "Browse categories"}>
    <h2 className="text-xs font-bold uppercase tracking-widest text-ink-500">{lang === "vi" ? "Xem danh mục" : "Browse categories"}</h2>
    <div className="mt-3 flex flex-wrap gap-2">
      {categories.map((category) => <Link key={category.id} href={localHref(`/products/${encodeURIComponent(category.slug)}`, lang)}
        className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-bold text-ink-700 transition hover:border-brand-500 hover:text-brand-700">
        {categoryName(category, lang)}
      </Link>)}
    </div>
  </section>;
}

async function findResults(tokens: string[], categories: Category[], selected: Category | undefined, allCategories: Category[], lang: Locale): Promise<Results> {
  // Dùng đúng cổng duyệt, media, giá và xếp hạng của catalogue hiện tại. Chỉ chia
  // sẻ dữ liệu gốc giữa các danh mục ở server; không gửi bản ghi gốc sang trình duyệt.
  const snapshot = await loadPublicProductCatalogSnapshot({ categories: allCategories });
  const scoped = categoryScope(categories, selected);
  const byCategoryId = new Map(categories.map((category) => [category.id, category]));
  const supplierText = new Map(snapshot.suppliers.map((supplier) => [supplier.id, supplierSearchText(supplier)]));
  const eligibleSupplierIds = new Set<string>();
  const productMatchSupplierIds = new Set<string>();
  const seenProductIds = new Set<string>();
  const matches: ProductResult[] = [];
  let incomplete = false;
  const today = new Date().toISOString().slice(0, 10);

  // Giới hạn số danh mục xử lý đồng thời để không tạo bão truy vấn media/chứng nhận.
  for (let i = 0; i < scoped.length; i += CATEGORY_BATCH_SIZE) {
    const batch = scoped.slice(i, i + CATEGORY_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((category) =>
      listPublicCategoryProducts(category, { snapshot, today })));
    for (let j = 0; j < batch.length; j++) {
      const outcome = settled[j];
      if (outcome.status === "rejected") {
        incomplete = true;
        console.error("[search] could not load category", batch[j].slug, outcome.reason);
        continue;
      }
      const category = batch[j];
      const categoryText = categorySearchText(category, byCategoryId);
      const name = categoryName(category, lang);
      for (const product of outcome.value) {
        // Demo/test không phải là kết quả mua bán, kể cả khi môi trường bật preview.
        if (product.isDemo || product.isDemoSupplier) continue;
        eligibleSupplierIds.add(product.supplierId);
        const relevance = productSearchRelevance(tokens, {
          product: searchText([product.name, ...Object.values(product.attributes ?? {})]),
          grade: searchText([product.grade, ...(product.grades ?? [])]),
          structuredGrade: searchText(product.hasGradeRows ? (product.grades ?? []) : [gradeFromAttributes(product.attributes)]),
          category: categoryText,
          // Từ khoá nhà cung cấp khai cho sản phẩm: giúp người mua gõ đúng từ mà
          // người bán dùng, nhưng không thay thế tên/grade và không phải cổng công bố.
          keywords: searchText(product.keywords ?? []),
          supplier: searchText([product.supplierName, supplierText.get(product.supplierId)]),
        });
        if (!relevance) continue;
        productMatchSupplierIds.add(product.supplierId);
        if (!seenProductIds.has(product.id)) {
          seenProductIds.add(product.id);
          matches.push({ product, category, categoryName: name, relevance });
        }
      }
    }
  }

  const availableSuppliers = snapshot.suppliers.filter((supplier) => !supplier.is_demo && !isSyntheticSupplier(supplier) &&
    (!selected || eligibleSupplierIds.has(supplier.id)));
  const directSupplierMatch = tokens.length > 0 && availableSuppliers.some((supplier) => matchesTokens(supplierText.get(supplier.id) ?? "", tokens));
  const exactSupplierNameMatch = tokens.length > 1 && availableSuppliers.some((supplier) =>
    [supplier.display_name, supplier.trade_name, supplier.name].some((name) =>
      searchText([name]).trim().replace(/\s+/g, " ") === tokens.join(" ")));
  const suppliers = availableSuppliers
    .filter((supplier) => matchesTokens(supplierText.get(supplier.id) ?? "", tokens) || productMatchSupplierIds.has(supplier.id))
    .map((supplier) => ({
      id: supplier.id,
      slug: supplier.slug || null,
      name: withoutDirectContacts(supplier.display_name || supplier.trade_name || supplier.name),
      province: withoutDirectContacts(supplierProvinceDisplay(supplier) || (lang === "vi" ? "Việt Nam" : "Vietnam")),
      checks: supplier.approved_verification_steps.length,
    }));
  // Xếp trên toàn bộ danh mục trước khi chia trang: độ khớp trước, sau đó mỗi
  // vòng một thẻ/NCC; tầng và điểm hiện tại chỉ quyết định thứ tự trong vòng.
  const products = orderSearchProducts(matches, (a, b) => compareRankedProducts(a, b, SPEC_RANKING_WEIGHTS));
  return { products, suppliers, directSupplierMatch, exactSupplierNameMatch, incomplete };
}

function SearchResults({ results, state }: { results: Results; state: SearchLinkState }) {
  const { products, suppliers, directSupplierMatch, exactSupplierNameMatch, incomplete } = results;
  const isVi = state.lang === "vi";
  const totalProducts = products.length;
  const productPages = Math.max(1, Math.ceil(totalProducts / PRODUCT_PAGE_SIZE));
  const supplierPages = Math.max(1, Math.ceil(suppliers.length / SUPPLIER_PAGE_SIZE));
  const productPage = Math.min(state.productPage, productPages);
  const supplierPage = Math.min(state.supplierPage, supplierPages);
  const linkState = { ...state, productPage, supplierPage };
  const start = (productPage - 1) * PRODUCT_PAGE_SIZE;
  const shownProducts = products.slice(start, start + PRODUCT_PAGE_SIZE);
  const shownSuppliers = suppliers.slice((supplierPage - 1) * SUPPLIER_PAGE_SIZE, supplierPage * SUPPLIER_PAGE_SIZE);
  // An exact multi-word supplier name leads, even if its words occur on a card.
  // Otherwise complete product/category matches and exact codes lead; a weak
  // product match does not displace a direct supplier match.
  const tokenCount = normalize(state.query).split(/\s+/).filter(Boolean).length;
  const productFirst = tokenCount > 0 && !exactSupplierNameMatch && (products.some(({ relevance }) =>
    relevance.productCodes > 0 || relevance.coreTokens === tokenCount) ||
    (!directSupplierMatch && products.some(({ relevance }) => relevance.coreTokens > 0)));
  const comparisonOffers = products.map(({ product, category }) => ({
    id: product.id, supplierId: product.supplierId, categorySlug: category.slug, isDemo: product.isDemo,
  }));

  if (!totalProducts && !suppliers.length) {
    if (incomplete) return <SearchError lang={state.lang} partial />;
    return <section className="mt-10 rounded-xl border border-ink-200 bg-white p-8 text-center">
      <PackageSearch className="mx-auto h-10 w-10 text-ink-300" aria-hidden="true" />
      <h2 className="mt-4 break-words text-lg font-bold text-ink-900">
        {isVi ? "Không tìm thấy kết quả" : "No matching results"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
        {isVi ? "Hãy thử từ khóa ngắn hơn, chọn danh mục khác hoặc gửi yêu cầu tìm nguồn hàng." : "Try fewer words, choose another category, or send us your sourcing requirements."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link href={localHref("/rfq", state.lang)} className="btn btn-primary inline-flex items-center gap-1.5">
          {isVi ? "Gửi yêu cầu báo giá" : "Request a quote"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link href={localHref("/#categories", state.lang)}
          className="btn inline-flex items-center gap-1.5 border border-ink-200 bg-white">
          {isVi ? "Xem danh mục" : "Browse categories"}
        </Link>
      </div>
    </section>;
  }

  const supplierSection = suppliers.length > 0 ? <section id="search-suppliers" className="mt-8 scroll-mt-24" aria-label={isVi ? "Nhà cung cấp phù hợp" : "Matching suppliers"}>
    <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900"><Users className="h-5 w-5 text-brand-700" aria-hidden="true" />{isVi ? "Nhà cung cấp" : "Suppliers"}</h2>
    <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shownSuppliers.map((supplier) => <li key={supplier.id} className="min-w-0">
        <Link href={localHref(`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`, state.lang)}
          className="group flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-500">
          <span className="break-words font-bold text-ink-900 group-hover:text-brand-700">{supplier.name}</span>
          <span className="mt-1 text-xs text-ink-500">{supplier.province}
            {supplier.checks > 0 && (isVi ? ` · Đã duyệt ${supplier.checks} nội dung xác minh` : ` · ${supplier.checks} verified check${supplier.checks === 1 ? "" : "s"}`)}
          </span>
        </Link>
      </li>)}
    </ul>
    <Pagination kind="supplier" page={supplierPage} pages={supplierPages} total={suppliers.length} size={SUPPLIER_PAGE_SIZE} state={linkState} />
  </section> : null;

  const productSection = totalProducts > 0 ? <section id="search-products" className="mt-8 scroll-mt-24" aria-label={isVi ? "Sản phẩm phù hợp" : "Matching products"}>
    <h2 className="text-lg font-bold text-ink-900">{isVi ? "Sản phẩm" : "Products"}</h2>
    <p className="mt-1 text-xs leading-5 text-ink-500">
      {state.query
        ? (isVi ? "Ưu tiên sản phẩm khớp từ khóa; xen kẽ nhà cung cấp khi có thể." : "Relevant products first; suppliers alternate when possible.")
        : (isVi ? "Xen kẽ nhà cung cấp khi có thể." : "Suppliers alternate when possible.")}
    </p>
    <ul className="mt-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {shownProducts.map(({ product, category, categoryName: name }) => {
        const slug = encodeURIComponent(category.slug);
        const productHref = localHref(`/products/${slug}/${encodeURIComponent(product.id)}`, state.lang);
        const quoteHref = localHref(`/rfq?category=${slug}&suppliers=${encodeURIComponent(product.supplierId)}&product=${encodeURIComponent(product.name)}&product_id=${encodeURIComponent(product.id)}`, state.lang);
        return <li key={product.id} className="flex min-w-0 flex-col">
          <Link href={localHref(`/products/${slug}`, state.lang)} title={name}
            aria-label={isVi ? `Xem danh mục ${name}` : `View ${name} category`}
            className="mb-2 flex min-w-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            <span className="truncate">{name}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <PublicProductCard href={productHref} imagePath={product.cardImagePath ?? product.imagePaths[0]}
              name={product.name} grades={product.cardGrades} gradeRows={product.gradeRows} moq={product.moq}
              stalePriceDays={product.quantityOffer?.stale ? product.quantityOffer.daysSinceConfirmed : undefined}
              volumePricing={product.quantityOffer?.hasVolumePricing}
              price={product.price} incoterm={product.incoterm} fob={product.incoterm?.toUpperCase() === "FOB"}
              leadTimeDays={product.leadTimeDays} leadTimeText={product.leadTimeText} supplierName={product.supplierName}
              supplierHref={localHref(`/suppliers/${encodeURIComponent(product.supplierSlug || product.supplierId)}`, state.lang)}
              quoteHref={quoteHref}
              verificationSteps={product.verificationSteps} l2Scope={product.l2Scope}
              comparison={hasProductComparisonPeer(comparisonOffers, { id: product.id, supplierId: product.supplierId, categorySlug: category.slug, isDemo: product.isDemo })
                ? { id: product.id, categorySlug: category.slug } : undefined} />
          </div>
        </li>;
      })}
    </ul>
    <Pagination kind="product" page={productPage} pages={productPages} total={totalProducts} size={PRODUCT_PAGE_SIZE} state={linkState} />
  </section> : null;

  const countClass = "rounded-full bg-brand-50 px-2.5 py-1 ring-1 ring-brand-200";
  const productCount = isVi ? `${totalProducts} sản phẩm` : `${totalProducts} product${totalProducts === 1 ? "" : "s"}`;
  const supplierCount = isVi ? `${suppliers.length} nhà cung cấp` : `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}`;
  return <>
    {incomplete && <SearchError lang={state.lang} partial />}
    <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-brand-700">
      {totalProducts > 0 ? <a href="#search-products" className={`${countClass} hover:bg-brand-100`}>{productCount}</a>
        : <span className={countClass}>{productCount}</span>}
      {suppliers.length > 0 ? <a href="#search-suppliers" className={`${countClass} hover:bg-brand-100`}>{supplierCount}</a>
        : <span className={countClass}>{supplierCount}</span>}
    </div>

    {productFirst ? productSection : supplierSection}
    {productFirst ? supplierSection : productSection}
  </>;
}

function Pagination({ kind, page, pages, total, size, state }: {
  kind: "product" | "supplier"; page: number; pages: number; total: number; size: number; state: SearchLinkState;
}) {
  if (pages <= 1) return null;
  const isVi = state.lang === "vi";
  const href = (next: number) => searchHref(kind === "product" ? { ...state, productPage: next } : { ...state, supplierPage: next });
  const range = `${(page - 1) * size + 1}–${Math.min(page * size, total)} / ${total}`;
  return <nav aria-label={isVi ? (kind === "product" ? "Trang sản phẩm" : "Trang nhà cung cấp") : (kind === "product" ? "Product pages" : "Supplier pages")}
    className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
    <p>{isVi ? `Trang ${page}/${pages}` : `Page ${page} of ${pages}`} <span className="text-ink-500">({range})</span></p>
    <div className="flex gap-2">
      {page > 1 && <Link href={href(page - 1)} className="rounded-lg border border-ink-200 px-3 py-2 font-semibold text-brand-700 hover:border-brand-500">{isVi ? "Trước" : "Previous"}</Link>}
      {page < pages && <Link href={href(page + 1)} className="rounded-lg border border-ink-200 px-3 py-2 font-semibold text-brand-700 hover:border-brand-500">{isVi ? "Tiếp" : "Next"}</Link>}
    </div>
  </nav>;
}
