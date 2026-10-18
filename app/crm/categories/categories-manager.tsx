"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Minus,
  Plus,
  Search,
  Sparkles,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/actions";
import { Breadcrumbs, Button, Field } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ImagePicker } from "@/components/image-picker";
import { decideCategoryPublicationAction } from "./publication-actions";
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
    spec_columns: [],
    spec_rows: [],
    buying_facts: [],
    faqs: [],
    filters: [],
  };
}

export function CategoriesManager({ initialCategories, canPublish = false, aiEnabled = false }: { initialCategories: Category[]; canPublish?: boolean; aiEnabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [draftNew, setDraftNew] = useState<CategoryDraft>(() => emptyDraft(initialCategories.length * 10 + 10));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
      if (!res.ok) { toast.push({ kind: "error", title: res.message }); return null; }
      toast.push({ kind: "success", title: res.message });
      startTransition(() => router.refresh());
      return res;
    } catch (error) {
      toast.push({ kind: "error", title: error instanceof Error ? error.message : "Không lưu được danh mục." });
      return null;
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
      if (ok.id) setExpanded(ok.id);
    }
  }

  async function onUpdate(id: string, publish?: boolean) {
    const d = drafts[id];
    if (!d) return;
    if (publish !== undefined && !window.confirm(publish ? "Công khai danh mục này trên website?" : "Ẩn danh mục này khỏi website?")) return;
    if (publish !== undefined) {
      const saved = initialCategories.find((category) => category.id === id);
      if (saved && JSON.stringify(d) !== JSON.stringify(fromCategory(saved)) &&
          !window.confirm("Nội dung trong form khác bản đã lưu. Quyết định này chỉ áp dụng cho bản đã lưu, không lưu các ô đang nhập. Tiếp tục?")) return;
      const ok = await run(() => decideCategoryPublicationAction(id, publish));
      if (ok) setDrafts((prev) => ({ ...prev, [id]: { ...d, is_published: publish } }));
      return;
    }
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

  const visible = useMemo(() => initialCategories
    .filter((c) => `${i18n(c.name_i18n)} ${c.slug}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slug.localeCompare(b.slug)), [initialCategories, query]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "Tổng quan", href: "/crm/dashboard" }, { label: "Danh mục" }]} />
      <PageHeader
        title="Danh mục sản phẩm"
        sub="Chọn một danh mục để chỉnh sửa nội dung trang web. Lưu không tự công khai."
        actions={<Button variant="primary" onClick={() => { setExpanded(null); setNewOpen(true); }}><Plus className="h-4 w-4" /> Thêm danh mục</Button>}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="card overflow-hidden p-0 lg:sticky lg:top-20">
          <div className="border-b border-ink-100 p-4">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm danh mục…" aria-label="Tìm danh mục" />
            </label>
            <p className="mt-2 text-xs text-ink-500">{visible.length} danh mục</p>
          </div>
          <nav aria-label="Danh mục sản phẩm" className="max-h-[65vh] overflow-y-auto p-2">
            {visible.map((c) => <button type="button" key={c.id}
              onClick={() => { setNewOpen(false); setExpanded(c.id); }}
              className={"flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-ink-50 " + (expanded === c.id && !newOpen ? "bg-brand-50 ring-1 ring-brand-200" : "")}>
              {c.hero_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.hero_image} alt="" className="h-11 w-12 shrink-0 rounded-lg object-cover" />
              ) : <span className="flex h-11 w-12 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-400"><ImageIcon className="h-4 w-4" /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">{i18n(c.name_i18n) || c.slug}</span>
                <span className="block truncate text-xs text-ink-500">{c.is_published && c.status === "published" ? "Công khai" : "Bản nháp"} · /{c.slug}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" />
            </button>)}
            {visible.length === 0 && <p className="p-4 text-sm text-ink-500">Không tìm thấy danh mục.</p>}
          </nav>
        </aside>
        <main className="min-w-0">
          {newOpen ? <CategoryEditor draft={draftNew} setDraft={setDraftNew} onSave={onCreate} onCancel={() => setNewOpen(false)} onPreview={onPreview} onDelete={() => setNewOpen(false)} busy={busy} isNew canPublish={canPublish} aiEnabled={aiEnabled} />
          : expanded && drafts[expanded] ? (() => {
            const c = initialCategories.find((item) => item.id === expanded);
            if (!c) return null;
            return <CategoryEditor key={c.id} draft={drafts[c.id]}
              setDraft={(d) => setDrafts((p) => ({ ...p, [c.id]: typeof d === "function" ? d(p[c.id]) : d }))}
              onSave={() => onUpdate(c.id)} onPublish={(publish) => onUpdate(c.id, publish)}
              onCancel={() => setExpanded(null)} onPreview={onPreview} onDelete={() => onDelete(c.id)}
              busy={busy} previousSlugs={c.previous_slugs ?? []} canDelete canPublish={canPublish} aiEnabled={aiEnabled} />;
          })() : <div className="card flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
            <FolderOpen className="h-10 w-10 text-brand-600" />
            <h2 className="text-lg font-bold text-ink-900">Chọn danh mục để bắt đầu</h2>
            <p className="text-sm text-ink-500">Hoặc tạo danh mục mới, lưu nháp rồi bổ sung ảnh và nội dung.</p>
            <Button variant="primary" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Thêm danh mục</Button>
          </div>}
        </main>
      </div>
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
  draft, setDraft, onSave, onPublish, onCancel, onPreview, onDelete, busy, isNew, previousSlugs, canDelete, canPublish, aiEnabled,
}: {
  draft: CategoryDraft;
  setDraft: (updater: CategoryDraft | ((d: CategoryDraft) => CategoryDraft)) => void;
  onSave: () => void;
  onPublish?: (publish: boolean) => void;
  onCancel: () => void;
  onPreview: (slug: string) => void;
  onDelete: () => void;
  busy: boolean;
  isNew?: boolean;
  previousSlugs?: string[];
  canDelete?: boolean;
  canPublish?: boolean;
  aiEnabled?: boolean;
}) {
  const set = <K extends keyof CategoryDraft>(k: K, v: CategoryDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const uploadUrl = draft.id ? `/api/categories/${encodeURIComponent(draft.id)}/hero-image` : "";
  const [drafting, setDrafting] = useState(false);
  const toast = useToast();

  async function aiIntro() {
    if (!draft.name_en.trim()) { toast.push({ kind: "error", title: "Nhập tên danh mục trước." }); return; }
    if (draft.intro_en.trim() && !window.confirm("Thay phần giới thiệu hiện tại bằng bản nháp AI?")) return;
    setDrafting(true);
    try {
      const response = await fetch("/api/ai/editor-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "category", name: draft.name_en, facts: draft.buying_facts.filter((f) => f.label && f.value).map((f) => `${f.label}: ${f.value}`).slice(0, 6) }),
      });
      const data = await response.json() as { text?: string; message?: string };
      if (!response.ok || !data.text) throw new Error(data.message ?? "AI chưa soạn được. Thử lại sau.");
      set("intro_en", data.text);
      toast.push({ kind: "success", title: "Đã điền bản nháp. Hãy kiểm tra trước khi lưu." });
    } catch (error) { toast.push({ kind: "error", title: error instanceof Error ? error.message : "Lỗi AI" }); }
    finally { setDrafting(false); }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-4">
          <div>
            <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (draft.is_published ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-600")}>{draft.is_published ? "Công khai" : "Bản nháp"}</span>
            <h2 className="mt-3 text-xl font-bold text-ink-900">{isNew ? "Danh mục mới" : (draft.name_en || "Chỉnh sửa danh mục")}</h2>
          </div>
          {!isNew && draft.slug && <button type="button" className="btn btn-ghost" onClick={() => onPreview(draft.slug)}><ExternalLink className="h-4 w-4" /> Xem trang</button>}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Tên danh mục (tiếng Anh)" required className="sm:col-span-2">
            <input className="input" value={draft.name_en} onChange={(e) => setDraft((d) => ({
              ...d, name_en: e.target.value,
              slug: isNew && d.slug === d.name_en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                ? e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : d.slug,
            }))} placeholder="Cashew, Coffee, Pepper…" />
          </Field>
          <Field label="Đường dẫn" required><input className="input" value={draft.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))} placeholder="cashew" /></Field>
          <Field label="Thứ tự hiển thị"><input type="number" className="input" value={draft.sort_order} onChange={(e) => set("sort_order", Number(e.target.value) || 0)} /></Field>
          {previousSlugs && previousSlugs.length > 0 && <p className="text-xs text-ink-500 sm:col-span-2">Đường dẫn cũ sẽ tự chuyển tiếp: {previousSlugs.map((s) => "/products/" + s).join(", ")}</p>}
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-base font-bold text-ink-900">Nội dung trang</h3><p className="text-sm text-ink-500">Viết cho khách hàng quốc tế bằng tiếng Anh.</p></div>
          {aiEnabled && <Button type="button" size="sm" disabled={drafting || busy} onClick={() => void aiIntro()}>{drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI soạn giới thiệu</Button>}
        </div>
        <div className="space-y-4">
          <Field label="Giới thiệu ngắn"><textarea className="input" rows={3} value={draft.intro_en} onChange={(e) => set("intro_en", e.target.value)} placeholder="A concise introduction for international buyers…" /></Field>
          <Field label="Nội dung chi tiết"><textarea className="input" rows={6} value={draft.body_en} onChange={(e) => set("body_en", e.target.value)} placeholder="Giới thiệu ngành hàng, sản phẩm, điểm cần lưu ý…" /></Field>
          <div><p className="mb-2 text-sm font-semibold text-ink-800">Ảnh bìa</p>
            {uploadUrl ? <ImagePicker value={draft.hero_image} altValue={draft.hero_alt_en} onAltChange={(v) => set("hero_alt_en", v)} onChange={(v) => set("hero_image", v)} uploadUrl={uploadUrl} disabled={busy} />
            : <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-sm text-ink-500">Lưu danh mục trước để tải ảnh lên.</p>}
          </div>
        </div>
      </section>

      <details className="card p-5">
        <summary className="cursor-pointer text-base font-bold text-ink-900">Bảng thông số, thông tin mua hàng & câu hỏi</summary>
        <div className="mt-4 space-y-3"><SpecEditor draft={draft} setDraft={setDraft} /><FactsEditor draft={draft} setDraft={setDraft} /><FaqsEditor draft={draft} setDraft={setDraft} /></div>
      </details>

      <details className="card p-5">
        <summary className="cursor-pointer text-base font-bold text-ink-900">Hiển thị & tìm kiếm</summary>
        <div className="mt-5 space-y-4">
          <Field label="Tiêu đề trang (H1)"><input className="input" value={draft.h1_en} onChange={(e) => set("h1_en", e.target.value)} placeholder={`Để trống: ${draft.name_en || "Category"} suppliers in Vietnam`} /></Field>
          <Field label="Dòng giới thiệu trên trang chủ"><input className="input" value={draft.kicker_en} onChange={(e) => set("kicker_en", e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tiêu đề tìm kiếm"><input className="input" value={draft.seo_title_en} onChange={(e) => set("seo_title_en", e.target.value)} /></Field>
            <Field label="Mô tả tìm kiếm"><textarea className="input" rows={2} value={draft.seo_desc_en} onChange={(e) => set("seo_desc_en", e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={draft.active_on_homepage} disabled={!canPublish} onChange={(e) => set("active_on_homepage", e.target.checked)} /> Hiển thị trên trang chủ</label>
          <label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={draft.seo_indexable} disabled={!canPublish} onChange={(e) => set("seo_indexable", e.target.checked)} /> Cho phép Google lập chỉ mục khi công khai</label>
          {canDelete && !isNew && <div className="border-t border-ink-100 pt-4"><Button type="button" variant="danger" disabled={busy} onClick={onDelete}><Trash2 className="h-4 w-4" /> Xoá danh mục</Button></div>}
        </div>
      </details>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <span className="text-sm text-ink-500">Lưu không tự chuyển trạng thái.</span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onCancel}>Đóng</Button>
          <Button type="button" variant="primary" disabled={busy} onClick={onSave}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {isNew ? "Lưu bản nháp" : "Lưu thay đổi"}</Button>
        </div>
      </div>
      {!isNew && canPublish && onPublish && <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div><h3 className="font-bold text-ink-900">Trạng thái công khai</h3><p className="text-sm text-ink-500">{draft.is_published ? "Trang này đang hiển thị trên website." : "Trang này chỉ hiển thị trong CRM."}</p></div>
        <Button type="button" variant={draft.is_published ? "ghost" : "soft"} disabled={busy} onClick={() => onPublish(!draft.is_published)}>{draft.is_published ? "Ẩn khỏi website" : "Công khai trang"}</Button>
      </div>}
    </div>
  );
}

/* --------------------------- JSON editors --------------------------- */

function SpecEditor({ draft, setDraft }: { draft: CategoryDraft; setDraft: (u: (d: CategoryDraft) => CategoryDraft) => void }) {
  const cols = draft.spec_columns;
  function addCol() { setDraft((d) => {
    let n = d.spec_columns.length + 1;
    while (d.spec_columns.some((c) => c.key === `col${n}`)) n++;
    return { ...d, spec_columns: [...d.spec_columns, { key: `col${n}`, label: "", width: "", emphasis: false }] };
  }); }
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
  function addRow() { setDraft((d) => {
    let n = d.spec_rows.length + 1;
    while (d.spec_rows.some((r) => r.key === `row${n}`)) n++;
    return { ...d, spec_rows: [...d.spec_rows, { key: `row${n}`, values: Object.fromEntries(d.spec_columns.map((c) => [c.key, ""])) }] };
  }); }
  function setCell(ri: number, key: string, v: string) { setDraft((d) => ({ ...d, spec_rows: d.spec_rows.map((r, i) => (i === ri ? { ...r, values: { ...r.values, [key]: v } } : r)) })); }
  function removeRow(i: number) { setDraft((d) => ({ ...d, spec_rows: d.spec_rows.filter((_, j) => j !== i) })); }
  return (
    <details className="rounded-xl border border-ink-200 p-4">
      <summary className="cursor-pointer font-semibold text-ink-800">Bảng thông số · {draft.spec_rows.length} hàng</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-ink-500">Thêm tiêu đề cột và điền dữ liệu cho từng dòng.</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-500"><span>Cột</span><button type="button" onClick={addCol} className="btn btn-ghost py-1 text-[11.5px]"><Plus className="h-3 w-3" /> Thêm cột</button></div>
          {cols.map((c, i) => (
            <div key={c.key} className="flex flex-wrap items-center gap-2">
              <input value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} className="input min-w-40 flex-1 text-[13px]" aria-label={`Tiêu đề cột ${i + 1}`} placeholder="Tiêu đề cột" />
              <label className="flex items-center gap-1 text-[12px] text-ink-700"><input type="checkbox" checked={!!c.emphasis} onChange={(e) => setCol(i, { emphasis: e.target.checked })} className="h-3.5 w-3.5" /> Nổi bật</label>
              <button type="button" onClick={() => removeCol(i)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600" aria-label={`Xoá cột ${i + 1}`}><Minus className="h-3.5 w-3.5" /></button>
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
      <summary className="cursor-pointer font-semibold text-ink-800">Thông tin mua hàng · {facts.length} mục</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-ink-500">Ví dụ: số lượng tối thiểu, đóng gói, cảng xuất.</p>
        <button type="button" onClick={add} className="btn btn-ghost py-1 text-[12px]"><Plus className="h-3 w-3" /> Thêm mục</button>
        {facts.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-ink-100 p-2 sm:grid-cols-[100px_1fr_2fr_auto]">
            <select value={f.icon} onChange={(e) => set(i, { icon: e.target.value as CategoryFact["icon"] })} className="input text-[12.5px]" aria-label="Biểu tượng">
              {(["scale", "package", "ship", "anchor", "calendar", "users", "factory", "check", "shield", "tag"] as const).map((icon) => <option key={icon} value={icon}>{({ scale: "Khối lượng", package: "Đóng gói", ship: "Vận chuyển", anchor: "Cảng", calendar: "Thời gian", users: "Đối tác", factory: "Nhà máy", check: "Kiểm tra", shield: "Chất lượng", tag: "Nhãn" })[icon]}</option>)}
            </select>
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
      <summary className="cursor-pointer font-semibold text-ink-800">Câu hỏi thường gặp · {draft.faqs.length} câu</summary>
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
