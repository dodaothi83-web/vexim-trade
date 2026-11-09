import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, ImageOff, MapPin, PackageSearch } from "lucide-react";

import { supplierTypeIcon } from "@/components/brand/vexim-icons";
import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { supplierNameCase } from "@/lib/public/supplier-name";
import { VERIFICATION_DISPLAY_ORDER, type SupplierType, type VerificationLevel } from "@/lib/types";
import { verificationLabel, type PublicL2Scope } from "@/lib/verification-status";

/** Search only passes buyer-facing supplier fields and already-gated public offers. */
export type SearchSupplierCardSupplier = {
  id: string;
  slug: string | null;
  name: string;
  province: string;
  type: SupplierType | null;
  typeLabel: string;
  profileImage: string | null;
  summary: string;
  mainProducts: string;
  verificationSteps: VerificationLevel[];
  l2Scope: PublicL2Scope;
};

export type SearchSupplierCardOffer = { product: PublicCategoryProduct; categorySlug: string };

function checkLabel(level: VerificationLevel, scope: PublicL2Scope, vi: boolean): string {
  if (!vi) return verificationLabel(level, scope);
  if (level === 1) return "Đã kiểm tra giấy tờ doanh nghiệp";
  if (level === 3) return "Đã kiểm tra hồ sơ giao hàng";
  if (scope === "partner_contract") return "Đã kiểm tra hợp đồng nhà máy đối tác";
  if (scope === "both") return "Đã kiểm tra nhà máy và hợp đồng đối tác";
  return scope === "factory" ? "Đã xác minh nhà máy" : "Đã kiểm tra hồ sơ cấp L3";
}

function supplierAvatar(path: string | null, id: string): string | null {
  const relative = path?.replace(/^\/+/, "") ?? "";
  // Profile photos uploaded through Vexim have this public route. Do not turn a
  // supplier-authored URL or an unrelated vault path into an image on search.
  return relative.startsWith(`suppliers/${id}/profile-`) && /\.(jpe?g|png|webp|gif|avif)$/i.test(relative)
    ? `/public-media/${relative}` : null;
}

