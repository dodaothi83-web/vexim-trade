"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { CookieSettingsButton } from "@/components/cookie-consent";
import { SocialLinks } from "@/components/social-links";
import { COMPANY } from "@/lib/config";

type Language = "en" | "vi";
type PlatformLegalStripProps = {
  variant?: "strip" | "footer";
  tone?: "light" | "dark";
  widthClass?: string;
};

const PLATFORM_LINKS = [
  { href: { en: "/thong-tin-chu-quan", vi: "/thong-tin-chu-quan" }, label: { en: "Platform Owner Information", vi: "Thông tin chủ quản" } },
  { href: { en: "/platform-rules", vi: "/quy-che-hoat-dong" }, label: { en: "Platform Operating Rules", vi: "Quy chế hoạt động" } },
  { href: { en: "/khieu-nai", vi: "/khieu-nai" }, label: { en: "Complaints and Violation Reports", vi: "Khiếu nại và báo cáo vi phạm" } },
  { href: { en: "/terms-of-service", vi: "/dieu-khoan-su-dung" }, label: { en: "Terms of Service", vi: "Điều khoản sử dụng" } },
  { href: { en: "/privacy-policy", vi: "/chinh-sach-bao-mat" }, label: { en: "Privacy Policy", vi: "Chính sách bảo mật" } },
] as const;

const COPY = {
  en: {
    sectionLabel: "Platform legal information",
    registration: (taxCode: string, date: string) => `Enterprise Registration Certificate No. ${taxCode}, first issued on ${date}.`,
    legalRepresentative: (name: string) => `Legal representative: Mr. ${name}`,
    platformResponsible: (name: string) => `Person responsible for the e-commerce platform: Mr. ${name}`,
    rulesEffective: (date: string) => `The Platform Operating Regulations are effective from ${date}.`,
    sourceCredit: "Please credit “veximtrade.com” when republishing information from this website.",
    navigationLabel: "Platform regulations menu",
    navigationTitle: "Platform Regulations",
  },
  vi: {
    sectionLabel: "Thông tin pháp lý của nền tảng",
    registration: (taxCode: string, date: string) => `Giấy chứng nhận đăng ký doanh nghiệp số ${taxCode}, cấp lần đầu ngày ${date}.`,
    legalRepresentative: (name: string) => `Người đại diện theo pháp luật: Ông ${name}`,
    platformResponsible: (name: string) => `Chịu trách nhiệm sàn giao dịch thương mại điện tử: Ông ${name}`,
    rulesEffective: (date: string) => `Quy chế hoạt động có hiệu lực từ ngày ${date}.`,
    sourceCredit: "Ghi rõ nguồn “veximtrade.com” khi phát hành lại thông tin từ website này.",
    navigationLabel: "Menu quy định của nền tảng",
    navigationTitle: "Quy định của nền tảng",
  },
} as const;

/** One footer, with navigation separated from the legal disclosure. */
function UnifiedFooter({ lang }: { lang: Language }) {
  const vi = lang === "vi";
  const copy = COPY[lang];
  const explore = [
    { href: vi ? "/how-it-works?lang=vi" : "/how-it-works", label: vi ? "Cách hoạt động" : "How it works" },
    { href: "/how-we-verify", label: vi ? "Quy trình xác thực" : "How we verify" },
    { href: "/for-suppliers", label: vi ? "Dành cho nhà cung cấp" : "For suppliers" },
    { href: "/login", label: vi ? "Đăng nhập nhà cung cấp" : "Supplier sign in" },
  ];
  const linkClass = "inline-block py-1 underline-offset-4 hover:text-brand-700 hover:underline";
  return <footer lang={lang} className="mt-16 border-t border-ink-200 bg-white pb-28 text-sm text-ink-600">
    <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
      <div className="grid gap-8 py-10 md:grid-cols-[1.3fr_0.8fr_1fr] md:gap-12">
        <section aria-labelledby="footer-company-title">
          <h2 id="footer-company-title" className="text-lg font-bold text-brand-700">Vexim Trade</h2>
          <p className="mt-3 font-semibold text-ink-900">{COMPANY.legalName}</p>
          <p className="mt-2 max-w-sm leading-6">{vi ? COMPANY.address : COMPANY.addressEn}</p>
          <div className="mt-2 flex flex-col items-start gap-1">
            <a href={`mailto:${COMPANY.contactEmail}`} className={linkClass}>{COMPANY.contactEmail}</a>
            <a href={`tel:${COMPANY.phone}`} className={linkClass}>{COMPANY.phoneDisplay}</a>
          </div>
          <SocialLinks className="mt-3" />
        </section>
        <nav aria-label={vi ? "Khám phá" : "Explore"}>
          <h2 className="font-bold text-ink-900">{vi ? "Khám phá" : "Explore"}</h2>
          <ul className="mt-3 space-y-1">{explore.map((item) => <li key={item.href}><Link href={item.href} prefetch={false} className={linkClass}>{item.label}</Link></li>)}</ul>
        </nav>
        <nav aria-label={vi ? "Chính sách và hỗ trợ" : "Policies and support"}>
          <h2 className="font-bold text-ink-900">{vi ? "Chính sách và hỗ trợ" : "Policies & support"}</h2>
          <ul className="mt-3 space-y-1">
            {PLATFORM_LINKS.map((item) => <li key={item.href.en}><Link href={item.href[lang]} className={linkClass}>{item.label[lang]}</Link></li>)}
            <li><Link href="/cookie-policy" className={linkClass}>{vi ? "Chính sách cookie" : "Cookie Policy"}</Link></li>
            <li><CookieSettingsButton className={linkClass}>{vi ? "Cài đặt cookie" : "Cookie settings"}</CookieSettingsButton></li>
          </ul>
        </nav>
      </div>
      <section aria-label={copy.sectionLabel} className="border-t border-ink-200 pt-6 text-xs leading-6">
        <p>{copy.registration(COMPANY.taxCode, COMPANY.registrationDate)}</p>
        <p className="mt-2">{copy.legalRepresentative(COMPANY.legalRepresentative)}</p>
        <p>{copy.platformResponsible(COMPANY.platformResponsible)}</p>
        <p>{copy.rulesEffective(COMPANY.platformRulesEffectiveDate)}</p>
        <p className="mt-2">{copy.sourceCredit}</p>
        <p className="mt-4 font-semibold text-ink-700">Copyright © {new Date().getFullYear()} Vexim Trade</p>
      </section>
    </div>
  </footer>;
}

