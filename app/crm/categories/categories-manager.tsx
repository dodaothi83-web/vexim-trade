"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Minus,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/actions";
import { Breadcrumbs, Button, EmptyState, Field } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ImagePicker } from "@/components/image-picker";
import { useToast } from "@/components/toast";
import type { Category, CategoryColumn, CategoryFact, CategoryFilter, CategoryRow } from "@/lib/types";

function i18n(v: { en?: string } | null | undefined): string {
  if (!v || typeof v !== "object") return "";
  return (v.en ?? "") as string;
}

type CategoryDraft = {
  id?: string;
  slug: string;
  name_en: string;
  intro_en: string;
  h1_en: string;
  body_en: string;
  kicker_en: string;
  hero_image: string | null;
  hero_alt_en: string;
  seo_title_en: string;
  seo_desc_en: string;
  active_on_homepage: boolean;
  seo_indexable: boolean;
  is_published: boolean;
  sort_order: number;
  spec_columns: CategoryColumn[];
  spec_rows: CategoryRow[];
  buying_facts: CategoryFact[];
  faqs: Array<{ q: string; a: string }>;
  filters: CategoryFilter[];
};

function fromCategory(c: Category): CategoryDraft {
  const cols: CategoryColumn[] = Array.isArray(c.spec_columns) ? (c.spec_columns as CategoryColumn[]) : [];
  const rows: CategoryRow[] = Array.isArray(c.spec_rows) ? (c.spec_rows as CategoryRow[]) : [];
  const facts: CategoryFact[] = Array.isArray(c.buying_facts) ? (c.buying_facts as CategoryFact[]) : [];
  const faqs: Array<{ q: string; a: string }> = Array.isArray(c.faq_i18n)
    ? (c.faq_i18n as Array<{ q?: string; a?: string; question?: string; answer?: string }>)
        .map((f) => ({ q: f.q ?? f.question ?? "", a: f.a ?? f.answer ?? "" }))
    : [];
  const filters: CategoryFilter[] = Array.isArray(c.filters) ? (c.filters as CategoryFilter[]) : [];
  return {
    id: c.id,
    slug: c.slug,
    name_en: i18n(c.name_i18n),
    intro_en: i18n(c.intro_i18n),
    h1_en: i18n(c.h1_i18n),
    body_en: i18n(c.body_i18n) || "",
    kicker_en: i18n(c.homepage_kicker_i18n),
    hero_image: c.hero_image ?? null,
    hero_alt_en: i18n(c.hero_alt_i18n),
    seo_title_en: i18n(c.seo_title_i18n),
    seo_desc_en: i18n(c.seo_desc_i18n),
    active_on_homepage: !!c.active_on_homepage,
    seo_indexable: !!c.seo_indexable,
    is_published: c.is_published,
    sort_order: c.sort_order ?? 0,
    spec_columns: cols,
    spec_rows: rows,
    buying_facts: facts,
    faqs,
    filters,
  };
}

function emptyDraft(sortOrder: number): CategoryDraft {
  return {
    slug: "",
    name_en: "",
    intro_en: "",
    h1_en: "",
    body_en: "",
    kicker_en: "",
    hero_image: null,
    hero_alt_en: "",
    seo_title_en: "",
    seo_desc_en: "",
    active_on_homepage: false,
    seo_indexable: false,
    is_published: false,
    sort_order: sortOrder,
    spec_columns: [{ key: "grade", label: "Grade", width: "w-24", emphasis: true }],
    spec_rows: [],
    buying_facts: [],
    faqs: [],
    filters: [],
  };
}

