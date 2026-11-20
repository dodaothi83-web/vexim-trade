import { Fragment, type CSSProperties, type ReactNode } from "react";

import { AplusVideo } from "@/components/public/aplus-video";
import { StorefrontBannerCarousel } from "@/components/public/storefront-banner-carousel";
import { STOREFRONT_TONE_COLORS, type StorefrontStat } from "@/lib/storefront-theme";
import type { LayoutBlock, StorefrontLayout, TextNode, TextRun } from "@/lib/storefront-layout";

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

/**
 * Chỉ trình thiết kế: các điểm sửa trực tiếp trên khối (kiểu Notion). Không truyền thì khối hiển
 * thị y như trang công khai.
 */
export interface BlockEditor {
  /** Ô chữ sửa tại chỗ thay cho chữ tĩnh. */
  text: (block: LayoutBlock, field: string, value: string, opts: { placeholder: string; max: number; className: string; multiline?: boolean; tone?: "light" | "dark"; label: string }) => ReactNode;
  /** Nút Đổi/Xóa phủ lên ảnh thứ `index` của trường ảnh. */
  imageOverlay: (block: LayoutBlock, field: "images" | "image_path", index: number) => ReactNode;
  /** Ô "+ Thêm ảnh"; null khi đã đủ số ảnh. */
  addImage: (block: LayoutBlock, field: "images" | "image_path", className: string) => ReactNode;
  /** Nút tải, thay, xóa video của khối. */
  video: (block: LayoutBlock) => ReactNode;
  /** Gói Pro: khối Giới thiệu công ty có chỗ đặt video. */
  companyVideo?: boolean;
  /** Khối Giới thiệu công ty: nút sửa phần giới thiệu từ hồ sơ ngay trong khối. */
  companyText?: (block: LayoutBlock) => ReactNode;
}

const NOT_EVIDENCE = "Images and text shared by the supplier. They are not evidence of a Vexim check.";

export function StorefrontBlocks({ layout, data, selectedId, onSelect, showHidden = false, emptyBlock, editor, toolbar, inserter }: {
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
  /** Chỉ trình thiết kế: sửa trực tiếp chữ, ảnh, video trên khối. */
  editor?: BlockEditor;
  /** Chỉ trình thiết kế: thanh công cụ nổi của khối (lên, xuống, ẩn, xóa). */
  toolbar?: (block: LayoutBlock, index: number) => ReactNode;
  /** Chỉ trình thiết kế: nút "+" chèn khối ở vị trí `index` (trước khối thứ index). */
  inserter?: (index: number) => ReactNode;
}) {
  const tone = STOREFRONT_TONE_COLORS[layout.tone];
  const style = { "--sf-accent": tone.accent, "--sf-dark": tone.dark, "--sf-tint": tone.tint } as CSSProperties;
  const visible = layout.blocks.filter((block) => showHidden || !block.hidden);
  const hasSupplierMedia = visible.some((block) => block.type === "banner" || block.type === "about");
  return <div style={style} className="@container mt-6 space-y-8" data-storefront-blocks>
    {visible.map((block, index) => {
      const rendered = renderBlock(block, data, index, editor);
      if (!onSelect) return rendered ? <div key={block.id}>{rendered}</div> : null;
      const content = rendered ?? emptyBlock?.(block);
      if (!content) return null;
      const position = layout.blocks.indexOf(block);
      return <div key={block.id}>
        {inserter?.(position)}
        <div data-block-id={block.id} onClick={() => onSelect(block.id)}
          className={`group/block relative scroll-mt-28 rounded-xl outline outline-2 outline-offset-4 transition ${selectedId === block.id ? "outline-brand-600" : "outline-transparent hover:outline-brand-200"} ${block.hidden ? "opacity-40" : ""}`}>
          {toolbar && <div className={`absolute -top-4 right-3 z-20 transition ${selectedId === block.id ? "opacity-100" : "opacity-0 group-hover/block:opacity-100"}`}
            onClick={(event) => event.stopPropagation()}>{toolbar(block, position)}</div>}
          {content}
        </div>
      </div>;
    })}
    {inserter?.(layout.blocks.length)}
    {hasSupplierMedia && <p className="text-xs text-ink-500">{NOT_EVIDENCE}</p>}
  </div>;
}

/** Một khối riêng lẻ (trình soạn trang dựng từng mục trong tài liệu). null khi chưa có nội dung. */
export function renderStorefrontBlock(block: LayoutBlock, data: StorefrontBlocksData, index: number, editor?: BlockEditor): ReactNode {
  return renderBlock(block, data, index, editor);
}

