import Link from "next/link";
import { redirect } from "next/navigation";
import { Factory, Ship } from "lucide-react";

import { PageHeader } from "@/components/page-header";

import { supplierLevelAccess } from "@/lib/supplier-portal/submission-access";
import { getOrCreateSubmission, loadSubmissionBundle } from "@/lib/verification-submission-service";
import { buildPortalSubmission, exportSpecs, photoSpecs, type PortalSubmissionView } from "@/lib/supplier-portal/submission-view";
import { migrationHint } from "@/lib/db/migration-hints";
import { VerificationSubmissionPanel } from "./verification-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xác thực nhà máy & lịch sử xuất khẩu | Vexim Trade", robots: { index: false, follow: false } };

/**
 * Cổng NCC TỰ GỬI bằng chứng xác thực:
 *  - L2: 9 ảnh nhà máy, chụp bằng điện thoại là được; bắt buộc có tờ mã xác minh
 *    do hệ thống phát hành nằm trong khung hình của 3 ảnh 🔖
 *  - L3: chứng từ lịch sử xuất khẩu + link nguồn công khai
 * AI quét và nêu tín hiệu; việc xác minh vẫn do nhân viên Vexim đối chiếu và duyệt.
 */
export default async function SupplierVerificationPage() {
  const access = await supplierLevelAccess(2);
  if (!access) redirect("/login");
  const { store, supplier, user } = access;

  let l2: PortalSubmissionView | null = null;
  let l3: PortalSubmissionView | null = null;
  try {
    [l2, l3] = await Promise.all([2, 3].map(async (level) => {
      const submission = await getOrCreateSubmission(store, { supplierId: supplier.id, level: level as 2 | 3, userId: user.id });
      const bundle = await loadSubmissionBundle(store, submission.id);
      return bundle ? buildPortalSubmission(bundle) : null;
    })) as (PortalSubmissionView | null)[];
  } catch (error) {
    // Bảng hồ sơ tự gửi chưa có trên môi trường này: báo cho NCC một câu rõ ràng
    // thay vì để trang trắng. Người vận hành đọc log để biết file migration cần chạy.
    console.error(`[supplier-portal] chưa mở được hồ sơ tự gửi. ${migrationHint(error) ?? ""}`.trim(), error);
    return <>
      <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Cổng xác thực L2 · L3" />
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="text-base font-bold">Chưa mở được phần tải bằng chứng</h2>
        <p className="mt-2">Đây là lỗi cấu hình phía Vexim, không phải lỗi tài khoản của bạn. Vexim đã nhận được ghi nhận tự động; bạn thử lại sau hoặc báo trực tiếp cho người phụ trách.</p>
        <p className="mt-2">Sản phẩm, RFQ và thông báo ở các mục khác vẫn dùng bình thường.</p>
        <Link href="/supplier/portal" className="mt-3 inline-block font-semibold text-amber-900 underline">Về bảng điều khiển</Link>
      </div>
    </>;
  }

  const photoItems = photoSpecs();
  const exportItems = exportSpecs();

  return <>
    <PageHeader
      eyebrow="Cổng nhà cung cấp · riêng tư"
      title="Cổng xác thực L2 · L3"
      actions={<Link href="/supplier/portal" className="text-sm font-semibold text-brand-800 hover:underline">Về bảng điều khiển</Link>}
    />
    <div className="mb-5 max-w-3xl text-[13px] leading-6 text-ink-600">
      Doanh nghiệp tự chụp và tự tải bằng chứng. Chụp bằng điện thoại là đủ, không cần ảnh gốc hay bật định vị.
      <strong> Chỉ một thứ bắt buộc:</strong> tải tờ mã xác minh do hệ thống phát hành, in ra (hoặc mở trên màn hình)
      và chụp cùng 3 ảnh có đánh dấu 🔖. AI chỉ quét sơ bộ; <strong>tải lên không tự cấp huy hiệu</strong>, nhân viên
      Vexim vẫn đối chiếu và một người có quyền duyệt khác phê kết quả.
    </div>

    {/* Thanh nhảy nhanh 2 cấp — màu phản ánh trạng thái hồ sơ, bấm là cuộn tới đúng bảng. */}
    <nav aria-label="Chọn cấp xác thực" className="mb-5 flex flex-wrap gap-2">
      {[{ href: "#level-2", view: l2, name: "L2 · Xác thực nhà máy", icon: <Factory className="size-4" /> },
        { href: "#level-3", view: l3, name: "L3 · Lịch sử xuất khẩu", icon: <Ship className="size-4" /> }].map((entry) => {
        const tone = entry.view?.status === "pending_review" ? "border-amber-300 bg-amber-50 text-amber-900"
          : entry.view?.status === "accepted" ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : entry.view?.status === "returned" ? "border-rose-300 bg-rose-50 text-rose-900"
          : "border-ink-300 bg-white text-ink-700";
        return <a key={entry.href} href={entry.href} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition hover:brightness-95 ${tone}`}>
          {entry.icon} {entry.name}
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold">
            {entry.view ? `${entry.view.statusLabel} · ${entry.view.uploadedTotal}/${entry.view.requiredTotal}` : "—"}
          </span>
        </a>;
      })}
    </nav>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900"><Factory className="size-5 text-brand-700" /> L2 · Xác thực nhà máy</h2>
        <ul className="mt-3 space-y-1 text-[13px] text-ink-700">
          <li>1. Bấm <strong>“Tạo mã xác minh”</strong>, rồi <strong>tải tờ mã về</strong> (hoặc in ra). Đây là bước bắt buộc.</li>
          <li>2. Đến từng chỗ trong nhà máy, <strong>đặt tờ mã cạnh cảnh</strong> và chụp 3 ảnh có đánh dấu 🔖: cổng nhà máy, dây chuyền đang chạy, kho thành phẩm. Mã trên giấy phải đọc rõ.</li>
          <li>3. Chụp 6 ảnh còn lại. Ảnh điện thoại, kể cả ảnh đã gửi qua Zalo, đều nhận. Bật định vị và chụp ban ngày thì tốt hơn, nhưng không bắt buộc.</li>
        </ul>
        <p className="mt-3 text-xs text-ink-500">Áp dụng cho mọi ngành hàng: đủ {photoItems.length} ảnh bắt buộc bên dưới.</p>
      </div>
      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900"><Ship className="size-5 text-brand-700" /> L3 · Lịch sử xuất khẩu</h2>
        <ul className="mt-3 space-y-1 text-[13px] text-ink-700">
          <li>1. Tải ảnh/PDF chứng từ của <strong>một lô hàng đã xuất thật</strong>: vận đơn, tờ khai hải quan, hoá đơn, phiếu đóng gói, C/O…</li>
          <li>2. Khai <strong>link nguồn gốc công khai</strong> (trang doanh nghiệp, sàn B2B, tin đăng hội chợ) để hệ thống đối chiếu.</li>
          <li>3. Che/ẩn số tài khoản ngân hàng, giá mua bán và thông tin buyer nếu bạn không muốn chia sẻ.</li>
        </ul>
        <p className="mt-3 text-xs text-ink-500">Thông tin lô hàng là <strong>doanh nghiệp tự khai</strong>, không phải dữ liệu Hải quan. RFQ trúng thầu không thay chứng từ giao hàng.</p>
      </div>
    </div>

    {l2 && <div id="level-2" className="scroll-mt-20"><VerificationSubmissionPanel view={l2} specs={photoItems} /></div>}
    {l3 && <div id="level-3" className="scroll-mt-20"><VerificationSubmissionPanel view={l3} specs={exportItems} /></div>}

    <details className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <summary className="cursor-pointer text-base font-bold">AI quét những gì, và không làm được gì</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>AI đọc nội dung từng ảnh: biển tên công ty, dây chuyền, công nhân bảo hộ, nhãn mã lô, tờ giấy viết tay mã xác minh, chứng từ vận đơn/tờ khai.</li>
        <li>Hệ thống ghi lại các tín hiệu kỹ thuật (còn dữ liệu ảnh gốc hay không, có toạ độ hay không, giờ chụp, phần mềm chỉnh sửa) và hiện thành ghi chú cho người duyệt. Từ 21/10/2026 những điểm này <strong>không chặn hồ sơ</strong>.</li>
        <li>Thứ duy nhất bị chặn: ảnh 🔖 không thấy tờ mã, hoặc mã trong ảnh không khớp mã đã phát hành. Khi đó hồ sơ ở lại bản nháp để doanh nghiệp chụp lại.</li>
        <li>AI <strong>không</strong> xác nhận giấy tờ là thật, không xác nhận doanh nghiệp đã xuất khẩu, không tự duyệt và không tự cấp huy hiệu L2/L3.</li>
        <li>Hồ sơ đạt sẽ vào hàng đợi; nhân viên Vexim đối chiếu rồi mới mở đợt kiểm chính thức, và người duyệt phải là người khác người kiểm.</li>
      </ul>
    </details>
  </>;
}
