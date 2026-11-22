"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Pencil, Search } from "lucide-react";
import { suggestProductCategories, type CategoryChoice } from "@/lib/public/category-assignment";
import { fill } from "@/lib/i18n/format";

/**
 * Ô chọn ngành hàng theo kiểu Shopee Seller Centre.
 *
 *  - Gợi ý ngành từ tên sản phẩm + ô tìm ngành hàng (đọc được cả có dấu / không dấu, Việt / Anh).
 *  - Duyệt theo cột: máy tính 2 cột (nhóm lớn › nhóm nhỏ); điện thoại đi từng cấp, có nút quay lại.
 *  - Chỉ chọn được danh mục LÁ. Nhóm lớn đã chia nhóm nhỏ chỉ để mở nhóm nhỏ.
 *  - Dòng "Đã chọn: A › B" luôn hiện trước nút Xác nhận; chọn xong thu gọn còn một dòng + nút Sửa.
 *  - Ngành ngoài phạm vi đã đăng ký vẫn hiện (mờ, có nhãn) để NCC biết cần đăng ký thêm.
 *
 * Chỉ là giao diện: server vẫn tự kiểm tra danh mục lá và phạm vi (category-proposals.ts).
 */
export type CategoryPickerOption = {
  id: string;
  slug: string;
  /** Tên hiển thị theo ngôn ngữ trang. */
  label: string;
  /** Tên tiếng Anh, dùng để tìm và gợi ý (tên sản phẩm thường có tiếng Anh). */
  label_en?: string | null;
  parent_slug?: string | null;
  /** false = nhóm lớn đã có nhóm nhỏ đang mở. */
  leaf?: boolean;
};

export type CategoryPickerCopy = {
  searchLabel: string;
  searchPlaceholder: string;
  suggested: string;
  selected: string;
  none: string;
  confirm: string;
  cancel: string;
  change: string;
  back: string;
  pickGroupHint: string;
  childCount: string;
  noResults: string;
  outOfScope: string;
  registerMore: string;
  needLeaf: string;
  confirmChange: string;
};

export const CATEGORY_PICKER_COPY_VI: CategoryPickerCopy = {
  searchLabel: "Tìm ngành hàng",
  searchPlaceholder: "Gõ tên ngành, ví dụ: hoa hồi, điều rang, trà",
  suggested: "Gợi ý theo tên sản phẩm:",
  selected: "Đã chọn",
  none: "Chưa chọn danh mục",
  confirm: "Xác nhận",
  cancel: "Huỷ",
  change: "Sửa",
  back: "Quay lại",
  pickGroupHint: "Chọn một nhóm bên trái để xem nhóm nhỏ.",
  childCount: "{count} nhóm nhỏ",
  noResults: "Không tìm thấy ngành phù hợp. Thử từ khác hoặc duyệt danh sách.",
  outOfScope: "Ngoài ngành đã đăng ký",
  registerMore: "Đăng ký thêm ngành",
  needLeaf: "Danh mục này đã chia nhóm nhỏ. Chọn nhóm nhỏ phù hợp với sản phẩm.",
  confirmChange: "Đổi danh mục sẽ xoá grade và thông số đã nhập theo danh mục cũ. Tiếp tục?",
};

const normalize = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

