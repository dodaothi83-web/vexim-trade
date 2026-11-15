import type { CSSProperties, ReactNode } from "react";

import type { PublicSupplierCard } from "@/lib/public/catalog";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import {
  supplierAnnualOutputDisplay, supplierCapacityDisplay, supplierExportMarketsDisplay, supplierIncotermsDisplay, supplierMoqDisplay,
} from "@/lib/public/supplier-english";
import { STOREFRONT_TONE_COLORS, type StorefrontStat, type StorefrontTheme } from "@/lib/storefront-theme";
import type { ShowcaseBlock } from "@/lib/supplier-showcase";
import { looksVietnamese } from "@/lib/vietnamese-text";

/**
 * Đầu trang và phần trưng bày của trang nhà cung cấp gói Premium/Pro theo 3 mẫu đã duyệt
 * (docs/storefront-templates). Màu tông chỉ áp trong khung này; khung Vexim, nút xác minh
 * xanh và các mục chung bên dưới giữ nguyên.
 */
const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");

const STAT_LABELS: Record<StorefrontStat, string> = {
  capacity: "Capacity",
  founded: "Founded",
  employees: "Employees",
  markets: "Export markets",
  lead_time: "Lead time",
  moq: "Minimum order",
  incoterms: "Incoterms",
};

/** Giá trị số liệu lấy từ hồ sơ; trống thì bỏ, không hiện "On request" ở vị trí nổi bật. */
export function storefrontStatValue(s: PublicSupplierCard, stat: StorefrontStat): string {
  switch (stat) {
    case "capacity": return safe(s.annual_output?.trim() ? supplierAnnualOutputDisplay(s) : supplierCapacityDisplay(s));
    case "founded": return s.founded_year ? String(s.founded_year) : "";
    case "employees": return typeof s.employees === "number" && s.employees > 0 ? String(s.employees) : "";
    case "markets": {
      const markets = supplierExportMarketsDisplay(s);
      return markets.length > 2 ? `${markets.length} countries` : safe(markets.join(", "));
    }
    case "lead_time": return s.lead_time_days ? `${s.lead_time_days} days` : "";
    case "moq": return safe(supplierMoqDisplay(s));
    case "incoterms": return safe(supplierIncotermsDisplay(s).join(", "));
  }
}

export interface PremiumStorefrontProps {
  supplier: PublicSupplierCard;
  theme: StorefrontTheme;
  name: string;
  /** Nhãn loại hình (Manufacturer…) kèm biểu tượng, dựng sẵn ở component cha. */
  typeBadge: ReactNode;
  location: string;
  checks: ReactNode;
  actions: ReactNode;
  coverUrl: string | null;
  avatarUrl: string | null;
  coverAction?: ReactNode;
  avatarAction?: ReactNode;
  nameTag: "h1" | "h2";
  showcase: ShowcaseBlock[];
  imageUrl: (path: string) => string;
}

export function PremiumStorefront(props: PremiumStorefrontProps) {
  const tone = STOREFRONT_TONE_COLORS[props.theme.tone];
  const style = { "--sf-accent": tone.accent, "--sf-dark": tone.dark, "--sf-tint": tone.tint } as CSSProperties;
  const stats = props.theme.stats
    .map((stat) => ({ stat, label: STAT_LABELS[stat], value: storefrontStatValue(props.supplier, stat) }))
    .filter((item) => item.value);
  // Câu giới thiệu cũ viết bằng tiếng Việt (lưu trước khi có kiểm tra) không hiện cho người mua.
  const tagline = looksVietnamese(props.theme.tagline) ? "" : safe(props.theme.tagline);
  const shared = { ...props, stats, tagline };
  return <div style={style} data-storefront-template={props.theme.template} data-storefront-tone={props.theme.tone}>
    {props.theme.template === "modern" ? <Modern {...shared} />
      : props.theme.template === "gallery" ? <Gallery {...shared} /> : <Elegant {...shared} />}
  </div>;
}

type Shared = PremiumStorefrontProps & { stats: { stat: StorefrontStat; label: string; value: string }[]; tagline: string };

const NOT_EVIDENCE = "Images and text shared by the supplier. They are not evidence of a Vexim check.";

function Avatar({ avatarUrl, name, className }: { avatarUrl: string | null; name: string; className: string }) {
  return <div className={className}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
  </div>;
}

