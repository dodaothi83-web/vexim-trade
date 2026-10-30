import Link from "next/link";
import type { Metadata } from "next";

import { COMPANY } from "@/lib/config";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Thông tin chủ quản nền tảng | Vexim Trade" },
  description: "Thông tin về tổ chức quản lý và vận hành nền tảng Vexim Trade.",
  alternates: { canonical: `${SITE_URL}/thong-tin-chu-quan` },
  robots: { index: true, follow: true },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1 border-b border-ink-100 py-3.5 last:border-0 sm:grid-cols-[220px_1fr] sm:gap-4">
    <dt className="text-sm font-semibold text-ink-500">{label}</dt>
    <dd className="text-sm font-medium leading-6 text-ink-800">{children}</dd>
  </div>;
}

export default function PlatformOperatorPage() {
  return <article lang="vi" className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Vexim Trade · Thông tin công khai</p>
    <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">Thông tin chủ quản nền tảng</h1>
    <p className="mt-3 text-sm text-ink-500">Cập nhật ngày 18 tháng 10 năm 2026</p>
    <p className="mt-6 text-sm leading-7 text-ink-700">Vexim Trade là nền tảng giới thiệu nhà cung cấp Việt Nam và tiếp nhận yêu cầu báo giá của doanh nghiệp mua hàng. Tổ chức quản lý và vận hành nền tảng là:</p>

    <dl className="mt-4">
      <Row label="Tên tổ chức">{COMPANY.legalName}</Row>
      <Row label="Tên nền tảng">Vexim Trade</Row>
      <Row label="Website"><a href={SITE_URL} className="font-semibold text-brand-700 underline">{SITE_URL}</a></Row>
      <Row label="Mã số doanh nghiệp / mã số thuế">{COMPANY.taxCode}, cấp ngày {COMPANY.registrationDate}</Row>
      <Row label="Địa chỉ trụ sở chính">{COMPANY.address}</Row>
      <Row label="Người đại diện theo pháp luật">{COMPANY.legalRepresentative}</Row>
      <Row label="Người chịu trách nhiệm sàn giao dịch thương mại điện tử">{COMPANY.platformResponsible}</Row>
      <Row label="Email tiếp nhận phản ánh"><a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a></Row>
      <Row label="Điện thoại">{COMPANY.phone}</Row>
    </dl>

    <section className="mt-9 space-y-3" aria-labelledby="operator-model">
      <h2 id="operator-model" className="text-xl font-bold text-ink-900">Mô hình hoạt động</h2>
      <p className="text-sm leading-7 text-ink-700">Nhà cung cấp đăng ký tài khoản, gửi hồ sơ doanh nghiệp và sản phẩm để Vexim kiểm tra trước khi thông tin được công khai. Doanh nghiệp mua hàng gửi yêu cầu báo giá qua Vexim. Vexim không cung cấp chức năng đặt hàng trực tuyến, không nhận thanh toán, không giữ tiền của hai bên và không giao kết hợp đồng điện tử trên website. Hợp đồng mua bán do người mua và nhà cung cấp tự thỏa thuận riêng bằng văn bản.</p>
      <p className="text-sm leading-7 text-ink-700">Hiện Vexim không thu phí nhà cung cấp và không thu phí doanh nghiệp mua hàng khi gửi yêu cầu báo giá. Cách áp dụng nếu Vexim bắt đầu thu phí trong tương lai được nêu tại mục Phí sử dụng nền tảng trong <Link href="/quy-che-hoat-dong#rules-fees" className="font-semibold text-brand-700 underline">Quy chế hoạt động</Link>.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="operator-registration">
      <h2 id="operator-registration" className="text-xl font-bold text-ink-900">Đăng ký hoạt động thương mại điện tử</h2>
      <p className="text-sm leading-7 text-ink-700">Vexim đang thực hiện thủ tục đăng ký hoạt động nền tảng thương mại điện tử trung gian theo Luật Thương mại điện tử và Nghị định số 248/2026/NĐ-CP. Thông tin xác nhận đăng ký sẽ được cập nhật tại trang này sau khi cơ quan nhà nước có thẩm quyền xác nhận.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="operator-links">
      <h2 id="operator-links" className="text-xl font-bold text-ink-900">Quy định và liên hệ</h2>
      <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-ink-700">
        <li><Link href="/quy-che-hoat-dong" className="font-semibold text-brand-700 underline">Quy chế hoạt động của nền tảng</Link></li>
        <li><Link href="/dieu-khoan-su-dung" className="font-semibold text-brand-700 underline">Điều khoản sử dụng</Link></li>
        <li><Link href="/chinh-sach-bao-mat" className="font-semibold text-brand-700 underline">Chính sách bảo mật</Link></li>
        <li><Link href="/khieu-nai" className="font-semibold text-brand-700 underline">Gửi phản ánh, khiếu nại hoặc báo cáo vi phạm</Link></li>
      </ul>
    </section>
  </article>;
}
