"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { SupplierCategoryPicker } from "../supplier-category-picker";
import { saveSupplierCategoriesAction } from "./actions";

export function SupplierCategoryForm({ options, initial }: { options: CategoryProposalOption[]; initial: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setResult(null);
    try {
      const response = await saveSupplierCategoriesAction(new FormData(event.currentTarget));
      setResult(response);
      if (response.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-6 max-w-2xl rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 className="text-lg font-bold text-ink-900">Chọn danh mục</h2>
    <SupplierCategoryPicker categories={options} initial={initial} />
    <button disabled={busy} type="submit" className="btn btn-primary mt-5">{busy ? "Đang lưu..." : "Lưu danh mục"}</button>
    {result && <p role="status" className={`mt-3 text-sm ${result.ok ? "text-brand-800" : "text-rose-800"}`}>{result.message}</p>}
  </form>;
}