export function CategoryPicker({
  options,
  value,
  onChange,
  name,
  disabled = false,
  scope = [],
  registerHref,
  suggestFrom = "",
  hasDependentInput = false,
  copy = CATEGORY_PICKER_COPY_VI,
  invalid = false,
  emptyLabel,
}: {
  options: CategoryPickerOption[];
  value: string;
  onChange: (slug: string) => void;
  /** Tên ô ẩn gửi cùng form; bỏ trống khi form tự gửi giá trị khác. */
  name?: string;
  disabled?: boolean;
  /** Slug trong phạm vi đã đăng ký; rỗng = không giới hạn. */
  scope?: string[];
  registerHref?: string;
  suggestFrom?: string;
  /** Đã nhập grade/thông số theo danh mục hiện tại: hỏi lại trước khi đổi. */
  hasDependentInput?: boolean;
  copy?: CategoryPickerCopy;
  invalid?: boolean;
  /** Cho phép để trống (CRM: "Tự nhận diện theo tên/quy cách"); có nhãn này thì ô bắt đầu thu gọn. */
  emptyLabel?: string;
}) {
  const uid = useId();
  const bySlug = useMemo(() => new Map(options.map((o) => [o.slug, o])), [options]);
  const childrenOf = useMemo(() => {
    const map = new Map<string, CategoryPickerOption[]>();
    for (const o of options) if (o.parent_slug && bySlug.has(o.parent_slug)) map.set(o.parent_slug, [...(map.get(o.parent_slug) ?? []), o]);
    return map;
  }, [options, bySlug]);
  const roots = useMemo(() => options.filter((o) => !o.parent_slug || !bySlug.has(o.parent_slug)), [options, bySlug]);
  const isLeaf = (o: CategoryPickerOption) => o.leaf !== false && !(childrenOf.get(o.slug)?.length);
  const inScope = (o: CategoryPickerOption): boolean => !scope.length || scope.includes(o.slug) ||
    (childrenOf.get(o.slug) ?? []).some((child) => scope.includes(child.slug));
  const pathOf = (slug: string) => {
    const option = bySlug.get(slug);
    if (!option) return slug;
    const parent = option.parent_slug ? bySlug.get(option.parent_slug) : undefined;
    return parent ? `${parent.label} › ${option.label}` : option.label;
  };

  const current = value ? bySlug.get(value) : undefined;
  const needsLeaf = !!current && !isLeaf(current);
  const [open, setOpen] = useState((!value && !emptyLabel) || needsLeaf);
  const [pending, setPending] = useState(current && isLeaf(current) ? value : "");
  const [activeGroup, setActiveGroup] = useState(() => {
    if (needsLeaf) return value;
    return current?.parent_slug && bySlug.has(current.parent_slug) ? current.parent_slug : "";
  });
  const [query, setQuery] = useState("");

  // Danh mục lá mà một gợi ý trỏ tới: gợi ý là nhóm lớn thì mở ra các nhóm nhỏ của nó.
  const leavesFor = (picked: CategoryPickerOption[], limit: number) => {
    const out: CategoryPickerOption[] = [];
    for (const option of picked) {
      for (const leaf of isLeaf(option) ? [option] : childrenOf.get(option.slug) ?? []) {
        if (!out.includes(leaf)) out.push(leaf);
      }
    }
    return out.slice(0, limit);
  };
  const choices = useMemo<CategoryChoice[]>(() => options.map((o) => ({
    id: o.id, slug: o.slug, name_i18n: { en: o.label_en || o.label, vi: o.label } as CategoryChoice["name_i18n"],
    parent_id: o.parent_slug ? bySlug.get(o.parent_slug)?.id ?? null : null,
  })), [options, bySlug]);
  const fromRules = (text: string) => suggestProductCategories(text, choices, 6)
    .map((choice) => bySlug.get(choice.slug)).filter((o): o is CategoryPickerOption => !!o);
  const suggestions = suggestFrom.trim() ? leavesFor(fromRules(suggestFrom), 3) : [];

  const results = (() => {
    const q = normalize(query);
    if (!q) return [];
    const tokens = q.split(" ");
    const words = (texts: (string | null | undefined)[]) => texts.flatMap((text) => text ? normalize(text).split(/[^a-z0-9]+/) : []);
    // Khớp cả từ trước, khớp đầu từ sau: "tra" ra "Trà" chứ không lẫn "Trái cây".
    const matches = (texts: (string | null | undefined)[], exact: boolean) => {
      const list = words(texts);
      return tokens.every((token) => list.some((word) => exact ? word === token : word.startsWith(token)));
    };
    const leaves = options.filter(isLeaf);
    const own = (o: CategoryPickerOption) => [o.label, o.label_en, o.slug.replace(/-/g, " ")];
    const withParent = (o: CategoryPickerOption) => {
      const parent = o.parent_slug ? bySlug.get(o.parent_slug) : undefined;
      return [...own(o), parent?.label, parent?.label_en];
    };
    const tiers = [
      leaves.filter((o) => matches(own(o), true)),
      leaves.filter((o) => matches(withParent(o), true)),
      leaves.filter((o) => matches(own(o), false)),
      leaves.filter((o) => matches(withParent(o), false)),
    ];
    const textMatch = tiers.find((tier) => tier.length) ?? [];
    return leavesFor([...fromRules(query), ...textMatch], 8);
  })();

  function choose(option: CategoryPickerOption) {
    if (!isLeaf(option)) { setActiveGroup(option.slug); return; }
    setPending(option.slug);
  }

  function confirm() {
    if (!pending) return;
    if (pending !== value && value && hasDependentInput && typeof window !== "undefined" && !window.confirm(copy.confirmChange)) return;
    if (pending !== value) onChange(pending);
    setOpen(false);
    setQuery("");
  }

  function cancel() {
    setPending(current && isLeaf(current) ? value : "");
    setQuery("");
    setOpen(false);
  }

  const hidden = name && !disabled ? <input type="hidden" name={name} value={value} /> : null;

  if (!open || disabled) {
    return (
      <div>
        {hidden}
        <div className={`flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 ${invalid ? "border-rose-300 bg-rose-50" : "border-ink-200 bg-ink-50"}`}>
          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${value ? "font-semibold text-ink-900" : "text-ink-500"}`}>
            {value ? pathOf(value) : emptyLabel ?? copy.none}
          </span>
          {!disabled && <button type="button" onClick={() => { setOpen(true); setPending(current && isLeaf(current) ? value : ""); }}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-brand-700 hover:bg-brand-50">
            <Pencil className="size-3.5" aria-hidden="true" /> {copy.change}
          </button>}
        </div>
        {needsLeaf && !disabled && <p className="mt-1.5 text-[11.5px] font-semibold text-amber-800">{copy.needLeaf}</p>}
      </div>
    );
  }

  const row = (option: CategoryPickerOption, { showPath = false, active = false } = {}) => {
    const leaf = isLeaf(option);
    const selected = leaf && pending === option.slug;
    const outside = !inScope(option);
    const kids = childrenOf.get(option.slug)?.length ?? 0;
    return (
      <li key={option.slug}>
        <button type="button" onClick={() => choose(option)} aria-pressed={leaf ? selected : undefined} aria-expanded={leaf ? undefined : active}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors ${selected ? "bg-brand-50 font-semibold text-brand-800"
            : active ? "bg-ink-100 font-semibold text-ink-900" : "hover:bg-ink-50"} ${outside && !selected ? "text-ink-400" : selected || active ? "" : "text-ink-800"}`}>
          <span className="min-w-0 flex-1">
            <span className="block break-words">{showPath ? pathOf(option.slug) : option.label}</span>
            {(outside || (!leaf && kids > 0)) && <span className="block text-[11px] font-normal text-ink-400">
              {[outside ? copy.outOfScope : null, !leaf && kids ? fill(copy.childCount, { count: kids }) : null].filter(Boolean).join(" · ")}
            </span>}
          </span>
          {selected && <Check className="size-4 shrink-0 text-brand-700" aria-hidden="true" />}
          {!leaf && <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden="true" />}
        </button>
      </li>
    );
  };

  const group = activeGroup ? bySlug.get(activeGroup) : undefined;
  const pendingOption = pending ? bySlug.get(pending) : undefined;

  return (
    <div className={`overflow-hidden rounded-md border bg-white ${invalid && !pending ? "border-rose-300" : "border-ink-200"}`}>
      {hidden}
      <div className="border-b border-ink-200 p-2">
        <label htmlFor={`${uid}-search`} className="sr-only">{copy.searchLabel}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input id={`${uid}-search`} type="search" autoComplete="off" value={query} placeholder={copy.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter trong ô tìm không được gửi cả form sản phẩm.
              if (event.key === "Enter") { event.preventDefault(); if (results[0]) setPending(results[0].slug); }
            }}
            className="input w-full pl-8" />
        </div>
      </div>

      {!query && suggestions.length > 0 && <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-200 px-3 py-2">
        <span className="text-[11.5px] text-ink-500">{copy.suggested}</span>
        {suggestions.map((option) => <button key={option.slug} type="button" onClick={() => choose(option)} aria-pressed={pending === option.slug}
          className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${pending === option.slug ? "border-brand-600 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:border-brand-300"}`}>
          {pathOf(option.slug)}
        </button>)}
      </div>}

      {query ? (
        results.length
          ? <ul className="max-h-72 divide-y divide-ink-100 overflow-y-auto">{results.map((option) => row(option, { showPath: true }))}</ul>
          : <p className="px-3 py-4 text-[12px] text-ink-500">{copy.noResults}</p>
      ) : (
        <div className="grid md:grid-cols-2 md:divide-x md:divide-ink-200">
          <ul className={`max-h-72 overflow-y-auto ${group ? "hidden md:block" : ""}`}>
            {roots.map((option) => row(option, { active: option.slug === activeGroup }))}
          </ul>
          <div className={group ? "" : "hidden md:block"}>
            {group ? <>
              <button type="button" onClick={() => setActiveGroup("")}
                className="flex w-full items-center gap-1 border-b border-ink-100 px-3 py-2 text-[12px] font-semibold text-brand-700 md:hidden">
                <ChevronLeft className="size-4" aria-hidden="true" /> {copy.back}
                <span className="ml-1 truncate font-normal text-ink-500">{group.label}</span>
              </button>
              <ul className="max-h-72 overflow-y-auto">{(childrenOf.get(group.slug) ?? []).map((option) => row(option))}</ul>
            </> : <p className="px-3 py-4 text-[12px] text-ink-400">{copy.pickGroupHint}</p>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 bg-ink-50 px-3 py-2">
        <p className="min-w-0 flex-1 text-[12px] text-ink-600" aria-live="polite">
          {pendingOption
            ? <>{copy.selected}: <strong className="text-ink-900">{pathOf(pendingOption.slug)}</strong></>
            : needsLeaf ? <span className="font-semibold text-amber-800">{copy.needLeaf}</span> : copy.none}
          {pendingOption && !inScope(pendingOption) && registerHref && <>
            {" · "}<Link href={registerHref} className="font-semibold text-brand-700 underline">{copy.registerMore}</Link>
          </>}
        </p>
        {emptyLabel && value && <button type="button" onClick={() => { onChange(""); setPending(""); setQuery(""); setOpen(false); }}
          className="btn btn-ghost btn-sm">{emptyLabel}</button>}
        {(value || emptyLabel) && !needsLeaf && <button type="button" onClick={cancel} className="btn btn-ghost btn-sm">{copy.cancel}</button>}
        <button type="button" onClick={confirm} disabled={!pending} className="btn btn-primary btn-sm">{copy.confirm}</button>
      </div>
    </div>
  );
}
