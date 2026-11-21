"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { AplusEditor } from "@/components/products/aplus-editor";
import type { AplusMessages } from "@/lib/i18n/portal/aplus";
import type { AplusModule } from "@/lib/products/aplus";
import { saveProductContentModeAction } from "../../../aplus-actions";

/**
 * Trang soạn A+ của một sản phẩm: trình soạn A+ đầy đủ chiều rộng, nút Lưu riêng. Mở từ lựa chọn
 * "Nội dung A+" trong trang sửa sản phẩm; còn đang chọn "Nội dung cơ bản" thì có nút chuyển sang A+.
 */
export function ProductAplusWorkspace({ productId, initial, allowed, editable, copy, mode, publicHref }: {
  productId: string; initial: AplusModule[]; allowed: boolean; editable: boolean; copy: AplusMessages;
  mode: "basic" | "aplus" | null; publicHref: string | null;
}) {
  const t = copy.contentTabs;
  const [current, setCurrent] = useState(mode ?? (initial.length ? "aplus" : "basic"));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <Link href={`/supplier/portal/products/${productId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" aria-hidden="true" />{t.back}</Link>
      {publicHref && <a href={publicHref} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:text-brand-700">{t.viewProduct}<ExternalLink className="size-3.5" aria-hidden="true" /></a>}
    </div>
    {allowed && current === "basic" && <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm font-semibold text-amber-900">{t.showingBasic}</p>
      <button type="button" disabled={busy || !editable} className="btn btn-primary btn-sm" onClick={async () => {
        setBusy(true); setNote(null);
        const result = await saveProductContentModeAction(productId, "aplus").catch(() => ({ ok: false, message: copy.errors.failed }));
        setBusy(false); setNote(result);
        if (result.ok) setCurrent("aplus");
      }}>{t.aplus}</button>
      {note && !note.ok && <p role="alert" className="w-full text-xs font-semibold text-rose-700">{note.message}</p>}
    </div>}
    <AplusEditor productId={productId} allowed={allowed} editable={editable} initial={initial} copy={copy} standalone
      lockedHref="/supplier/portal/services" />
  </div>;
}
