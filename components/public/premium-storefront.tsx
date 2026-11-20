import type { CSSProperties, ReactNode } from "react";

import type { PublicSupplierCard } from "@/lib/public/catalog";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import {
  supplierAnnualOutputDisplay, supplierCapacityDisplay, supplierExportMarketsDisplay, supplierIncotermsDisplay, supplierMoqDisplay,
} from "@/lib/public/supplier-english";
import { STOREFRONT_TONE_COLORS, type StorefrontStat, type StorefrontTheme } from "@/lib/storefront-theme";
import type { ShowcaseBlock } from "@/lib/supplier-showcase";
import { looksVietnamese } from "@/lib/vietnamese-text";
import { aplusVideoThumbnailUrl } from "@/lib/products/aplus";
import { HeroVideoButton } from "@/components/public/hero-video-button";

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
  /** Chỉ cổng nhà cung cấp (xem SupplierStorefront). */
  avatarHint?: ReactNode;
  nameAside?: ReactNode;
  ownerActions?: ReactNode;
  nameTag: "h1" | "h2";
  showcase: ShowcaseBlock[];
  imageUrl: (path: string) => string;
  /**
   * Ảnh nền thay thế khi chưa có ảnh bìa (ảnh đầu tiên của A+ doanh nghiệp), để đầu trang không bị
   * khoảng tối trống.
   */
  fallbackImageUrl?: string | null;
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
  // Chỉ còn mẫu "Hiện đại" (chủ sàn chốt 2026-11-20).
  return <div style={style} data-storefront-template="modern" data-storefront-tone={props.theme.tone}>
    <Modern {...shared} />
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

/* ---------- Mẫu 2: Hiện đại ---------- */
function Modern(p: Shared) {
  const NameTag = p.nameTag;
  const video = p.theme.hero_video;
  // Ảnh nền: ảnh bìa → ảnh đầu tiên của A+ doanh nghiệp → khối Showcase cũ → ảnh bìa video nhà máy
  // (có thể chưa có khi video đang xử lý nên để sau cùng). Không có ảnh nào thì nền tông màu đậm kèm
  // chữ cái đầu mờ, không để khoảng trống.
  const heroImage = p.coverUrl ?? p.fallbackImageUrl ?? (p.showcase[0] ? p.imageUrl(p.showcase[0].image_path) : null)
    ?? (video ? aplusVideoThumbnailUrl(video.video_uid, 1080) : null);
  return <section className="mt-5" aria-labelledby="supplier-name">
    <div className="relative overflow-hidden rounded-2xl bg-[var(--sf-dark)] text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {heroImage && <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {!heroImage && <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-16 select-none text-[16rem] font-black leading-none text-white/[0.06] sm:text-[22rem]">{p.name.slice(0, 1).toUpperCase()}</span>}
      <div className={`absolute inset-0 ${heroImage ? "bg-[#0F1216]/60" : "bg-gradient-to-br from-transparent to-black/30"}`} aria-hidden="true" />
      {p.coverAction}
      <div className="relative flex min-h-[360px] flex-col justify-end gap-4 p-6 sm:min-h-[460px] sm:p-12">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Avatar avatarUrl={p.avatarUrl} name={p.name} className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white text-2xl font-bold text-[var(--sf-accent)]" />
            {p.avatarAction}
          </div>
          {p.avatarHint}
          <span className="rounded-md bg-[var(--sf-accent)] px-3 py-1 text-xs font-bold">{p.location}</span>
        </div>
        <NameTag id="supplier-name" className="max-w-3xl break-words text-3xl font-extrabold leading-tight tracking-tight sm:text-6xl">{p.name}</NameTag>
        {p.nameAside && <div className="flex flex-wrap items-center gap-2">{p.nameAside}</div>}
        {p.tagline && <p className="max-w-2xl text-[15px] leading-7 text-white/90 sm:text-lg">{p.tagline}</p>}
        <div className="flex max-w-xl flex-col gap-2 sm:flex-row [&>*]:sm:w-auto">{p.actions}
          {video && <HeroVideoButton uid={video.video_uid} title={`${p.name} factory video`} />}</div>
        {p.ownerActions && <div>{p.ownerActions}</div>}
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
