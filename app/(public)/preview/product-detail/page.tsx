import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, MapPin } from "lucide-react";

import { ProductMediaGallery } from "@/components/product-media-gallery";
import { requirePagePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Xem thử giao diện chi tiết sản phẩm | Vexim Trade",
  robots: { index: false, follow: false },
};

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[120px_1fr] gap-4 border-b border-ink-100 py-3 text-sm last:border-0">
    <dt className="font-medium text-ink-500">{label}</dt><dd className="min-w-0 break-words font-semibold text-ink-800">{value}</dd>
  </div>;
}

/** Layout-only example: no supplier, product, price or certification is read or published. */
export default async function StaffProductDetailPreview() {
  await requirePagePermission("products.view", "/crm/products");

  return <div className="mx-auto max-w-6xl px-5 pb-24 pt-7 sm:px-6 lg:px-8">
    <div role="status" className="rounded-xl border-2 border-amber-400 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
      <strong className="block text-base">BẢN XEM THỬ GIAO DIỆN · CHỈ NHÂN VIÊN</strong>
      Đây là dữ liệu mẫu để xem bố cục trang chi tiết buyer, không phải sản phẩm/NCC thật, ảnh sản phẩm đã được duyệt, báo giá hay chào hàng. Không xuất hiện trong danh mục và không nhận RFQ.
    </div>
    <nav aria-label="Breadcrumb" className="mt-6 text-sm text-ink-600">Home / Products / Cashew / <strong className="text-ink-900">UI preview</strong></nav>
    <Link href="/crm/products" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="size-4" /> Back to CRM products</Link>

    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)]">
      <div className="min-w-0">
        <ProductMediaGallery name="Cashew example · illustrative photo" images={["/images/categories/cashew-grade.jpg"]} video={null} previewStaticMedia />
        <p className="mt-3 text-xs font-semibold text-amber-900">Ảnh minh họa danh mục — không phải ảnh của một sản phẩm/NCC đã duyệt.</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Vietnam · Cashew (example layout)</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-ink-900 sm:text-4xl">Cashew kernels · sample display</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-700">Khu vực giới thiệu ngắn của sản phẩm. Khi có sản phẩm thật được duyệt, nội dung do Vexim kiểm tra sẽ xuất hiện ở đây.</p>
        <div className="mt-5 rounded-xl border border-ink-200 bg-white px-5 py-2">
          <Fact label="Grade" value="Sample only — not a verified grade" />
          <Fact label="MOQ" value="Not available in preview" />
          <Fact label="Reference price" value="Not available in preview" />
          <Fact label="Specification" value="Actual approved product specifications appear here" />
          <Fact label="Packaging" value="Not available in preview" />
          <Fact label="Lead time" value="Not available in preview" />
          <Fact label="Export port" value="Not available in preview" />
        </div>
        <p className="mt-4 text-xs text-ink-500">Trang sản phẩm thật chỉ hiển thị giá tham khảo khi có quyền công khai giá hợp lệ; thiếu giá sẽ ghi “On request”.</p>
        <div aria-disabled="true" className="mt-5 flex min-h-11 w-full items-center justify-center rounded-lg bg-ink-200 px-4 py-2 text-center text-sm font-bold text-ink-600">RFQ không khả dụng trên trang xem thử</div>
        <aside className="mt-6 rounded-xl border border-brand-200 bg-brand-50/60 p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-brand-700">Supplied by</h2>
          <p className="mt-2 text-lg font-bold text-ink-800">Không có nhà cung cấp trong bản xem thử</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-600"><MapPin className="size-4" aria-hidden="true" /> Địa điểm NCC thật chỉ hiện khi có dữ liệu được phép công khai.</p>
          <p className="mt-3 text-xs text-ink-600">Không có huy hiệu xác minh hay chứng nhận mẫu. Trang thật chỉ hiển thị những phần Vexim đã duyệt đúng phạm vi.</p>
        </aside>
      </div>
    </div>
    <section className="mt-12 border-t border-ink-200 pt-8" aria-labelledby="demo-description-title">
      <h2 id="demo-description-title" className="text-2xl font-black text-ink-900">Product description</h2>
      <p className="mt-4 text-sm leading-7 text-ink-700">Vị trí mô tả dài của sản phẩm đã được duyệt. Bản xem thử không phải nguồn thông số kỹ thuật hoặc chứng từ giao dịch.</p>
    </section>
  </div>;
}