function renderBlock(block: LayoutBlock, data: StorefrontBlocksData, index: number, ed?: BlockEditor) {
  switch (block.type) {
    case "banner":
      if (ed) return <div className="group/img relative h-56 overflow-hidden rounded-2xl bg-ink-900 @2xl:h-[380px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {block.images[0] && <img src={data.imageUrl(block.images[0])} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0E16]/75 via-[#0A0E16]/35 to-transparent" aria-hidden="true" />
        <div className="absolute bottom-6 left-6 right-6 max-w-xl text-white @2xl:bottom-10 @2xl:left-10">
          {ed.text(block, "eyebrow", block.eyebrow, { placeholder: "Small line, e.g. Binh Phuoc · Since 2009", max: 60, tone: "dark", label: "Eyebrow", className: "text-[11px] font-bold uppercase tracking-[0.18em] text-white/85" })}
          <div className="mt-2">{ed.text(block, "headline", block.headline, { placeholder: "Headline in English", max: 120, multiline: true, tone: "dark", label: "Headline", className: "text-2xl font-light leading-snug text-white @2xl:text-4xl" })}</div>
        </div>
        <div className="absolute right-3 top-3 z-10 flex flex-wrap items-start justify-end gap-1.5">
          {block.images.map((path, i) => <div key={path} className="group/img relative size-14 overflow-hidden rounded-lg ring-2 ring-white/80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.imageUrl(path)} alt="" className="h-full w-full object-cover" />
            {ed.imageOverlay(block, "images", i)}
          </div>)}
          {ed.addImage(block, "images", "size-14 !rounded-lg bg-white/90 text-[10px]")}
        </div>
      </div>;
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
        <div className={`group/img relative overflow-hidden rounded-2xl ${index % 2 ? "@2xl:order-2" : ""}`}>
          {block.image_path
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={data.imageUrl(block.image_path)} alt={block.title} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
            : ed?.addImage(block, "image_path", "aspect-[4/3] w-full")}
          {ed && block.image_path && ed.imageOverlay(block, "image_path", 0)}
        </div>
        <div className="min-w-0">
          {ed ? ed.text(block, "title", block.title, { placeholder: "Heading in English", max: 80, label: "Heading", className: "text-xl font-bold leading-snug text-ink-900 @2xl:text-2xl" })
            : <h2 className="break-words text-xl font-bold leading-snug text-ink-900 @2xl:text-2xl">{block.title}</h2>}
          {ed ? <div className="mt-3">{ed.text(block, "body", block.body, { placeholder: "Write a few sentences in English", max: 600, multiline: true, label: "Text", className: "text-[15px] leading-7 text-ink-600" })}</div>
            : block.body && <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-7 text-ink-600">{block.body}</p>}
        </div>
      </article>;
    case "video":
      return <section aria-labelledby={`video-${block.id}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">Factory tour</p>
        {ed ? <div className="mt-1">{ed.text(block, "title", block.title, { placeholder: "Inside our facility", max: 120, label: "Video title", className: "text-xl font-bold tracking-tight text-ink-900" })}</div>
          : <h2 id={`video-${block.id}`} className="mt-1 text-xl font-bold tracking-tight text-ink-900">{block.title || "Inside our facility"}</h2>}
        <div className="relative mt-4">
          {block.video_uid ? <AplusVideo uid={block.video_uid} title={block.title || "Factory video"} className="rounded-2xl" />
            : ed && <div className="flex aspect-video items-center justify-center rounded-2xl border-2 border-dashed border-ink-300 bg-ink-50" />}
          {ed && <div className="absolute left-3 top-3 z-10">{ed.video(block)}</div>}
        </div>
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
          {images.length > 0 && <AboutMedia images={images.map(data.imageUrl)} overlay={ed ? (i) => ed.imageOverlay(block, "images", i) : undefined}
            add={ed?.addImage(block, "images", "absolute bottom-3 left-3 z-10 h-auto !flex-row px-3 py-1.5 !border-solid !border-white bg-white/95")} />}
          {!images.length && ed && <div className="p-4 @3xl:order-2">{ed.addImage(block, "images", "h-48 w-full @3xl:h-full @3xl:min-h-[360px]")}</div>}
          <div className="min-w-0 p-6 @2xl:p-10 @3xl:order-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">About</p>
            <h2 id="about-title" className="mt-1.5 text-2xl font-bold tracking-tight text-ink-900 @2xl:text-3xl">About this supplier</h2>
            <div className="mt-4 h-0.5 w-12 bg-[var(--sf-accent)]" aria-hidden="true" />
            {data.sections?.company}
            {ed?.companyText?.(block)}
          </div>
        </div>
        {(block.video_uid || ed?.companyVideo) && <div className="border-t border-ink-100 bg-[var(--sf-tint)]/40 p-6 @2xl:p-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">Company video</p>
          {ed ? <div className="mt-1">{ed.text(block, "video_title", block.video_title ?? "", { placeholder: "Meet the company", max: 120, label: "Video title", className: "text-xl font-bold tracking-tight text-ink-900" })}</div>
            : <h3 className="mt-1 text-xl font-bold tracking-tight text-ink-900">{block.video_title || "Meet the company"}</h3>}
          <div className="relative mt-4 max-w-4xl">
            {block.video_uid ? <AplusVideo uid={block.video_uid} title={block.video_title || "Company video"} className="rounded-2xl" />
              : <div className="aspect-video rounded-2xl border-2 border-dashed border-ink-300 bg-white/60" />}
            {ed && <div className="absolute left-3 top-3 z-10">{ed.video(block)}</div>}
          </div>
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
      if (block.images?.length || ed) return <Shell id="gallery" eyebrow="Gallery" title="Supplier gallery">
        <p className="mt-1 text-xs text-ink-500">Shared supplier images; not evidence of factory verification.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 @2xl:grid-cols-3">{(block.images ?? []).map((path, i) => <div key={path} className="group/img relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imageUrl(path)} alt="" loading="lazy" decoding="async" className="h-32 w-full rounded-lg object-cover ring-1 ring-ink-200 @2xl:h-44" />
          {ed?.imageOverlay(block, "images", i)}
        </div>)}
          {ed?.addImage(block, "images", "h-32 @2xl:h-44")}
        </div>
        {ed && !block.images?.length && data.sections?.gallery}
      </Shell>;
      if (!data.sections?.gallery) return null;
      return <Shell id="gallery" eyebrow="Gallery" title="Supplier gallery">{data.sections.gallery}</Shell>;
    case "text":
      return <StorefrontText nodes={block.nodes} imageUrl={data.imageUrl} />;
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
/**
 * Đoạn văn tự do (trình soạn kiểu Notion): HTML ngữ nghĩa cho SEO. Tiêu đề h2/h3, danh sách
 * ul/ol liền nhau gộp một danh sách, ảnh là figure với alt và chú thích.
 */
export function StorefrontText({ nodes, imageUrl }: { nodes: TextNode[]; imageUrl: (path: string) => string }) {
  const out: ReactNode[] = [];
  const runs = (list: TextRun[]) => list.map((run, i) => {
    let node: ReactNode = run.t;
    if (run.i) node = <em>{node}</em>;
    if (run.b) node = <strong className="font-semibold text-ink-900">{node}</strong>;
    return <Fragment key={i}>{node}</Fragment>;
  });
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === "ul" || node.kind === "ol") {
      const items: TextRun[][] = [];
      while (i < nodes.length && nodes[i].kind === node.kind) { items.push((nodes[i] as { runs: TextRun[] }).runs); i++; }
      i--;
      const List = node.kind;
      out.push(<List key={i} className={`my-3 space-y-1.5 pl-5 ${List === "ul" ? "list-disc" : "list-decimal"} marker:text-[var(--sf-accent)]`}>
        {items.map((item, k) => <li key={k} className="whitespace-pre-line pl-1">{runs(item)}</li>)}
      </List>);
    } else if (node.kind === "img") {
      out.push(<figure key={i} className="my-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(node.path)} alt={node.caption} loading="lazy" decoding="async" className="w-full rounded-2xl object-cover" />
        {node.caption && <figcaption className="mt-2 text-center text-[13px] text-ink-500">{node.caption}</figcaption>}
      </figure>);
    } else if (node.kind === "h2") {
      out.push(<h2 key={i} className="mb-2 mt-7 text-2xl font-bold tracking-tight text-ink-900 first:mt-0 @2xl:text-[28px]">{runs(node.runs)}</h2>);
    } else if (node.kind === "h3") {
      out.push(<h3 key={i} className="mb-1.5 mt-5 text-lg font-bold text-ink-900 first:mt-0">{runs(node.runs)}</h3>);
    } else {
      out.push(<p key={i} className="my-3 whitespace-pre-line first:mt-0 last:mb-0">{runs(node.runs)}</p>);
    }
  }
  return <article className="mx-auto max-w-3xl break-words text-[16px] leading-[1.75] text-ink-700">{out}</article>;
}

function Shell({ id, eyebrow, title, sub, children }: { id: string; eyebrow: string; title: string; sub?: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-5 @2xl:p-7" aria-labelledby={`${id}-title`}>
    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">{eyebrow}</p>
    <h2 id={`${id}-title`} className="mt-1 text-xl font-bold tracking-tight text-ink-900">{title}</h2>
    {sub && <p className="mt-1 text-sm leading-6 text-ink-600">{sub}</p>}
    {children}
  </section>;
}

/** Ảnh giới thiệu: 1 ảnh lớn; 2 ảnh chồng nhau; 3 ảnh thì 1 lớn bên trái và 2 nhỏ bên phải. */
function AboutMedia({ images, overlay, add }: { images: string[]; overlay?: (index: number) => ReactNode; add?: ReactNode }) {
  const img = (src: string, className: string) => {
    const i = images.indexOf(src);
    return <div key={src} className="group/img relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />
      {overlay?.(i)}
    </div>;
  };
  return <div className="relative h-64 bg-[var(--sf-tint)] @2xl:h-80 @3xl:order-2 @3xl:h-auto @3xl:min-h-[440px]">
    {images.length === 1 ? <div className="absolute inset-0">{img(images[0], "")}</div>
      : images.length === 2 ? <div className="absolute inset-0 grid grid-rows-2 gap-1">{images.map((src) => img(src, ""))}</div>
        : <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1">
          <div className="row-span-2">{img(images[0], "")}</div>
          {img(images[1], "")}
          {img(images[2], "")}
        </div>}
    {add}
  </div>;
}
