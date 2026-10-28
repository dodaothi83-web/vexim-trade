"use client";

import { matchesVerificationFilter } from "@/lib/verification-status";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Filter } from "lucide-react";

import { PublicProductCard } from "@/components/public-product-card";
import { SponsoredPilotSlot } from "@/components/sponsored-pilot-slot";
import { SponsoredProductBand } from "@/components/sponsored-product-band";

import type { PublicCategoryProduct } from "@/lib/public/product-catalog";
import type { ProductAttributeField } from "@/lib/types";
import { fieldsFor } from "@/lib/product-attributes";
import type { PilotPlacement } from "@/lib/sponsored/pilot";
import { withoutSponsoredBand, type SponsoredBandItem } from "@/lib/public/sponsored-band";
import { arrangeSupplierProducts } from "@/lib/public/supplier-product-order";
import { hasProductComparisonPeer } from "@/lib/public/product-comparison";

function moqGroup(value: string): string {
  const text = value.toLowerCase();
  if (/fcl|container|\bcont\b|20\s*(?:ft|')/.test(text)) return "container";
  const quantity = /([\d.,]+)\s*(kg|tons?|tonnes?|mt|t)\b/i.exec(text);
  if (!quantity) return "ask";
  const number = Number(quantity[1].replace(/,/g, ""));
  if (!Number.isFinite(number)) return "ask";
  const tons = quantity[2].toLowerCase() === "kg" ? number / 1000 : number;
  return tons <= 1 ? "small" : tons <= 5 ? "medium" : "large";
}

function productGradesOf(product: PublicCategoryProduct): string[] {
  if (Array.isArray(product.grades) && product.grades.length > 0) return product.grades;
  return product.grade ? [product.grade] : [];
}

function productMatchesFieldOption(
  product: PublicCategoryProduct,
  fieldKey: string,
  option: string,
): boolean {
  if (fieldKey === "grade" || fieldKey === "product_type") {
    return productGradesOf(product).includes(option) || product.attributes?.[fieldKey] === option;
  }
  return product.attributes?.[fieldKey] === option;
}

function productMatchesMoqGroup(product: PublicCategoryProduct, targetGroup: string): boolean {
  if (Array.isArray(product.gradeRows) && product.gradeRows.length > 0) {
    return product.gradeRows.some((row) => moqGroup(row.moq) === targetGroup);
  }
  return moqGroup(product.moq) === targetGroup;
}

export function CategoryProductGrid({ products, categorySlug, grades, sponsored, sponsoredBand = [], productFields = [], comparisonEnabled = true }: {
  products: PublicCategoryProduct[]; categorySlug: string; grades: string[]; productFields?: ProductAttributeField[];
  sponsored?: PilotPlacement | null; sponsoredBand?: SponsoredBandItem[]; comparisonEnabled?: boolean;
}) {
  // Vùng đẩy đang hiện thì bỏ đúng những sản phẩm đó khỏi lưới tự nhiên. Đang lọc
  // thì vùng đẩy ẩn, và sản phẩm trả phí quay lại lưới như mọi sản phẩm khác.
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const attributeFilters = fieldsFor({ product_fields: productFields }).filter((f) => f.type === "select" && f.filterable && products.some((p) =>
    f.key === "grade" || f.key === "product_type"
      ? productGradesOf(p).length > 0 || !!p.attributes?.[f.key]
      : !!p.attributes?.[f.key],
  ));
  const hasStructuredGrade = attributeFilters.some((f) => f.key === "grade" || f.key === "product_type");
  const [moq, setMoq] = useState("");
  const [province, setProvince] = useState("");
  const [verified, setVerified] = useState(0);
  // Grade chips/filters come only from the CRM category configuration
  // (filters + product_fields). No hardcoded commodity demo values.
  const quick = hasStructuredGrade ? [] : grades.map((g) => ({ label: g, grades: [g] }));
  const allGrades = hasStructuredGrade ? [] : grades;
  const active = selectedGrades.length > 0 || Object.values(selectedAttributes).some(Boolean) || !!moq || !!province || verified > 0;
  const provinces = [...new Set(products.map((p) => p.province))].sort();
  const visible = useMemo(() => products.filter((p) => {
    const pGrades = productGradesOf(p);
    return (
      (!selectedGrades.length || selectedGrades.some((g) => pGrades.includes(g))) &&
      attributeFilters.every((field) => !selectedAttributes[field.key] || productMatchesFieldOption(p, field.key, selectedAttributes[field.key])) &&
      (!moq || productMatchesMoqGroup(p, moq)) &&
      (!province || p.province === province) && matchesVerificationFilter(p.verificationSteps, p.l2Scope, verified)
    );
  }), [products, selectedGrades, selectedAttributes, moq, province, verified, attributeFilters]);
  // Trần thẻ của một nhà cung cấp trong danh sách tự nhiên bên dưới, KHÔNG tính
  // vùng đẩy phía trên. Vùng đẩy là suất cộng thêm (additive slot): nhà cung cấp
  // mua gói giữ nguyên ba thẻ dưới lưới và có thêm một thẻ ở trên. Người trả tiền
  // nhận giá trị hiển thị tăng thêm thật, còn người không mua không bị đẩy khỏi
  // chỗ của họ. Vì vậy thẻ đã lên vùng đẩy được lấy ra khỏi danh sách TRƯỚC khi
  // áp trần, chứ không phải sau.
  const supplierCap = new Set(visible.map((p) => p.supplierId)).size < 2 ? 2 : 3;
  const listPool = useMemo(
    () => (active ? visible : withoutSponsoredBand(visible, sponsoredBand)),
    [active, visible, sponsoredBand],
  );
  // Lọc xong thì hiện đủ, không áp trần, để người đang tìm một quy cách cụ thể
  // không bị giấu mất lựa chọn.
  const { shown, hidden } = useMemo(
    () => arrangeSupplierProducts(listPool, active ? null : supplierCap),
    [listPool, active, supplierCap],
  );
  const comparisonOffers = useMemo(() => visible.map((product) => ({
    id: product.id, supplierId: product.supplierId, categorySlug, isDemo: product.isDemo,
  })), [visible, categorySlug]);
  const reset = () => { setSelectedAttributes({}); setSelectedGrades([]); setMoq(""); setProvince(""); setVerified(0); };
  const fields = <div className="space-y-5 text-sm">
    {attributeFilters.filter((field) => !field.showWhen || !selectedAttributes[field.showWhen.key] ||
      selectedAttributes[field.showWhen.key] === field.showWhen.value).map((field) => <label key={field.key} className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-500">{field.label}</span>
      <select className="input text-sm" value={selectedAttributes[field.key] ?? ""} onChange={(e) => setSelectedAttributes((current) => {
        const next = { ...current, [field.key]: e.target.value };
        for (const child of attributeFilters) if (child.showWhen?.key === field.key && child.showWhen.value !== e.target.value) delete next[child.key];
        return next;
      })}>
        <option value="">All</option>{field.options.filter((option) => products.some((p) => productMatchesFieldOption(p, field.key, option))).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>)}
    {allGrades.length > 0 && <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">Grade / type</legend>
      <div className="space-y-2">{allGrades.map((g) => <label key={g} className="flex cursor-pointer items-center gap-2 text-ink-700">
        <input type="checkbox" checked={selectedGrades.includes(g)} onChange={() => setSelectedGrades((xs) => xs.includes(g) ? xs.filter((x) => x !== g) : [...xs, g])} />{g}
      </label>)}</div>
    </fieldset>}
    <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-500">Minimum order</span>
      <select className="input text-sm" value={moq} onChange={(e) => setMoq(e.target.value)}>
        <option value="">Any MOQ</option><option value="small">Up to 1 ton</option><option value="medium">Over 1–5 tons</option>
        <option value="large">Over 5 tons</option><option value="container">Full container</option><option value="ask">On request / other</option>
      </select>
    </label>
    <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-500">Province</span>
      <select className="input text-sm" value={province} onChange={(e) => setProvince(e.target.value)}>
        <option value="">All provinces</option>{provinces.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
    <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-500">Supplier verification</span>
      <select className="input text-sm" value={verified} onChange={(e) => setVerified(Number(e.target.value))}>
        <option value={0}>All suppliers</option><option value={1}>Documents checked</option>
        <option value={2}>Factory verification</option><option value={4}>Partner factory contract reviewed</option><option value={3}>Delivery history reviewed</option>
      </select>
    </label>
    {active && <button type="button" onClick={reset} className="font-semibold text-brand-700 underline">Clear filters</button>}
  </div>;

  return <>
    {quick.length > 0 && <div className="mt-5 flex flex-wrap gap-2" aria-label="Quick grade filters">
      {quick.map((chip) => {
        const selected = selectedGrades.length === chip.grades.length && chip.grades.every((g) => selectedGrades.includes(g));
        return <button key={chip.label} type="button" aria-pressed={selected} onClick={() => setSelectedGrades(selected ? [] : chip.grades)}
          className={"rounded-full border px-3.5 py-1.5 text-xs font-bold transition " + (selected ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-500")}>
          {chip.label}
        </button>;
      })}
    </div>}
    <div className="mt-7 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block"><div className="sticky top-20 rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="mb-5 flex items-center gap-2 font-bold text-ink-900"><Filter className="h-4 w-4" /> Filter products</h2>{fields}
      </div></aside>
      <div className="min-w-0">
        <details className="mb-4 rounded-xl border border-ink-200 bg-white lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-ink-800"><span className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filter products</span><ChevronDown className="h-4 w-4" /></summary>
          <div className="border-t border-ink-100 p-4">{fields}</div>
        </details>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-600"><p><strong className="text-ink-900">{shown.length}</strong> of {visible.length} products{!active && listPool.length > shown.length ? ` · up to ${supplierCap} per supplier in the list below` : ""}</p>
          {active && <button type="button" className="text-xs font-semibold text-brand-700 underline" onClick={reset}>Show all</button>}
        </div>
        {/* Vùng đẩy chỉ hiện khi người xem chưa lọc gì. Đang lọc mà vẫn thấy thẻ
            trả phí thì thẻ đó không khớp bộ lọc, và người xem sẽ hiểu sai rằng nó
            khớp. Thà ẩn cả vùng còn hơn hiện một thẻ sai. Bản thử nghiệm cũ chỉ
            hiện khi chưa có gói bán thật nào. */}
        {!active && (sponsoredBand.length > 0
          ? <SponsoredProductBand items={sponsoredBand} categorySlug={categorySlug} comparisonEnabled={comparisonEnabled} />
          : sponsored && <SponsoredPilotSlot product={sponsored.product} ticket={sponsored.ticket}
              campaignId={sponsored.campaignId} categorySlug={categorySlug} />)}
        {visible.length ? <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => <div key={p.id} className="min-w-0">
            <PublicProductCard href={`/products/${encodeURIComponent(categorySlug)}/${encodeURIComponent(p.id)}`}
              imagePath={p.cardImagePath ?? p.imagePaths[0]} name={p.name} grades={productGradesOf(p)} moq={p.moq} price={p.price} fob={p.incoterm?.toUpperCase() === "FOB"}
              leadTimeDays={p.leadTimeDays} supplierName={p.supplierName}
              supplierHref={`/suppliers/${encodeURIComponent(p.supplierSlug || p.supplierId)}`}
              quoteHref={p.isDemo ? undefined : `/rfq?category=${encodeURIComponent(categorySlug)}&suppliers=${encodeURIComponent(p.supplierId)}&product=${encodeURIComponent(p.name)}&product_id=${encodeURIComponent(p.id)}`}
              oem={p.oem} odm={p.odm} samples={p.samples}
              verificationSteps={p.verificationSteps} l2Scope={p.l2Scope} test={p.isDemo}
              comparison={comparisonEnabled && hasProductComparisonPeer(comparisonOffers, {
                id: p.id, supplierId: p.supplierId, categorySlug, isDemo: p.isDemo,
              }) ? { id: p.id, categorySlug } : undefined} />
          </div>)}
        </div> : <div className="rounded-xl border border-ink-200 bg-white p-8 text-center">
          <h3 className="font-bold text-ink-900">No products match these filters</h3>
          <p className="mt-2 text-sm text-ink-600">Try another grade or tell us what you need.</p>
          <button type="button" className="mt-3 font-semibold text-brand-700 underline" onClick={reset}>Clear filters</button>
        </div>}
        {!active && hidden.size > 0 && <div className="mt-5 flex flex-wrap gap-2" aria-label="More products by supplier">
          {[...hidden].map(([supplierId, count]) => {
            const supplier = products.find((p) => p.supplierId === supplierId)!;
            return <Link key={supplierId} href={`/suppliers/${encodeURIComponent(supplier.supplierSlug || supplierId)}#products`}
              className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800 hover:border-brand-500">
              +{count} more from {supplier.supplierName}<ArrowRight className="h-3 w-3" aria-hidden />
            </Link>;
          })}
        </div>}
      </div>
    </div>
  </>;
}
