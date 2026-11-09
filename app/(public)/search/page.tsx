import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ChevronDown, Filter, PackageSearch, Users } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { cardTitleGrades, PublicProductCard } from "@/components/public-product-card";
import { SearchFilterForm } from "@/components/public/search-filter-form";
import { getStore } from "@/lib/db";
import { supplierTypeLabel } from "@/lib/public/catalog";
import { getCategoryTitle } from "@/lib/public/category-names";
import { gradeFromAttributes } from "@/lib/public/grade-resolution";
import {
  listPublicCategoryProducts,
  loadPublicProductCatalogSnapshot,
  type PublicCategoryProduct,
} from "@/lib/public/product-catalog";
import { hasProductComparisonPeer } from "@/lib/public/product-comparison";
import {
  appendSearchFilterParams, hasProductSearchFilters, hasSearchFilters,
  matchesSearchProduct, matchesSearchSupplier, parseSearchFilters, searchFilterOptions,
  type SearchFilters, type SearchFilterOptions, type SearchSupplierFilterData,
} from "@/lib/public/search-filters";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { categoryTieWindow, compareRankedProducts, SPEC_RANKING_WEIGHTS } from "@/lib/public/ranking";
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
type SearchParams = Record<string, Param>;
type SearchTab = "products" | "suppliers";
type SearchRequestState = { query: string; category: string; lang: Locale; productPage: number; supplierPage: number; requestedTab: SearchTab | null };
type SearchLinkState = SearchRequestState & { tab: SearchTab; filters: SearchFilters };

type ProductResult = { category: Category; categoryName: string; product: PublicCategoryProduct; relevance: SearchRelevance };
type SupplierResult = SearchSupplierFilterData & { slug: string | null; name: string; province: string; checks: number; directMatch: boolean };
type Results = {
  products: ProductResult[];
  suppliers: SupplierResult[];
  /** All gated public products in the selected category scope, for direct supplier-name searches. */
  eligibleProductsBySupplier: Map<string, PublicCategoryProduct[]>;
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

function searchHref(state: SearchLinkState, options: { clearFilters?: boolean; resetPages?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.category) params.set("cat", state.category);
  params.set("lang", state.lang);
  params.set("tab", state.tab);
  if (!options.resetPages) {
    if (state.productPage > 1) params.set("p", String(state.productPage));
    if (state.supplierPage > 1) params.set("s", String(state.supplierPage));
  }
  if (!options.clearFilters) appendSearchFilterParams(params, state.filters);
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
  const requestedTab = first(params?.tab);
  const state: SearchRequestState = {
    query, category: categorySlug, lang,
    productPage: pageNumber(params?.p), supplierPage: pageNumber(params?.s),
    requestedTab: requestedTab === "products" || requestedTab === "suppliers" ? requestedTab : null,
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

      {/* Ô tìm kiếm riêng của trang này đã bỏ: header công khai giờ luôn có một ô tìm kiếm
          hiện rõ ở mọi trang (trừ trang chủ), thêm một ô nữa ngay bên dưới là thừa và gây
          nhầm "sao có hai thanh tìm kiếm". Lọc theo danh mục (select) cũng theo đó không còn
          trên trang này — vẫn chọn được qua các thẻ danh mục ở BrowsePrompt bên dưới (khi chưa
          có từ khoá) hoặc đường link `?cat=` có sẵn từ nơi khác. */}

      {selected && <p className="mt-4 text-sm text-ink-600">
        {isVi ? "Danh mục: " : "Category: "}<strong className="text-ink-900">{categoryName(selected, lang)}</strong>
        {isVi ? " (bao gồm danh mục con)." : " (including subcategories)."}
      </p>}
      {failed ? <SearchError lang={lang} />
        : invalidCategory ? <div role="alert" className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          {isVi ? "Danh mục này không tồn tại hoặc chưa được công khai. Hãy chọn lại danh mục để tìm kiếm." : "This category is unavailable or not public. Please choose another category and search again."}
        </div>
          : results ? <SearchResults results={results} state={state} params={params} categories={visibleCategories} selected={selected ?? null} />
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
  const eligibleProductIds = new Set<string>();
  const eligibleProductsBySupplier = new Map<string, PublicCategoryProduct[]>();
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
        if (!eligibleProductIds.has(product.id)) {
          eligibleProductIds.add(product.id);
          const list = eligibleProductsBySupplier.get(product.supplierId) ?? [];
          list.push(product);
          eligibleProductsBySupplier.set(product.supplierId, list);
        }
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
      location: withoutDirectContacts(supplierProvinceDisplay(supplier)),
      type: supplier.supplier_type ?? null,
      typeLabel: supplierTypeLabel(supplier),
      verificationSteps: supplier.approved_verification_steps,
      l2Scope: supplier.approved_l2_scope ?? null,
      directMatch: matchesTokens(supplierText.get(supplier.id) ?? "", tokens),
      checks: supplier.approved_verification_steps.length,
    }));
  // Xếp trên toàn bộ danh mục trước khi chia trang: độ khớp trước, sau đó mỗi
  // vòng một thẻ/NCC; tầng và điểm hiện tại chỉ quyết định thứ tự trong vòng.
  // Cùng độ khớp, cùng tầng và cùng điểm thì luân phiên theo ngày như trang danh mục.
  const tieBreak = { window: categoryTieWindow(Date.now()) };
  const products = orderSearchProducts(matches, (a, b) => compareRankedProducts(a, b, SPEC_RANKING_WEIGHTS, undefined, tieBreak));
  return { products, suppliers, eligibleProductsBySupplier, directSupplierMatch, exactSupplierNameMatch, incomplete };
}

