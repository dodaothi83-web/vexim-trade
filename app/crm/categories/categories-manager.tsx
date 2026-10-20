"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CornerDownRight,
  ExternalLink,
  Eye,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/actions";
import { Badge, Breadcrumbs, Button, Field, formatDateTime } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ImagePicker } from "@/components/image-picker";
import { decideCategoryPublicationAction } from "./publication-actions";
import { reorderCategoriesAction } from "./reorder-actions";
import { useToast } from "@/components/toast";
import type { Category, CategoryColumn, CategoryFact, CategoryFilter, CategoryRow, ProductAttributeField } from "@/lib/types";

export type CategoryStats = { products: number; suppliers: number };

function i18n(v: { en?: string } | null | undefined): string {
  if (!v || typeof v !== "object") return "";
  return (v.en ?? "") as string;
}

function isPublished(c: Category): boolean {
  return !!(c.is_published && c.status === "published");
}

type EditorTab = "basic" | "content" | "spec" | "fields" | "faq" | "seo";

type CategoryDraft = {
  id?: string;
  slug: string;
  parent_id: string | null;
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
  product_fields: ProductAttributeField[];
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
    parent_id: c.parent_id ?? null,
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
    is_published: isPublished(c),
    sort_order: c.sort_order ?? 0,
    spec_columns: cols,
    product_fields: Array.isArray(c.product_fields) ? c.product_fields : [],
    spec_rows: rows,
    buying_facts: facts,
    faqs,
    filters,
  };
}

function emptyDraft(sortOrder: number): CategoryDraft {
  return {
    slug: "",
    parent_id: null,
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
    product_fields: [],
    spec_rows: [],
    buying_facts: [],
    faqs: [],
    filters: [],
  };
}

/* ------------------------- Checklist & độ hoàn thiện ------------------------- */

type ChecklistItem = {
  key: string;
  label: string;
  required: boolean;
  done: boolean;
  tab: EditorTab;
};

function checklistOf(d: CategoryDraft): ChecklistItem[] {
  return [
    { key: "name", label: "Tên & đường dẫn trang", required: true, done: !!(d.name_en.trim() && d.slug.trim()), tab: "basic" },
    { key: "hero", label: "Ảnh bìa", required: true, done: !!d.hero_image, tab: "content" },
    { key: "intro", label: "Giới thiệu ngắn cho buyer", required: true, done: !!d.intro_en.trim(), tab: "content" },
    { key: "faq", label: "Ít nhất 1 câu hỏi thường gặp", required: false, done: d.faqs.some((f) => f.q.trim()), tab: "faq" },
    { key: "fields", label: "Trường dữ liệu cho sản phẩm", required: false, done: d.product_fields.length > 0, tab: "fields" },
    { key: "seo", label: "Tiêu đề & mô tả trên Google", required: false, done: !!(d.seo_title_en.trim() && d.seo_desc_en.trim()), tab: "seo" },
  ];
}

