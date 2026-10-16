"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FolderOpen, Image as ImageIcon, Plus, Save, Trash2 } from "lucide-react";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/actions";
import { Breadcrumbs, Button, EmptyState, Field } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";
import type { Category } from "@/lib/types";

function i18n(v: Category["name_i18n"] | Category["intro_i18n"] | Category["homepage_kicker_i18n"] | null | undefined): string {
  if (!v || typeof v !== "object") return "";
  const m = v as Record<string, string>;
  return (m.en ?? Object.values(m)[0] ?? "") as string;
}

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const roots = initialCategories.filter((c) => !c.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const children = (pid: string) => initialCategories.filter((c) => c.parent_id === pid);

  async function run(
    fn: () => Promise<{ ok: boolean; message: string; id?: string }>,
    onSuccess?: (res: { ok: boolean; message: string; id?: string }) => void,
  ) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { toast.push({ kind: "error", title: res.message }); return; }
      toast.push({ kind: "success", title: res.message });
      onSuccess?.(res);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run(() => createCategoryAction(Object.fromEntries(fd)), () => { (e.target as HTMLFormElement).reset(); });
  }

  async function onUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run(() => updateCategoryAction(String(fd.get("id")), Object.fromEntries(fd)));
  }

  async function onDelete(id: string) {
    if (!confirm("Xoá danh mục này?")) return;
    await run(() => deleteCategoryAction(id));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "Tổng quan", href: "/crm/dashboard" }, { label: "Danh mục" }]} />
      <PageHeader
        title="Danh mục ngành công khai"
        sub="Tạo ngành mới, upload ảnh hero, bật lên trang chủ và mở trang công khai cho ngành. Sau khi bật Public page, trang /products/[slug] sẽ hiển thị; nếu còn đang thăm NCC, trang sẽ tự thu lead về RFQ."
        actions={<Link href="/crm/suppliers" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" /> Nhà cung cấp</Link>}
      />

      <form onSubmit={onCreate} className="card mt-6 space-y-4 p-5">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">Thêm ngành mới</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label="Slug (url)">
            <input name="slug" required className="input font-mono text-[13px]" placeholder="vd: cashew, coffee, rubber" />
          </Field>
          <Field label="Tên (tiếng Anh)">
            <input name="name_en" required className="input" placeholder="Cashew, Coffee, Pepper…" />
          </Field>
        </div>
        <Field label="Giới thiệu ngắn (en) – hiện ở hero trang category & thẻ trang chủ">
          <textarea name="intro_en" rows={2} className="input" placeholder="Một câu mô tả ngành cho buyer đọc ở trang category." />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Thứ tự (sắp xếp trên trang chủ)">
            <input name="sort_order" type="number" defaultValue={roots.length * 10 + 10} className="input" />
          </Field>
          <Field label="Kicker (chữ nhỏ trên thẻ trang chủ)">
            <input name="kicker_en" className="input" placeholder="vd: W180 – SP, AFI grades" />
          </Field>
          <Field label="Hero image (đường dẫn /images/... hoặc URL)">
            <input name="hero_image" className="input font-mono text-[12.5px]" placeholder="/images/categories/cashew-hero.jpg" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
            <input name="is_published" type="checkbox" defaultChecked className="h-4 w-4" /> Công khai
          </label>
          <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
            <input name="active_on_homepage" type="checkbox" className="h-4 w-4" /> Hiện ở trang chủ (What we source)
          </label>
          <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
            <input name="public_page_ready" type="checkbox" className="h-4 w-4" /> Đã có trang public (bật sau khi copywriter xong)
          </label>
          <Button type="submit" variant="primary" disabled={busy} className="ml-auto">
            <Plus className="h-4 w-4" /> Thêm ngành
          </Button>
        </div>
      </form>

      {initialCategories.length === 0 ? (
        <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="Chưa có danh mục nào" sub="Thêm ngành đầu tiên để hiện trên trang công khai." />
      ) : (
        <div className="mt-6 space-y-4">
          {roots.map((c) => (
            <CategoryRow key={c.id} c={c} children={children(c.id)} busy={busy} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  c, children, busy, onUpdate, onDelete,
}: {
  c: Category;
  children: Category[];
  busy: boolean;
  onUpdate: (e: React.FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
}) {
  const name = i18n(c.name_i18n) ?? c.slug;
  return (
    <form onSubmit={onUpdate} className="card p-5">
      <input type="hidden" name="id" value={c.id} />
      <div className="grid gap-3 md:grid-cols-[140px_1fr_100px]">
        <Field label="Slug">
          <input name="slug" defaultValue={c.slug} className="input font-mono text-[13px]" />
        </Field>
        <Field label="Tên (en)">
          <input name="name_en" defaultValue={name} className="input" />
        </Field>
        <Field label="Thứ tự">
          <input name="sort_order" type="number" defaultValue={c.sort_order} className="input" />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Giới thiệu ngắn (en)">
          <textarea name="intro_en" rows={2} defaultValue={i18n(c.intro_i18n)} className="input" />
        </Field>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Kicker trang chủ">
          <input name="kicker_en" defaultValue={i18n(c.homepage_kicker_i18n)} className="input" placeholder="vd: Robusta & Arabica" />
        </Field>
        <Field label="Hero image">
          <input name="hero_image" defaultValue={c.hero_image ?? ""} className="input font-mono text-[12.5px]" placeholder="/images/categories/xxx.jpg" />
        </Field>
      </div>
      {c.hero_image && (
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-16 w-28 overflow-hidden rounded-md border border-ink-200 bg-ink-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.hero_image} alt="" className="h-full w-full object-cover" />
          </div>
          <p className="flex items-center gap-1 text-[12px] text-ink-500"><ImageIcon className="h-3.5 w-3.5" /> Xem trước anh hero.</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
          <input name="is_published" type="checkbox" defaultChecked={c.is_published} className="h-4 w-4" /> Công khai
        </label>
        <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
          <input name="active_on_homepage" type="checkbox" defaultChecked={c.active_on_homepage ?? false} className="h-4 w-4" /> Hiện ở trang chủ
        </label>
        <label className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
          <input name="public_page_ready" type="checkbox" defaultChecked={c.public_page_ready ?? false} className="h-4 w-4" /> Public page đã sẵn sàng
        </label>
        <span className="ml-auto flex gap-2">
          <Button type="submit" variant="primary" disabled={busy}><Save className="h-3.5 w-3.5" /> Lưu</Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => onDelete(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </span>
      </div>
      {children.length > 0 && (
        <ul className="mt-4 space-y-1 border-l-2 border-ink-100 pl-4">
          {children.map((ch) => (
            <li key={ch.id} className="text-[12.5px] text-ink-600">
              <span className="font-mono text-ink-400">{ch.slug}</span> — {i18n(ch.name_i18n) ?? ch.slug}
              {ch.active_on_homepage && <span className="ml-2 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">home</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
