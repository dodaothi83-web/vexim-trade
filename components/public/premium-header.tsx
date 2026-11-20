import type { ReactNode } from "react";

/**
 * Đầu trang nhà cung cấp gói Premium/Pro: một kiểu chung cho mọi nhà cung cấp (bản mẫu
 * docs/storefront-designer, chủ sàn chốt 2026-11-20). Tên, khiên xác minh và nút gửi yêu cầu
 * luôn ở cùng chỗ để người mua so sánh nhanh; nhà cung cấp chỉ chọn tông màu (biến --sf-*) và
 * câu giới thiệu. Component thuần, chữ đã lọc sẵn ở nơi gọi, để trình thiết kế dùng lại đúng
 * component này khi xem trước.
 */
export function PremiumHeader(p: {
  name: string;
  nameTag?: "h1" | "h2";
  /** Nhãn loại hình (Manufacturer…) kèm biểu tượng. */
  typeBadge?: ReactNode;
  location: string;
  tagline: string;
  checks: ReactNode;
  actions: ReactNode;
  /** Ảnh bìa: chỉ hiện khi trang chưa có khối Banner (banner thay ảnh bìa). */
  coverUrl: string | null;
  avatarUrl: string | null;
  coverAction?: ReactNode;
  avatarAction?: ReactNode;
  avatarHint?: ReactNode;
  nameAside?: ReactNode;
  ownerActions?: ReactNode;
}) {
  const NameTag = p.nameTag ?? "h1";
  return <section className="@container mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200" aria-labelledby="supplier-name">
    {(p.coverUrl || p.coverAction) && <div className={`relative bg-[var(--sf-tint)] ${p.coverUrl ? "h-36 @2xl:h-52" : "h-14"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.coverUrl && <img src={p.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {p.coverAction}
    </div>}
    <div className="flex flex-col gap-5 p-5 @2xl:flex-row @2xl:items-start @2xl:p-7">
      <div className="flex min-w-0 flex-1 gap-4">
        <div className="shrink-0">
          <div className="relative w-fit">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-[var(--sf-tint)] text-2xl font-bold text-[var(--sf-dark)] ring-1 ring-ink-200 @2xl:size-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" /> : p.name.slice(0, 1).toUpperCase()}
            </div>
            {p.avatarAction}
          </div>
          {p.avatarHint}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--sf-accent)]">{p.location}</p>
          <NameTag id="supplier-name" className="mt-1 break-words text-2xl font-bold leading-tight tracking-tight text-ink-900 @2xl:text-3xl">{p.name}</NameTag>
          {p.nameAside && <div className="mt-2 flex flex-wrap items-center gap-2">{p.nameAside}</div>}
          {p.tagline && <p className="mt-2 max-w-2xl text-[15px] leading-7 text-ink-600">{p.tagline}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">{p.typeBadge}</div>
          <div className="mt-3">{p.checks}</div>
        </div>
      </div>
      {(p.actions || p.ownerActions) && <div className="flex w-full shrink-0 flex-col gap-2 @2xl:w-60">
        {p.actions}
        {p.ownerActions}
      </div>}
    </div>
  </section>;
}