function completenessOf(d: CategoryDraft): number {
  const items = checklistOf(d);
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

function missingLabels(c: Category): string[] {
  const items = checklistOf(fromCategory(c));
  return items.filter((i) => i.required && !i.done).map((i) => i.label);
}

type ListFilter = "all" | "published" | "draft" | "noimg" | "incomplete";

/* --------------------------------- Manager --------------------------------- */

export function CategoriesManager({
  initialCategories,
  canPublish = false,
  aiEnabled = false,
  stats = {},
  currentUserId = "",
  isAdmin = false,
}: {
  initialCategories: Category[];
  canPublish?: boolean;
  aiEnabled?: boolean;
  stats?: Record<string, CategoryStats>;
  currentUserId?: string;
  /** Admin toàn quyền được tự công khai bản mình sửa cuối (ngoại lệ quy tắc 2 người). */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("basic");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [level, setLevel] = useState<"all" | "root" | "child">("all");
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});
  // null = đóng hộp thoại tạo; id null = tạo ngành tổng hợp, có id = tạo ngành con của ngành đó.
  const [createParent, setCreateParent] = useState<{ id: string | null; name: string } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // Đồng bộ bản nháp với dữ liệu server sau mỗi lần tải lại:
  // - Chưa có bản nháp → tạo từ bản đã lưu.
  // - Vừa Lưu thành công (pendingSync) hoặc bản nháp đang "sạch" so với bản đã
  //   lưu trước đó → thay bằng bản server mới nhất, để việc server chuẩn hoá
  //   dữ liệu khi lưu không khiến giao diện báo "chưa lưu" oan.
  // - Đang sửa dở (khác bản đã lưu) → giữ nguyên, không đè.
  const prevSavedJsonRef = useRef<Map<string, string>>(new Map());
  const pendingSyncRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const c of initialCategories) {
        const fresh = fromCategory(c);
        const freshJson = JSON.stringify(fresh);
        const prevSavedJson = prevSavedJsonRef.current.get(c.id);
        if (pendingSyncRef.current.has(c.id)) {
          next[c.id] = fresh;
          pendingSyncRef.current.delete(c.id);
        } else if (!next[c.id]) next[c.id] = fresh;
        else if (prevSavedJson !== undefined && JSON.stringify(next[c.id]) === prevSavedJson) next[c.id] = fresh;
        prevSavedJsonRef.current.set(c.id, freshJson);
      }
      return next;
    });
  }, [initialCategories]);

  const savedById = useMemo(() => new Map(initialCategories.map((c) => [c.id, c])), [initialCategories]);

  const dirtyIds = useMemo(() => {
    const dirty = new Set<string>();
    for (const [id, draft] of Object.entries(drafts)) {
      const saved = savedById.get(id);
      if (saved && JSON.stringify(draft) !== JSON.stringify(fromCategory(saved))) dirty.add(id);
    }
    return dirty;
  }, [drafts, savedById]);

  // Chặn đóng tab/trình duyệt khi còn thay đổi chưa lưu ở bất kỳ danh mục nào.
  useEffect(() => {
    if (dirtyIds.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyIds]);

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

  async function onCreate(input: { name_en: string; slug: string; parent_id: string | null }) {
    const nextSort = initialCategories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0) + 10;
    const draft: CategoryDraft = { ...emptyDraft(nextSort), name_en: input.name_en, slug: input.slug, parent_id: input.parent_id };
    const fd = toFormData(draft);
    const ok = await run(() => createCategoryAction(Object.fromEntries(fd)));
    if (ok?.id) {
      setCreateParent(null);
      setEditorTab("content");
      setEditingId(ok.id);
    }
    return !!ok;
  }

  async function onUpdate(id: string, publish?: boolean) {
    const d = drafts[id];
    if (!d) return;
    if (publish !== undefined) {
      // Công khai/Ẩn là quyết định riêng trên BẢN ĐÃ LƯU (giữ nguyên tắc cũ):
      // còn sửa dở thì chặn ngay tại đây với lý do rõ ràng.
      if (dirtyIds.has(id)) {
        toast.push({ kind: "error", title: "Bạn đang có thay đổi chưa lưu. Hãy Lưu bản nháp trước, rồi mới công khai/ẩn." });
        return;
      }
      if (!window.confirm(publish ? "Công khai danh mục này trên website? Thao tác áp dụng cho nội dung đã lưu." : "Ẩn danh mục này khỏi website?")) return;
      const ok = await run(() => decideCategoryPublicationAction(id, publish));
      if (ok) setDrafts((prev) => ({ ...prev, [id]: { ...d, is_published: publish } }));
      return;
    }
    const fd = toFormData(d);
    const saved = await run(() => updateCategoryAction(id, Object.fromEntries(fd)));
    if (saved) pendingSyncRef.current.add(id);
  }

  async function onDelete(id: string) {
    const hasChildren = initialCategories.some((c) => c.parent_id === id);
    const msg = hasChildren
      ? "Ngành này có danh mục con. Xoá sẽ ảnh hưởng cấu trúc. Bạn chắc chứ?\n\nLưu ý: nếu có NCC hoặc RFQ gắn với ngành này, hệ thống sẽ chặn xoá và đề nghị lưu trữ."
      : "Xác nhận xoá ngành này? Hành động không thể hoàn tác.\n\n(Nếu đã có NCC/RFQ, hãy chuyển trạng thái sang Nháp để ẩn thay vì xoá.)";
    if (!confirm(msg)) return;
    const ok = await run(() => deleteCategoryAction(id));
    if (ok) {
      setEditingId((cur) => (cur === id ? null : cur));
      setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  async function onReorder(siblingIdsInNewOrder: string[]) {
    const siblings = siblingIdsInNewOrder
      .map((id) => savedById.get(id))
      .filter((c): c is Category => !!c);
    if (siblings.length < 2) return;
    // Hoán vị các giá trị sort_order cũ trong nhóm — không xáo trộn thứ tự toàn cục.
    const oldOrders = siblings.map((c) => c.sort_order ?? 0).sort((a, b) => a - b);
    const orderedIds = siblingIdsInNewOrder;
    const currentOrder = [...siblings].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slug.localeCompare(b.slug)).map((c) => c.id);
    if (JSON.stringify(currentOrder) === JSON.stringify(orderedIds)) return;
    const updates = orderedIds.map((id, i) => ({ id, sort_order: oldOrders[i] ?? (i + 1) * 10 }));
    await run(() => reorderCategoriesAction(updates));
  }

  function onPreview(slug: string) {
    if (!slug) return;
    window.open(`/products/${slug}`, "_blank", "noopener");
  }

  function openEditor(id: string, tab: EditorTab = "basic") {
    setEditorTab(tab);
    setEditingId(id);
    setOpenMenuId(null);
  }

  /* ---- Cây danh mục: cha xếp trước, con thụt cấp ngay dưới cha ---- */
  const treeRows = useMemo(() => {
    const byId = new Map(initialCategories.map((c) => [c.id, c]));
    const bySort = (a: Category, b: Category) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.slug.localeCompare(b.slug);
    const childrenOf = new Map<string, Category[]>();
    const roots: Category[] = [];
    for (const c of initialCategories) {
      if (c.parent_id && byId.has(c.parent_id)) {
        const arr = childrenOf.get(c.parent_id) ?? [];
        arr.push(c);
        childrenOf.set(c.parent_id, arr);
      } else roots.push(c);
    }
    roots.sort(bySort);
    const rows: Array<{ cat: Category; depth: 0 | 1; childCount: number }> = [];
    for (const root of roots) {
      const kids = (childrenOf.get(root.id) ?? []).sort(bySort);
      rows.push({ cat: root, depth: 0, childCount: kids.length });
      for (const kid of kids) rows.push({ cat: kid, depth: 1, childCount: 0 });
    }
    return rows;
  }, [initialCategories]);

  const statsFor = useMemo(() => (c: Category): CategoryStats => {
    const own = stats[c.slug.toLowerCase()] ?? { products: 0, suppliers: 0 };
    const kids = initialCategories.filter((x) => x.parent_id === c.id);
    if (kids.length === 0) return own;
    let products = own.products;
    const supplierUpperBound = own.suppliers;
    let suppliers = supplierUpperBound;
    for (const kid of kids) {
      const ks = stats[kid.slug.toLowerCase()] ?? { products: 0, suppliers: 0 };
      products += ks.products;
      suppliers += ks.suppliers;
    }
    return { products, suppliers };
  }, [initialCategories, stats]);

  const counts = useMemo(() => {
    const draftsOnly = initialCategories.filter((c) => !isPublished(c)).length;
    return {
      total: initialCategories.length,
      roots: initialCategories.filter((c) => !c.parent_id).length,
      published: initialCategories.length - draftsOnly,
      draft: draftsOnly,
      noimg: initialCategories.filter((c) => !c.hero_image).length,
      incomplete: initialCategories.filter((c) => missingLabels(c).length > 0).length,
    };
  }, [initialCategories]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return treeRows.filter(({ cat, depth }) => {
      if (level === "root" && depth !== 0) return false;
      if (level === "child" && depth !== 1) return false;
      if (filter === "published" && !isPublished(cat)) return false;
      if (filter === "draft" && isPublished(cat)) return false;
      if (filter === "noimg" && cat.hero_image) return false;
      if (filter === "incomplete" && missingLabels(cat).length === 0) return false;
      if (q && !`${i18n(cat.name_i18n)} ${cat.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [treeRows, query, filter, level]);

  const dragEnabled = filter === "all" && level === "all" && !query.trim();

  const editingCategory = editingId ? savedById.get(editingId) : undefined;
  const editingDraft = editingId ? drafts[editingId] : undefined;

  /* ------------------------------- Màn sửa ------------------------------- */
  if (editingId) {
    if (!editingCategory || !editingDraft) {
      return (
        <div className="card flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-sm text-ink-500">Đang mở danh mục…</p>
          <Button type="button" onClick={() => setEditingId(null)}>← Về danh sách</Button>
        </div>
      );
    }
    const c = editingCategory;
    return (
      <CategoryEditor
        key={c.id}
        draft={editingDraft}
        savedCategory={c}
        parentOptions={initialCategories.filter((x) => x.id !== c.id && !x.parent_id)}
        stats={statsFor(c)}
        hasChildren={initialCategories.some((x) => x.parent_id === c.id)}
        dirty={dirtyIds.has(c.id)}
        setDraft={(d) => setDrafts((p) => ({ ...p, [c.id]: typeof d === "function" ? d(p[c.id]) : d }))}
        onSave={() => onUpdate(c.id)}
        onPublish={(publish) => onUpdate(c.id, publish)}
        onBack={() => setEditingId(null)}
        onPreview={onPreview}
        onDelete={() => onDelete(c.id)}
        busy={busy}
        initialTab={editorTab}
        canPublish={canPublish}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        aiEnabled={aiEnabled}
      />
    );
  }

  /* ----------------------------- Màn danh sách ----------------------------- */
  const filterTabs: Array<{ key: ListFilter; label: string; count: number }> = [
    { key: "all", label: "Tất cả", count: counts.total },
    { key: "published", label: "Đang công khai", count: counts.published },
    { key: "draft", label: "Bản nháp", count: counts.draft },
    { key: "noimg", label: "Thiếu ảnh bìa", count: counts.noimg },
    { key: "incomplete", label: "Chưa hoàn thiện", count: counts.incomplete },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Tổng quan", href: "/crm/dashboard" }, { label: "Danh mục" }]} />
      <PageHeader
        title="Danh mục sản phẩm"
        sub="Quản lý cây ngành hàng hiển thị cho buyer — kéo thả để sắp xếp, bấm Sửa để viết nội dung. Lưu bản nháp không tự công khai."
        actions={<Button variant="primary" onClick={() => setCreateParent({ id: null, name: "" })}><Plus className="h-4 w-4" /> Thêm danh mục</Button>}
      />

      {/* KPI tổng quan */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { value: counts.total, label: `Tổng danh mục · ${counts.roots} ngành tổng hợp` },
          { value: counts.published, label: "Đang công khai cho buyer" },
          { value: counts.noimg, label: "Thiếu ảnh bìa", warn: counts.noimg > 0 },
          { value: counts.incomplete, label: "Chưa đủ điều kiện công khai", warn: counts.incomplete > 0 },
        ].map((k) => (
          <div key={k.label} className="card px-4 py-3.5">
            <p className={`text-[22px] font-black leading-none ${k.warn ? "text-amber-600" : "text-ink-900"}`}>{k.value}</p>
            <p className="mt-1.5 text-xs text-ink-500">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        {/* Thanh lọc */}
        <div className="border-b border-ink-200 p-3">
          <div className="mb-2.5 flex flex-wrap gap-1.5" role="tablist" aria-label="Lọc danh mục">
            {filterTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={filter === t.key}
                onClick={() => setFilter(t.key)}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${filter === t.key ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
              >
                {t.label} <span className="font-normal opacity-60">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc đường dẫn… (vd: cashew)" aria-label="Tìm danh mục" />
            </label>
            <select className="input w-auto" value={level} onChange={(e) => setLevel(e.target.value as typeof level)} aria-label="Lọc theo cấp danh mục">
              <option value="all">Mọi cấp danh mục</option>
              <option value="root">Ngành tổng hợp</option>
              <option value="child">Ngành con</option>
            </select>
          </div>
        </div>

        {/* Bảng cây danh mục */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="table-th w-10"><span className="sr-only">Kéo sắp xếp</span></th>
                <th className="table-th">Danh mục</th>
                <th className="table-th">Trạng thái</th>
                <th className="table-th">Sản phẩm · NCC</th>
                <th className="table-th">Hoàn thiện</th>
                <th className="table-th">Cập nhật</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ cat: c, depth, childCount }) => {
                const published = isPublished(c);
                const draft = drafts[c.id];
                const pct = completenessOf(draft ?? fromCategory(c));
                const missing = missingLabels(c);
                const st = statsFor(c);
                const isDirty = dirtyIds.has(c.id);
                return (
                  <tr
                    key={c.id}
                    draggable={dragEnabled}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => { if (dragEnabled && dragId && dragId !== c.id) e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!dragEnabled || !dragId || dragId === c.id) return;
                      const dragged = savedById.get(dragId);
                      if (!dragged || (dragged.parent_id ?? null) !== (c.parent_id ?? null)) { setDragId(null); return; }
                      const siblings = treeRows.filter((r) => (r.cat.parent_id ?? null) === (c.parent_id ?? null)).map((r) => r.cat.id);
                      const from = siblings.indexOf(dragId);
                      const to = siblings.indexOf(c.id);
                      if (from < 0 || to < 0) return;
                      siblings.splice(from, 1);
                      siblings.splice(to, 0, dragId);
                      setDragId(null);
                      void onReorder(siblings);
                    }}
                    className={`${dragId === c.id ? "opacity-40" : ""} hover:bg-ink-50/60`}
                  >
                    <td className="table-td">
                      <GripVertical className={`h-4 w-4 ${dragEnabled ? "cursor-grab text-ink-300" : "text-ink-200"}`} aria-label={dragEnabled ? "Kéo để sắp xếp" : "Tắt bộ lọc để kéo sắp xếp"} />
                    </td>
                    <td className="table-td">
                      <div className={`flex items-center gap-3 ${depth === 1 ? "pl-8" : ""}`}>
                        {depth === 1 && <CornerDownRight className="h-4 w-4 shrink-0 text-ink-300" />}
                        {c.hero_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.hero_image} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-400"><ImageIcon className="h-4 w-4" /></span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink-900">{i18n(c.name_i18n) || c.slug}</span>
                          <span className="block truncate text-xs text-ink-500">
                            /products/{c.slug}
                            {depth === 0 ? ` · Ngành tổng hợp${childCount ? ` · ${childCount} ngành con` : ""}` : " · Ngành con"}
                            {isDirty && <span className="ml-1.5 font-semibold text-amber-600">● Đang sửa chưa lưu</span>}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="table-td">
                      {published
                        ? <Badge className="bg-emerald-50 text-emerald-700">● Công khai</Badge>
                        : <Badge className="bg-ink-100 text-ink-500">● Bản nháp</Badge>}
                    </td>
                    <td className="table-td whitespace-nowrap text-ink-600">
                      {st.products > 0 ? `${st.products} SP · ${st.suppliers} NCC` : <span className="text-ink-400">Chưa có sản phẩm</span>}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
                          <span className={`block h-full rounded-full ${pct < 70 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-xs font-semibold text-ink-600">{pct}%</span>
                      </div>
                      {missing.length > 0 && <p className="mt-1 text-[11.5px] text-amber-600">Thiếu: {missing.join(", ").toLowerCase()}</p>}
                    </td>
                    <td className="table-td whitespace-nowrap text-xs text-ink-500">{c.updated_at ? formatDateTime(c.updated_at) : "—"}</td>
                    <td className="table-td">
                      <div className="flex items-center justify-end gap-1.5">
                        {published && (
                          <Button type="button" size="sm" onClick={() => onPreview(c.slug)}><Eye className="h-3.5 w-3.5" /> Xem</Button>
                        )}
                        <Button type="button" size="sm" variant="soft" onClick={() => openEditor(c.id)}><Pencil className="h-3.5 w-3.5" /> Sửa</Button>
                        <div className="relative">
                          <Button type="button" size="sm" aria-label="Thêm thao tác" aria-expanded={openMenuId === c.id} onClick={(e) => {
                            if (openMenuId === c.id) { setOpenMenuId(null); return; }
                            // Menu dùng vị trí fixed theo nút bấm: đặt absolute trong bảng
                            // overflow-x-auto sẽ bị cắt mất, bấm mở mà không thấy gì.
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
                            setOpenMenuId(c.id);
                          }}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          {openMenuId === c.id && (
                            <>
                              <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpenMenuId(null)} />
                              <div className="fixed z-50 w-52 rounded-xl border border-ink-200 bg-white p-1.5 shadow-xl" style={menuPos ? { top: menuPos.top, right: menuPos.right } : undefined} role="menu">
                              {!c.parent_id && (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-ink-700 hover:bg-ink-50"
                                  onClick={() => { setOpenMenuId(null); setCreateParent({ id: c.id, name: i18n(c.name_i18n) || c.slug }); }}
                                >
                                  <CornerDownRight className="h-3.5 w-3.5" /> Thêm danh mục con…
                                </button>
                              )}
                              {canPublish && (
                                <button
                                  type="button"
                                  disabled={busy || isDirty}
                                  title={isDirty ? "Đang sửa chưa lưu — mở Sửa để công khai" : undefined}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                                  onClick={() => { setOpenMenuId(null); void onUpdate(c.id, !published); }}
                                >
                                  {published ? "Ẩn khỏi website" : "Công khai…"}
                                  {isDirty && <span className="text-[11px] text-amber-600">(chưa lưu)</span>}
                                </button>
                              )}
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-rose-700 hover:bg-rose-50"
                                onClick={() => { setOpenMenuId(null); void onDelete(c.id); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Xoá danh mục…
                              </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-500">Không có danh mục nào khớp bộ lọc. Thử từ khoá khác hoặc xoá bộ lọc.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-dashed border-ink-200 px-4 py-2.5 text-xs text-ink-500">
          {dragEnabled
            ? "Kéo biểu tượng ⠿ ở đầu dòng để đổi thứ tự hiển thị (chỉ kéo trong cùng nhóm ngành) — hệ thống tự lưu."
            : "Đang lọc/tìm kiếm: tắt bộ lọc để kéo–thả sắp xếp."}
          {" "}Danh mục con hiển thị thụt cấp dưới ngành tổng hợp.
        </p>
      </div>

      {createParent && (
        <CreateCategoryDialog
          parentId={createParent.id}
          parentName={createParent.name}
          busy={busy}
          onClose={() => setCreateParent(null)}
          onCreate={onCreate}
        />
      )}
    </div>
  );
}

/* --------------------------- Hộp thoại thêm mới --------------------------- */

function CreateCategoryDialog({
  parentId,
  parentName,
  busy,
  onClose,
  onCreate,
}: {
  // Nút "Thêm danh mục" luôn truyền null (chỉ tạo ngành tổng hợp).
  // Tạo ngành con đi qua menu "..." của từng ngành tổng hợp nên cha đã cố định sẵn.
  parentId: string | null;
  parentName: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { name_en: string; slug: string; parent_id: string | null }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function submit() {
    if (!name.trim()) { setError("Hãy nhập tên danh mục (tiếng Anh)."); return; }
    const finalSlug = (slugTouched ? slug : autoSlug(name)).trim();
    if (!finalSlug) { setError("Hãy nhập đường dẫn trang."); return; }
    setError(null);
    await onCreate({ name_en: name.trim(), slug: finalSlug, parent_id: parentId });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4" role="dialog" aria-modal="true" aria-label={parentId ? "Thêm danh mục con" : "Thêm danh mục mới"}>
      <div className="card w-full max-w-md p-5">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-ink-900">{parentId ? "Thêm danh mục con" : "Thêm danh mục mới"}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700" aria-label="Đóng"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-[13px] text-ink-500">Chỉ cần 3 thông tin — hệ thống tạo <b>bản nháp</b> rồi tự mở màn hình sửa để bổ sung ảnh và nội dung.</p>
        <div className="space-y-3.5">
          {parentId && (
            <Field label="Thuộc ngành tổng hợp">
              <p className="input flex items-center bg-ink-50 font-medium text-ink-700">{parentName}</p>
            </Field>
          )}
          <Field label="Tên danh mục (tiếng Anh)" required>
            <input className="input" value={name} autoFocus placeholder="vd: Cashew kernels"
              onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(autoSlug(e.target.value)); }} />
          </Field>
          <Field label="Đường dẫn trang" required hint="Buyer sẽ thấy: veximtrade.com/products/<đường-dẫn>">
            <input className="input" value={slug} placeholder="cashew-kernels"
              onChange={(e) => { setSlugTouched(true); setSlug(autoSlug(e.target.value)); }} />
          </Field>
          {error && <p className="flex items-center gap-1.5 text-[13px] font-medium text-rose-600"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Huỷ</Button>
          <Button type="button" variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Tạo bản nháp & sửa tiếp
          </Button>
        </div>
      </div>
    </div>
  );
}

function toFormData(d: CategoryDraft): FormData {
  const fd = new FormData();
  fd.set("slug", d.slug);
  if (d.id) fd.set("id", d.id);
  fd.set("parent_id", d.parent_id ?? "");
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
  fd.set("product_fields", JSON.stringify(d.product_fields));
  fd.set("spec_rows", JSON.stringify(d.spec_rows));
  fd.set("buying_facts", JSON.stringify(d.buying_facts));
  fd.set("faqs", JSON.stringify(d.faqs));
  fd.set("filters", JSON.stringify(d.filters));
  return fd;
}

/* --------------------------------- Trình sửa -------------------------------- */

const TABS: Array<{ key: EditorTab; label: string; hint: string }> = [
  { key: "basic", label: "Thông tin cơ bản", hint: "Tên, đường dẫn, danh mục cha" },
  { key: "content", label: "Nội dung & ảnh", hint: "Giới thiệu, nội dung chi tiết, ảnh bìa" },
  { key: "spec", label: "Thông số tham khảo", hint: "Bảng grade/thông số trên trang danh mục" },
  { key: "fields", label: "Trường sản phẩm · Nâng cao", hint: "Trường NCC điền cho từng sản phẩm" },
  { key: "faq", label: "Mua hàng & FAQ", hint: "MOQ, đóng gói, câu hỏi thường gặp" },
  { key: "seo", label: "SEO & hiển thị", hint: "Google, trang chủ, lập chỉ mục" },
];

function tabState(key: EditorTab, d: CategoryDraft): "ok" | "part" | "no" {
  switch (key) {
    case "basic": return d.name_en.trim() && d.slug.trim() ? "ok" : "no";
    case "content": return d.hero_image && d.intro_en.trim() ? "ok" : d.intro_en.trim() || d.body_en.trim() ? "part" : "no";
    case "spec": return d.spec_rows.length > 0 ? "ok" : "no";
    case "fields": return d.product_fields.length > 0 ? "ok" : "no";
    case "faq": return d.faqs.some((f) => f.q.trim()) ? "ok" : d.buying_facts.length > 0 ? "part" : "no";
    case "seo": return d.seo_title_en.trim() && d.seo_desc_en.trim() ? "ok" : d.seo_title_en.trim() || d.seo_desc_en.trim() ? "part" : "no";
  }
}

function CategoryEditor({
  draft, setDraft, onSave, onPublish, onBack, onPreview, onDelete, busy, initialTab, savedCategory, parentOptions, stats, hasChildren, dirty, canPublish, currentUserId, isAdmin, aiEnabled,
}: {
  draft: CategoryDraft;
  setDraft: (updater: CategoryDraft | ((d: CategoryDraft) => CategoryDraft)) => void;
  onSave: () => void;
  onPublish?: (publish: boolean) => void;
  onBack: () => void;
  onPreview: (slug: string) => void;
  onDelete: () => void;
  busy: boolean;
  initialTab: EditorTab;
  savedCategory: Category;
  parentOptions: Category[];
  stats: CategoryStats;
  hasChildren: boolean;
  dirty: boolean;
  canPublish?: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
  aiEnabled?: boolean;
}) {
  const set = <K extends keyof CategoryDraft>(k: K, v: CategoryDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const uploadUrl = draft.id ? `/api/categories/${encodeURIComponent(draft.id)}/hero-image` : "";
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [drafting, setDrafting] = useState(false);
  const [draftingBody, setDraftingBody] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const toast = useToast();

  const checklist = checklistOf(draft);
  const missingRequired = checklist.filter((i) => i.required && !i.done);
  const published = draft.is_published;
  const selfEdited = !!currentUserId && savedCategory.updated_by === currentUserId;
  // Quy tắc 2 người chỉ áp cho người không phải Admin; Admin toàn quyền tự công khai được.
  const selfPublishBlocked = selfEdited && !isAdmin;

  // Lý do nút Công khai bị khoá — hiển thị ngay cạnh nút, không chờ bấm mới biết.
  const publishBlockReason = !canPublish
    ? null
    : dirty
      ? "Có thay đổi chưa lưu — hãy Lưu bản nháp trước."
      : !published && missingRequired.length > 0
        ? `Còn thiếu: ${missingRequired.map((i) => i.label.toLowerCase()).join(", ")}.`
        : !published && selfPublishBlocked
          ? "Bạn là người sửa cuối — cần người khác công khai (quy tắc 2 người)."
          : null;

  function handleSave() {
    if (!draft.name_en.trim() || !draft.slug.trim()) {
      setNameError("Tên danh mục và đường dẫn trang là bắt buộc.");
      setTab("basic");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setNameError(null);
    onSave();
  }

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

  async function aiBody() {
    if (!draft.name_en.trim()) { toast.push({ kind: "error", title: "Nhập tên danh mục trước." }); return; }
    if (draft.body_en.trim() && !window.confirm("Thay nội dung chi tiết hiện tại bằng bản nháp AI?")) return;
    setDraftingBody(true);
    try {
      const response = await fetch("/api/ai/editor-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "category-body", name: draft.name_en, intro: draft.intro_en, facts: draft.buying_facts.filter((f) => f.label && f.value).map((f) => `${f.label}: ${f.value}`).slice(0, 8) }),
      });
      const data = await response.json() as { text?: string; message?: string };
      if (!response.ok || !data.text) throw new Error(data.message ?? "AI chưa soạn được. Thử lại sau.");
      set("body_en", data.text);
      toast.push({ kind: "success", title: "Đã điền bản nháp nội dung chi tiết. Hãy kiểm tra và sửa lại trước khi lưu." });
    } catch (error) { toast.push({ kind: "error", title: error instanceof Error ? error.message : "Lỗi AI" }); }
    finally { setDraftingBody(false); }
  }

  const buyerTag = <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-sky-800">Buyer thấy · EN</span>;
  const seoTitlePreview = draft.seo_title_en.trim() || (draft.name_en ? `${draft.name_en} suppliers in Vietnam | Vexim Trade` : "Tiêu đề trang");
  const seoDescPreview = draft.seo_desc_en.trim() || draft.intro_en.trim() || "Mô tả sẽ lấy từ phần giới thiệu ngắn nếu để trống.";

  return (
    <div>
      {/* Thanh hành động dính trên cùng — nơi duy nhất chứa Lưu & Công khai */}
      <div className="sticky top-2 z-30 mb-4 rounded-2xl border border-ink-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
          <Button type="button" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Danh sách</Button>
          <h1 className="min-w-0 truncate text-[16px] font-black tracking-tight text-ink-900">{draft.name_en || "Danh mục mới"}</h1>
          {published
            ? <Badge className="bg-emerald-50 text-emerald-700">● Công khai</Badge>
            : <Badge className="bg-ink-100 text-ink-500">● Bản nháp</Badge>}
          {dirty
            ? <span className="text-xs font-bold text-amber-600">● Chưa lưu thay đổi</span>
            : <span className="text-xs font-medium text-ink-400">Đã lưu</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {draft.slug && <Button type="button" size="sm" onClick={() => onPreview(draft.slug)}><ExternalLink className="h-3.5 w-3.5" /> Xem trang web</Button>}
            <Button type="button" size="sm" variant="soft" disabled={busy} onClick={handleSave}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu bản nháp
            </Button>
            {canPublish && onPublish && (
              <Button
                type="button"
                size="sm"
                variant={published ? "ghost" : "primary"}
                disabled={busy || !!publishBlockReason}
                title={publishBlockReason ?? undefined}
                onClick={() => onPublish(!published)}
              >
                {published ? "Ẩn khỏi website" : "Công khai…"}
              </Button>
            )}
          </div>
        </div>
        {canPublish && publishBlockReason && !published && (
          <p className="flex items-center gap-1.5 border-t border-ink-100 px-3.5 py-2 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Chưa công khai được: {publishBlockReason}
          </p>
        )}
        {!canPublish && (
          <p className="border-t border-ink-100 px-3.5 py-2 text-xs text-ink-500">Bạn có quyền sửa nội dung; việc công khai/ẩn danh mục do người có quyền công khai thực hiện.</p>
        )}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[210px_minmax(0,1fr)_300px]">
        {/* Mục lục tab dọc */}
        <nav aria-label="Mục chỉnh sửa" className="card sticky top-24 hidden p-2 xl:block">
          {TABS.map((t) => {
            const state = tabState(t.key, draft);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${tab === t.key ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-ink-50"}`}
              >
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${state === "ok" ? "bg-emerald-500" : state === "part" ? "bg-amber-500" : "bg-ink-300"}`} />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-ink-900">{t.label}</span>
                  <span className="block truncate text-[11.5px] text-ink-500">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Chọn tab dạng select trên màn hình nhỏ */}
        <label className="xl:hidden">
          <span className="sr-only">Chọn mục chỉnh sửa</span>
          <select className="input" value={tab} onChange={(e) => setTab(e.target.value as EditorTab)}>
            {TABS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>

        {/* Panel theo tab */}
        <div className="min-w-0">
          {tab === "basic" && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-ink-900">Thông tin cơ bản</h2>
              <p className="mb-5 mt-0.5 text-[13px] text-ink-500">Định danh của danh mục. Đổi đường dẫn vẫn tự giữ chuyển hướng (301) từ đường dẫn cũ.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={<>Tên danh mục {buyerTag}</>} required className="sm:col-span-2">
                  <input className="input" value={draft.name_en} onChange={(e) => set("name_en", e.target.value)} placeholder="Cashew kernels, Coffee, Pepper…" aria-invalid={!!nameError} />
                </Field>
                <Field label="Đường dẫn trang" required hint="Buyer sẽ thấy: veximtrade.com/products/<đường-dẫn>">
                  <input className="input" value={draft.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))} placeholder="cashew" aria-invalid={!!nameError} />
                </Field>
                <Field label="Danh mục cha (ngành tổng hợp)" hint="Danh mục có 2 cấp: ngành tổng hợp và ngành con.">
                  <select className="input" value={draft.parent_id ?? ""} onChange={(e) => set("parent_id", e.target.value || null)}>
                    <option value="">— Không có (đây là ngành tổng hợp) —</option>
                    {parentOptions.map((c) => <option key={c.id} value={c.id}>{i18n(c.name_i18n) || c.slug}</option>)}
                  </select>
                </Field>
                {nameError && <p className="flex items-center gap-1.5 text-[13px] font-medium text-rose-600 sm:col-span-2"><AlertTriangle className="h-4 w-4" /> {nameError}</p>}
                {(savedCategory.previous_slugs ?? []).length > 0 && (
                  <p className="text-xs text-ink-500 sm:col-span-2">Đường dẫn cũ sẽ tự chuyển tiếp: {(savedCategory.previous_slugs ?? []).map((s) => "/products/" + s).join(", ")}</p>
                )}
                <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-500 sm:col-span-2">
                  Thứ tự hiển thị được sắp xếp bằng <b>kéo–thả ngay ở danh sách danh mục</b> (cùng nhóm ngành) — không cần gõ số thứ tự nữa.
                </p>
              </div>

              {/* Vùng nguy hiểm — tách riêng, không giấu trong mục SEO */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-rose-800">Vùng nguy hiểm</p>
                  <p className="text-xs leading-relaxed text-ink-500">
                    {stats.products > 0
                      ? `Đang có ${stats.products} sản phẩm thuộc danh mục này — hệ thống sẽ chặn xoá; hãy ẩn khỏi website (về bản nháp) thay vì xoá.`
                      : hasChildren
                        ? "Danh mục đang có ngành con — xoá sẽ ảnh hưởng cấu trúc cây danh mục."
                        : "Xoá vĩnh viễn danh mục này. Hành động không thể hoàn tác."}
                  </p>
                </div>
                <Button type="button" variant="danger" size="sm" disabled={busy || stats.products > 0} title={stats.products > 0 ? "Đã có sản phẩm thuộc danh mục" : undefined} onClick={onDelete}>
                  <Trash2 className="h-4 w-4" /> Xoá danh mục…
                </Button>
              </div>
            </section>
          )}

          {tab === "content" && (
            <section className="card p-5">
              <div className="mb-4">
                <h2 className="text-base font-bold text-ink-900">Nội dung & ảnh bìa</h2>
                <p className="mt-0.5 text-[13px] text-ink-500">Phần buyer đọc đầu tiên trên trang danh mục — viết bằng tiếng Anh.</p>
              </div>
              <div className="space-y-4">
                <Field
                  label={<>Giới thiệu ngắn {buyerTag}</>}
                  action={aiEnabled ? (
                    <Button type="button" size="sm" disabled={drafting || busy} onClick={() => void aiIntro()}>
                      {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Tự động soạn nội dung
                    </Button>
                  ) : undefined}
                >
                  <textarea className="input" rows={3} value={draft.intro_en} onChange={(e) => set("intro_en", e.target.value)} placeholder="A concise introduction for international buyers…" />
                </Field>
                <Field
                  label={<>Nội dung chi tiết {buyerTag}</>}
                  hint="Bài giới thiệu ngành hàng hiển thị dưới danh sách nhà cung cấp trên trang public. Khoảng 3 đến 5 đoạn ngắn: ngành hàng, mặt hàng chính, lưu ý khi mua và cách Vexim hỗ trợ báo giá."
                  action={aiEnabled ? (
                    <Button type="button" size="sm" disabled={draftingBody || busy} onClick={() => void aiBody()}>
                      {draftingBody ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Tự động soạn nội dung
                    </Button>
                  ) : undefined}
                >
                  <textarea className="input" rows={10} value={draft.body_en} onChange={(e) => set("body_en", e.target.value)} placeholder="Giới thiệu ngành hàng, sản phẩm, điểm cần lưu ý…" />
                </Field>
                <div>
                  <p className="label">Ảnh bìa (hiển thị toàn chiều ngang trên trang public)</p>
                  <ImagePicker value={draft.hero_image} altValue={draft.hero_alt_en} onAltChange={(v) => set("hero_alt_en", v)} onChange={(v) => set("hero_image", v)} uploadUrl={uploadUrl} disabled={busy} hint="Ảnh ngang tối thiểu 1600×900 px, đẹp nhất khoảng 1600×686 px (tỉ lệ 21:9)." />
                </div>
              </div>
            </section>
          )}

          {tab === "spec" && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-ink-900">Bảng thông số tham khảo</h2>
              <p className="mb-4 mt-0.5 text-[13px] text-ink-500">Bảng buyer dùng để đối chiếu grade/quy cách trên trang danh mục. Đây là nội dung tham khảo của trang, <b>không phải</b> thông số của từng nhà cung cấp.</p>
              <SpecEditor draft={draft} setDraft={setDraft} />
            </section>
          )}

          {tab === "fields" && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-ink-900">Trường dữ liệu cho từng sản phẩm <span className="ml-1 rounded bg-ink-100 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-ink-500">Nâng cao</span></h2>
              <div className="mb-4 mt-2 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Thay đổi ở đây làm thay đổi <b>form nhập sản phẩm của nhà cung cấp/nhân viên</b>. Mã trường đã có sản phẩm sử dụng thì không nên đổi; đổi lựa chọn cũ cần đối chiếu lại sản phẩm hiện có. Khai báo ở đây không tự cấp chứng nhận hay tự đăng sản phẩm.</p>
              </div>
              <ProductFieldsEditor draft={draft} setDraft={setDraft} />
            </section>
          )}

          {tab === "faq" && (
            <section className="card space-y-7 p-5">
              <div>
                <h2 className="text-base font-bold text-ink-900">Thông tin mua hàng</h2>
                <p className="mb-4 mt-0.5 text-[13px] text-ink-500">Các dữ kiện buyer cần trước khi gửi yêu cầu báo giá: số lượng tối thiểu, đóng gói, cảng xuất…</p>
                <FactsEditor draft={draft} setDraft={setDraft} />
              </div>
              <div className="border-t border-ink-100 pt-6">
                <h2 className="text-base font-bold text-ink-900">Câu hỏi thường gặp (FAQ)</h2>
                <p className="mb-4 mt-0.5 text-[13px] text-ink-500">Hiển thị dạng mục mở/đóng ở cuối trang danh mục và hỗ trợ Google hiển thị rich result.</p>
                <FaqsEditor draft={draft} setDraft={setDraft} />
              </div>
            </section>
          )}

          {tab === "seo" && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-ink-900">SEO & hiển thị</h2>
              <p className="mb-5 mt-0.5 text-[13px] text-ink-500">Cách danh mục xuất hiện trên Google và trang chủ — xem khung xem trước ở cột phải, cập nhật theo nội dung bạn gõ.</p>
              <div className="space-y-4">
                <Field label={<>Tiêu đề lớn đầu trang (H1) {buyerTag}</>} hint={`Để trống sẽ tự dùng: ${draft.name_en || "Category"} suppliers in Vietnam`}>
                  <input className="input" value={draft.h1_en} onChange={(e) => set("h1_en", e.target.value)} placeholder={`${draft.name_en || "Category"} suppliers in Vietnam`} />
                </Field>
                <Field label={<>Câu mô tả ngắn trên thẻ trang chủ {buyerTag}</>}>
                  <input className="input" value={draft.kicker_en} onChange={(e) => set("kicker_en", e.target.value)} placeholder="vd: W180 – SP, AFI grades" />
                </Field>
                <Field label="Tiêu đề trên Google (SEO)" hint={`${draft.seo_title_en.length} ký tự${draft.seo_title_en.length > 60 ? " — nên rút xuống dưới 60 ký tự" : ""}`}>
                  <input className="input" value={draft.seo_title_en} onChange={(e) => set("seo_title_en", e.target.value)} />
                </Field>
                <Field label="Mô tả trên Google (SEO)" hint={`${draft.seo_desc_en.length} ký tự${draft.seo_desc_en.length > 160 ? " — nên rút xuống dưới 160 ký tự" : ""}`}>
                  <textarea className="input" rows={2} value={draft.seo_desc_en} onChange={(e) => set("seo_desc_en", e.target.value)} />
                </Field>
                <div className="space-y-2.5 border-t border-ink-100 pt-4">
                  <label className="flex items-start gap-2 text-sm text-ink-700">
                    <input type="checkbox" className="mt-0.5" checked={draft.active_on_homepage} disabled={!canPublish} onChange={(e) => set("active_on_homepage", e.target.checked)} />
                    <span>Hiển thị thẻ danh mục trên trang chủ{!canPublish && <span className="block text-xs text-ink-400">Chỉ người có quyền công khai mới thay đổi được mục này.</span>}</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-ink-700">
                    <input type="checkbox" className="mt-0.5" checked={draft.seo_indexable} disabled={!canPublish} onChange={(e) => set("seo_indexable", e.target.checked)} />
                    <span>Cho phép Google lập chỉ mục khi công khai{!canPublish && <span className="block text-xs text-ink-400">Chỉ người có quyền công khai mới thay đổi được mục này.</span>}</span>
                  </label>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Cột phải: checklist + xem trước + trạng thái */}
        <aside className="space-y-4 xl:sticky xl:top-24">
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><CheckCircle2 className="h-4 w-4 text-brand-600" /> Checklist trước khi công khai</h3>
            <ul className="space-y-2.5">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-2 text-[13px]">
                  {item.done
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    : <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${item.required ? "border-amber-400 text-amber-500" : "border-ink-300 text-ink-300"}`}><Minus className="h-3 w-3" /></span>}
                  <span className={item.done ? "text-ink-700" : "font-medium text-ink-800"}>
                    {item.label}
                    {item.required && !item.done && <span className="ml-1 text-[11px] font-bold text-amber-600">BẮT BUỘC</span>}
                    {!item.required && !item.done && <span className="ml-1 text-[11px] text-ink-400">nên có</span>}
                  </span>
                  {!item.done && (
                    <button type="button" onClick={() => setTab(item.tab)} className="ml-auto shrink-0 text-xs font-bold text-brand-700 hover:underline">Bổ sung →</button>
                  )}
                </li>
              ))}
              <li className="flex items-center gap-2 border-t border-ink-100 pt-2.5 text-[13px]">
                {selfPublishBlocked && !published
                  ? <><AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" /><span className="font-medium text-ink-800">Người duyệt khác người sửa cuối <span className="block text-[11px] font-normal text-ink-400">Bạn là người sửa cuối — hãy nhờ người khác công khai.</span></span></>
                  : <><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /><span className="text-ink-700">Người duyệt khác người sửa cuối{selfEdited && isAdmin && !published && <span className="block text-[11px] font-normal text-ink-400">Bạn là Admin nên được tự công khai bản mình sửa.</span>}</span></>}
              </li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-ink-400">Đủ các mục <b>BẮT BUỘC</b> và đã lưu bản nháp, nút Công khai mới bấm được — lý do luôn hiển thị ngay tại thanh trên cùng.</p>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><Eye className="h-4 w-4 text-brand-600" /> Xem trước trực tiếp</h3>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">Thẻ trên trang chủ / trang danh mục</p>
            <div className="overflow-hidden rounded-xl border border-ink-200">
              {draft.hero_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.hero_image} alt={draft.hero_alt_en} className="aspect-[21/9] w-full object-cover" />
              ) : (
                <div className="flex aspect-[21/9] w-full flex-col items-center justify-center gap-1 bg-ink-100 text-ink-400"><ImageIcon className="h-6 w-6" /><span className="text-xs">Chưa có ảnh bìa</span></div>
              )}
              <div className="p-3">
                <p className="truncate text-sm font-bold text-ink-900">{draft.name_en || "Tên danh mục"}</p>
                {draft.kicker_en && <p className="truncate text-xs font-semibold text-brand-700">{draft.kicker_en}</p>}
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{draft.intro_en || "Phần giới thiệu ngắn sẽ hiển thị ở đây…"}</p>
              </div>
            </div>
            <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-400">Kết quả trên Google</p>
            <div className="rounded-xl border border-ink-200 p-3">
              <p className="truncate text-[11.5px] text-emerald-700">veximtrade.com/products/{draft.slug || "duong-dan"}</p>
              <p className="truncate text-[15px] text-[#1a0dab]">{seoTitlePreview}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-500">{seoDescPreview}</p>
            </div>
          </div>

          <div className="card p-4 text-[13px] leading-relaxed text-ink-600">
            <h3 className="mb-2 text-sm font-bold text-ink-900">Trạng thái</h3>
            <p>{published ? "Đang hiển thị trên website." : "Chỉ hiển thị trong CRM."}</p>
            <p className="mt-1 text-xs text-ink-400">
              {stats.products} sản phẩm · {stats.suppliers} NCC có sản phẩm
              {savedCategory.updated_at ? ` · Sửa cuối ${formatDateTime(savedCategory.updated_at)}` : ""}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* --------------------------- Các trình sửa con --------------------------- */

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
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ink-700">Cột của bảng ({cols.length})</p>
          <button type="button" onClick={addCol} className="btn btn-ghost py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Thêm cột</button>
        </div>
        {cols.map((c, i) => (
          <div key={c.key} className="flex flex-wrap items-center gap-2">
            <input value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} className="input min-w-40 flex-1 text-[13px]" aria-label={`Tiêu đề cột ${i + 1}`} placeholder="Tiêu đề cột (vd: Grade)" />
            <label className="flex items-center gap-1 text-xs text-ink-700"><input type="checkbox" checked={!!c.emphasis} onChange={(e) => setCol(i, { emphasis: e.target.checked })} className="h-3.5 w-3.5" /> Nổi bật</label>
            <button type="button" onClick={() => removeCol(i)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600" aria-label={`Xoá cột ${i + 1}`}><Minus className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {cols.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-3.5 py-3 text-[13px] text-ink-500">Chưa có cột nào. Thêm cột trước, rồi thêm hàng dữ liệu.</p>}
      </div>
      <div className="space-y-2 border-t border-ink-100 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ink-700">Hàng dữ liệu ({draft.spec_rows.length})</p>
          <button type="button" onClick={addRow} disabled={cols.length === 0} className="btn btn-ghost py-1.5 text-xs disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Thêm hàng</button>
        </div>
        {draft.spec_rows.map((r, ri) => (
          <div key={ri} className="flex flex-wrap items-start gap-2 rounded-xl border border-ink-100 p-2.5">
            {cols.map((c) => (
              <div key={c.key} className="min-w-[130px] flex-1">
                <p className="mb-1 text-xs font-semibold text-ink-500">{c.label || c.key}</p>
                <input value={r.values?.[c.key] ?? ""} onChange={(e) => setCell(ri, c.key, e.target.value)} className="input text-[13px]" aria-label={`${c.label || c.key}, hàng ${ri + 1}`} />
              </div>
            ))}
            <button type="button" onClick={() => removeRow(ri)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600" aria-label={`Xoá hàng ${ri + 1}`}><Minus className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactsEditor({ draft, setDraft }: { draft: CategoryDraft; setDraft: (u: (d: CategoryDraft) => CategoryDraft) => void }) {
  const facts = draft.buying_facts;
  function add() { setDraft((d) => ({ ...d, buying_facts: [...d.buying_facts, { key: `fact${d.buying_facts.length + 1}`, icon: "scale", label: "", value: "" }] })); }
  function set(i: number, patch: Partial<CategoryFact>) { setDraft((d) => ({ ...d, buying_facts: d.buying_facts.map((f, j) => (j === i ? { ...f, ...patch } : f)) })); }
  function remove(i: number) { setDraft((d) => ({ ...d, buying_facts: d.buying_facts.filter((_, j) => j !== i) })); }
  return (
    <div className="space-y-3">
      <button type="button" onClick={add} className="btn btn-ghost py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Thêm mục mua hàng</button>
      {facts.map((f, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-ink-100 p-2.5 sm:grid-cols-[130px_1fr_2fr_auto]">
          <select value={f.icon} onChange={(e) => set(i, { icon: e.target.value as CategoryFact["icon"] })} className="input text-[13px]" aria-label="Biểu tượng">
            {([["scale", "Khối lượng"], ["package", "Đóng gói"], ["ship", "Vận chuyển"], ["anchor", "Cảng"], ["calendar", "Thời gian"], ["users", "Đối tác"], ["factory", "Nhà máy"], ["check", "Kiểm tra"], ["shield", "Chất lượng"], ["tag", "Nhãn"]] as const).map(([icon, label]) => <option key={icon} value={icon}>{label}</option>)}
          </select>
          <input value={f.label} onChange={(e) => set(i, { label: e.target.value })} className="input text-[13px]" placeholder="Nhãn (vd: Minimum order)" aria-label={`Nhãn mục ${i + 1}`} />
          <input value={f.value} onChange={(e) => set(i, { value: e.target.value })} className="input text-[13px]" placeholder="Nội dung…" aria-label={`Nội dung mục ${i + 1}`} />
          <button type="button" onClick={() => remove(i)} className="rounded-md border border-ink-200 p-1.5 text-ink-500 hover:text-red-600" aria-label={`Xoá mục ${i + 1}`}><Minus className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {facts.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-3.5 py-3 text-[13px] text-ink-500">Chưa có mục nào. Ví dụ: Minimum order, Packing, Port and lead time…</p>}
    </div>
  );
}

function FaqsEditor({ draft, setDraft }: { draft: CategoryDraft; setDraft: (u: (d: CategoryDraft) => CategoryDraft) => void }) {
  function add() { setDraft((d) => ({ ...d, faqs: [...d.faqs, { q: "", a: "" }] })); }
  function set(i: number, patch: Partial<{ q: string; a: string }>) { setDraft((d) => ({ ...d, faqs: d.faqs.map((f, j) => (j === i ? { ...f, ...patch } : f)) })); }
  function remove(i: number) { setDraft((d) => ({ ...d, faqs: d.faqs.filter((_, j) => j !== i) })); }
  return (
    <div className="space-y-3">
      <button type="button" onClick={add} className="btn btn-ghost py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Thêm câu hỏi</button>
      {draft.faqs.map((f, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-ink-100 p-3">
          <input value={f.q} onChange={(e) => set(i, { q: e.target.value })} className="input text-[13px] font-semibold" placeholder="Câu hỏi (tiếng Anh)" aria-label={`Câu hỏi ${i + 1}`} />
          <textarea value={f.a} onChange={(e) => set(i, { a: e.target.value })} rows={2} className="input text-[13px]" placeholder="Câu trả lời (tiếng Anh)" aria-label={`Câu trả lời ${i + 1}`} />
          <div className="flex justify-end"><button type="button" onClick={() => remove(i)} className="rounded-md border border-ink-200 px-2 py-1.5 text-xs font-medium text-ink-500 hover:text-red-600">Xoá câu này</button></div>
        </div>
      ))}
      {draft.faqs.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-3.5 py-3 text-[13px] text-ink-500">Chưa có câu hỏi nào — đây là mục “nên có” trong checklist công khai.</p>}
    </div>
  );
}

/** Vexim supplies the options for each commodity; this is NOT the reference-spec table above. */
function ProductFieldsEditor({ draft, setDraft }: { draft: CategoryDraft; setDraft: (u: (d: CategoryDraft) => CategoryDraft) => void }) {
  const fields = draft.product_fields;
  const update = (i: number, patch: Partial<ProductAttributeField>) => setDraft((d) => ({ ...d,
    product_fields: d.product_fields.map((field, j) => j === i ? { ...field, ...patch } : field),
  }));
  return (
    <div className="space-y-4">
      {fields.map((field, i) => (
        <div key={i} className="rounded-xl border border-ink-200 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên hiển thị (buyer thấy)"><input className="input" value={field.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Grade / Type / Origin" /></Field>
            <Field label="Mã trường (không đổi khi đã có sản phẩm)" hint="Chỉ gồm a-z, số, _. Ví dụ: grade, product_type"><input className="input" value={field.key} onChange={(e) => update(i, { key: e.target.value.toLowerCase() })} /></Field>
            <Field label="Kiểu nhập"><select className="input" value={field.type} onChange={(e) => update(i, { type: e.target.value as ProductAttributeField["type"], options: e.target.value === "text" ? [] : field.options, filterable: false })}><option value="select">Chọn từ danh sách</option><option value="text">Nhập văn bản</option></select></Field>
            {field.type === "select" && <Field label="Lựa chọn (mỗi dòng một giá trị)"><textarea className="input" rows={3} value={field.options.join("\n")} onChange={(e) => update(i, { options: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })} placeholder={"W240\nW320\nW450"} /></Field>}
          </div>
          {field.type === "select" && <label className="mt-3 flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={!!field.filterable} onChange={(e) => update(i, { filterable: e.target.checked })} /> Cho buyer lọc theo trường này khi có sản phẩm phù hợp</label>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-700">
            <span>Chỉ hiện khi trường trước chọn:</span>
            <select className="input w-auto" value={field.showWhen?.key ?? ""} onChange={(e) => update(i, { showWhen: e.target.value ? { key: e.target.value, value: "" } : undefined })} aria-label="Trường điều kiện"><option value="">Luôn hiện</option>{fields.slice(0, i).filter((f) => f.type === "select").map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}</select>
            {field.showWhen && <select className="input w-auto" value={field.showWhen.value} onChange={(e) => update(i, { showWhen: { key: field.showWhen!.key, value: e.target.value } })} aria-label="Giá trị điều kiện"><option value="">Chọn giá trị</option>{fields.find((f) => f.key === field.showWhen?.key)?.options.map((value) => <option key={value} value={value}>{value}</option>)}</select>}
          </div>
          <button type="button" className="mt-3 text-sm font-semibold text-rose-700 hover:underline" onClick={() => setDraft((d) => ({ ...d, product_fields: d.product_fields.filter((_, j) => j !== i) }))}>Xoá trường này</button>
        </div>
      ))}
      <Button type="button" disabled={fields.length >= 16} onClick={() => setDraft((d) => { let n = d.product_fields.length + 1; while (d.product_fields.some((f) => f.key === `field${n}`)) n++; return { ...d, product_fields: [...d.product_fields, { key: `field${n}`, label: "", type: "select", options: [], filterable: false }] }; })}><Plus className="h-4 w-4" /> Thêm trường sản phẩm</Button>
    </div>
  );
}
