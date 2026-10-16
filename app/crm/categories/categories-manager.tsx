"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FolderOpen, Plus, Save, Trash2 } from "lucide-react";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/actions";
import { Breadcrumbs, Button, EmptyState, Field } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";
import type { Category } from "@/lib/types";

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const [categories, setCategories] = useState(initialCategories);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const roots = categories.filter((c) => !c.parent_id);
  const children = (pid: string) => categories.filter((c) => c.parent_id === pid);

  async function run(
    fn: () => Promise<{ ok: boolean; message: string; id?: string }>,
    onSuccess?: (res: { ok: boolean; message: string; id?: string }) => void,
  ) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        toast.push({ kind: "error", title: res.message });
        return;
      }
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
    await run(() => createCategoryAction(Object.fromEntries(fd)), () => {
      (e.target as HTMLFormElement).reset();
    });
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
      <Breadcrumbs
        items={[
          { label: "Tổng quan", href: "/crm/dashboard" },
          { label: "Danh mục" },
        ]}
      />
      <PageHeader
        title="Danh mục ngành công khai"
        sub="Quản lý ngành / phân loại hiện trên trang công khai. Đánh dấu Công khai để hiện trên thanh menu."
        actions={
          <Link href="/crm/suppliers" className="btn btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Nhà cung cấp
          </Link>
        }
      />

      <form onSubmit={onCreate} className="card mt-6 grid gap-3 p-5 sm:grid-cols-[1fr_2fr_auto]">
        <Field label="Slug">
          <input name="slug" required className="input font-mono text-[13px]" placeholder="vd: cashew, coffee" />
        </Field>
        <Field label="Tên (tiếng Anh)">
          <input name="name_en" required className="input" placeholder="Cashew, Coffee, Pepper..." />
        </Field>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 self-end rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
            <input name="is_published" type="checkbox" defaultChecked className="h-4 w-4" />
            Công khai
          </label>
          <Button type="submit" variant="primary" disabled={busy}>
            <Plus className="h-4 w-4" /> Thêm
          </Button>
        </div>
      </form>

      {categories.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" />}
          title="Chưa có danh mục nào"
          sub="Thêm ngành đầu tiên (ví dụ cashew) để hiện trên menu và trang category."
        />
      ) : (
        <div className="card mt-4 overflow-hidden">
          <ul className="divide-y divide-ink-100">
            {roots.map((c) => (
              <CategoryRow
                key={c.id}
                c={c}
                children={children(c.id)}
                busy={busy}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  c,
  children,
  busy,
  onUpdate,
  onDelete,
}: {
  c: Category;
  children: Category[];
  busy: boolean;
  onUpdate: (e: React.FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
}) {
  const name = c.name_i18n?.en ?? c.slug;
  return (
    <li className="p-4">
      <form onSubmit={onUpdate} className="grid gap-3 sm:grid-cols-[140px_1fr_100px_auto_auto]">
        <input type="hidden" name="id" value={c.id} />
        <Field label="Slug">
          <input name="slug" defaultValue={c.slug} className="input font-mono text-[13px]" />
        </Field>
        <Field label="Tên (en)">
          <input name="name_en" defaultValue={name} className="input" />
        </Field>
        <Field label="Thứ tự">
          <input name="sort_order" type="number" defaultValue={c.sort_order} className="input" />
        </Field>
        <label className="flex items-center gap-2 self-end rounded-md border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700">
          <input name="is_published" type="checkbox" defaultChecked={c.is_published} className="h-4 w-4" />
          Công khai
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            <Save className="h-3.5 w-3.5" /> Lưu
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => onDelete(c.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </form>
      {children.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-ink-100 pl-4">
          {children.map((ch) => (
            <li key={ch.id} className="text-[12.5px] text-ink-600">
              <span className="font-mono text-ink-400">{ch.slug}</span> — {ch.name_i18n?.en ?? ch.slug}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
