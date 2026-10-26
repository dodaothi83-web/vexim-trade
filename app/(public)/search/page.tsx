import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, PackageSearch, Users } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { CategoryProductGrid } from "@/components/category-product-grid";
import { getStore } from "@/lib/db";
import { listPublicSuppliers } from "@/lib/public/catalog";
import { listPublicCategoryProducts, type PublicCategoryProduct } from "@/lib/public/product-catalog";
import { t } from "@/lib/public/i18n";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { supplierProvinceDisplay } from "@/lib/public/supplier-english";
import type { Category, CategoryFilter, Supplier } from "@/lib/types";

export const metadata: Metadata = {
  title: "Search products & suppliers | Veximtrade",
  description:
    "Search export-ready Vietnamese products, grades and verified suppliers, or send your requirements and we look for suppliers that match.",
  // Trang kết quả tìm kiếm là nội dung mỏng, lặp theo từ khoá — không cho index.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

const MAX_RESULTS_PER_CATEGORY = 12;
const MAX_PRODUCT_RESULTS = 48;
const MAX_SUPPLIER_RESULTS = 6;
const MAX_QUERY_LENGTH = 120;

function categoryDisplayName(cat: Category): string {
  return t(cat.name_i18n) || cat.slug;
}

/** Grade chips chỉ đến từ cấu hình CRM của danh mục (giống trang danh mục). */
function categoryGradeChips(category: Category): string[] {
  const filters: CategoryFilter[] = Array.isArray(category.filters) ? category.filters : [];
  const grades: string[] = [];
  for (const f of filters) {
    if ((f.key || "").toLowerCase().includes("grade") && Array.isArray(f.options)) {
      for (const o of f.options) grades.push(typeof o === "string" ? o : o.label);
    }
  }
  return grades;
}

/**
 * B1 cho search: từ khoá quyết định CÓ mặt trong kết quả hay không (AND mọi token,
 * khớp trên tên hiển thị, grade, tên NCC, tên danh mục và giá trị thuộc tính có cấu
 * trúc). Việc khớp từ khoá KHÔNG mang điểm — điểm structuredMatch vẫn chỉ thưởng
 * grade đã khai, đúng nguyên tắc không xếp hạng theo chữ gõ tay.
 */
function matchesTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

function productHaystack(product: PublicCategoryProduct, categoryName: string): string {
  return [
    product.name,
    product.grade ?? "",
    product.supplierName,
    categoryName,
    ...Object.values(product.attributes ?? {}),
  ]
    .join(" ")
    .toLowerCase();
}

function supplierHaystack(
  supplier: Pick<Supplier, "province" | "profile_translation_meta"> & {
    display_name?: string | null;
    trade_name?: string | null;
    name?: string | null;
    slug?: string | null;
  },
): string {
  return [
    supplier.display_name || "",
    supplier.trade_name || "",
    supplier.name || "",
    supplier.slug || "",
    supplierProvinceDisplay(supplier) || "",
  ]
    .join(" ")
    .toLowerCase();
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp?.q ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  const store = getStore();
  const allCategories = await store.listCategories({ publishedOnly: false }).catch(() => [] as Category[]);
  const visibleCategories = allCategories
    .filter((c) => c.status === "published" && c.is_published)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slug.localeCompare(b.slug));

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Search" }]} />
      <h1 className="mt-4 text-[32px] font-black leading-[1.05] text-ink-900 sm:text-[42px]">
        {query ? "Search results" : "Search the marketplace"}
      </h1>
      <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">
        {query
          ? <>Products and suppliers matching <strong className="font-bold text-ink-900">“{query}”</strong>.</>
          : "Use the search box to find products, grades and suppliers — e.g. W320 cashew, white pepper, jasmine rice."}
      </p>
      {query ? (
        <SearchResults query={query} tokens={tokens} categories={visibleCategories} />
      ) : (
        <BrowsePrompt categories={visibleCategories} />
      )}
    </div>
  );
}

