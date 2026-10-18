import Link from "next/link";
import { Metadata } from "next";
import { ArrowRight, Minus } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import {
  getPublicSuppliersByIds,
  mainProductNames,
  supplierTypeLabel,
} from "@/lib/public/catalog";

export const metadata: Metadata = {
  title: "Compare suppliers | Veximtrade",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ ids?: string }>;
}

function parseIds(ids: string | undefined): string[] {
  if (!ids) return [];
  return ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export default async function ComparePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const ids = parseIds(sp?.ids);
  const suppliers = ids.length > 0 ? await getPublicSuppliersByIds(ids) : [];

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Compare" },
        ]}
      />
      <h1
        className="mt-4 text-[38px] font-bold leading-tight text-ink-900 sm:text-[46px]"
        style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}
      >
        Compare suppliers
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600">
        Side-by-side view of up to 4 verified Vietnamese suppliers you shortlisted. Tick &ldquo;+
        Compare&rdquo; on supplier cards to build this list.
      </p>

      {suppliers.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-ink-300 bg-ink-50 p-10 text-center">
          <p className="text-[15px] text-ink-600">
            No suppliers selected yet. Browse a category first.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2 text-[14px] font-semibold text-white hover:bg-ink-800"
          >
            Back to categories <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-8 overflow-x-auto rounded-lg border border-ink-200 bg-white">
            <table className="min-w-full text-left text-[14px]">
              <thead className="bg-ink-50">
                <tr>
                  <th className="sticky left-0 z-10 w-48 bg-ink-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    Criterion
                  </th>
                  {suppliers.map((s) => {
                    return (
                      <th key={s.id} className="min-w-[220px] px-4 py-3 align-top">
                        <Link
                          href={`/suppliers/${encodeURIComponent(s.slug || s.id)}`}
                          className="block text-[15px] font-semibold text-ink-900 hover:text-brand-700"
                        >
                          {s.display_name ?? s.name}
                        </Link>
                        <p className="mt-1 text-[12px] font-medium text-ink-600">{supplierTypeLabel(s)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5"><VerificationPips levels={s.approved_verification_steps} compact /><VerificationTierBadge levels={s.approved_verification_steps} /></div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                <Row
                  label="Location"
                  cells={suppliers.map((s) => (
                    <>{s.province ? `${s.province}, Vietnam` : "—"}</>
                  ))}
                />
                <Row
                  label="Founded"
                  cells={suppliers.map((s) => <>{s.founded_year ?? <Dash />}</>)}
                />
                <Row
                  label="Employees"
                  cells={suppliers.map((s) => (
                    <>{typeof s.employees === "number" && s.employees > 0 ? `${s.employees}` : <Dash />}</>
                  ))}
                />
                <Row
                  label="Main products"
                  cells={suppliers.map((s) => <>{mainProductNames(s.main_products) || <Dash />}</>)}
                />
                <Row
                  label="MOQ"
                  cells={suppliers.map((s) => <>{s.moq_text || <Dash />}</>)}
                />
                <Row
                  label="Lead time"
                  cells={suppliers.map((s) => (
                    <>{s.lead_time_days ? `${s.lead_time_days} days` : <Dash />}</>
                  ))}
                />
                <Row
                  label="Ports"
                  cells={suppliers.map((s) => <>{(s.ports ?? []).join(", ") || <Dash />}</>)}
                />
                <Row
                  label="Incoterms"
                  cells={suppliers.map((s) => <>{(s.incoterms ?? []).join(", ") || <Dash />}</>)}
                />
                <Row
                  label="Product prices"
                  cells={suppliers.map((s) => s.main_products.length
                    ? <Link href={`/suppliers/${encodeURIComponent(s.slug || s.id)}#products`} className="font-medium text-brand-700 hover:underline">See individual products</Link>
                    : <Dash />)}
                />
                <Row
                  label="Private label"
                  cells={suppliers.map((s) => <>{s.private_label ? "Yes" : "Available on request"}</>)}
                />
                <tr className="bg-ink-50/60">
                  <td className="sticky left-0 z-10 bg-ink-50/60 px-4 py-4 font-semibold text-ink-900" />
                  {suppliers.map((s) => (
                    <td key={s.id} className="px-4 py-4">
                      <Link
                        href={`/rfq?suppliers=${s.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-ink-800"
                      >
                        Request quote <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5 text-[13px] text-ink-600">
            <p>
              Need help choosing? <Link href="/rfq" className="font-semibold text-ink-900 underline underline-offset-2 hover:text-brand-700">Send a sourcing request</Link> and
              our desk will shortlist suitable suppliers with confirmed quotes within 1 business day.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, cells }: { label: string; cells: React.ReactNode[] }) {
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-white px-4 py-3 align-top text-[12.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </td>
      {cells.map((c, i) => (
        <td key={i} className="px-4 py-3 align-top text-ink-800">
          {c}
        </td>
      ))}
    </tr>
  );
}

function Dash() {
  return <Minus className="inline-block h-3 w-3 text-ink-300" />;
}
