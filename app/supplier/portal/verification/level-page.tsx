import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Factory, Ship } from "lucide-react";

import { PageHeader } from "@/components/page-header";

import { supplierLevelAccess } from "@/lib/supplier-portal/submission-access";
import { getOrCreateSubmission, loadSubmissionBundle } from "@/lib/verification-submission-service";
import { buildPortalSubmission, exportSpecs, photoSpecs } from "@/lib/supplier-portal/submission-view";
import { migrationHint } from "@/lib/db/migration-hints";
import { VerificationSubmissionPanel } from "./verification-panel";

/**
 * Khung dùng chung cho HAI trang xác minh tự gửi:
 *  - `/supplier/portal/verification/factory` — L2, 9 ảnh nhà máy
 *  - `/supplier/portal/verification/export`  — L3, chứng từ lịch sử xuất khẩu
 *
 * Mỗi trang chỉ tải hồ sơ của đúng cấp mình. Không gộp hai cấp vào một trang để menu,
 * tiến độ và hành động nộp của từng cấp không lẫn nhau.
 *
 * Bố cục lấy nhịp từ trang sản phẩm của sàn TMĐT: tab chuyển cấp ở trên, dải tổng quan
 * (trạng thái + tiến độ), lưới thẻ bằng chứng có ảnh thu nhỏ, và cột tóm tắt dính bên
 * phải với nút nộp. Toàn bộ hành vi cũ (mã xác minh, GPS, tải tệp, AI quét, nộp, khóa
 * hồ sơ) giữ nguyên trong `VerificationSubmissionPanel`.
 */

const LEVELS = {
  2: {
    title: "Xác thực nhà máy",
    titleShort: "Nhà máy",
    eyebrow: "Cổng nhà cung cấp · Xác minh L2",
    description: "Chín ảnh nhà máy theo danh mục chung. Ba ảnh đánh dấu 🔖 phải có tờ mã xác minh do hệ thống phát hành.",
    href: "/supplier/portal/verification/factory",
    icon: Factory,
    guide: [
      { title: "Tạo và in tờ mã", body: "Bấm “Tạo mã xác minh” rồi tải tờ mã về (hoặc in ra). Đây là bước bắt buộc duy nhất về giấy tờ." },
      { title: "Chụp 9 ảnh tại nhà máy", body: "Đặt tờ mã cạnh cảnh ở 3 ảnh 🔖: cổng nhà máy, dây chuyền đang chạy, kho thành phẩm. Ảnh điện thoại, kể cả ảnh đã gửi qua Zalo, đều nhận." },
      { title: "AI quét và nộp", body: "AI chỉ quét sơ bộ. Hồ sơ được đối chiếu thủ công; huy hiệu L2 chỉ được phê khi người duyệt khác người kiểm." },
    ],
  },
  3: {
    title: "Lịch sử xuất khẩu",
    titleShort: "Xuất khẩu",
    eyebrow: "Cổng nhà cung cấp · Xác minh L3",
    description: "Chứng từ của một lô hàng đã xuất thật: vận đơn, tờ khai hải quan và link nguồn công khai để đối chiếu.",
    href: "/supplier/portal/verification/export",
    icon: Ship,
    guide: [
      { title: "Chọn một lô đã giao", body: "Khai mã lô, ngày giao và nơi đến. RFQ trúng thầu không thay được chứng từ giao hàng." },
      { title: "Tải chứng từ", body: "Bắt buộc có vận đơn và tờ khai hải quan. Hoá đơn, phiếu đóng gói, C/O… là mục tùy chọn nếu bạn có." },
      { title: "Thêm link và nộp", body: "Dán link công khai có nhắc tới doanh nghiệp/lô hàng. AI chỉ quét sơ bộ; vẫn phải có người đối chiếu và duyệt." },
    ],
  },
} as const;

