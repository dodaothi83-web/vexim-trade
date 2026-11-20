"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { AplusEditor } from "@/components/products/aplus-editor";
import { fill } from "@/lib/i18n/format";
import type { AplusMessages } from "@/lib/i18n/portal/aplus";
import type { AplusModule } from "@/lib/products/aplus";
import { APLUS_COMPANY_TEMPLATE_IDS } from "@/lib/products/aplus-templates";
import { migrateShowcaseToCompanyAplusAction, saveCompanyAplusAction, translateCompanyAplusPreviewAction } from "../company-aplus-actions";

/**
 * Trang soạn A+ doanh nghiệp: cùng trình soạn với A+ sản phẩm (trái soạn tiếng Việt, phải xem trước
 * bản tiếng Anh), bộ mẫu theo loại hình doanh nghiệp, nút Lưu riêng. Còn khối Showcase cũ thì có nút
 * chuyển sang A+ (không mất nội dung).
 */
export function CompanyAplusWorkspace({ initial, allowed, showcaseCount, publicHref, copy }: {
  initial: AplusModule[]; allowed: boolean; showcaseCount: number; publicHref: string | null; copy: AplusMessages;
}) {
  const [modules, setModules] = useState(initial);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const c = copy.company;
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <Link href="/supplier/portal/storefront" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" aria-hidden="true" />{c.back}</Link>
      {publicHref && <a href={publicHref} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:text-brand-700">{c.preview}<ExternalLink className="size-3.5" aria-hidden="true" /></a>}
    </div>
    {allowed && showcaseCount > 0 && modules.length === 0 && <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900">{c.migrateTitle}</p>
        <p className="mt-0.5 text-xs leading-5 text-ink-600">{fill(c.migrateBody, { count: showcaseCount })}</p>
      </div>
      <button type="button" disabled={busy} className="btn btn-primary btn-sm" onClick={async () => {
        // Chuyển khối thay nội dung đang soạn (ví dụ vừa dùng bộ mẫu): hỏi lại trước.
        if (!window.confirm(copy.templates.confirmReplace)) return;
        setBusy(true); setNote(null);
        const result = await migrateShowcaseToCompanyAplusAction().catch(() => ({ ok: false, message: copy.errors.failed, modules: undefined }));
        setBusy(false); setNote({ ok: result.ok, text: result.message });
        if (result.ok && result.modules) { setModules(result.modules); setVersion((v) => v + 1); }
      }}>{c.migrate}</button>
      {note && <p role={note.ok ? "status" : "alert"} className={`w-full text-xs font-semibold ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</p>}
    </div>}
    <AplusEditor key={version} productId={null} allowed={allowed} editable initial={modules} copy={copy} standalone
      templateIds={APLUS_COMPANY_TEMPLATE_IDS} lockedHref="/supplier/portal/storefront"
      heading={{ title: c.title, sub: c.sub, lockedTitle: c.lockedTitle, lockedBody: c.lockedBody, save: c.save }}
      api={{ endpoint: "/api/supplier-portal/company-aplus", save: saveCompanyAplusAction, translate: translateCompanyAplusPreviewAction }} />
  </div>;
}
