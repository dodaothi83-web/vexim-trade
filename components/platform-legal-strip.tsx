import Link from "next/link";

import { COMPANY } from "@/lib/config";

const PLATFORM_LINKS = [
  { href: "/thong-tin-chu-quan", label: "Thông tin chủ quản" },
  { href: "/quy-che-hoat-dong", label: "Quy chế hoạt động" },
  { href: "/khieu-nai", label: "Khiếu nại và báo cáo vi phạm" },
  { href: "/dieu-khoan-su-dung", label: "Điều khoản sử dụng" },
  { href: "/chinh-sach-bao-mat", label: "Chính sách bảo mật" },
] as const;

export function PlatformLegalStrip({
  tone = "light",
  widthClass = "max-w-7xl",
}: {
  tone?: "light" | "dark";
  widthClass?: string;
}) {
  const copyrightYear = new Date().getFullYear();
  const dark = tone === "dark";

  return (
    <section
      aria-label="Thông tin pháp lý của nền tảng"
      className={`border-t ${dark ? "border-white/10 text-slate-400" : "border-ink-200 text-ink-500"}`}
    >
      <div className={`mx-auto grid gap-7 px-5 py-7 text-[12.5px] leading-6 sm:px-6 md:grid-cols-3 lg:px-8 ${widthClass}`}>
        <div>
          <p className={`font-bold ${dark ? "text-slate-100" : "text-ink-900"}`}>
            Copyright © {copyrightYear} VeximTrade.com
          </p>
          <p className={`mt-2 font-semibold ${dark ? "text-slate-200" : "text-ink-800"}`}>{COMPANY.legalName}</p>
          <p className="mt-1">{COMPANY.address}</p>
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
          <p>
            Giấy chứng nhận đăng ký doanh nghiệp số {COMPANY.taxCode}, cấp lần đầu ngày {COMPANY.registrationDate}.
          </p>
          <p className="mt-2">Người đại diện theo pháp luật: Ông {COMPANY.legalRepresentative}</p>
          <p>Chịu trách nhiệm sàn giao dịch thương mại điện tử: Ông {COMPANY.platformResponsible}</p>
          <p>Quy chế hoạt động có hiệu lực từ ngày {COMPANY.platformRulesEffectiveDate}.</p>
          <p className="mt-2">Ghi rõ nguồn “VeximTrade.com” khi phát hành lại thông tin từ website này.</p>
        </div>

        <nav aria-label="Menu quy định của nền tảng">
          <p className={`font-bold ${dark ? "text-slate-100" : "text-ink-900"}`}>Quy định của nền tảng</p>
          <ul className="mt-2 space-y-1.5">
            {PLATFORM_LINKS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={`underline-offset-2 hover:underline ${dark ? "hover:text-white" : "hover:text-brand-700"}`}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
