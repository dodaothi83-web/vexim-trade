"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Lock, Pencil, Trash2 } from "lucide-react";

import { fill } from "@/lib/i18n/format";
import type { ShowcaseMessages } from "@/lib/i18n/portal/showcase";
import { SHOWCASE_BODY_MAX, SHOWCASE_MAX_BLOCKS, SHOWCASE_TITLE_MAX } from "@/lib/supplier-showcase";
import { deleteShowcaseBlockAction, moveShowcaseBlockAction, updateShowcaseBlockAction } from "./showcase-actions";

type Block = { id: string; title: string; body: string; url: string };

/**
 * Nhà cung cấp quản lý khối nội dung hình ảnh. Gói Basic thấy lời mời nâng gói; gói đã hết
 * hạn vẫn thấy và gỡ được khối cũ (không hiện công khai) nhưng không thêm hay sửa.
 */
export function ShowcaseEditor({ blocks, enabled, copy }: { blocks: Block[]; enabled: boolean; copy: ShowcaseMessages }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<{ ok: boolean; message?: string }>) => startTransition(async () => {
    setMessage(null);
    const result = await task();
    if (!result.ok) setMessage({ ok: false, text: result.message ?? copy.errors.failed });
    else { setEditing(null); router.refresh(); }
  });

  return (
    <section aria-labelledby="showcase-editor-title" className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="showcase-editor-title" className="text-[15px] font-bold text-ink-900">{copy.title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-ink-500">{copy.sub}</p>
        </div>
        {enabled && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-800">
          {fill(copy.count, { count: blocks.length, max: SHOWCASE_MAX_BLOCKS })}</span>}
      </div>

      {!enabled && (
        <div className="mt-4 flex flex-wrap items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">{copy.lockedTitle}</p>
            <p className="mt-1 text-xs leading-5 text-ink-600">{copy.lockedBody}</p>
            <Link href="/supplier/portal/services" className="mt-2 inline-block text-xs font-bold text-brand-700 underline">{copy.lockedCta}</Link>
          </div>
        </div>
      )}

      {message && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900">{message.text}</p>}

      {(enabled || blocks.length > 0) && (
        blocks.length === 0 ? <p className="mt-4 text-sm text-ink-600">{copy.empty}</p> : (
          <ul className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-200">
            {blocks.map((block, index) => (
              <li key={block.id} className="flex flex-wrap items-start gap-3 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.url} alt="" className="h-16 w-24 shrink-0 rounded-md object-cover ring-1 ring-ink-200" />
                {editing === block.id ? (
                  <BlockForm copy={copy} initial={block} pending={pending} onCancel={() => setEditing(null)}
                    onSave={(title, body) => run(() => updateShowcaseBlockAction(block.id, title, body))} />
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-ink-900">{block.title}</p>
                      {block.body && <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-ink-600">{block.body}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {enabled && <>
                        <IconButton label={copy.moveUp} disabled={pending || index === 0} onClick={() => run(() => moveShowcaseBlockAction(block.id, -1))}><ArrowUp className="size-4" /></IconButton>
                        <IconButton label={copy.moveDown} disabled={pending || index === blocks.length - 1} onClick={() => run(() => moveShowcaseBlockAction(block.id, 1))}><ArrowDown className="size-4" /></IconButton>
                        <IconButton label={copy.edit} disabled={pending} onClick={() => setEditing(block.id)}><Pencil className="size-4" /></IconButton>
                      </>}
                      <IconButton label={copy.delete} disabled={pending} onClick={() => { if (window.confirm(copy.confirmDelete)) run(() => deleteShowcaseBlockAction(block.id)); }}><Trash2 className="size-4" /></IconButton>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {enabled && blocks.length < SHOWCASE_MAX_BLOCKS && (
        adding ? <AddForm copy={copy} onDone={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} />
          : <button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-800 hover:border-brand-400">
            <ImagePlus className="size-4" aria-hidden="true" />{copy.add}</button>
      )}
    </section>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className="flex size-8 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-50 hover:text-brand-800 disabled:opacity-40">{children}</button>;
}

function TextFields({ copy, title, body, setTitle, setBody }: {
  copy: ShowcaseMessages; title: string; body: string; setTitle: (v: string) => void; setBody: (v: string) => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  return <>
    <label htmlFor={titleId} className="block text-xs font-semibold text-ink-800">{copy.titleLabel}</label>
    <input id={titleId} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={SHOWCASE_TITLE_MAX} placeholder={copy.titlePlaceholder} className="input w-full text-sm" required />
    <label htmlFor={bodyId} className="block text-xs font-semibold text-ink-800">{copy.bodyLabel}</label>
    <textarea id={bodyId} value={body} onChange={(e) => setBody(e.target.value)} maxLength={SHOWCASE_BODY_MAX} rows={3} placeholder={copy.bodyPlaceholder} className="input w-full text-sm" />
    <p className="text-[11px] leading-4 text-ink-500">{copy.noContactNote}</p>
  </>;
}

function BlockForm({ copy, initial, pending, onSave, onCancel }: {
  copy: ShowcaseMessages; initial: Block; pending: boolean; onSave: (title: string, body: string) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  return <div className="min-w-0 flex-1 space-y-2">
    <TextFields copy={copy} title={title} body={body} setTitle={setTitle} setBody={setBody} />
    <div className="flex gap-2">
      <button type="button" disabled={pending} onClick={() => onSave(title, body)} className="rounded-lg bg-brand-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-60">{pending ? copy.saving : copy.save}</button>
      <button type="button" onClick={onCancel} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">{copy.cancel}</button>
    </div>
  </div>;
}

function AddForm({ copy, onDone, onCancel }: { copy: ShowcaseMessages; onDone: () => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileId = useId();

  async function save() {
    if (!file) { setError(copy.errors.image); return; }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("body", body);
    const response = await fetch("/api/supplier-portal/showcase", { method: "POST", body: form }).catch(() => null);
    const data = response ? await response.json().catch(() => null) as { ok?: boolean; message?: string } | null : null;
    setBusy(false);
    if (data?.ok) onDone();
    else setError(data?.message ?? copy.errors.failed);
  }

  return <div className="mt-4 space-y-2 rounded-lg border border-ink-200 p-4">
    <label htmlFor={fileId} className="block text-xs font-semibold text-ink-800">{copy.image}</label>
    <input id={fileId} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
    <p className="text-[11px] leading-4 text-ink-500">{copy.imageHint}</p>
    <TextFields copy={copy} title={title} body={body} setTitle={setTitle} setBody={setBody} />
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</p>}
    <div className="flex gap-2">
      <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-60">{busy ? copy.saving : copy.save}</button>
      <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">{copy.cancel}</button>
    </div>
  </div>;
}
