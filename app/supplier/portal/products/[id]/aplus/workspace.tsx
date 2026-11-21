"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { AplusEditor } from "@/components/products/aplus-editor";
import type { AplusMessages } from "@/lib/i18n/portal/aplus";
import type { AplusModule } from "@/lib/products/aplus";
import { saveProductContentModeAction } from "../../../aplus-actions";

/**
 * Trang soạn A+ của một sản phẩm (mở bằng nút "Nội dung A+" ở mục Nội dung chi tiết): trình soạn A+
 * đầy đủ chiều rộng, nút Lưu riêng. Mặc định trang sản phẩm hiện nội dung cơ bản; nhà cung cấp bật
 * "Hiện A+ trên trang sản phẩm" ở đây, và tắt được để quay về nội dung cơ bản.
 */
export function ProductAplusWorkspace({ productId, initial, allowed, editable, copy, mode, publicHref }: {
  productId: string; initial: AplusModule[]; allowed: boolean; editable: boolean; copy: AplusMessages;
  mode: "basic" | "aplus" | null; publicHref: string | null;
}) {
  const t = copy.aplusPage;
  const [current, setCurrent] = useState<"basic" | "aplus">(mode ?? (initial.length ? "aplus" : "basic"));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const choose = async (next: "basic" | "aplus") => {
    setBusy(true); setNote(null);
    const result = await saveProductContentModeAction(productId, next).catch(() => ({ ok: false, message: copy.errors.failed }));
    setBusy(false); setNote(result);
    if (result.ok) setCurrent(next);
  };
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <Link href={`/supplier/portal/products/${productId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" aria-hidden="true" />{t.back}</Link>
      {publicHref && <a href={publicHref} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:text-brand-700">{t.viewProduct}<ExternalLink className="size-3.5" aria-hidden="true" /></a>}
    </div>
    {allowed && <div className={`mb-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${current === "aplus" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <p className={`min-w-0 flex-1 text-sm font-semibold ${current === "aplus" ? "text-emerald-900" : "text-amber-900"}`}>{current === "aplus" ? t.showingAplus : t.showingBasic}</p>
      {current === "basic"
        ? <button type="button" disabled={busy || !editable} className="btn btn-primary btn-sm" onClick={() => void choose("aplus")}>{t.useAplus}</button>
        : <button type="button" disabled={busy || !editable} className="btn btn-ghost btn-sm" onClick={() => void choose("basic")}>{t.useBasic}</button>}
      {current === "aplus" && initial.length === 0 && <p className="w-full text-xs text-ink-600">{t.aplusEmpty}</p>}
      {note && !note.ok && <p role="alert" className="w-full text-xs font-semibold text-rose-700">{note.message}</p>}
    </div>}
    <AplusEditor productId={productId} allowed={allowed} editable={editable} initial={initial} copy={copy} standalone
      lockedHref="/supplier/portal/services" />
  </div>;
}