export function SearchSupplierCard({ supplier, offers, offerCount, lang }: {
  supplier: SearchSupplierCardSupplier;
  /** Up to three offers from this search, prioritising offers with public photos. */
  offers: readonly SearchSupplierCardOffer[];
  offerCount: number;
  lang: "en" | "vi";
}) {
  const vi = lang === "vi";
  const localHref = (path: string) => vi ? `${path}${path.includes("?") ? "&" : "?"}lang=vi` : path;
  const profileHref = localHref(`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`);
  const rfqHref = localHref(`/rfq?suppliers=${encodeURIComponent(supplier.id)}`);
  const name = supplierNameCase(supplier.name);
  const avatar = supplierAvatar(supplier.profileImage, supplier.id);
  const TypeIcon = supplierTypeIcon(supplier.type);
  const typeName = vi ? (supplier.type === "manufacturer" ? "Nhà sản xuất" : supplier.type === "trading" ? "Công ty thương mại" : supplier.type === "cooperative" ? "Hợp tác xã" : "Nhà cung cấp") : supplier.typeLabel;
  const location = /^(vietnam|việt nam)$/i.test(supplier.province) ? supplier.province : `${supplier.province}, ${vi ? "Việt Nam" : "Vietnam"}`;
  const approved = VERIFICATION_DISPLAY_ORDER.filter((level) => supplier.verificationSteps.includes(level));
  const featured = offers[0]?.product;
  const showMainProducts = !!supplier.mainProducts && supplier.mainProducts !== supplier.summary;
  const galleryClass = offers.length > 1
    ? "grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
    : "grid-cols-1";

  return <article data-search-supplier={supplier.slug || supplier.id}
    className="group overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card transition hover:border-brand-300 hover:shadow-md">
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-5 xl:flex-row xl:items-start xl:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-200 bg-brand-50 text-xl font-bold text-brand-700 sm:h-16 sm:w-16">
          {avatar ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={avatar} alt="" loading="lazy" className="h-full w-full object-contain" /></> : name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="break-words text-lg font-bold leading-snug tracking-tight text-ink-900 sm:text-xl">
            <Link href={profileHref} target="_blank" rel="noopener noreferrer"
              aria-label={vi ? `Xem hồ sơ ${name} (mở tab mới)` : `View ${name} profile (opens in a new tab)`}
              className="hover:text-brand-700 hover:underline focus-visible:rounded-sm">
              {name}
            </Link>
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-600 sm:text-sm">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />{location}</span>
            <span className="inline-flex items-center gap-1.5" title={vi ? "Loại hình do nhà cung cấp khai, không phải cấp xác minh" : "Supplier-stated business type, not a verification check"}>
              <TypeIcon className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />{typeName}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <VerificationPips levels={supplier.verificationSteps} l2Scope={supplier.l2Scope} variant="marketplace" />
            {approved.length > 0 && <VerificationTierBadge levels={supplier.verificationSteps} />}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:pl-[4.875rem] xl:pl-0">
        <Link href={profileHref} target="_blank" rel="noopener noreferrer"
          aria-label={vi ? `Xem hồ sơ ${name} (mở tab mới)` : `View ${name} profile (opens in a new tab)`}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-700 transition hover:border-brand-500 hover:bg-brand-50 sm:text-sm">
          {vi ? "Xem hồ sơ" : "View profile"}
        </Link>
        <Link href={rfqHref}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-brand-800 sm:text-sm">
          {vi ? "Yêu cầu báo giá" : "Request a quote"}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </div>

    <div role="group" className="flex flex-wrap items-center gap-2 border-y border-ink-100 bg-ink-50/60 px-4 py-3 sm:px-5"
      aria-label={vi ? "Các nội dung xác minh đã công bố" : "Published supplier checks"}>
      <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">{vi ? "Vexim kiểm tra" : "Vexim checks"}</span>
      {approved.length ? approved.map((level) => <span key={level}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold leading-4 text-ink-800">
        <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />{checkLabel(level, supplier.l2Scope, vi)}
      </span>) : <span className="text-xs text-ink-600">{vi ? "Chưa có nội dung xác minh được công bố" : "No checks published yet"}</span>}
      <Link href={`${profileHref}#verification`} target="_blank" rel="noopener noreferrer"
        aria-label={vi ? `Xem xác minh của ${name} (mở tab mới)` : `Review ${name} checks (opens in a new tab)`}
        className="inline-flex w-full items-center gap-1 text-xs font-semibold text-brand-700 hover:underline sm:ml-auto sm:w-auto">
        {vi ? "Xem chi tiết" : "Review details"}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>

    <div className="grid gap-5 px-4 py-5 sm:px-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-6">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{vi ? "Hồ sơ nhà cung cấp" : "Supplier overview"}</p>
        {supplier.summary ? <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-ink-700">{supplier.summary}</p>
          : !showMainProducts && <p className="mt-2 text-sm leading-6 text-ink-600">{vi ? "Xem hồ sơ để biết thêm thông tin doanh nghiệp." : "Explore the company profile for more details."}</p>}
        {showMainProducts && <div className="mt-3 rounded-lg bg-brand-50/70 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-brand-700">{vi ? "Mặt hàng chính · theo hồ sơ NCC" : "Main products · supplier profile"}</p>
          <p className="mt-1 line-clamp-2 break-words text-sm font-medium leading-5 text-ink-800">{supplier.mainProducts}</p>
        </div>}
        {featured && <div className="mt-4 border-t border-ink-100 pt-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{vi ? "Từ sản phẩm công khai" : "From a public offer"}</p>
          <p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-ink-900">{featured.name}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2">
              <dt className="text-[11px] text-ink-500">MOQ</dt>
              <dd className="mt-0.5 break-words text-xs font-bold text-ink-800">{withoutDirectContacts(featured.moq || "") || (vi ? "Cần xác nhận" : "On request")}</dd>
            </div>
            <div className="min-w-0 rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2">
              <dt className="text-[11px] text-ink-500">{vi ? "Thời gian giao" : "Lead time"}</dt>
              <dd className="mt-0.5 break-words text-xs font-bold text-ink-800">{withoutDirectContacts(featured.leadTimeText || "") || (vi ? "Cần xác nhận" : "On request")}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] leading-4 text-ink-500">{vi ? "Điều kiện do NCC khai cho sản phẩm này; xác nhận lại khi hỏi giá." : "Product terms are supplier-stated; confirm when requesting a quote."}</p>
        </div>}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{vi ? "Sản phẩm trong tìm kiếm" : "Products in this search"}</h4>
          {offerCount > 0 && <span className="text-xs text-ink-500">{vi ? `${offerCount} sản phẩm công khai` : `${offerCount} public offer${offerCount === 1 ? "" : "s"}`}</span>}
        </div>
        {offers.length ? <div className={`mt-3 grid h-[230px] gap-2 sm:h-[260px] ${galleryClass} ${offers.length === 3 ? "grid-rows-2" : "grid-rows-1"}`}>
          {offers.map(({ product, categorySlug }, index) => {
            const image = product.cardImagePath ?? product.imagePaths[0];
            const href = localHref(`/products/${encodeURIComponent(categorySlug)}/${encodeURIComponent(product.id)}`);
            return <Link key={product.id} href={href} target="_blank" rel="noopener noreferrer"
              aria-label={vi ? `Xem sản phẩm ${product.name} (mở tab mới)` : `View ${product.name} (opens in a new tab)`}
              className={`group/offer flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-ink-200 bg-ink-50 transition hover:border-brand-500 focus-visible:z-10 ${offers.length === 3 && index === 0 ? "row-span-2" : ""}`}>
              <div className="min-h-0 flex-1 overflow-hidden bg-ink-50">
                {image ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/public-media/${image.replace(/^\//, "")}`} alt="" loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover/offer:scale-105" /></>
                  : <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-ink-500"><ImageOff className="h-6 w-6" aria-hidden="true" /><span className="text-[10px]">{vi ? "Chưa có ảnh" : "No photo"}</span></div>}
              </div>
              <span className="block border-t border-ink-100 bg-white px-2.5 py-2 text-xs font-semibold leading-4 text-ink-800 group-hover/offer:text-brand-700">
                <span className="line-clamp-2 break-words">{product.name}</span>
              </span>
            </Link>;
          })}
        </div> : <div className="mt-3 flex h-[230px] flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50 px-5 text-center sm:h-[260px]">
          <PackageSearch className="h-8 w-8 text-ink-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink-600">{vi ? "Chưa có sản phẩm công khai trong tìm kiếm này." : "No public offers in this search."}</p>
          <Link href={profileHref} target="_blank" rel="noopener noreferrer"
            aria-label={vi ? `Xem hồ sơ ${name} (mở tab mới)` : `View ${name} profile (opens in a new tab)`}
            className="mt-2 text-xs font-semibold text-brand-700 underline underline-offset-2">
            {vi ? "Xem hồ sơ nhà cung cấp" : "View supplier profile"}
          </Link>
        </div>}
      </div>
    </div>
  </article>;
}
