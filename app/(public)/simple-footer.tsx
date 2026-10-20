"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { COMPANY } from "@/lib/config";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { SocialLinks } from "@/components/social-links";

/**
 * Footer gọn cho các trang không phải home. Trang chủ (/) tự render footer
 * đầy đủ (industries + links + contact) trong home.tsx.
 */
export function SimpleFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <footer className="mt-16 border-t border-ink-200 bg-white py-8 text-[12.5px] text-ink-500">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-2 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>© {new Date().getFullYear()} {COMPANY.legalName}, Tây Tựu, Hà Nội, Việt Nam</div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/how-we-verify" className="hover:text-ink-800">How we verify</Link>
          <Link href="/for-suppliers" className="hover:text-ink-800">For suppliers</Link>
          <Link href="/thong-tin-chu-quan" className="hover:text-ink-800">Thông tin chủ quản</Link>
          <Link href="/quy-che-hoat-dong" className="hover:text-ink-800">Quy chế hoạt động</Link>
          <Link href="/khieu-nai" className="hover:text-ink-800">Khiếu nại</Link>
          <Link href="/privacy-policy" className="hover:text-ink-800">Privacy Policy</Link>
          <Link href="/cookie-policy" className="hover:text-ink-800">Cookie Policy</Link>
          <CookieSettingsButton className="hover:text-ink-800" />
          <Link href="/terms-of-service" className="hover:text-ink-800">Terms of Service</Link>
          <a href={`mailto:${COMPANY.email}`} className="hover:text-ink-800">{COMPANY.email}</a>
          <SocialLinks />
        </div>
      </div>
    </footer>
  );
}
