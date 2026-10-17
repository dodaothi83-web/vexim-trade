"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { confirmSupplierCategoriesAction } from "./category-actions";

export function SupplierCategoryControls({ supplierId, options, proposed, other, confirmed, primary, reviewed }: {
  supplierId: string; options: CategoryProposalOption[]; proposed: string[]; other?: string | null;
  confirmed: string[]; primary?: string | null; reviewed: boolean;
}) {
  const router = useRouter();
  const proposedIds = options.filter((c) => proposed.includes(c.slug)).map((c) => c.id);
  const [selected, setSelected] = useState<string[]>(confirmed.length && reviewed ? confirmed : proposedIds.length ? proposedIds : confirmed);
  const [main, setMain] = useState(primary && selected.includes(primary) ? primary : selected[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
    if (next.length > 8) return;
    setSelected(next);
    if (!next.includes(main)) setMain(next[0] ?? "");
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(); form.set("supplier_id", supplierId);
    for (const id of selected) form.append("category_id", id);
    if (main) form.set("primary_id", main);
    try {
      const result = await confirmSupplierCategoriesAction(form);
      setMessage(result.message);
      if (result.ok) router.refresh();
    } catch { setMessage("Không kết nối được máy chủ."); }
    finally { setBusy(false); }
  }
  return <section className="card mb-5 p-5" aria-label="Danh mục NCC đề xuất">
    <h2 className="text-lg font-bold text-ink-900">Danh mục kinh doanh</h2>
    <p className="mt-1 text-sm text-ink-600">NCC tự đề xuất: {proposed.length ? proposed.map((slug) => options.find((c) => c.slug === slug)?.label || slug).join(" · ") : "Chưa chọn danh mục"}{other ? ` · Khác: ${other}` : ""}. Chỉ Vexim được chốt danh mục; thao tác này không tự công khai NCC/sản phẩm.</p>
    <p className={`mt-2 text-xs font-semibold ${reviewed ? "text-emerald-800" : "text-amber-800"}`}>{reviewed ? "Đã được Vexim chốt danh mục NCC" : "Chưa được Vexim chốt · ngành hệ thống suy đoán chỉ là gợi ý"}</p>
    <form onSubmit={submit} className="mt-4 space-y-4"><div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">{options.map((c) => <label key={c.id} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm">
      <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} disabled={busy || (!selected.includes(c.id) && selected.length >= 8)} className="size-4 accent-teal-700" />{c.label}
    </label>)}</div>
      <label className="block max-w-xs text-sm font-semibold">Danh mục chính
        <select className="input mt-1" value={main} onChange={(e) => setMain(e.target.value)} disabled={busy || !selected.length}>
          {!selected.length && <option value="">Chưa có</option>}
          {selected.map((id) => { const c = options.find((item) => item.id === id); return <option value={id} key={id}>{c?.label ?? id}</option>; })}
        </select></label>
      <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Đang lưu..." : "Vexim chốt danh mục NCC"}</button>
      {message && <p role="status" className="text-sm text-ink-700">{message}</p>}
    </form>
  </section>;
}