function PlatformLegalStripContent({
  variant = "strip",
  tone = "light",
  widthClass = "max-w-7xl",
  lang,
}: PlatformLegalStripProps & { lang: Language }) {
  if (variant === "footer") return <UnifiedFooter lang={lang} />;
  const copyrightYear = new Date().getFullYear();
  const dark = tone === "dark";
  const copy = COPY[lang];

  return (
    <section
      lang={lang}
      aria-label={copy.sectionLabel}
      className={`border-t ${dark ? "border-white/10 text-slate-400" : "border-ink-200 text-ink-500"}`}
    >
      <div className={`mx-auto grid gap-7 px-5 py-7 text-[12.5px] leading-6 sm:px-6 md:grid-cols-[0.95fr_1.5fr_0.75fr] lg:gap-10 lg:px-8 ${widthClass}`}>
        <div>
          <p className={`font-bold ${dark ? "text-slate-100" : "text-ink-900"}`}>
            Copyright © {copyrightYear} Vexim Trade
          </p>
          <p className={`mt-2 font-semibold ${dark ? "text-slate-200" : "text-ink-800"}`}>{COMPANY.legalName}</p>
          <p className="mt-1">{lang === "vi" ? COMPANY.address : COMPANY.addressEn}</p>
          <p className="mt-1">
            <a href={`mailto:${COMPANY.contactEmail}`} className={`font-semibold underline-offset-2 hover:underline ${dark ? "text-slate-200" : "text-brand-700"}`}>
              {COMPANY.contactEmail}
            </a>
            <span aria-hidden="true"> · </span>
            <a href={`tel:${COMPANY.phone}`} className={`font-semibold ${dark ? "text-slate-200" : "text-ink-700"}`}>
              {COMPANY.phoneDisplay}
            </a>
          </p>
        </div>

        <div>
          <p>{copy.registration(COMPANY.taxCode, COMPANY.registrationDate)}</p>
          <p className="mt-2">{copy.legalRepresentative(COMPANY.legalRepresentative)}</p>
          <p>{copy.platformResponsible(COMPANY.platformResponsible)}</p>
          <p>{copy.rulesEffective(COMPANY.platformRulesEffectiveDate)}</p>
          <p className="mt-2">{copy.sourceCredit}</p>
        </div>

        <nav aria-label={copy.navigationLabel} className="md:pl-6 lg:pl-10">
          <p className={`font-bold ${dark ? "text-slate-100" : "text-ink-900"}`}>{copy.navigationTitle}</p>
          <ul className="mt-2 space-y-1.5">
            {PLATFORM_LINKS.map((item) => (
              <li key={item.href.en}>
                <Link href={item.href[lang]} className={`underline-offset-2 hover:underline ${dark ? "hover:text-white" : "hover:text-brand-700"}`}>
                  {item.label[lang]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

function LocalizedPlatformLegalStrip(props: PlatformLegalStripProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vietnameseRoutes = ["/quy-che-hoat-dong", "/dieu-khoan-su-dung", "/chinh-sach-bao-mat", "/thong-tin-chu-quan", "/khieu-nai"];
  const englishRoutes = ["/platform-rules", "/terms-of-service", "/privacy-policy"];
  const lang: Language = vietnameseRoutes.includes(pathname)
    ? "vi"
    : englishRoutes.includes(pathname)
      ? "en"
      : searchParams.get("lang") === "vi" ? "vi" : "en";
  return <PlatformLegalStripContent {...props} lang={lang} />;
}

/** Theo cùng nút chuyển English / Tiếng Việt của website; English là mặc định. */
export function PlatformLegalStrip(props: PlatformLegalStripProps) {
  return (
    <Suspense fallback={<PlatformLegalStripContent {...props} lang="en" />}>
      <LocalizedPlatformLegalStrip {...props} />
    </Suspense>
  );
}
