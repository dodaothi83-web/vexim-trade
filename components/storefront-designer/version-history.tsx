"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DesignerMessages } from "@/lib/i18n/portal/designer";

export type VersionRow = { id: string; when: string; role: "supplier" | "staff"; email: string | null; note: string | null; live: boolean };

/** Lịch sử phiên bản "Thiết kế trang": mỗi lần áp dụng một dòng, khôi phục được bản cũ. */
export function StorefrontVersionHistory({ versions, restore, copy, showEmail = false }: {
  versions: VersionRow[];
  restore: (id: string) => Promise<{ ok: boolean; message: string }>;
  copy: DesignerMessages["versions"];
  /** CRM hiện email người áp dụng; cổng nhà cung cấp chỉ ghi "Bạn" hoặc "Vexim". */
  showEmail?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return <section className="rounded-xl border border-ink-200 bg-white p-4" aria-labelledby="storefront-versions">
    <h2 id="storefront-versions" className="text-sm font-bold text-ink-900">{copy.title}</h2>
    <p className="mt-0.5 text-xs leading-5 text-ink-500">{copy.sub}</p>
    {versions.length === 0 ? <p className="mt-3 text-xs text-ink-500">{copy.empty}</p> : <ol className="mt-2 divide-y divide-ink-100">
      {versions.map((v) => <li key={v.id} className="flex items-start gap-2 py-2.5 text-xs">
        <div className="min-w-0 flex-1 leading-5 text-ink-600">
          <p className="font-semibold text-ink-900">{v.when} · {v.role === "staff" ? copy.staff : copy.supplier}</p>
          {showEmail && v.email && <p>{v.email}</p>}
          {v.note && <p className="break-words">{v.note}</p>}
        </div>
        {v.live ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800">{copy.live}</span>
          : <button type="button" disabled={!!busy} className="btn btn-soft btn-sm shrink-0" onClick={async () => {
            if (!window.confirm(copy.confirmRestore)) return;
            setBusy(v.id); setMessage(null);
            const result = await restore(v.id).catch(() => ({ ok: false, message: "" }));
            setMessage({ ok: result.ok, text: result.message }); setBusy(null);
            if (result.ok) router.refresh();
          }}>{busy === v.id ? "…" : copy.restore}</button>}
      </li>)}
    </ol>}
    {message?.text && <p role={message.ok ? "status" : "alert"} className={`mt-2 text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </section>;
}
