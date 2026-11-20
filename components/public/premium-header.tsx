import type { ReactNode } from "react";

/**
 * Đầu trang nhà cung cấp gói Premium/Pro: kiểu "Hiện đại" là kiểu duy nhất (chủ sàn chốt
 * 2026-11-20; bỏ "Thanh lịch" và "Trưng bày"). Ảnh bìa làm nền lớn với lớp phủ tối, tên công
 * ty chữ trắng, khiên xác minh và loại hình ngay dưới. Nhà cung cấp chỉ chọn tông màu (biến
 * --sf-*) và câu giới thiệu. Component thuần, chữ đã lọc sẵn ở nơi gọi, để trình thiết kế dùng
 * lại đúng component này khi xem trước.
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
  /** Ảnh nền đầu trang: ảnh bìa, thiếu thì ảnh banner đầu tiên; không có thì nền tông màu đậm. */
  coverUrl: string | null;
  avatarUrl: string | null;
  coverAction?: ReactNode;
  /** Chỉ cổng nhà cung cấp: nhãn và kích thước gợi ý cạnh nút thêm ảnh bìa. */
  coverHint?: ReactNode;
  avatarAction?: ReactNode;
  nameAside?: ReactNode;
  ownerActions?: ReactNode;
}) {
  const NameTag = p.nameTag ?? "h1";
  return <section className="@container mt-5" aria-labelledby="supplier-name">
    <div className="relative overflow-hidden rounded-2xl bg-[var(--sf-dark)] text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.coverUrl && <img src={p.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-[#0F1216]/60" aria-hidden="true" />
      {p.coverAction}
      {p.coverHint}
      <div className="relative flex min-h-[340px] flex-col justify-end gap-4 p-6 @2xl:min-h-[440px] @2xl:p-12">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <div className="flex size-14 items-center justify-center overflow-hidden rounded-xl bg-white text-2xl font-bold text-[var(--sf-accent)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" /> : p.name.slice(0, 1).toUpperCase()}
            </div>
            {p.avatarAction}
          </div>
          <span className="rounded-md bg-[var(--sf-accent)] px-3 py-1 text-xs font-bold">{p.location}</span>
        </div>
        <NameTag id="supplier-name" className="max-w-3xl break-words text-3xl font-extrabold leading-tight tracking-tight @2xl:text-5xl">{p.name}</NameTag>
        {p.nameAside && <div className="flex flex-wrap items-center gap-2">{p.nameAside}</div>}
        {p.tagline && <p className="max-w-2xl text-[15px] leading-7 text-white/90 @2xl:text-lg">{p.tagline}</p>}
        {p.actions && <div className="flex max-w-md flex-col gap-2 @2xl:flex-row">{p.actions}</div>}
        {p.ownerActions && <div>{p.ownerActions}</div>}
      </div>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">{p.checks}{p.typeBadge}</div>
  </section>;
}
