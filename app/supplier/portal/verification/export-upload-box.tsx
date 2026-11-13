"use client";

import { useState } from "react";
import { FileText, Info, Plus, Trash2 } from "lucide-react";

import { VeximDocumentIcon } from "@/components/brand/vexim-icons";

import { FilePicker } from "@/components/file-picker";
import { fill } from "@/lib/i18n/format";
import type { VerificationMessages } from "@/lib/i18n/portal/verification";
import type { PortalItemView } from "@/lib/supplier-portal/submission-view";
import { L3_EXPORT_ITEMS } from "@/lib/types";
import { MAX_ITEMS_PER_KEY } from "@/lib/verification-submission";
import { deleteSubmissionItemAction } from "./submission-actions";

/** Tối đa số tệp cho một lô; đủ cho một bộ chứng từ thường gặp mà không làm hồ sơ quá dài. */
export const EXPORT_MAX_FILES = 10;

/**
 * Chứng từ xuất khẩu (hiển thị L2) gom vào MỘT ô tải, thay cho 7 thẻ theo loại chứng từ.
 * Chủ dự án yêu cầu 11/2026: nhà cung cấp không cần biết tệp nào là vận đơn hay tờ khai.
 *
 * CSDL vẫn giới hạn 3 tệp mỗi `checklist_key`, nên ô này tự đặt từng tệp vào ngăn còn chỗ
 * (bắt đầu từ "chứng từ khác"). Không đổi bảng, trigger hay luật duyệt; nhân viên vẫn mở
 * từng tệp để xem như trước.
 */
const KEY_ORDER = ["other_export_evidence", ...L3_EXPORT_ITEMS.map((item) => item.key).filter((key) => key !== "other_export_evidence")];

