import type { LegacyReviewEvidence } from "@/lib/products/product-form-legacy-review";

/** Source evidence is informational; it is never an approval or a data write. */
export function LegacyReviewEvidencePanel({ evidence }: { evidence: LegacyReviewEvidence[] }) {
  if (!evidence.length) return null;
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" aria-label="Thông tin cần xác nhận">
    <h2 className="font-semibold text-amber-950">Thông tin cần xác nhận</h2>
    <p className="mt-1 text-amber-900">Các giá trị dưới đây được giữ nguyên từ nguồn cũ; việc hiển thị không xác nhận chúng là chính thức.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{evidence.map((item) => <div key={item.label} className="rounded-lg bg-white p-3">
      <h3 className="font-semibold text-ink-900">{item.label}</h3>
      <ul className="mt-1 space-y-1 text-ink-700">{item.lines.map((value, index) => <li key={index} className="break-words">{value}</li>)}</ul>
      <p className="mt-2 text-xs text-amber-900">{item.instruction}</p>
    </div>)}</div>
  </section>;
}