function SearchResults({ results, state, params, categories, selected }: {
  results: Results; state: SearchRequestState; params?: SearchParams; categories: Category[]; selected: Category | null;
}) {
  const { products, suppliers, eligibleProductsBySupplier, directSupplierMatch, exactSupplierNameMatch, incomplete } = results;
  const isVi = state.lang === "vi";
  // Keyword hits contribute their public listings. A direct company-name hit may
  // filter by any of that company's eligible listings in this category scope, so
  // its facets must offer those same choices (and never private/raw products).
  const facetProducts = new Map(products.map(({ product }) => [product.id, product]));
  for (const supplier of suppliers) if (supplier.directMatch) {
    for (const product of eligibleProductsBySupplier.get(supplier.id) ?? []) facetProducts.set(product.id, product);
  }
  const options = searchFilterOptions([...facetProducts.values()], suppliers, selected);
  const filters = parseSearchFilters(params, options);
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const matchedProductsBySupplier = new Map<string, PublicCategoryProduct[]>();
  for (const { product } of products) {
    const group = matchedProductsBySupplier.get(product.supplierId) ?? [];
    group.push(product);
    matchedProductsBySupplier.set(product.supplierId, group);
  }
  // Supplier facets describe an actual published offer. For a direct company-name hit,
  // check all of that company's eligible listings; for a product-keyword hit, only the
  // listings that matched the query can qualify. Never combine facets across products.
  const filteredProducts = products.filter(({ product }) => matchesSearchProduct(product, supplierById.get(product.supplierId), filters));
  const filteredSuppliers = suppliers.filter((supplier) => matchesSearchSupplier(supplier, filters) &&
    (!hasProductSearchFilters(filters) || (supplier.directMatch
      ? eligibleProductsBySupplier.get(supplier.id) ?? []
      : matchedProductsBySupplier.get(supplier.id) ?? []).some((product) => matchesSearchProduct(product, supplier, filters))));
  const totalProducts = filteredProducts.length;
  const totalSuppliers = filteredSuppliers.length;
  const tokenCount = normalize(state.query).split(/\s+/).filter(Boolean).length;
  const productFirst = tokenCount > 0 && !exactSupplierNameMatch && (filteredProducts.some(({ relevance }) =>
    relevance.productCodes > 0 || relevance.coreTokens === tokenCount) ||
    (!directSupplierMatch && filteredProducts.some(({ relevance }) => relevance.coreTokens > 0)));
  // A category browse opens products. Exact company searches still open suppliers first;
  // either tab can be explicitly selected, including when it has zero results.
  const tab: SearchTab = state.requestedTab ?? (totalProducts === 0 && totalSuppliers > 0 ? "suppliers"
    : totalSuppliers > 0 && directSupplierMatch && !productFirst ? "suppliers" : "products");
  const productPages = Math.max(1, Math.ceil(totalProducts / PRODUCT_PAGE_SIZE));
  const supplierPages = Math.max(1, Math.ceil(totalSuppliers / SUPPLIER_PAGE_SIZE));
  const productPage = Math.min(state.productPage, productPages);
  const supplierPage = Math.min(state.supplierPage, supplierPages);
  const linkState: SearchLinkState = { ...state, tab, filters, productPage, supplierPage };
  const clearHref = searchHref(linkState, { clearFilters: true, resetPages: true });
  const shownProducts = filteredProducts.slice((productPage - 1) * PRODUCT_PAGE_SIZE, productPage * PRODUCT_PAGE_SIZE);
  const shownSuppliers = filteredSuppliers.slice((supplierPage - 1) * SUPPLIER_PAGE_SIZE, supplierPage * SUPPLIER_PAGE_SIZE);
  const comparisonOffers = filteredProducts.map(({ product, category }) => ({
    id: product.id, supplierId: product.supplierId, categorySlug: category.slug, isDemo: product.isDemo,
  }));

  // An empty category/keyword search still needs both tabs and the category
  // dropdown: otherwise buyers cannot recover from a zero-result category here.
  if (!products.length && !suppliers.length && incomplete) return <SearchError lang={state.lang} partial />;
  const noUnfilteredResults = !products.length && !suppliers.length;

  const productSection = totalProducts > 0 ? <section id="search-products" className="scroll-mt-24" aria-label={isVi ? "Sản phẩm phù hợp" : "Matching products"}>
    <h2 className="sr-only">{isVi ? "Sản phẩm" : "Products"}</h2>
    <p className="mb-4 text-xs leading-5 text-ink-500">
      {state.query
        ? (isVi ? "Ưu tiên sản phẩm khớp từ khóa; xen kẽ nhà cung cấp khi có thể." : "Relevant products first; suppliers alternate when possible.")
        : (isVi ? "Xen kẽ nhà cung cấp khi có thể." : "Suppliers alternate when possible.")}
    </p>
    <ul className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
      {shownProducts.map(({ product, category, categoryName: name }) => {
        const slug = encodeURIComponent(category.slug);
        const productHref = localHref(`/products/${slug}/${encodeURIComponent(product.id)}`, state.lang);
        return <li key={product.id} className="flex min-w-0 flex-col">
          <Link href={localHref(`/products/${slug}`, state.lang)} title={name}
            aria-label={isVi ? `Xem danh mục ${name}` : `View ${name} category`}
            className="mb-2 flex min-w-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            <span className="truncate">{name}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <PublicProductCard href={productHref} imagePath={product.cardImagePath ?? product.imagePaths[0]}
              name={product.name} grades={cardTitleGrades(product)} gradeRows={product.gradeRows} moq={product.moq}
              highlightedGrades={filters.grades}
              stalePriceDays={product.quantityOffer?.stale ? product.quantityOffer.daysSinceConfirmed : undefined}
              volumePricing={product.quantityOffer?.hasVolumePricing}
              price={product.price} incoterm={product.incoterm} fob={product.incoterm?.toUpperCase() === "FOB"}
              leadTimeDays={product.leadTimeDays} leadTimeText={product.leadTimeText} supplierName={product.supplierName}
              supplierHref={localHref(`/suppliers/${encodeURIComponent(product.supplierSlug || product.supplierId)}`, state.lang)}
              verificationSteps={product.verificationSteps} l2Scope={product.l2Scope} certificates={product.certificates}
              comparison={hasProductComparisonPeer(comparisonOffers, { id: product.id, supplierId: product.supplierId, categorySlug: category.slug, isDemo: product.isDemo })
                ? { id: product.id, categorySlug: category.slug } : undefined} />
          </div>
        </li>;
      })}
    </ul>
    <Pagination kind="product" page={productPage} pages={productPages} total={totalProducts} size={PRODUCT_PAGE_SIZE} state={linkState} />
  </section> : null;

  const supplierSection = totalSuppliers > 0 ? <section id="search-suppliers" className="scroll-mt-24" aria-label={isVi ? "Nhà cung cấp phù hợp" : "Matching suppliers"}>
    <h2 className="sr-only">{isVi ? "Nhà cung cấp" : "Suppliers"}</h2>
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {shownSuppliers.map((supplier) => <li key={supplier.id} className="min-w-0">
        <Link href={localHref(`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`, state.lang)}
          target="_blank" rel="noopener noreferrer"
          className="group flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-500">
          <span className="break-words font-bold text-ink-900 group-hover:text-brand-700">{supplier.name}</span>
          <span className="mt-1 text-xs text-ink-500">{supplier.province}
            {supplier.checks > 0 && (isVi ? ` · Đã duyệt ${supplier.checks} nội dung xác minh` : ` · ${supplier.checks} verified check${supplier.checks === 1 ? "" : "s"}`)}
          </span>
        </Link>
      </li>)}
    </ul>
    <Pagination kind="supplier" page={supplierPage} pages={supplierPages} total={totalSuppliers} size={SUPPLIER_PAGE_SIZE} state={linkState} />
  </section> : null;

  const tabs = [
    { key: "products" as const, label: isVi ? "Sản phẩm" : "Products", count: totalProducts, Icon: PackageSearch },
    { key: "suppliers" as const, label: isVi ? "Nhà cung cấp" : "Suppliers", count: totalSuppliers, Icon: Users },
  ];
  const activeFilters = hasSearchFilters(filters);
  const fieldProps = { filters, options, categories, state: linkState, clearHref };
  const activeTotal = tab === "products" ? totalProducts : totalSuppliers;
  const otherTab: SearchTab = tab === "products" ? "suppliers" : "products";
  const otherCount = tab === "products" ? totalSuppliers : totalProducts;
  const filterTitle = tab === "products" ? (isVi ? "Lọc sản phẩm" : "Filter products") : (isVi ? "Lọc nhà cung cấp" : "Filter suppliers");
  return <>
    {incomplete && <SearchError lang={state.lang} partial />}
    <nav aria-label={isVi ? "Loại kết quả tìm kiếm" : "Search result types"} className="mt-8 flex gap-1 border-b border-ink-200">
      {tabs.map(({ key, label, count, Icon }) => <Link key={key} href={searchHref({ ...linkState, tab: key })}
        prefetch={false} scroll={false} aria-current={tab === key ? "page" : undefined}
        className={`-mb-px inline-flex min-h-12 items-center gap-2 border-b-[3px] px-3 text-sm font-bold transition sm:px-5 ${tab === key
          ? "border-brand-700 text-brand-800" : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800"}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{label}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${tab === key ? "bg-brand-50 text-brand-800" : "bg-ink-50 text-ink-600"}`}>{count}</span>
      </Link>)}
    </nav>
    <div className="mt-6 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-ink-200 bg-white p-4">
          <h2 className="mb-5 flex items-center gap-2 font-bold text-ink-900"><Filter className="h-4 w-4" aria-hidden="true" />{filterTitle}</h2>
          <SearchFilterForm key={searchHref(linkState)} applyLabel={isVi ? "Áp dụng" : "Apply filters"} pendingLabel={isVi ? "Đang lọc…" : "Updating…"}>
            <SearchFilterFields {...fieldProps} />
          </SearchFilterForm>
        </div>
      </aside>
      <div className="min-w-0">
        <details className="mb-4 rounded-xl border border-ink-200 bg-white lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-ink-800">
            <span className="flex items-center gap-2"><Filter className="h-4 w-4" aria-hidden="true" />{filterTitle}</span><ChevronDown className="h-4 w-4" aria-hidden="true" />
          </summary>
          <div className="border-t border-ink-100 p-4">
            <SearchFilterForm key={searchHref(linkState)} applyLabel={isVi ? "Áp dụng" : "Apply filters"} pendingLabel={isVi ? "Đang lọc…" : "Updating…"}>
              <SearchFilterFields {...fieldProps} />
            </SearchFilterForm>
          </div>
        </details>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-600" aria-live="polite">
          <p><strong className="text-ink-900">{activeTotal}</strong> {tab === "products"
            ? isVi ? "sản phẩm" : activeTotal === 1 ? "product" : "products"
            : isVi ? "nhà cung cấp" : activeTotal === 1 ? "supplier" : "suppliers"}
            {activeFilters && <span className="text-ink-500">{isVi ? " phù hợp bộ lọc" : " match the filters"}</span>}
          </p>
          {activeFilters && <Link href={clearHref} className="text-xs font-semibold text-brand-700 underline">{isVi ? "Xóa bộ lọc" : "Clear filters"}</Link>}
        </div>
        {activeTotal > 0 ? tab === "products" ? productSection : supplierSection
          : noUnfilteredResults ? <section className="rounded-xl border border-ink-200 bg-white p-8 text-center">
            <PackageSearch className="mx-auto h-10 w-10 text-ink-300" aria-hidden="true" />
            <h2 className="mt-4 break-words text-lg font-bold text-ink-900">{isVi ? "Không tìm thấy kết quả" : "No matching results"}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
              {isVi ? "Hãy thử từ khóa ngắn hơn, chọn danh mục khác hoặc gửi yêu cầu tìm nguồn hàng." : "Try fewer words, choose another category, or send us your sourcing requirements."}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link href={localHref("/rfq", state.lang)} className="btn btn-primary inline-flex items-center gap-1.5">
                {isVi ? "Gửi yêu cầu báo giá" : "Request a quote"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href={localHref("/#categories", state.lang)} className="btn inline-flex items-center gap-1.5 border border-ink-200 bg-white">
                {isVi ? "Xem danh mục" : "Browse categories"}
              </Link>
            </div>
          </section>
          : <section className="rounded-xl border border-ink-200 bg-white p-8 text-center">
            <h2 className="font-bold text-ink-900">{isVi
              ? tab === "products" ? "Không có sản phẩm phù hợp" : "Không có nhà cung cấp phù hợp"
              : tab === "products" ? "No matching products" : "No matching suppliers"}</h2>
            <p className="mt-2 text-sm text-ink-600">{isVi ? "Thử bộ lọc khác hoặc xem loại kết quả còn lại." : "Try other filters or switch result types."}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm font-semibold text-brand-700">
              {activeFilters && <Link href={clearHref} className="underline">{isVi ? "Xóa bộ lọc" : "Clear filters"}</Link>}
              {otherCount > 0 && <Link href={searchHref({ ...linkState, tab: otherTab })} className="underline">
                {isVi ? otherTab === "products" ? "Xem sản phẩm" : "Xem nhà cung cấp" : otherTab === "products" ? "View products" : "View suppliers"}
              </Link>}
            </div>
          </section>}
      </div>
    </div>
  </>;
}

function SearchFilterFields({ filters, options, categories, state, clearHref }: {
  filters: SearchFilters; options: SearchFilterOptions; categories: Category[]; state: SearchLinkState; clearHref: string;
}) {
  const vi = state.lang === "vi";
  const label = "mb-2 block text-xs font-bold uppercase tracking-widest text-ink-500";
  const visibleAttributes = options.attributes.filter((field) => {
    if (!field.showWhen) return true;
    if (field.showWhen.key === "grade" || field.showWhen.key === "product_type") {
      return !filters.grades.length || filters.grades.includes(field.showWhen.value);
    }
    const parent = filters.attributes[field.showWhen.key];
    return !parent || parent === field.showWhen.value;
  });
  return <div className="space-y-5 text-sm">
    {state.tab === "suppliers" && <p className="text-xs leading-5 text-ink-500">
      {vi ? "Bộ lọc sản phẩm tìm nhà cung cấp có ít nhất một sản phẩm công khai phù hợp." : "Product filters find suppliers with at least one matching public offer."}
    </p>}
    {state.query && <input type="hidden" name="q" value={state.query} />}
    <input type="hidden" name="lang" value={state.lang} />
    <input type="hidden" name="tab" value={state.tab} />
    <label className="block"><span className={label}>{vi ? "Danh mục" : "Category"}</span>
      <select name="cat" className="input text-sm" defaultValue={state.category}>
        <option value="">{vi ? "Tất cả danh mục" : "All categories"}</option>
        {categories.map((category) => <option key={category.id} value={category.slug}>{categoryName(category, state.lang)}</option>)}
      </select>
    </label>
    {visibleAttributes.map((field) =>
      <label key={field.key} className="block"><span className={label}>{field.label}</span>
        <select name={`attr.${field.key}`} className="input text-sm" defaultValue={filters.attributes[field.key] ?? ""}>
          <option value="">{vi ? "Tất cả" : "All"}</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>)}
    {options.grades.length > 0 && <fieldset><legend className={label}>{vi ? "Quy cách / loại" : "Grade / type"}</legend>
      <div className="max-h-44 space-y-2 overflow-y-auto">{options.grades.map((grade) => <label key={grade} className="flex cursor-pointer items-center gap-2 text-ink-700">
        <input type="checkbox" name="grade" value={grade} defaultChecked={filters.grades.includes(grade)} />{grade}
      </label>)}</div>
    </fieldset>}
    <label className="block"><span className={label}>{vi ? "Đơn hàng tối thiểu" : "Minimum order"}</span>
      <select name="moq" className="input text-sm" defaultValue={filters.moq}>
        <option value="">{vi ? "Mọi mức MOQ" : "Any MOQ"}</option>
        <option value="small">{vi ? "Tối đa 1 tấn" : "Up to 1 ton"}</option>
        <option value="medium">{vi ? "Trên 1–5 tấn" : "Over 1–5 tons"}</option>
        <option value="large">{vi ? "Trên 5 tấn" : "Over 5 tons"}</option>
        <option value="container">{vi ? "Nguyên container" : "Full container"}</option>
        <option value="ask">{vi ? "Cần hỏi / khác" : "On request / other"}</option>
      </select>
    </label>
    <label className="block"><span className={label}>{vi ? "Thời gian giao hàng" : "Lead time"}</span>
      <select name="lead" className="input text-sm" defaultValue={filters.leadTime}>
        <option value="">{vi ? "Mọi thời gian" : "Any lead time"}</option>
        {[15, 30, 45].map((days) => <option key={days} value={days}>{vi ? `Trong ${days} ngày` : `Ships within ${days} days`}</option>)}
      </select>
    </label>
    {options.incoterms.length > 0 && <label className="block"><span className={label}>Incoterm</span>
      <select name="incoterm" className="input text-sm" defaultValue={filters.incoterm}>
        <option value="">{vi ? "Mọi điều kiện" : "All incoterms"}</option>
        {options.incoterms.map((term) => <option key={term} value={term}>{term}</option>)}
      </select>
    </label>}
    {options.sourceRegions.length > 0 && <label className="block"><span className={label}>{vi ? "Vùng nguyên liệu" : "Source region"}</span>
      <select name="region" className="input text-sm" defaultValue={filters.sourceRegion}>
        <option value="">{vi ? "Mọi vùng" : "All regions"}</option>
        {options.sourceRegions.map((region) => <option key={region} value={region}>{region}</option>)}
      </select>
    </label>}
    {options.supplierLocations.length > 0 && <label className="block"><span className={label}>{vi ? "Địa điểm nhà cung cấp" : "Supplier location"}</span>
      <select name="location" className="input text-sm" defaultValue={filters.supplierLocation}>
        <option value="">{vi ? "Mọi địa điểm" : "All locations"}</option>
        {options.supplierLocations.map((location) => <option key={location} value={location}>{location}</option>)}
      </select>
    </label>}
    {options.supplierTypes.length > 0 && <label className="block"><span className={label}>{vi ? "Loại hình nhà cung cấp" : "Supplier type"}</span>
      <select name="supplierType" className="input text-sm" defaultValue={filters.supplierType}>
        <option value="">{vi ? "Mọi loại hình" : "All supplier types"}</option>
        {options.supplierTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
      <span className="mt-1 block text-[11px] text-ink-500">{vi ? "Theo thông tin nhà cung cấp khai, không phải cấp xác minh." : "Stated by the supplier; not a verification level."}</span>
    </label>}
    <label className="block"><span className={label}>{vi ? "Xác minh nhà cung cấp" : "Supplier verification"}</span>
      <select name="verified" className="input text-sm" defaultValue={filters.verified}>
        <option value={0}>{vi ? "Mọi nhà cung cấp" : "All suppliers"}</option>
        <option value={1}>{vi ? "Đã kiểm tra giấy tờ" : "Documents checked"}</option>
        <option value={2}>{vi ? "Đã xác minh nhà máy" : "Factory verification"}</option>
        <option value={4}>{vi ? "Đã kiểm tra hợp đồng nhà máy" : "Partner factory contract reviewed"}</option>
        <option value={3}>{vi ? "Đã kiểm tra giao hàng" : "Delivery history reviewed"}</option>
      </select>
    </label>
    {options.certificates.length > 0 && <fieldset><legend className={label}>{vi ? "Chứng nhận" : "Certifications"}</legend>
      <div className="space-y-2">{options.certificates.map((cert) => <label key={cert} className="flex cursor-pointer items-center gap-2 text-ink-700">
        <input type="checkbox" name="certificate" value={cert} defaultChecked={filters.certificates.includes(cert)} />{cert}
      </label>)}</div>
    </fieldset>}
    <fieldset><legend className={label}>{vi ? "Tuỳ chọn sản phẩm" : "Product options"}</legend>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-ink-700"><input type="checkbox" name="oem" value="1" defaultChecked={filters.oemOdm} />OEM / ODM</label>
        <label className="flex cursor-pointer items-center gap-2 text-ink-700"><input type="checkbox" name="samples" value="1" defaultChecked={filters.samples} />{vi ? "Hàng mẫu" : "Samples"}</label>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-ink-500">{vi ? "Theo thông tin nhà cung cấp khai" : "Stated by the supplier"}</p>
    </fieldset>
    {hasSearchFilters(filters) && <Link href={clearHref} className="inline-block font-semibold text-brand-700 underline">{vi ? "Xóa bộ lọc" : "Clear filters"}</Link>}
  </div>;
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
