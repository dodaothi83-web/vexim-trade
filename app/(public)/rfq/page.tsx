import { redirect } from "next/navigation";
import Link from "next/link";
import { RfqForm } from "./rfq-form";
import { Breadcrumbs } from "@/components/ui";
import { getStore } from "@/lib/db";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { categoryFilterValues } from "@/lib/category-filters";
import { listPublicSuppliers } from "@/lib/public/catalog";
import { supplierShortName } from "@/lib/public/supplier-name";
import { loadRfqProductContext } from "@/lib/public/rfq-product-context";
import type { Category } from "@/lib/types";

export const metadata = {
  title: "Request a quote | Veximtrade",
  description: "Send a sourcing request and get matched with suitable Vietnamese suppliers.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function RfqPage({
  searchParams,
}: {
  searchParams?: Promise<{
    category?: string;
    product?: string;
    product_id?: string;
    grade?: string;
    suppliers?: string;
    sample?: string;
    intent?: string;
  }>;
}) {
  const sp = await searchParams;
  const store = getStore();
  const categories = await store.listCategories({ publishedOnly: true }).catch(() => []);
  const supplierIds = (sp?.suppliers ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const publicSuppliers = supplierIds.length ? await listPublicSuppliers().catch(() => []) : [];
  const initialSuppliers = supplierIds
    .map((supId) => publicSuppliers.find((s) => s.id === supId))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    // Dùng tên ngắn (tên hiển thị → tên thương mại → pháp nhân đã hạ kiểu chữ),
    // không bày tên pháp lý viết hoa toàn bộ lên đầu form.
    .map((s) => ({ id: s.id, name: supplierShortName({ name: s.name, trade_name: s.trade_name, display_name: s.display_name }) }));

  // Thẻ "You are asking about" chỉ có khi sản phẩm đã qua cổng công bố và đúng nhà cung
  // cấp; mọi trường hợp khác trả null để form quay về trạng thái vào từ menu.
  const contextProduct = await loadRfqProductContext({
    categorySlug: sp?.category ?? null,
    supplierId: supplierIds.length === 1 ? supplierIds[0] : null,
    productId: sp?.product_id ?? null,
  }).catch(() => null);

  // Old question links now open the product modal, never a separate question page.
  if (sp?.intent === "question") {
    if (contextProduct && sp.category && sp.product_id) {
      redirect(`/products/${encodeURIComponent(sp.category)}/${encodeURIComponent(sp.product_id)}?ask=1`);
    }
    redirect("/rfq");
  }

  return (
    <div className="mx-auto max-w-[1120px] px-5 py-10 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Request a quote" },
        ]}
      />
      <h1 className="mt-4 text-[34px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[44px]">
        Request a quote
      </h1>
      <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-ink-700">
        Tell us what you need: grade, volume, destination and timeline.
      </p>

      <RfqForm
        categories={categories.map((c: Category) => ({ slug: c.slug, name: c.name_i18n?.en ?? c.slug }))}
        categorySpecs={Object.fromEntries(categories.map((c: Category) => {
          const standardGrades = standardGradesForCategory(c);
          const legacyGrades = categoryFilterValues(c.filters, "grade");
          return [c.slug, {
            // `filters` is jsonb: old rows may hold a string, a map or one object,
            // so the page reads it through the normaliser instead of `.find`.
            grades: standardGrades.length > 0 ? standardGrades : legacyGrades,
            certs: categoryFilterValues(c.filters, "certifications"),
          }];
        }))}
        initialCategory={sp?.category ?? null}
        initialProduct={(sp?.product ?? "").slice(0, 150)}
        initialProductId={sp?.product_id ?? null}
        initialGrade={(sp?.grade ?? "").trim().slice(0, 80)}
        initialSupplierIds={supplierIds}
        initialSuppliers={initialSuppliers}
        wantsSamples={sp?.sample === "1"}
        mode="quote"
        contextProduct={contextProduct}
      />

      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-500">

          By submitting, you acknowledge our <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link> and agree to our <Link href="/terms-of-service" className="font-semibold text-brand-700 underline">Terms of Service</Link>. We share your request only with the suppliers we contact about it,
          and your email/phone/company are <strong>not</strong> disclosed to suppliers until you approve an introduction.

      </p>
    </div>
  );
}
