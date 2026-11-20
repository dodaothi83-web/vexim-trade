import type { CSSProperties, ReactNode } from "react";

import { AplusVideo } from "@/components/public/aplus-video";
import { StorefrontBannerCarousel } from "@/components/public/storefront-banner-carousel";
import { STOREFRONT_TONE_COLORS, type StorefrontStat } from "@/lib/storefront-theme";
import type { LayoutBlock, StorefrontLayout } from "@/lib/storefront-layout";

/**
 * Các khối "Thiết kế trang" (Premium/Pro) dưới phần đầu trang nhà cung cấp. Component thuần:
 * nhận dữ liệu đã chuẩn bị sẵn (số liệu, thị trường, sản phẩm) để dùng chung cho trang công
 * khai, "Trang của tôi" và bản xem trước trực tiếp trong trình thiết kế.
 */
export const STOREFRONT_STAT_LABELS: Record<StorefrontStat, string> = {
  capacity: "Capacity", founded: "Founded", employees: "Employees", markets: "Export markets",
  lead_time: "Lead time", moq: "Minimum order", incoterms: "Incoterms",
};

export type StorefrontBlockProduct = { name: string; imageUrl: string | null; href: string | null; detail?: string };

export type StorefrontBlockCategory = { name: string; href: string | null; count: number; imageUrl: string | null };
export type StorefrontBlockCertificate = { name: string; detail: string };

export interface StorefrontBlocksData {
  statValues: Partial<Record<StorefrontStat, string>>;
  markets: string[];
  products: Record<string, StorefrontBlockProduct>;
  /** Nhóm sản phẩm đang đăng theo danh mục (khối Nhóm sản phẩm, gói Pro). */
  categories?: StorefrontBlockCategory[];
  /** Chứng nhận Vexim đã kiểm tra, còn hiệu lực. */
  certificates?: StorefrontBlockCertificate[];
  /**
   * Nội dung các mục chung (giới thiệu, xác minh, điều kiện giao dịch, thông tin công ty, chứng
   * nhận có ảnh, thư viện ảnh) dựng sẵn ở máy chủ từ cùng component với trang Basic.
   */
  sections?: { company?: ReactNode; checks?: ReactNode; trade?: ReactNode; companyDetails?: ReactNode; certificates?: ReactNode; gallery?: ReactNode };
  imageUrl: (path: string) => string;
}

const NOT_EVIDENCE = "Images and text shared by the supplier. They are not evidence of a Vexim check.";

export function StorefrontBlocks({ layout, data, selectedId, onSelect, showHidden = false, emptyBlock }: {
  layout: StorefrontLayout;
  data: StorefrontBlocksData;
  /** Chỉ trình thiết kế: khối đang chọn và chọn khối khi bấm. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showHidden?: boolean;
  /**
   * Chỉ trình thiết kế: khối chưa có nội dung (ví dụ thư viện ảnh khi chưa có ảnh) vẫn hiện một ô
   * giữ chỗ để bấm chọn được; người mua không thấy ô này.
   */
  emptyBlock?: (block: LayoutBlock) => ReactNode;
}) {
  const tone = STOREFRONT_TONE_COLORS[layout.tone];
  const style = { "--sf-accent": tone.accent, "--sf-dark": tone.dark, "--sf-tint": tone.tint } as CSSProperties;
  const visible = layout.blocks.filter((block) => showHidden || !block.hidden);
  const hasSupplierMedia = visible.some((block) => block.type === "banner" || block.type === "about");
  return <div style={style} className="@container mt-6 space-y-8" data-storefront-blocks>
    {visible.map((block, index) => {
      const rendered = renderBlock(block, data, index);
      if (!onSelect) return rendered ? <div key={block.id}>{rendered}</div> : null;
      const content = rendered ?? emptyBlock?.(block);
      if (!content) return null;
      return <div key={block.id} data-block-id={block.id} role="button" tabIndex={0} aria-pressed={selectedId === block.id}
        onClick={() => onSelect(block.id)} onKeyDown={(event) => { if (event.key === "Enter") onSelect(block.id); }}
        className={`scroll-mt-28 cursor-pointer rounded-xl outline outline-2 outline-offset-4 transition ${selectedId === block.id ? "outline-brand-600" : "outline-transparent hover:outline-brand-200"} ${block.hidden ? "opacity-40" : ""}`}>
        {content}
      </div>;
    })}
    {hasSupplierMedia && <p className="text-xs text-ink-500">{NOT_EVIDENCE}</p>}
  </div>;
}

