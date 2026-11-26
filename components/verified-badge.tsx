"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { VERIFICATION_TIER_TONES, verificationTier, type VerificationTier } from "@/components/verification-tier";
import { VERIFICATION_DISPLAY_ORDER, type VerificationLevel } from "@/lib/types";
import { verificationCheckLabel, type PublicL2Scope } from "@/lib/verification-status";

/**
 * Nhãn xác minh gọn trên thẻ sản phẩm: "Verified" + khiên nhỏ có số cấp (L1/L2/L3).
 *
 * Cấp = số bước kiểm tra đã duyệt, không phải bậc nối tiếp (L2 có thể là giấy tờ + giao hàng,
 * chưa kiểm nhà máy). Vì vậy bảng chi tiết luôn liệt kê đủ ba bước và trạng thái từng bước.
 * Desktop: di chuột hoặc focus để xem. Điện thoại: chạm để mở, chạm ra ngoài hoặc Esc để đóng.
 * Màu: riêng nhãn này trên thẻ sản phẩm dùng ba sắc độ đậm (chủ dự án duyệt 24/11/2026):
 * L1 xanh ngọc, L2 xanh dương, L3 hổ phách, dạng pill nền nhạt + viền mảnh. Các nơi khác
 * (khiên nhỏ, pill cấp ở trang sản phẩm/so sánh/CRM) vẫn dùng thang navy VERIFICATION_TIER_TONES.
 */

/** Pill "Verified" trên thẻ sản phẩm: chữ + khiên đặc cùng màu, nền nhạt, viền mảnh. */
export const CARD_BADGE_TONES: Record<Exclude<VerificationTier, 0>, { color: string; bg: string; border: string }> = {
  1: { color: "#0F766E", bg: "#F0FDFA", border: "#99F6E4" },
  2: { color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
  3: { color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
};

const SHIELD_PATH = "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";

export function TierShield({ tier, className = "h-[18px] w-[18px] sm:h-5 sm:w-5", tone = VERIFICATION_TIER_TONES[tier], labelClassName = "text-[7.5px] sm:text-[8px]" }: {
  tier: Exclude<VerificationTier, 0>;
  className?: string;
  tone?: { fill: string; stroke: string; text: string };
  /** Cỡ chữ "L1/L2/L3" trong khiên; khiên lớn (con dấu trên ảnh bìa CRM) cần chữ to hơn. */
  labelClassName?: string;
}) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" fill={tone.fill} stroke={tone.stroke} strokeWidth={1.8} strokeLinejoin="round">
        <path d={SHIELD_PATH} />
      </svg>
      <span className={`relative -mt-px font-extrabold leading-none tracking-tight ${labelClassName}`} style={{ color: tone.text }}>
        L{tier}
      </span>
    </span>
  );
}