const EN_WARN = (
  <span className="ml-1 rounded bg-amber-100 px-1 py-[1px] text-[10px] font-bold uppercase tracking-wider text-amber-700">
    Admin: ô tiếng Anh — ghi bằng tiếng Anh cho khách quốc tế
  </span>
);

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [draftNew, setDraftNew] = useState<CategoryDraft>(() => emptyDraft(initialCategories.length * 10 + 10));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const c of initialCategories) if (!next[c.id]) next[c.id] = fromCategory(c);
      return next;
    });
  }, [initialCategories]);

  async function run(fn: () => Promise<{ ok: boolean; message: string; id?: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { toast.push({ kind: "error", title: res.message }); return false; }
      toast.push({ kind: "success", title: res.message });
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    const fd = toFormData(draftNew);
    const ok = await run(() => createCategoryAction(Object.fromEntries(fd)));
    if (ok) {
      setDraftNew(emptyDraft(initialCategories.length * 10 + 20));
      setNewOpen(false);
    }
  }

  async function onUpdate(id: string) {
    const d = drafts[id];
    if (!d) return;
    const fd = toFormData(d);
    await run(() => updateCategoryAction(id, Object.fromEntries(fd)));
  }

  async function onDelete(id: string) {
    const hasChildren = initialCategories.some((c) => c.parent_id === id);
    const msg = hasChildren
      ? "Ngành này có danh mục con. Xoá sẽ ảnh hưởng cấu trúc. Bạn chắc chứ?\n\nLưu ý: nếu có NCC hoặc RFQ gắn với ngành này, hệ thống sẽ chặn xoá và đề nghị lưu trữ."
      : "Xác nhận xoá ngành này? Hành động không thể hoàn tác.\n\n(Nếu đã có NCC/RFQ, hãy chuyển trạng thái sang Nháp để ẩn thay vì xoá.)";
    if (!confirm(msg)) return;
    await run(() => deleteCategoryAction(id));
  }

  function onPreview(slug: string) {
    if (!slug) return;
    window.open(`/products/${slug}`, "_blank", "noopener");
  }

  const roots = useMemo(
    () => initialCategories.filter((c) => !c.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [initialCategories],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "Tổng quan", href: "/crm/dashboard" }, { label: "Danh mục" }]} />
      <PageHeader
        title="Danh mục ngành công khai"
        sub="Quản lý toàn bộ nội dung trang /products/[slug] tại đây: ảnh hero, H1, thân bài, bảng thông số, buying facts, FAQ, SEO và trạng thái công khai. Trang category tự render theo mẫu chung — không cần code lại cho ngành mới."
        actions={
          <div className="flex gap-2">
            <Link href="/crm/suppliers" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" /> Nhà cung cấp</Link>
            <Button variant="primary" onClick={() => setNewOpen((v) => !v)}><Plus className="h-4 w-4" /> Thêm ngành</Button>
          </div>
        }
      />

      {newOpen && (
        <CategoryEditor
          draft={draftNew}
          setDraft={setDraftNew}
          onSave={onCreate}
          onCancel={() => setNewOpen(false)}
          onPreview={onPreview}
          onDelete={() => setNewOpen(false)}
          busy={busy}
          isNew
        />
      )}

      {initialCategories.length === 0 ? (
        <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="Chưa có danh mục nào" sub="Thêm ngành đầu tiên để hiện trên trang công khai." />
      ) : (
        <div className="mt-6 space-y-4">
          {roots.map((c) => (
            <div key={c.id} className="card p-0">
              <div className="flex items-center gap-3 p-4">
                <button type="button" onClick={() => setExpanded((id) => (id === c.id ? null : c.id))} className="flex flex-1 items-center gap-3 text-left">
                  <ChevronDown className={"h-4 w-4 text-ink-400 transition " + (expanded === c.id ? "rotate-180" : "-rotate-90")} />
                  {c.hero_image ? (
                    <div className="relative h-10 w-16 overflow-hidden rounded-md bg-ink-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.hero_image} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-16 items-center justify-center rounded-md bg-ink-50 text-ink-300"><ImageIcon className="h-4 w-4" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold text-ink-900">{i18n(c.name_i18n) || c.slug}</p>
                      <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-mono text-ink-500">/{c.slug}</code>
                      {c.status === "draft" || !c.is_published ? <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-600">Nháp</span> : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Published</span>}
                      {c.active_on_homepage && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Home</span>}
                      {c.seo_indexable && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Indexable</span>}
                    </div>
                    <p className="truncate text-[12px] text-ink-500">{i18n(c.intro_i18n) || "Chưa có mô tả."}</p>
                  </div>
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onPreview(c.slug)} className="rounded-md border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Xem trước trang public" aria-label="Preview"><Eye className="h-4 w-4" /></button>
                </div>
              </div>
              {expanded === c.id && drafts[c.id] && (
                <div className="border-t border-ink-100 p-5">
                  <CategoryEditor
                    draft={drafts[c.id]}
                    setDraft={(d) => setDrafts((p) => ({ ...p, [c.id]: typeof d === "function" ? d(p[c.id]) : d }))}
                    onSave={() => onUpdate(c.id)}
                    onCancel={() => setExpanded(null)}
                    onPreview={onPreview}
                    onDelete={() => onDelete(c.id)}
                    busy={busy}
                    previousSlugs={c.previous_slugs ?? []}
                    canDelete={true}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toFormData(d: CategoryDraft): FormData {
  const fd = new FormData();
  fd.set("slug", d.slug);
  if (d.id) fd.set("id", d.id);
  fd.set("name_en", d.name_en);
  fd.set("intro_en", d.intro_en);
  fd.set("h1_en", d.h1_en);
  fd.set("body_en", d.body_en);
  fd.set("kicker_en", d.kicker_en);
  fd.set("hero_image", d.hero_image ?? "");
  fd.set("hero_alt_en", d.hero_alt_en);
  fd.set("seo_title_en", d.seo_title_en);
  fd.set("seo_desc_en", d.seo_desc_en);
  fd.set("active_on_homepage", d.active_on_homepage ? "on" : "");
  fd.set("seo_indexable", d.seo_indexable ? "on" : "");
  fd.set("is_published", d.is_published ? "on" : "");
  fd.set("sort_order", String(d.sort_order));
  fd.set("spec_columns", JSON.stringify(d.spec_columns));
  fd.set("spec_rows", JSON.stringify(d.spec_rows));
  fd.set("buying_facts", JSON.stringify(d.buying_facts));
  fd.set("faqs", JSON.stringify(d.faqs));
  fd.set("filters", JSON.stringify(d.filters));
  return fd;
}

function CategoryEditor({
  draft, setDraft, onSave, onCancel, onPreview, onDelete, busy, isNew, previousSlugs, canDelete,
}: {
  draft: CategoryDraft;
  setDraft: (updater: CategoryDraft | ((d: CategoryDraft) => CategoryDraft)) => void;
  onSave: () => void;
  onCancel: () => void;
  onPreview: (slug: string) => void;
  onDelete: () => void;
  busy: boolean;
  isNew?: boolean;
  previousSlugs?: string[];
  canDelete?: boolean;
}) {
  const set = <K extends keyof CategoryDraft>(k: K, v: CategoryDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const uploadUrl = draft.id ? `/api/categories/${encodeURIComponent(draft.id)}/hero-image` : "";

  return (
    <div className={"card space-y-5 p-5 " + (isNew ? "mt-6" : "")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">{isNew ? "Thêm ngành mới" : "Chỉnh sửa ngành"}</p>
        <div className="flex gap-2">
          {!isNew && draft.slug && (
            <button type="button" onClick={() => onPreview(draft.slug)} className="btn btn-ghost">
              <ExternalLink className="h-3.5 w-3.5" /> Xem trước
            </button>
          )}
          <button type="button" onClick={onCancel} className="btn btn-ghost">{isNew ? "Huỷ" : "Đóng"}</button>
          <Button type="button" variant="primary" disabled={busy} onClick={onSave}><Save className="h-3.5 w-3.5" /> Lưu</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label={<>Slug (url) {EN_WARN}</>}>
          <input value={draft.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))} required className="input font-mono text-[13px]" placeholder="vd: cashew, coffee, rubber" />
          {previousSlugs && previousSlugs.length > 0 && (
            <p className="mt-1 text-[11.5px] text-amber-700">Slug cũ sẽ tự 301: {previousSlugs.map((s) => "/" + s).join(", ")}</p>
          )}
        </Field>
        <Field label={<>Tên (tiếng Anh) {EN_WARN}</>}>
          <input value={draft.name_en} onChange={(e) => set("name_en", e.target.value)} required className="input" placeholder="Cashew, Coffee, Pepper…" />
        </Field>
      </div>

      <Field label={<>H1 override (tiếng Anh) — để trống dùng mặc định "{draft.name_en || "[Tên]"} suppliers in Vietnam" {EN_WARN}</>}>
        <input value={draft.h1_en} onChange={(e) => set("h1_en", e.target.value)} className="input" placeholder="vd: Vietnamese cashew kernel suppliers" />
      </Field>

      <Field label={<>Giới thiệu ngắn (en) — hiện ở hero trang category {EN_WARN}</>}>
        <textarea value={draft.intro_en} onChange={(e) => set("intro_en", e.target.value)} rows={2} className="input" placeholder="Một câu mô tả ngành cho buyer đọc ở trang category." />
      </Field>

      <Field label={<>Thân bài (en, HTML cơ bản được) — hiện sau khối NCC/lead {EN_WARN}</>}>
        <textarea value={draft.body_en} onChange={(e) => set("body_en", e.target.value)} rows={5} className="input font-mono text-[12.5px]" placeholder="<p>Mô tả dài…</p>" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label={<>Kicker trang chủ (en) {EN_WARN}</>}>
          <input value={draft.kicker_en} onChange={(e) => set("kicker_en", e.target.value)} className="input" placeholder="vd: W180 – SP, AFI grades" />
        </Field>
        <Field label="Thứ tự sắp xếp">
          <input value={draft.sort_order} onChange={(e) => set("sort_order", Number(e.target.value) || 0)} type="number" className="input" />
        </Field>
      </div>

      <div>
        <p className="mb-1 text-[12px] font-semibold text-ink-800">Ảnh hero category <span className="ml-1 font-normal text-ink-500">(1600px, JPEG nén 0.85, upload qua kho media)</span></p>
        {uploadUrl ? (
          <ImagePicker
            value={draft.hero_image}
            altValue={draft.hero_alt_en}
            onAltChange={(v) => set("hero_alt_en", v)}
            onChange={(v) => set("hero_image", v)}
            uploadUrl={uploadUrl}
            disabled={busy}
          />
        ) : (
          <Field label="Hero image (đường dẫn — sau khi Lưu để tạo ID bạn có thể upload ảnh)">
            <input value={draft.hero_image ?? ""} onChange={(e) => set("hero_image", e.target.value || null)} className="input font-mono text-[12.5px]" placeholder="/images/categories/cashew-hero.jpg hoặc /public-media/categories/xxx.jpg" />
          </Field>
        )}
      </div>

      <details className="rounded-xl border border-ink-200 p-4">
        <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">SEO — title & meta description (en)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={<>SEO title (en) {EN_WARN}</>}>
            <input value={draft.seo_title_en} onChange={(e) => set("seo_title_en", e.target.value)} className="input" placeholder="… | Vexim Trade" />
          </Field>
          <Field label={<>Meta description (en) {EN_WARN}</>}>
            <textarea value={draft.seo_desc_en} onChange={(e) => set("seo_desc_en", e.target.value)} rows={3} className="input" />
          </Field>
        </div>
      </details>

      <SpecEditor draft={draft} setDraft={setDraft} />
      <FactsEditor draft={draft} setDraft={setDraft} />
      <FaqsEditor draft={draft} setDraft={setDraft} />
      <FiltersEditor draft={draft} setDraft={setDraft} />

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
        <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
          <input type="checkbox" checked={draft.is_published} onChange={(e) => set("is_published", e.target.checked)} className="h-4 w-4" /> Công khai (published)
        </label>
        <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
          <input type="checkbox" checked={draft.active_on_homepage} onChange={(e) => set("active_on_homepage", e.target.checked)} className="h-4 w-4" /> Hiện ở trang chủ (What we source)
        </label>
        <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
          <input type="checkbox" checked={draft.seo_indexable} onChange={(e) => set("seo_indexable", e.target.checked)} className="h-4 w-4" /> Cho Google index (robots: index)
        </label>
        <span className="ml-auto flex gap-2">
          {canDelete && !isNew && (
            <Button type="button" variant="danger" disabled={busy} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> Xoá</Button>
          )}
        </span>
      </div>
    </div>
  );
}

/* --------------------------- JSON editors --------------------------- */

function SpecEditor({ draft, setDraft }: { draft: CategoryDraft; setDraft: (u: (d: CategoryDraft) => CategoryDraft) => void }) {
  const cols = draft.spec_columns;
  function addCol() { setDraft((d) => ({ ...d, spec_columns: [...d.spec_columns, { key: `col${d.spec_columns.length + 1}`, label: "", width: "", emphasis: false }] })); }
  function setCol(i: number, patch: Partial<CategoryColumn>) { setDraft((d) => ({ ...d, spec_columns: d.spec_columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) })); }
  function removeCol(i: number) {
    setDraft((d) => {
      const removing = d.spec_columns[i];
      return {
        ...d,
        spec_columns: d.spec_columns.filter((_, j) => j !== i),
        spec_rows: d.spec_rows.map((r) => { const copy = { ...r.values }; delete copy[removing.key]; return { ...r, values: copy }; }),
      };
    });
  }
  function addRow() { setDraft((d) => ({ ...d, spec_rows: [...d.spec_rows, { key: `row${d.spec_rows.length + 1}`, values: Object.fromEntries(d.spec_columns.map((c) => [c.key, ""])) }] })); }
  function setCell(ri: number, key: string, v: string) { setDraft((d) => ({ ...d, spec_rows: d.spec_rows.map((r, i) => (i === ri ? { ...r, values: { ...r.values, [key]: v } } : r)) })); }
  function removeRow(i: number) { setDraft((d) => ({ ...d, spec_rows: d.spec_rows.filter((_, j) => j !== i) })); }
  return (
    <details className="rounded-xl border border-ink-200 p-4">
      <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">Bảng thông số (grade/spec reference) — {cols.length} cột, {draft.spec_rows.length} hàng</summary>
      <div className="mt-3 space-y-3">
        <p className="text-[12px] text-ink-500">Tự do thêm/bớt cột (ví dụ: Grade, Name, Kernels/lb, Uses) và hàng dữ liệu. Chỉ hiện trên trang public khi có ≥1 cột.</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-500"><span>Cột</span><button type="button" onClick={addCol} className="btn btn-ghost py-1 text-[11.5px]"><Plus className="h-3 w-3" /> Thêm cột</button></div>
          {cols.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_0.7fr_auto_auto]">
              <input value={c.key} onChange={(e) => setCol(i, { key: e.target.value.replace(/\s+/g, "_") })} className="input font-mono text-[12.5px]" placeholder="key (vd: grade)" />
              <input value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} className="input text-[13px]" placeholder="Tiêu đề cột" />
              <input value={c.width ?? ""} onChange={(e) => setCol(i, { width: e.target.value })} className="input font-mono text-[12.5px]" placeholder="w-24" />
              <label className="flex items-center gap-1 text-[12px] text-ink-700"><input type="checkbox" checked={!!c.emphasis} onChange={(e) => setCol(i, { emphasis: e.target.checked })} className="h-3.5 w-3.5" /> Đậm</label>
              <button type="button" onClick={() => removeCol(i)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600"><Minus className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-ink-100 pt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-500"><span>Hàng dữ liệu</span><button type="button" onClick={addRow} disabled={cols.length === 0} className="btn btn-ghost py-1 text-[11.5px] disabled:opacity-50"><Plus className="h-3 w-3" /> Thêm hàng</button></div>
          {draft.spec_rows.map((r, ri) => (
            <div key={ri} className="flex flex-wrap items-start gap-2 rounded-md border border-ink-100 p-2">
              {cols.map((c) => (
                <div key={c.key} className="min-w-[120px] flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">{c.label || c.key}</p>
                  <input value={r.values?.[c.key] ?? ""} onChange={(e) => setCell(ri, c.key, e.target.value)} className="input mt-1 text-[12.5px]" />
                </div>
              ))}
              <button type="button" onClick={() => removeRow(ri)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600"><Minus className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function FactsEditor({ draft, setDraft }: { draft: CategoryDraft; setDraft: (u: (d: CategoryDraft) => CategoryDraft) => void }) {
  const facts = draft.buying_facts;
  function add() { setDraft((d) => ({ ...d, buying_facts: [...d.buying_facts, { key: `fact${d.buying_facts.length + 1}`, icon: "scale", label: "", value: "" }] })); }
  function set(i: number, patch: Partial<CategoryFact>) { setDraft((d) => ({ ...d, buying_facts: d.buying_facts.map((f, j) => (j === i ? { ...f, ...patch } : f)) })); }
  function remove(i: number) { setDraft((d) => ({ ...d, buying_facts: d.buying_facts.filter((_, j) => j !== i) })); }
  return (
    <details className="rounded-xl border border-ink-200 p-4">
      <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">Khối "Buying basics" — {facts.length} mục</summary>
      <div className="mt-3 space-y-3">
        <p className="text-[12px] text-ink-500">6 thẻ sự thật mua hàng (MOQ, đóng gói, Incoterms, cảng, mùa vụ, thanh toán…). Icon: scale / package / ship / anchor / calendar / users / factory / check / shield.</p>
        <button type="button" onClick={add} className="btn btn-ghost py-1 text-[12px]"><Plus className="h-3 w-3" /> Thêm mục</button>
        {facts.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-ink-100 p-2 sm:grid-cols-[100px_1fr_2fr_auto]">
            <input value={f.icon} onChange={(e) => set(i, { icon: e.target.value as CategoryFact["icon"] })} className="input font-mono text-[12.5px]" placeholder="icon" />
            <input value={f.label} onChange={(e) => set(i, { label: e.target.value })} className="input text-[13px]" placeholder="Nhãn (vd: Minimum order)" />
            <input value={f.value} onChange={(e) => set(i, { value: e.target.value })} className="input text-[13px]" placeholder="Nội dung…" />
            <button type="button" onClick={() => remove(i)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600"><Minus className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </details>
  );
}

function FaqsEditor({ draft, setDraft }: { draft: CategoryDraft; setDraft: (u: (d: CategoryDraft) => CategoryDraft) => void }) {
  function add() { setDraft((d) => ({ ...d, faqs: [...d.faqs, { q: "", a: "" }] })); }
  function set(i: number, patch: Partial<{ q: string; a: string }>) { setDraft((d) => ({ ...d, faqs: d.faqs.map((f, j) => (j === i ? { ...f, ...patch } : f)) })); }
  function remove(i: number) { setDraft((d) => ({ ...d, faqs: d.faqs.filter((_, j) => j !== i) })); }
  return (
    <details className="rounded-xl border border-ink-200 p-4">
      <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">FAQ — {draft.faqs.length} câu (tự sinh accordion + JSON-LD FAQPage)</summary>
      <div className="mt-3 space-y-3">
        <button type="button" onClick={add} className="btn btn-ghost py-1 text-[12px]"><Plus className="h-3 w-3" /> Thêm câu hỏi</button>
        {draft.faqs.map((f, i) => (
          <div key={i} className="space-y-2 rounded-md border border-ink-100 p-2">
            <input value={f.q} onChange={(e) => set(i, { q: e.target.value })} className="input text-[13px] font-semibold" placeholder="Câu hỏi (tiếng Anh)" />
            <textarea value={f.a} onChange={(e) => set(i, { a: e.target.value })} rows={2} className="input text-[13px]" placeholder="Câu trả lời (tiếng Anh)" />
            <div className="flex justify-end"><button type="button" onClick={() => remove(i)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600"><Minus className="h-3.5 w-3.5" /></button></div>
          </div>
        ))}
      </div>
    </details>
  );
}

function FiltersEditor({ draft, setDraft }: { draft: CategoryDraft; setDraft: (u: (d: CategoryDraft) => CategoryDraft) => void }) {
  function add() { setDraft((d) => ({ ...d, filters: [...d.filters, { key: `filter${d.filters.length + 1}`, label: "", options: [] as CategoryFilter["options"] }] })); }
  function set(i: number, patch: Partial<CategoryFilter>) { setDraft((d) => ({ ...d, filters: d.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) })); }
  function remove(i: number) { setDraft((d) => ({ ...d, filters: d.filters.filter((_, j) => j !== i) })); }
  return (
    <details className="rounded-xl border border-ink-200 p-4">
      <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">Filters (thuộc tính lọc) — {draft.filters.length} nhóm — MVP đang stub, sau sẽ lọc động</summary>
      <div className="mt-3 space-y-3">
        <button type="button" onClick={add} className="btn btn-ghost py-1 text-[12px]"><Plus className="h-3 w-3" /> Thêm nhóm</button>
        {draft.filters.map((f, i) => (
          <div key={i} className="space-y-2 rounded-md border border-ink-100 p-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr]">
              <input value={f.key} onChange={(e) => set(i, { key: e.target.value.replace(/\s+/g, "_") })} className="input font-mono text-[12.5px]" placeholder="key (vd: grade)" />
              <input value={f.label} onChange={(e) => set(i, { label: e.target.value })} className="input text-[13px]" placeholder="Nhãn (vd: Grade)" />
            </div>
            <input value={(f.options ?? []).map((o) => (typeof o === "string" ? o : o.label)).join(", ")} onChange={(e) => set(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).map((s) => ({ value: s.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: s })) })} className="input font-mono text-[12.5px]" placeholder="Các lựa chọn, cách nhau bởi dấu phẩy (W180, W240, W320)" />
            <div className="flex justify-end"><button type="button" onClick={() => remove(i)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600"><Minus className="h-3.5 w-3.5" /></button></div>
          </div>
        ))}
      </div>
    </details>
  );
}
