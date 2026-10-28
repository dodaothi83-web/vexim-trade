import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  FileCheck2,
  Handshake,
  Lock,
  MessageSquare,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Breadcrumbs } from "@/components/ui";

export const metadata: Metadata = {
  title: "How it works for buyers | Vexim Trade",
  description:
    "Browse verified Vietnamese suppliers, compare specs, and request a quote from the supplier you choose, or send your requirements to find a fit.",
  alternates: { canonical: "/how-it-works" },
};

type Locale = "en" | "vi";

export default async function HowItWorksPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const lang: Locale = params?.lang === "vi" ? "vi" : "en";
  const isVi = lang === "vi";

  const homeHref = isVi ? "/?lang=vi" : "/";
  const categoriesHref = isVi ? "/?lang=vi#categories" : "/#categories";

  const quickFacts = isVi
    ? [
        {
          icon: Wallet,
          title: "Miễn phí cho người mua",
          desc: "Tra cứu sản phẩm, so sánh thông số và gửi yêu cầu báo giá không mất phí.",
        },
        {
          icon: Lock,
          title: "Giữ kín thông tin liên hệ",
          desc: "Khi gửi yêu cầu báo giá, nhà cung cấp chỉ thấy email và số điện thoại sau khi bạn đồng ý kết nối.",
        },
        {
          icon: Handshake,
          title: "Ký hợp đồng và thanh toán trực tiếp",
          desc: "Thỏa thuận điều khoản và thanh toán trực tiếp với nhà cung cấp bạn chọn. Nền tảng không giữ tiền giao dịch.",
        },
      ]
    : [
        {
          icon: Wallet,
          title: "Free for buyers",
          desc: "Browse products, compare specs, and request quotes at zero cost.",
        },
        {
          icon: Lock,
          title: "Your contact stays private",
          desc: "On quote requests, suppliers only see your email and phone after you approve an introduction.",
        },
        {
          icon: Handshake,
          title: "Direct contract and payment",
          desc: "Agree on final terms and pay your chosen supplier directly. The platform never holds your funds.",
        },
      ];

  return (
    <div lang={lang} className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Breadcrumbs
        items={[
          { label: isVi ? "Trang chủ" : "Home", href: homeHref },
          { label: isVi ? "Cách hoạt động" : "How it works" },
        ]}
      />

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
          {isVi ? "Hướng dẫn cho người mua" : "Buyer guide"}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          {isVi ? "Cách mua hàng trên nền tảng" : "How sourcing works for buyers"}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-600">
          {isVi
            ? "Tìm nhà cung cấp thực phẩm và nông sản Việt Nam, xem hồ sơ đã kiểm tra và gửi yêu cầu báo giá trực tiếp. Người mua sử dụng hoàn toàn miễn phí."
            : "Find Vietnamese food and agricultural suppliers, check their verified records, and request quotes directly. Sourcing on this platform is free for buyers."}
        </p>
      </div>

      {/* 3 điểm cốt lõi đọc lướt trong 5 giây */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {quickFacts.map((fact) => {
          const Icon = fact.icon;
          return (
            <div
              key={fact.title}
              className="rounded-xl border border-ink-200 bg-white p-5 shadow-2xs"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <h2 className="mt-3 text-sm font-bold text-ink-900">{fact.title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{fact.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Quy trình 4 bước rõ ràng kèm hành động tiếp theo */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold text-ink-900 sm:text-2xl">
          {isVi ? "4 bước tìm nguồn hàng" : "4 steps to source"}
        </h2>

        <div className="mt-5 space-y-4">
          {/* Bước 1 */}
          <div className="rounded-2xl border border-ink-200 bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-mono text-sm font-bold text-brand-800">
                01
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-brand-700" aria-hidden="true" />
                  <h3 className="text-base font-bold text-ink-900">
                    {isVi ? "Tìm và so sánh sản phẩm" : "Find and compare products"}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">
                  {isVi
                    ? "Tìm theo tên hàng, phân loại hoặc danh mục. Chọn tối đa 3 sản phẩm để đặt cạnh nhau các thông số quy cách, số lượng đặt tối thiểu, cảng xuất, chứng nhận và giá tham khảo."
                    : "Search by product, grade, or category. Select up to 3 products to compare specs, minimum order quantities, export ports, certificates, and reference prices side by side."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold">
                  <Link
                    href={categoriesHref}
                    className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
                  >
                    {isVi ? "Xem danh mục" : "Browse categories"}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/compare"
                    className="inline-flex items-center gap-1 text-ink-700 hover:text-brand-700"
                  >
                    {isVi ? "Mở bảng so sánh" : "Open comparison table"}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Bước 2 */}
          <div className="rounded-2xl border border-ink-200 bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-mono text-sm font-bold text-brand-800">
                02
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-700" aria-hidden="true" />
                  <h3 className="text-base font-bold text-ink-900">
                    {isVi
                      ? "Đọc huy hiệu xác thực và chứng nhận"
                      : "Check verification badges and certificates"}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">
                  {isVi
                    ? "Mỗi nhà cung cấp hiển thị rõ những hạng mục đã kiểm tra độc lập: giấy tờ pháp lý, nhà máy hoặc hợp đồng gia công, và lịch sử lô hàng xuất khẩu. Chứng nhận chất lượng ghi rõ đơn vị đứng tên (Chính chủ hoặc Đơn vị đối tác) kèm ngày hết hạn."
                    : "Each supplier profile shows which of the 3 independent checks it has passed: business documents, factory or partner contract, and shipment history. Quality certificates state whether they belong to the supplier (Owner) or a partner plant (Partner Entity), with expiration dates shown."}
                </p>
                <div className="mt-3 text-xs font-semibold">
                  <Link
                    href="/how-we-verify"
                    className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
                  >
                    {isVi ? "Xem chi tiết cách xác thực" : "See how verification works"}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Bước 3: Luồng chọn nhà cung cấp luôn đặt trước luồng RFQ mở */}
          <div className="rounded-2xl border border-ink-200 bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-mono text-sm font-bold text-brand-800">
                03
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-brand-700" aria-hidden="true" />
                  <h3 className="text-base font-bold text-ink-900">
                    {isVi ? "Chọn cách gửi yêu cầu" : "Choose how to reach suppliers"}
                  </h3>
                </div>

                <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-700">
                  <li className="rounded-lg bg-slate-50 px-3.5 py-2.5">
                    <span className="font-semibold text-ink-900">
                      {isVi
                        ? "Hỏi báo giá nhà cung cấp bạn chọn: "
                        : "Request a quote from a supplier you choose: "}
                    </span>
                    {isVi
                      ? "Yêu cầu được chuyển tới đúng đơn vị đó trước. Nếu họ không đáp ứng được quy cách hoặc sản lượng, bạn sẽ được hỏi ý kiến trước khi gợi ý đơn vị khác."
                      : "Your request goes to that supplier first. If they cannot meet your specs or volume, we ask your permission before suggesting anyone else."}
                  </li>
                  <li className="rounded-lg bg-slate-50 px-3.5 py-2.5">
                    <span className="font-semibold text-ink-900">
                      {isVi
                        ? "Gửi yêu cầu báo giá mở: "
                        : "Send an open quote request: "}
                    </span>
                    {isVi
                      ? "Nếu chưa chọn được nhà cung cấp cụ thể, hãy gửi quy cách, số lượng và cảng đích để đội ngũ tìm nhà máy phù hợp. Quảng cáo trả phí không ảnh hưởng tới kết quả chọn lọc."
                      : "If you have not picked a supplier yet, share your grade, volume, and destination port so our team can find fitting factories. Paid placement never affects who gets matched."}
                  </li>
                  <li className="rounded-lg bg-slate-50 px-3.5 py-2.5">
                    <span className="font-semibold text-ink-900">
                      {isVi ? "Hỏi nhanh trên trang sản phẩm: " : "Ask a quick product question: "}
                    </span>
                    {isVi
                      ? "Dùng nút hỏi nhà cung cấp ngay trên trang sản phẩm khi bạn chỉ cần trao đổi nhanh qua email về quy cách hoặc bao bì."
                      : "Use the Ask supplier button on any product page when you want a direct email reply about specs or packaging."}
                  </li>
                </ul>

                <div className="mt-3.5 text-xs font-semibold">
                  <Link
                    href="/rfq"
                    className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
                  >
                    {isVi ? "Gửi yêu cầu báo giá" : "Submit a quote request"}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Bước 4 */}
          <div className="rounded-2xl border border-ink-200 bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-mono text-sm font-bold text-brand-800">
                04
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-brand-700" aria-hidden="true" />
                  <h3 className="text-base font-bold text-ink-900">
                    {isVi
                      ? "Nhận phản hồi và giao dịch trực tiếp"
                      : "Review offers and trade directly"}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">
                  {isVi
                    ? "Nhận cập nhật đầu tiên trong 1 ngày làm việc. Bạn xem báo giá, yêu cầu gửi mẫu, đồng ý kết nối với đơn vị muốn làm việc, sau đó ký hợp đồng và thanh toán trực tiếp với nhà cung cấp."
                    : "Receive an initial update within 1 business day. Review quotes, request samples, approve introductions to suppliers you want to speak with, and sign your contract directly with the supplier."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lưu ý ngắn gọn khi đọc thông tin trên trang sản phẩm */}
      <section className="mt-10 rounded-2xl border border-ink-200 bg-ink-50/70 p-6">
        <h2 className="text-base font-bold text-ink-900">
          {isVi ? "Lưu ý khi xem thông tin sản phẩm" : "Good to know before you order"}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-800">
              {isVi ? "Giá tham khảo" : "Reference prices"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {isVi
                ? "Giá hiển thị do nhà cung cấp cập nhật kèm thời hạn hiệu lực, chưa phải báo giá chốt đơn. Hãy xác nhận lại giá theo số lượng và lịch giao thực tế."
                : "Shown prices are indicative quotes shared by suppliers within a valid date, not a binding offer. Confirm final pricing for your volume and shipment schedule."}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-800">
              {isVi ? "Nhãn tài trợ" : "Sponsored labels"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {isVi
                ? "Vị trí quảng cáo luôn gắn nhãn rõ ràng. Việc tìm kiếm và chọn lọc nhà cung cấp cho yêu cầu báo giá chỉ dựa trên tiêu chí hàng hóa của bạn."
                : "Paid placements are clearly labeled Sponsored. Search relevance and quote matching always follow your product requirements."}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-800">
              {isVi ? "Kiểm tra trước khi chốt đơn" : "Pre-shipment checks"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {isVi
                ? "Huy hiệu xác thực cho biết từng hạng mục đã được kiểm tra tại thời điểm duyệt hồ sơ. Bạn vẫn nên duyệt mẫu hàng, kiểm định lô hàng và chốt điều khoản thanh toán trước khi giao dịch."
                : "Verification badges confirm specific checks completed at review time. Always confirm samples, batch inspection, and payment terms before placing an order."}
            </p>
          </div>
        </div>
      </section>

      {/* Khối hành động cuối trang: ưu tiên tự chọn nhà cung cấp trước, gửi RFQ sau */}
      <div className="mt-12 rounded-2xl bg-brand-900 p-7 text-white sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-400">
            {isVi ? "Bắt đầu tìm nguồn hàng" : "Start sourcing"}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold">
            {isVi
              ? "Xem danh mục nhà cung cấp hoặc gửi yêu cầu báo giá."
              : "Browse verified suppliers or send your requirements."}
          </h2>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-0 sm:shrink-0">
          <Link
            href={categoriesHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-accent-400"
          >
            {isVi ? "Xem danh mục" : "Browse categories"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/rfq"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            {isVi ? "Gửi yêu cầu báo giá" : "Request a quote"}
          </Link>
        </div>
      </div>
    </div>
  );
}