function renderBlock(block: LayoutBlock, data: StorefrontBlocksData, index: number) {
  switch (block.type) {
    case "banner":
      return <StorefrontBannerCarousel images={block.images.map(data.imageUrl)} eyebrow={block.eyebrow} headline={block.headline} />;
    case "stats": {
      const items = block.stats.map((stat) => ({ stat, value: data.statValues[stat] ?? "" })).filter((item) => item.value);
      if (!items.length) return null;
      return <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-ink-200 bg-ink-200 @2xl:grid-cols-4" style={{ gap: 1 }}>
        {items.map((item) => <div key={item.stat} className="bg-white p-4 @2xl:p-5">
          <dd className="break-words text-xl font-bold text-[var(--sf-dark)] @2xl:text-2xl">{item.value}</dd>
          <dt className="mt-1 text-xs text-ink-500">{STOREFRONT_STAT_LABELS[item.stat]}</dt>
        </div>)}
      </dl>;
    }
    case "products": {
      const items = block.product_ids.map((id) => ({ id, product: data.products[id] })).filter((item) => item.product);
      if (!items.length) return null;
      return <section id="featured" className="scroll-mt-24" aria-labelledby={`featured-${block.id}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">Featured</p>
        <h2 id={`featured-${block.id}`} className="mt-1 text-xl font-bold tracking-tight text-ink-900">Featured products</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          {items.map(({ id, product }) => {
            const body = <>
              <div className="aspect-square overflow-hidden bg-ink-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" />}
              </div>
              <p className="line-clamp-2 px-3 pt-2.5 text-sm font-semibold text-ink-900">{product.name}</p>
              {product.detail && <p className="px-3 pb-3 pt-0.5 text-xs text-ink-500">{product.detail}</p>}
              {!product.detail && <div className="pb-3" />}
            </>;
            return <li key={id} className="group min-w-0 overflow-hidden rounded-xl border border-ink-200 bg-white">
              {product.href ? <a href={product.href} className="block">{body}</a> : body}
            </li>;
          })}
        </ul>
      </section>;
    }
    case "about":
      return <article className="grid items-center gap-5 @2xl:grid-cols-2 @2xl:gap-10">
        <div className={`overflow-hidden rounded-2xl ${index % 2 ? "@2xl:order-2" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imageUrl(block.image_path)} alt={block.title} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
        </div>
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold leading-snug text-ink-900 @2xl:text-2xl">{block.title}</h2>
          {block.body && <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-7 text-ink-600">{block.body}</p>}
        </div>
      </article>;
    case "video":
      return <section aria-labelledby={`video-${block.id}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">Factory tour</p>
        <h2 id={`video-${block.id}`} className="mt-1 text-xl font-bold tracking-tight text-ink-900">{block.title || "Inside our facility"}</h2>
        <div className="mt-4"><AplusVideo uid={block.video_uid} title={block.title || "Factory video"} className="rounded-2xl" /></div>
      </section>;
    case "categories": {
      const groups = data.categories ?? [];
      if (groups.length < 2) return null;
      return <section aria-labelledby={`categories-${block.id}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">Browse</p>
        <h2 id={`categories-${block.id}`} className="mt-1 text-xl font-bold tracking-tight text-ink-900">Product groups</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          {groups.map((group) => {
            const body = <>
              <div className="aspect-[4/3] overflow-hidden bg-[var(--sf-tint)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {group.imageUrl && <img src={group.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" />}
              </div>
              <p className="px-3 pt-2.5 text-sm font-semibold text-ink-900">{group.name}</p>
              <p className="px-3 pb-3 pt-0.5 text-xs text-ink-500">{group.count} {group.count === 1 ? "product" : "products"}</p>
            </>;
            return <li key={group.name} className="group min-w-0 overflow-hidden rounded-xl border border-ink-200 bg-white">
              {group.href ? <a href={group.href} className="block">{body}</a> : body}
            </li>;
          })}
        </ul>
      </section>;
    }
    case "company": {
      // Giới thiệu công ty (Premium/Pro): chữ bên trái, ảnh bên phải (1 ảnh lớn hoặc 1 lớn + 2 nhỏ),
      // video giới thiệu (gói Pro) trải rộng bên dưới. Điện thoại: ảnh trên, chữ dưới.
      const images = block.images ?? [];
      return <section id="about" className="scroll-mt-24 overflow-hidden rounded-2xl border border-ink-200 bg-white" aria-labelledby="about-title">
        <div className={images.length ? "grid @3xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" : undefined}>
          {images.length > 0 && <AboutMedia images={images.map(data.imageUrl)} />}
          <div className="min-w-0 p-6 @2xl:p-10 @3xl:order-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">About</p>
            <h2 id="about-title" className="mt-1.5 text-2xl font-bold tracking-tight text-ink-900 @2xl:text-3xl">About this supplier</h2>
            <div className="mt-4 h-0.5 w-12 bg-[var(--sf-accent)]" aria-hidden="true" />
            {data.sections?.company}
          </div>
        </div>
        {block.video_uid && <div className="border-t border-ink-100 bg-[var(--sf-tint)]/40 p-6 @2xl:p-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">Company video</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-ink-900">{block.video_title || "Meet the company"}</h3>
          <div className="mt-4 max-w-4xl"><AplusVideo uid={block.video_uid} title={block.video_title || "Company video"} className="rounded-2xl" /></div>
        </div>}
      </section>;
    }
    case "checks":
      return <Shell id="verification" eyebrow="Verification" title="Supplier checks" sub="See what has been reviewed and what each check covers.">{data.sections?.checks}</Shell>;
    case "trade":
      return <Shell id="trade" eyebrow="Trade terms" title="Trade overview">{data.sections?.trade}</Shell>;
    case "details":
      if (!data.sections?.companyDetails) return null;
      return <Shell id="company-details" eyebrow="Company" title="Company details">{data.sections.companyDetails}</Shell>;
    case "gallery":
      if (block.images?.length) return <Shell id="gallery" eyebrow="Gallery" title="Supplier gallery">
        <p className="mt-1 text-xs text-ink-500">Shared supplier images; not evidence of factory verification.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 @2xl:grid-cols-3">{block.images.map((path) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img key={path} src={data.imageUrl(path)} alt="" loading="lazy" decoding="async" className="h-32 w-full rounded-lg object-cover ring-1 ring-ink-200 @2xl:h-44" />
        ))}</div>
      </Shell>;
      if (!data.sections?.gallery) return null;
      return <Shell id="gallery" eyebrow="Gallery" title="Supplier gallery">{data.sections.gallery}</Shell>;
    case "certificates": {
      if (data.sections?.certificates) return <Shell id="certificates" eyebrow="Certificates" title="Certificates on file">{data.sections.certificates}</Shell>;
      const items = data.certificates ?? [];
      if (!items.length) return null;
      return <section aria-labelledby={`certificates-${block.id}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">Certificates</p>
        <h2 id={`certificates-${block.id}`} className="mt-1 text-xl font-bold tracking-tight text-ink-900">Certificates on file</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => <li key={`${item.name}-${item.detail}`} className="rounded-xl border border-ink-200 bg-white px-4 py-2.5">
            <p className="text-sm font-semibold text-ink-900">{item.name}</p>
            {item.detail && <p className="text-xs text-ink-500">{item.detail}</p>}
          </li>)}
        </ul>
        <p className="mt-2 text-xs text-ink-500">Certificates reviewed by Vexim for this supplier. See Supplier checks for what each review covers.</p>
      </section>;
    }
    case "markets":
      if (!data.markets.length) return null;
      return <section aria-labelledby={`markets-${block.id}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">Export markets</p>
        <h2 id={`markets-${block.id}`} className="mt-1 text-xl font-bold tracking-tight text-ink-900">Where we ship</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {data.markets.map((market) => <li key={market} className="rounded-full bg-[var(--sf-tint)] px-3 py-1.5 text-sm font-semibold text-[var(--sf-dark)]">{market}</li>)}
        </ul>
      </section>;
  }
}

/** Khung chung của các mục: dòng nhỏ theo tông màu, tiêu đề, nội dung trong thẻ trắng. */
function Shell({ id, eyebrow, title, sub, children }: { id: string; eyebrow: string; title: string; sub?: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-5 @2xl:p-7" aria-labelledby={`${id}-title`}>
    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">{eyebrow}</p>
    <h2 id={`${id}-title`} className="mt-1 text-xl font-bold tracking-tight text-ink-900">{title}</h2>
    {sub && <p className="mt-1 text-sm leading-6 text-ink-600">{sub}</p>}
    {children}
  </section>;
}

/** Ảnh giới thiệu: 1 ảnh lớn; 2 ảnh chồng nhau; 3 ảnh thì 1 lớn bên trái và 2 nhỏ bên phải. */
function AboutMedia({ images }: { images: string[] }) {
  const img = (src: string, className: string) => (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img key={src} src={src} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />
  );
  return <div className="relative h-64 bg-[var(--sf-tint)] @2xl:h-80 @3xl:order-2 @3xl:h-auto @3xl:min-h-[440px]">
    {images.length === 1 ? <div className="absolute inset-0">{img(images[0], "")}</div>
      : images.length === 2 ? <div className="absolute inset-0 grid grid-rows-2 gap-1">{images.map((src) => img(src, ""))}</div>
        : <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1">
          <div className="row-span-2">{img(images[0], "")}</div>
          {img(images[1], "")}
          {img(images[2], "")}
        </div>}
  </div>;
}
