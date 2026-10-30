"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { COMPANY } from "@/lib/config";

type Language = "en" | "vi";
type PlatformLegalStripProps = {
  tone?: "light" | "dark";
  widthClass?: string;
};

const PLATFORM_LINKS = [
  { href: "/thong-tin-chu-quan", label: { en: "Platform Owner Information", vi: "Thông tin chủ quản" } },
  { href: "/quy-che-hoat-dong", label: { en: "Platform Operating Regulations", vi: "Quy chế hoạt động" } },
  { href: "/khieu-nai", label: { en: "Complaints and Violation Reports", vi: "Khiếu nại và báo cáo vi phạm" } },
  { href: "/dieu-khoan-su-dung", label: { en: "Terms of Service", vi: "Điều khoản sử dụng" } },
  { href: "/chinh-sach-bao-mat", label: { en: "Privacy Policy", vi: "Chính sách bảo mật" } },
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

function PlatformLegalStripContent({
  tone = "light",
  widthClass = "max-w-7xl",
  lang,
}: PlatformLegalStripProps & { lang: Language }) {
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
              <li key={item.href}>
                <Link href={item.href} className={`underline-offset-2 hover:underline ${dark ? "hover:text-white" : "hover:text-brand-700"}`}>
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
  const searchParams = useSearchParams();
  const lang: Language = searchParams.get("lang") === "vi" ? "vi" : "en";
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