export function VerifiedBadge({ levels, l2Scope, align = "right", size = "card" }: {
  levels: readonly VerificationLevel[];
  l2Scope?: PublicL2Scope;
  /** "card": thẻ sản phẩm (mặc định). "header": cạnh tên công ty cỡ lớn (trang nhà cung cấp trong CRM). */
  size?: "card" | "header";
  /**
   * Mép neo bảng chi tiết. "right" (mặc định): nhãn nằm sát mép phải thẻ sản phẩm, bảng mở sang trái.
   * "left": nhãn nằm ở bên trái khung (khối Supplied by trên trang sản phẩm), bảng mở sang phải để
   * không bị khung có overflow-hidden cắt mất. Khi đó bảng luôn mở xuống dưới (phía trên chỉ có tên
   * nhà cung cấp, không đủ chỗ).
   */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  // Thẻ nằm sát mép trên màn hình (dưới thanh menu dính): mở bảng xuống dưới thay vì lên trên.
  const [below, setBelow] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const place = () => {
    const top = wrapper.current?.getBoundingClientRect().top ?? 1000;
    setBelow(top < 320);
  };
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const approved = VERIFICATION_DISPLAY_ORDER.filter((level) => levels.includes(level));
  const tier = verificationTier(approved);
  // Chưa có bước nào được duyệt: thẻ không hiện nhãn (không có "Verified L0").
  if (tier === 0) return null;
  const shieldTier = tier as Exclude<VerificationTier, 0>;
  const tone = CARD_BADGE_TONES[shieldTier];

  // Bước chưa duyệt luôn mang tên chuẩn ("Factory verification"), không hiện "L3 review".
  const rows = VERIFICATION_DISPLAY_ORDER.map((level) => {
    const on = levels.includes(level);
    return { level, on, label: verificationCheckLabel(level, l2Scope, on) };
  });
  const accessibleName = `Verified L${tier}. Supplier checks: ${rows.map((r) => `${r.label}: ${r.on ? "Approved" : "Not approved"}`).join("; ")}`;

  return (
    <span ref={wrapper} className="group/vb relative inline-flex" onPointerEnter={place} onFocus={place}>
      <button
        type="button"
        aria-label={accessibleName}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { place(); setOpen((value) => !value); }}
        style={{ color: tone.color, backgroundColor: tone.bg, borderColor: tone.border }}
        className={`inline-flex cursor-help items-center rounded-full border font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${size === "header"
          ? "gap-1 py-0.5 pl-2.5 pr-1 text-[13px] leading-5"
          : "gap-[3px] py-px pl-1.5 pr-1 text-[10.5px] leading-4 sm:pl-2 sm:pr-[5px] sm:text-[11px]"}`}
      >
        <span>Verified</span>
        {/* Khiên đặc + số trắng: nét gọn, đọc rõ ở 14–16px, không cần viền phụ. */}
        <TierShield
          tier={shieldTier}
          tone={{ fill: tone.color, stroke: tone.color, text: "#FFFFFF" }}
          className={size === "header" ? "h-[22px] w-[22px]" : "h-4 w-4 sm:h-[18px] sm:w-[18px]"}
          labelClassName={size === "header" ? "text-[9px]" : undefined}
        />
      </button>
      {/* pb-2/pt-2 thay cho margin để con trỏ đi từ nhãn sang bảng không bị mất hover. */}
      <span
        id={panelId}
        role="tooltip"
        className={`absolute ${align === "left" ? "left-0" : "right-0"} z-40 w-60 max-w-[calc(100vw-2rem)] ${below || align === "left" ? "top-full pt-2" : "bottom-full pb-2"} ${
          open ? "block" : "hidden group-hover/vb:block group-focus-within/vb:block"}`}
      >
        <span className="block rounded-lg border border-ink-200 bg-white p-3 text-left shadow-xl">
          <strong className="block text-[12.5px] font-bold leading-5 text-ink-900">Supplier checks</strong>
          <span className="mt-1.5 block space-y-1.5">
            {rows.map((row) => (
              <span key={row.level} className="flex items-start gap-2">
                {row.on ? (
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2FA35A] text-white">
                    <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden="true" />
                  </span>
                ) : (
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-[1.5px] border-ink-300" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className={`block text-[12px] font-semibold leading-4 ${row.on ? "text-ink-900" : "text-ink-500"}`}>{row.label}</span>
                  <span className={`block text-[11px] leading-4 ${row.on ? "text-[#1F7A43]" : "text-ink-400"}`}>{row.on ? "Approved" : "Not approved"}</span>
                </span>
              </span>
            ))}
          </span>
          <Link href="/how-we-verify" className="mt-2.5 inline-block text-[11.5px] font-semibold text-brand-700 hover:underline">
            How we verify
          </Link>
        </span>
      </span>
    </span>
  );
}

/**
 * Con dấu xác minh trên ảnh bìa trang nhà cung cấp trong CRM: cùng khiên đặc màu cấp + "L1/L2/L3" và
 * chữ "Verified" như nhãn trên thẻ sản phẩm (chủ dự án yêu cầu 26/11/2026, thay con dấu tròn
 * "N CHECKS"). Chưa có bước nào duyệt thì hiện khiên xám "Chưa duyệt" để nhân viên thấy ngay.
 */
export function VerifiedCoverSeal({ levels }: { levels: readonly VerificationLevel[] }) {
  const tier = verificationTier(VERIFICATION_DISPLAY_ORDER.filter((level) => levels.includes(level)));
  const position = "absolute right-5 top-5 flex flex-col items-center gap-1 rounded-2xl border bg-white/95 px-3 pb-2 pt-2.5 shadow-lg";
  if (tier === 0) {
    return <span role="img" aria-label="Chưa có bước xác minh nào được duyệt" className={`${position} border-ink-200 text-ink-500`}>
      <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden="true"><path d={SHIELD_PATH} /></svg>
      <span className="text-[11px] font-semibold leading-none">Chưa duyệt</span>
    </span>;
  }
  const shieldTier = tier as Exclude<VerificationTier, 0>;
  const tone = CARD_BADGE_TONES[shieldTier];
  return <span role="img" aria-label={`Verified L${tier}: ${tier} of 3 checks approved`} className={position} style={{ borderColor: tone.border }}>
    <TierShield tier={shieldTier} tone={{ fill: tone.color, stroke: tone.color, text: "#FFFFFF" }} className="h-10 w-10" labelClassName="text-[13px]" />
    <span className="text-[11px] font-semibold leading-none" style={{ color: tone.color }}>Verified</span>
  </span>;
}
