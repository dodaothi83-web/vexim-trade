import { RfqForm } from "./rfq-form";
import { Breadcrumbs } from "@/components/ui";
import { getStore } from "@/lib/db";
import type { Category } from "@/lib/types";

export const metadata = {
  title: "Request a quote | Veximtrade",
  description: "Send a sourcing request — our export desk replies in one business day.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function RfqPage({
  searchParams,
}: {
  searchParams?: Promise<{
    category?: string;
    suppliers?: string;
    sample?: string;
  }>;
}) {
  const sp = await searchParams;
  const store = getStore();
  const categories = await store.listCategories({ publishedOnly: true }).catch(() => []);
  const supplierIds = (sp?.suppliers ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Request a quote" },
        ]}
      />
      <h1
        className="mt-4 text-[34px] font-bold leading-tight text-ink-900 sm:text-[44px]"
        style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}
      >
        Request a quote
      </h1>
      <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-ink-700">
        Tell us what you need — grade, volume, destination and timeline. Our desk screens suppliers and
        replies with a shortlist within one business day.
      </p>

      <RfqForm
        categories={categories.map((c: Category) => ({ slug: c.slug, name: c.name_i18n?.en ?? c.slug }))}
        initialCategory={sp?.category ?? null}
        initialSupplierIds={supplierIds}
        wantsSamples={sp?.sample === "1"}
      />

      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-500">
        By submitting, you agree to our privacy policy. We share your request only with shortlisted suppliers,
        and your email/phone/company are <strong>not</strong> disclosed to suppliers until you approve an introduction.
      </p>
    </div>
  );
}