export function ExportUploadBox({ submissionId, rows, editable, paused, onChanged, onBusyChange, copy }: {
  submissionId: string;
  rows: PortalItemView[];
  editable: boolean;
  paused: boolean;
  onChanged: (message: string, ok: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  copy: VerificationMessages["panel"]["exportBox"];
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const files = rows.filter((row) => row.href).sort((a, b) => (a.uploadedAt ?? "").localeCompare(b.uploadedAt ?? ""));
  const full = files.length >= EXPORT_MAX_FILES;
  const busy = progress !== null;

  async function upload(list: FileList | null) {
    const picked = Array.from(list ?? []).slice(0, Math.max(0, EXPORT_MAX_FILES - files.length));
    if (!picked.length || busy || paused || !editable) return;
    const used = new Map<string, number>();
    for (const row of files) used.set(row.key, (used.get(row.key) ?? 0) + 1);
    setProgress({ done: 0, total: picked.length }); onBusyChange(true);
    let done = 0; let reason = "";
    try {
      for (const file of picked) {
        const key = KEY_ORDER.find((k) => (used.get(k) ?? 0) < MAX_ITEMS_PER_KEY);
        if (!key) { reason = fill(copy.full, { max: EXPORT_MAX_FILES }); break; }
        const form = new FormData();
        form.set("checklistKey", key);
        form.set("file", file, file.name);
        form.set("capturedAt", new Date(file.lastModified || Date.now()).toISOString());
        const response = await fetch(`/api/supplier-portal/submissions/${encodeURIComponent(submissionId)}/upload`, { method: "POST", body: form });
        const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
        if (!response.ok || !data.ok) { reason = data.message ?? ""; break; }
        used.set(key, (used.get(key) ?? 0) + 1);
        done += 1;
        setProgress({ done, total: picked.length });
      }
      const ok = done === picked.length;
      onChanged(ok ? fill(copy.uploaded, { count: done }) : fill(copy.partial, { done, total: picked.length, reason }), ok);
    } catch {
      onChanged(fill(copy.partial, { done, total: picked.length, reason: "" }), false);
    } finally {
      setProgress(null); onBusyChange(false);
    }
  }

  async function remove(row: PortalItemView, index: number) {
    if (!editable || busy || paused || !window.confirm(fill(copy.confirmRemove, { index: index + 1 }))) return;
    onBusyChange(true);
    try {
      const form = new FormData();
      form.set("submission_id", submissionId);
      form.set("item_id", row.id);
      const result = await deleteSubmissionItemAction(form);
      onChanged(result.message, result.ok);
    } finally { onBusyChange(false); }
  }

  return <div className="mt-3 space-y-3">
    {/* Danh sách giấy tờ cần chuẩn bị: ô tải gộp một nên phải nói rõ ở đây nộp những gì. */}
    <section aria-labelledby="export-docs-title" className="rounded-xl border border-ink-200 bg-white p-3.5">
      <h4 id="export-docs-title" className="text-[13px] font-bold text-ink-900">{copy.docsTitle}</h4>
      <p className="mt-1 text-[12px] leading-5 text-ink-600">{copy.docsIntro}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <DocList label={copy.docsCoreLabel} docs={copy.docsCore} core />
        <DocList label={copy.docsExtraLabel} docs={copy.docsExtra} />
      </div>
    </section>
    {editable && !full && <FilePicker multiple busy={busy} disabled={paused} accept="image/jpeg,image/png,image/webp,application/pdf"
      title={copy.pick} hint={copy.pickHint}
      labels={{ choose: copy.choose, uploading: progress ? fill(copy.uploading, progress) : copy.choose, empty: copy.pickHint }}
      onPick={(list) => upload(list)} />}
    {editable && full && <p className="rounded-lg bg-ink-50 px-3 py-2 text-[12.5px] text-ink-700">{fill(copy.full, { max: EXPORT_MAX_FILES })}</p>}

    <div>
      <p className="text-[12px] font-semibold text-ink-600">{fill(copy.count, { count: files.length, max: EXPORT_MAX_FILES })}</p>
      {files.length === 0
        ? <p className="mt-1 text-[12.5px] text-ink-500">{copy.empty}</p>
        : <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {files.map((row, index) => <li key={row.id} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
            <a href={row.href} target="_blank" rel="noreferrer" className="shrink-0">
              {row.thumbHref
                // Ảnh bằng chứng mở qua route có kiểm tra quyền, không qua next/image công khai.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={row.thumbHref} alt="" className="h-12 w-12 rounded-lg border border-ink-200 object-cover" />
                : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-ink-500 ring-1 ring-ink-200"><FileText className="h-5 w-5" aria-hidden="true" /></span>}
            </a>
            <a href={row.href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand-700 underline">{fill(copy.file, { index: index + 1 })}</a>
            {editable && <button type="button" disabled={busy || paused} onClick={() => void remove(row, index)}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-rose-700 hover:underline disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{copy.remove}
            </button>}
          </li>)}
        </ul>}
    </div>

    <div className="rounded-xl bg-brand-50/70 p-3.5 text-[12.5px] leading-5 text-ink-700">
      <p className="flex items-center gap-1.5 font-bold text-ink-900"><Info className="h-4 w-4 text-brand-700" aria-hidden="true" />{copy.noteTitle}</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5">{copy.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </div>
  </div>;
}

function DocList({ label, docs, core = false }: { label: string; docs: readonly { name: string; detail: string }[]; core?: boolean }) {
  // Tài liệu trung tính của bộ icon Vexim: chỉ là "giấy cần có", không ngụ ý đã duyệt.
  const Icon = core ? VeximDocumentIcon : Plus;
  return <div>
    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{label}</p>
    <ul className="mt-1.5 space-y-2">
      {docs.map((doc) => <li key={doc.name} className="flex gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${core ? "text-brand-700" : "text-ink-400"}`} aria-hidden="true" />
        <span className="min-w-0 text-[12.5px] leading-5">
          <span className="font-semibold text-ink-900">{doc.name}</span>
          <span className="block text-ink-600">{doc.detail}</span>
        </span>
      </li>)}
    </ul>
  </div>;
}