export async function VerificationLevelPage({ level }: { level: 2 | 3 }) {
  const access = await supplierLevelAccess(level);
  if (!access) redirect("/login");
  const { store, supplier, user } = access;
  const copy = LEVELS[level];
  const specs = level === 2 ? photoSpecs() : exportSpecs();

  let view: Awaited<ReturnType<typeof buildPortalSubmission>> | null = null;
  try {
    const submission = await getOrCreateSubmission(store, { supplierId: supplier.id, level, userId: user.id });
    const bundle = await loadSubmissionBundle(store, submission.id);
    view = bundle ? buildPortalSubmission(bundle) : null;
  } catch (error) {
    // Bảng hồ sơ tự gửi chưa có trên môi trường này: báo cho NCC một câu rõ ràng
    // thay vì để trang trắng. Người vận hành đọc log để biết file migration cần chạy.
    console.error(`[supplier-portal] chưa mở được hồ sơ tự gửi. ${migrationHint(error) ?? ""}`.trim(), error);
    return <>
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} />
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="text-base font-bold">Chưa mở được phần tải bằng chứng</h2>
        <p className="mt-2">Đây là lỗi cấu hình phía hệ thống, không phải lỗi tài khoản của bạn. Ghi nhận đã được gửi tự động; bạn thử lại sau hoặc báo trực tiếp cho người phụ trách.</p>
        <p className="mt-2">Sản phẩm, RFQ và thông báo ở các mục khác vẫn dùng bình thường.</p>
        <Link href="/supplier/portal" className="mt-3 inline-block font-semibold text-amber-900 underline">Về bảng điều khiển</Link>
      </div>
    </>;
  }

  return <>
    <PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      sub={copy.description}
      actions={<Link href="/supplier/portal" className="btn btn-ghost btn-sm">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Tổng quan
      </Link>}
    />

    <TwoLevelTabs current={level} />

    <ol className="mt-4 grid gap-2.5 sm:grid-cols-3" aria-label="Ba bước thực hiện">
      {copy.guide.map((step, index) => <li key={step.title} className="flex gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-3 shadow-sm">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-black text-brand-800 ring-1 ring-brand-200">{index + 1}</span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-bold text-ink-900">{step.title}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{step.body}</span>
        </span>
      </li>)}
    </ol>

    {view
      ? <VerificationSubmissionPanel view={view} specs={specs} />
      : <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Chưa mở được hồ sơ xác minh này. Thử tải lại trang; nếu vẫn lỗi, liên hệ bộ phận hỗ trợ.
      </div>}

    <details className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <summary className="cursor-pointer text-base font-bold">AI quét những gì, và không làm được gì</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>AI đọc nội dung từng ảnh: biển tên công ty, dây chuyền, công nhân bảo hộ, nhãn mã lô, tờ giấy viết tay mã xác minh, chứng từ vận đơn/tờ khai.</li>
        <li>Hệ thống ghi lại các tín hiệu kỹ thuật (còn dữ liệu ảnh gốc hay không, có toạ độ hay không, giờ chụp, phần mềm chỉnh sửa) và hiện thành ghi chú cho người duyệt. Từ 21/10/2026 những điểm này <strong>không chặn hồ sơ</strong>.</li>
        <li>Thứ duy nhất bị chặn: ảnh 🔖 không thấy tờ mã, hoặc mã trong ảnh không khớp mã đã phát hành. Khi đó hồ sơ ở lại bản nháp để doanh nghiệp chụp lại.</li>
        <li>AI <strong>không</strong> xác nhận giấy tờ là thật, không xác nhận doanh nghiệp đã xuất khẩu, không tự duyệt và không tự cấp huy hiệu L2/L3.</li>
        <li>Hồ sơ đạt sẽ vào hàng đợi; hồ sơ được đối chiếu thủ công rồi mới mở đợt kiểm chính thức, và người duyệt phải khác người kiểm.</li>
      </ul>
    </details>
  </>;
}

/** Hai tab cấp xác minh, giữ đúng nhịp điều hướng của trang danh mục sàn TMĐT. */
function TwoLevelTabs({ current }: { current: 2 | 3 }) {
  return <nav aria-label="Chọn cấp xác minh" className="mt-4 grid gap-2.5 sm:grid-cols-2">
    {([2, 3] as const).map((level) => {
      const tab = LEVELS[level];
      const Icon = tab.icon;
      const active = current === level;
      return <Link key={level} href={tab.href} aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition ${active ? "border-brand-400 bg-brand-50 shadow-sm" : "border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40"}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-800"}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold tracking-wider text-ink-400 uppercase">Bước {level}/3</span>
          <span className={`block text-[13.5px] font-bold ${active ? "text-brand-900" : "text-ink-900"}`}>{tab.title}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-800"}`}>
          {active ? "Đang mở" : "Mở"}
        </span>
      </Link>;
    })}
  </nav>;
}
