import Link from "next/link";
import { RfqForm } from "./rfq-form";
import { Breadcrumbs } from "@/components/ui";
import { getStore } from "@/lib/db";
import { listPublicSuppliers } from "@/lib/public/catalog";
import type { Category, CategoryFilter } from "@/lib/types";

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
    .map((s) => ({ id: s.id, name: s.display_name || s.name }));
  const isQuestion = sp?.intent === "question" && supplierIds.length === 1 && initialSuppliers.length === 1 && Boolean(sp?.product_id);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: isQuestion ? "Ask supplier" : "Request a quote" },
        ]}
      />
      <h1
        className="mt-4 text-[34px] font-bold leading-tight text-ink-900 sm:text-[44px]"
        style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}
      >
        {isQuestion ? "Ask the supplier" : "Request a quote"}
      </h1>
      <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-ink-700">
        {isQuestion
          ? `Send your product question directly to ${initialSuppliers[0].name}. They can reply to your email.`
          : "Tell us what you need: grade, volume, destination and timeline."}
      </p>

      <RfqForm
        categories={categories.map((c: Category) => ({ slug: c.slug, name: c.name_i18n?.en ?? c.slug }))}
        categorySpecs={Object.fromEntries(categories.map((c: Category) => [c.slug, {
          grades: (c.filters as CategoryFilter[] | null)?.find((f) => f.key === "grade")?.options.map((o) => o.value) ?? [],
          certs: (c.filters as CategoryFilter[] | null)?.find((f) => f.key === "certifications")?.options.map((o) => o.value) ?? [],
        }]))}
        initialCategory={sp?.category ?? null}
        initialProduct={(sp?.product ?? "").slice(0, 150)}
        initialProductId={sp?.product_id ?? null}
        initialSupplierIds={supplierIds}
        initialSuppliers={initialSuppliers}
        wantsSamples={sp?.sample === "1"}
        mode={isQuestion ? "question" : "quote"}
        turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null}
      />

      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-500">
        {isQuestion ? <>
          By submitting, you agree to share your name, company, email and question with the selected supplier so they can reply directly. Vexim processes this information to deliver and support the enquiry. Read our <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link> and <Link href="/terms-of-service" className="font-semibold text-brand-700 underline">Terms of Service</Link>.
        </> : <>
          By submitting, you acknowledge our <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link> and agree to our <Link href="/terms-of-service" className="font-semibold text-brand-700 underline">Terms of Service</Link>. We share your request only with the suppliers we contact about it,
          and your email/phone/company are <strong>not</strong> disclosed to suppliers until you approve an introduction.
        </>}
      </p>
    </div>
  );
}