function BrowsePrompt({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;
  return (
    <section className="mt-8" aria-label="Browse categories">
      <h2 className="text-xs font-bold uppercase tracking-widest text-ink-500">Browse categories</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/products/${encodeURIComponent(c.slug)}`}
            className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-bold text-ink-700 transition hover:border-brand-500 hover:text-brand-700"
          >
            {categoryDisplayName(c)}
          </Link>
        ))}
      </div>
    </section>
  );
}

async function SearchResults({ query, tokens, categories }: { query: string; tokens: string[]; categories: Category[] }) {
  // Cùng đường ống gate + xếp hạng của trang danh mục: sản phẩm must pass mọi cổng công
  // khai, xếp theo tầng xác minh rồi điểm chất lượng trong tầng. Từ khoá chỉ lọc thêm.
  const [categoryProducts, suppliers] = await Promise.all([
    Promise.all(
      categories.map(async (category) => ({
        category,
        products: await listPublicCategoryProducts(category).catch(() => [] as PublicCategoryProduct[]),
      })),
    ),
    listPublicSuppliers().catch(() => []),
  ]);

  const groups: Array<{ category: Category; name: string; products: PublicCategoryProduct[] }> = [];
  const seenProductIds = new Set<string>();
  for (const { category, products } of categoryProducts) {
    const name = categoryDisplayName(category);
    const matched = products.filter(
      (p) => !seenProductIds.has(p.id) && matchesTokens(productHaystack(p, name), tokens),
    );
    for (const product of matched) seenProductIds.add(product.id);
    if (matched.length) groups.push({ category, name, products: matched });
  }

  let remaining = MAX_PRODUCT_RESULTS;
  const shownGroups = groups
    .map((group) => {
      const shown = group.products.slice(0, Math.min(MAX_RESULTS_PER_CATEGORY, remaining));
      remaining -= shown.length;
      return { ...group, shown };
    })
    .filter((group) => group.shown.length > 0);
  const totalProducts = seenProductIds.size;

  const supplierMatches = suppliers
    .filter((s) => !s.is_demo && !isSyntheticSupplier(s) && matchesTokens(supplierHaystack(s), tokens))
    .slice(0, MAX_SUPPLIER_RESULTS);

  if (!shownGroups.length && !supplierMatches.length) {
    return (
      <section className="mt-10 rounded-xl border border-ink-200 bg-white p-8 text-center">
        <PackageSearch className="mx-auto h-10 w-10 text-ink-300" aria-hidden />
        <h2 className="mt-4 text-lg font-bold text-ink-900">No matches for “{query}”</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
          Try fewer or different words — a grade like <em>W320</em>, a commodity like <em>cashew</em>, or a province.
          Or send us your requirements and we look for suppliers that match.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link href="/rfq" className="btn btn-primary inline-flex items-center gap-1.5">
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/#categories" className="btn inline-flex items-center gap-1.5 border border-ink-200 bg-white">
            Browse categories
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <p className="mt-4 text-[12.5px] font-semibold uppercase tracking-[0.16em] text-brand-700">
        {totalProducts > 0 && (
          <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">
            {totalProducts} product{totalProducts > 1 ? "s" : ""}
          </span>
        )}
        {supplierMatches.length > 0 && (
          <span className="ml-2 inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">
            {supplierMatches.length} supplier{supplierMatches.length > 1 ? "s" : ""}
          </span>
        )}
      </p>

      {supplierMatches.length > 0 && (
        <section className="mt-8" aria-label="Matching suppliers">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
            <Users className="h-5 w-5 text-brand-700" aria-hidden /> Suppliers
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {supplierMatches.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/suppliers/${encodeURIComponent(s.slug || s.id)}`}
                  className="group flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-500"
                >
                  <span className="font-bold text-ink-900 group-hover:text-brand-700">
                    {s.display_name || s.trade_name || s.name}
                  </span>
                  <span className="mt-1 text-xs text-ink-500">
                    {supplierProvinceDisplay(s) || "Vietnam"}
                    {s.approved_verification_steps.length > 0
                      ? ` · ${s.approved_verification_steps.length} verified check${s.approved_verification_steps.length > 1 ? "s" : ""}`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shownGroups.map(({ category, name, shown, products }) => (
        <section key={category.id} className="mt-10" aria-label={`${name} results`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-bold text-ink-900">{name}</h2>
            <Link
              href={`/products/${encodeURIComponent(category.slug)}`}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-900"
            >
              View all {name.toLowerCase()} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <CategoryProductGrid
            products={shown}
            categorySlug={category.slug}
            grades={categoryGradeChips(category)}
            sponsored={null}
            productFields={category.product_fields ?? []}
          />
          {products.length > shown.length && (
            <p className="mt-3 text-xs text-ink-500">
              Showing {shown.length} of {products.length} matching products in this category.
            </p>
          )}
        </section>
      ))}
    </>
  );
}