/* ---------- Mẫu 1: Thanh lịch ---------- */
function Elegant(p: Shared) {
  const NameTag = p.nameTag;
  return <section className="mt-5 overflow-hidden rounded-2xl bg-[#FBF9F5] ring-1 ring-ink-200" aria-labelledby="supplier-name">
    <div className="px-5 pb-8 pt-10 text-center sm:px-10 sm:pt-14">
      <div className="relative mx-auto w-fit">
        <Avatar avatarUrl={p.avatarUrl} name={p.name} className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white text-3xl font-bold text-[var(--sf-accent)] ring-1 ring-ink-200" />
        {p.avatarAction}
      </div>
      <div className="mt-4 flex justify-center">{p.typeBadge}</div>
      <p className="mt-3 text-[11.5px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">{p.location}</p>
      <NameTag id="supplier-name" className="mx-auto mt-2 max-w-3xl break-words text-3xl font-light tracking-tight text-ink-900 sm:text-5xl">{p.name}</NameTag>
      {p.tagline && <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-7 text-ink-600">{p.tagline}</p>}
      <div className="mx-auto my-5 h-0.5 w-14 bg-[var(--sf-accent)]" />
      <div className="flex justify-center">{p.checks}</div>
      <div className="mx-auto mt-6 flex max-w-md flex-col justify-center gap-2 sm:flex-row">{p.actions}</div>
    </div>
    {(p.coverUrl || p.coverAction) && <div className="relative mx-5 h-56 overflow-hidden rounded bg-ink-50 sm:mx-10 sm:h-[420px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.coverUrl && <img src={p.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {p.coverAction}
    </div>}
    {p.stats.length > 0 && <dl className="mx-5 my-8 grid grid-cols-2 border-y border-ink-200 sm:mx-10 sm:grid-cols-4">
      {p.stats.map((item, index) => <div key={item.stat} className={`px-3 py-5 text-center ${index % 2 ? "border-l border-ink-200" : ""} ${index > 0 ? "sm:border-l sm:border-ink-200" : ""}`}>
        <dd className="break-words text-2xl font-light text-[var(--sf-dark)]">{item.value}</dd>
        <dt className="mt-1 text-[11px] uppercase tracking-[0.08em] text-ink-500">{item.label}</dt>
      </div>)}
    </dl>}
    {p.showcase.length > 0 && <div id="showcase" className="scroll-mt-24 px-5 pb-10 sm:px-10">
      <h2 className="sr-only">Inside {p.name}</h2>
      <div className="space-y-10 sm:space-y-14">
        {p.showcase.map((block, index) => <article key={block.id} className="grid items-center gap-6 sm:grid-cols-2 sm:gap-12">
          <div className={`overflow-hidden rounded ${index % 2 ? "sm:order-2" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imageUrl(block.image_path)} alt={safe(block.title)} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] tracking-[0.2em] text-[var(--sf-accent)]">{String(index + 1).padStart(2, "0")}</p>
            <h3 className="mt-2 break-words text-2xl font-light leading-snug text-ink-900 sm:text-3xl">{safe(block.title)}</h3>
            {block.body && <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-8 text-ink-600">{safe(block.body)}</p>}
          </div>
        </article>)}
      </div>
      <p className="mt-8 text-xs text-ink-500">{NOT_EVIDENCE}</p>
    </div>}
  </section>;
}

/* ---------- Mẫu 2: Hiện đại ---------- */
function Modern(p: Shared) {
  const NameTag = p.nameTag;
  const heroImage = p.coverUrl ?? (p.showcase[0] ? p.imageUrl(p.showcase[0].image_path) : null);
  return <section className="mt-5" aria-labelledby="supplier-name">
    <div className="relative overflow-hidden rounded-2xl bg-[var(--sf-dark)] text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {heroImage && <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-[#0F1216]/60" aria-hidden="true" />
      {p.coverAction}
      <div className="relative flex min-h-[360px] flex-col justify-end gap-4 p-6 sm:min-h-[460px] sm:p-12">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Avatar avatarUrl={p.avatarUrl} name={p.name} className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white text-2xl font-bold text-[var(--sf-accent)]" />
            {p.avatarAction}
          </div>
          <span className="rounded-md bg-[var(--sf-accent)] px-3 py-1 text-xs font-bold">{p.location}</span>
        </div>
        <NameTag id="supplier-name" className="max-w-3xl break-words text-3xl font-extrabold leading-tight tracking-tight sm:text-6xl">{p.name}</NameTag>
        {p.tagline && <p className="max-w-2xl text-[15px] leading-7 text-white/90 sm:text-lg">{p.tagline}</p>}
        <div className="flex max-w-md flex-col gap-2 sm:flex-row [&>*]:sm:w-auto">{p.actions}</div>
      </div>
    </div>
    {p.stats.length > 0 && <dl className="relative z-10 mx-3 -mt-8 grid grid-cols-2 gap-3 sm:mx-8 sm:grid-cols-4">
      {p.stats.map((item) => <div key={item.stat} className="rounded-xl border-t-4 border-[var(--sf-accent)] bg-white p-4 shadow-card sm:p-5">
        <dd className="break-words text-xl font-extrabold text-ink-900 sm:text-2xl">{item.value}</dd>
        <dt className="mt-1 text-xs text-ink-500">{item.label}</dt>
      </div>)}
    </dl>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">{p.checks}{p.typeBadge}</div>
    {p.showcase.length > 0 && <div id="showcase" className="mt-10 scroll-mt-24">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--sf-accent)]">Company showcase</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Inside {p.name}</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {p.showcase.map((block) => <article key={block.id} className="overflow-hidden rounded-2xl bg-[var(--sf-tint)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.imageUrl(block.image_path)} alt={safe(block.title)} loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover" />
          <div className="p-5">
            <h3 className="break-words text-lg font-bold text-ink-900">{safe(block.title)}</h3>
            {block.body && <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-ink-600">{safe(block.body)}</p>}
          </div>
        </article>)}
      </div>
      <p className="mt-4 text-xs text-ink-500">{NOT_EVIDENCE}</p>
    </div>}
  </section>;
}

/* ---------- Mẫu 3: Trưng bày ---------- */
/** Khung ảnh lấp đầy theo số ảnh (1 đến 5), không để ô trống. */
function mosaicCell(index: number, count: number): string {
  if (index === 0) return count === 1 ? "col-span-2 h-56 sm:col-span-1 sm:h-auto" : "col-span-2 h-56 sm:col-span-1 sm:row-span-2 sm:h-auto";
  if (count === 2) return "col-span-2 h-36 sm:col-span-1 sm:row-span-2 sm:h-auto";
  if (count === 4 && index === 3) return "col-span-2 h-36 sm:h-auto";
  return "h-36 sm:h-auto";
}

function Gallery(p: Shared) {
  const NameTag = p.nameTag;
  const images = [
    ...(p.coverUrl ? [{ id: "cover", src: p.coverUrl, caption: "" }] : []),
    ...p.showcase.map((block) => ({ id: block.id, src: p.imageUrl(block.image_path), caption: safe(block.title) })),
  ].slice(0, 5);
  return <section className="mt-5 overflow-hidden rounded-2xl ring-1 ring-ink-200 lg:grid lg:grid-cols-[360px_minmax(0,1fr)]" aria-labelledby="supplier-name">
    <aside className="bg-[var(--sf-tint)] p-6 sm:p-9 lg:border-r lg:border-ink-200">
      <div className="relative w-fit">
        <Avatar avatarUrl={p.avatarUrl} name={p.name} className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[var(--sf-accent)] text-2xl font-bold text-white" />
        {p.avatarAction}
      </div>
      <NameTag id="supplier-name" className="mt-5 break-words text-3xl font-bold leading-tight text-ink-900">{p.name}</NameTag>
      <p className="mt-2 text-[11.5px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">{p.location}</p>
      {p.tagline && <p className="mt-3 text-[15px] leading-7 text-ink-600">{p.tagline}</p>}
      <div className="mt-4">{p.typeBadge}</div>
      <div className="mt-4">{p.checks}</div>
      {p.stats.length > 0 && <dl className="mt-6 grid grid-cols-2 gap-4">
        {p.stats.map((item) => <div key={item.stat} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-500">{item.label}</dt>
          <dd className="mt-0.5 break-words font-bold text-ink-900">{item.value}</dd>
        </div>)}
      </dl>}
      <div className="mt-6 flex flex-col gap-2">{p.actions}</div>
    </aside>
    <div id="showcase" className="relative scroll-mt-24 bg-white p-4 sm:p-7">
      {p.coverAction}
      {images.length > 0 ? <div className={`grid grid-cols-2 gap-3 ${images.length === 1 ? "sm:grid-cols-1 sm:grid-rows-[440px]" : images.length <= 3 ? "sm:grid-cols-[2fr_1fr] sm:grid-rows-[220px_220px]" : "sm:grid-cols-[2fr_1fr_1fr] sm:grid-rows-[220px_220px]"}`}>
        {images.map((image, index) => <figure key={image.id} className={`relative m-0 overflow-hidden rounded-xl bg-ink-50 ${mosaicCell(index, images.length)}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={image.caption} loading={index === 0 ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover" />
          {image.caption && <figcaption className="absolute bottom-2 left-2 max-w-[85%] truncate rounded-md bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink-900">{image.caption}</figcaption>}
        </figure>)}
      </div> : <div className="flex h-56 items-center justify-center rounded-xl bg-[var(--sf-tint)] text-sm text-ink-500">Photos coming soon</div>}
      {p.showcase.some((block) => block.body) && <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {p.showcase.filter((block) => block.body).map((block) => <div key={block.id} className="min-w-0">
          <h3 className="break-words border-l-[3px] border-[var(--sf-accent)] pl-3 text-lg font-bold text-ink-900">{safe(block.title)}</h3>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-7 text-ink-600">{safe(block.body)}</p>
        </div>)}
      </div>}
      {p.showcase.length > 0 && <p className="mt-6 text-xs text-ink-500">{NOT_EVIDENCE}</p>}
    </div>
  </section>;
}
