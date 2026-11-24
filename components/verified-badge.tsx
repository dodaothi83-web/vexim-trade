"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { VERIFICATION_TIER_TONES, verificationTier, type VerificationTier } from "@/components/verification-tier";
import { VERIFICATION_DISPLAY_ORDER, type VerificationLevel } from "@/lib/types";
import { verificationLabel, type PublicL2Scope } from "@/lib/verification-status";

/**
 * Nhãn xác minh gọn trên thẻ sản phẩm: "Verified" + khiên nhỏ có số cấp (L1/L2/L3).
 *
 * Cấp = số bước kiểm tra đã duyệt, không phải bậc nối tiếp (L2 có thể là giấy tờ + giao hàng,
 * chưa kiểm nhà máy). Vì vậy bảng chi tiết luôn liệt kê đủ ba bước và trạng thái từng bước.
 * Desktop: di chuột hoặc focus để xem. Điện thoại: chạm để mở, chạm ra ngoài hoặc Esc để đóng.
 * Màu khiên: thang navy đậm dần dùng chung toàn site (VERIFICATION_TIER_TONES).
 */

const SHIELD_PATH = "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";

export function TierShield({ tier, className = "h-[18px] w-[18px] sm:h-5 sm:w-5" }: { tier: Exclude<VerificationTier, 0>; className?: string }) {
  const tone = VERIFICATION_TIER_TONES[tier];
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" fill={tone.fill} stroke={tone.stroke} strokeWidth={1.8} strokeLinejoin="round">
        <path d={SHIELD_PATH} />
      </svg>
      <span className="relative -mt-px text-[7.5px] font-extrabold leading-none tracking-tight sm:text-[8px]" style={{ color: tone.text }}>
        L{tier}
      </span>
    </span>
  );
}

export function VerifiedBadge({ levels, l2Scope }: { levels: readonly VerificationLevel[]; l2Scope?: PublicL2Scope }) {
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

  const rows = VERIFICATION_DISPLAY_ORDER.map((level) => ({
    level,
    label: verificationLabel(level, l2Scope),
    on: levels.includes(level),
  }));
  const accessibleName = `Verified L${tier}. Supplier checks: ${rows.map((r) => `${r.label}: ${r.on ? "Approved" : "Not approved"}`).join("; ")}`;

  return (
    <span ref={wrapper} className="group/vb relative inline-flex" onPointerEnter={place} onFocus={place}>
      <button
        type="button"
        aria-label={accessibleName}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { place(); setOpen((value) => !value); }}
        className="inline-flex cursor-help items-center gap-1 rounded-md text-[11px] font-semibold leading-4 text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:text-xs sm:leading-5"
      >
        <span>Verified</span>
        <TierShield tier={tier as Exclude<VerificationTier, 0>} />
      </button>
      {/* pb-2/pt-2 thay cho margin để con trỏ đi từ nhãn sang bảng không bị mất hover. */}
      <span
        id={panelId}
        role="tooltip"
        className={`absolute right-0 z-40 w-60 max-w-[calc(100vw-2rem)] ${below ? "top-full pt-2" : "bottom-full pb-2"} ${
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
