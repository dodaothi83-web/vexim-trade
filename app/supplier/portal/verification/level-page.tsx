import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";

import { supplierLevelAccess } from "@/lib/supplier-portal/submission-access";
import { getOrCreateSubmission, loadSubmissionBundle } from "@/lib/verification-submission-service";
import { buildPortalSubmission, exportSpecs, partnerSpecs, photoSpecs } from "@/lib/supplier-portal/submission-view";
import { l2ScopeForSupplier } from "@/lib/l2-scope";
import { migrationHint } from "@/lib/db/migration-hints";
import { LevelTabs } from "./level-tabs";
import { VerificationSubmissionPanel } from "./verification-panel";

/**
 * Khung dùng chung cho HAI trang xác minh tự gửi:
 *  - `/supplier/portal/verification/factory` - L2, 9 ảnh nhà máy
 *  - `/supplier/portal/verification/export`  - L3, chứng từ lịch sử xuất khẩu
 *
 * Mỗi trang chỉ tải hồ sơ của đúng cấp mình. Không gộp hai cấp vào một trang để menu,
 * tiến độ và hành động nộp của từng cấp không lẫn nhau. Dải tab ba bước dùng chung với
 * trang L1 (`level-tabs.tsx`) để ba cấp xác minh đọc như một quy trình. Bước 1 chỉ nộp
 * giấy tờ do nhân viên đối chiếu, nên không có nút nộp trong khung này.
 *
 * Bố cục lấy nhịp từ trang sản phẩm của sàn TMĐT: tab chuyển cấp ở trên, dải tổng quan
 * (trạng thái + tiến độ), lưới thẻ bằng chứng có ảnh thu nhỏ, và cột tóm tắt dính bên
 * phải với nút nộp. L2 giữ luồng AI; chứng từ L3 do nhân viên đối chiếu.
 */

const LEVELS = {
  2: {
    title: "Xác thực nhà máy",
    eyebrow: "Cổng nhà cung cấp · Xác minh L2",
    description: "Chín ảnh nhà máy theo danh mục chung. Ba ảnh đánh dấu 🔖 phải có tờ mã xác minh do hệ thống phát hành.",
    benefits: [
      "Huy hiệu xác thực nhà máy hiện trên hồ sơ và thẻ sản phẩm.",
      "Người mua đọc được đúng mức đã kiểm, không phải một nhãn chung.",
      "Hồ sơ 2/3 luôn đứng trên hồ sơ 1/3 khi xếp hạng danh mục.",
      "Người mua lọc riêng được nhóm đã xác thực nhà máy.",
      "Nhận xét của nhân viên, nếu được duyệt, hiện trên hồ sơ công khai.",
    ],
    guide: [
      { title: "Tạo và in tờ mã", body: "Bấm “Tạo mã xác minh” rồi tải tờ mã về (hoặc in ra). Đây là bước bắt buộc duy nhất về giấy tờ." },
      { title: "Chụp 9 ảnh tại nhà máy", body: "Đặt tờ mã cạnh cảnh ở 3 ảnh 🔖: cổng nhà máy, dây chuyền đang chạy, kho thành phẩm. Ảnh điện thoại, kể cả ảnh đã gửi qua Zalo, đều nhận." },
      { title: "AI quét và nộp", body: "AI nêu điểm cần kiểm tra, không tự trả hay duyệt. Nhân viên đối chiếu và quyết định kết quả." },
    ],
  },
  3: {
    title: "Lịch sử xuất khẩu",
    eyebrow: "Cổng nhà cung cấp · Xác minh L3",
    description: "Tải chứng từ phù hợp của một lô hàng đã xuất để nhân viên đối chiếu.",
    benefits: [
      "Huy hiệu lịch sử xuất khẩu hiện trên hồ sơ và thẻ sản phẩm.",
      "Người mua đọc được đúng mức đã kiểm, không phải một nhãn chung.",
      "Hồ sơ 3/3 là nhóm cao nhất trên lưới danh mục.",
      "Người mua lọc riêng được nhóm đã đối chiếu lịch sử xuất khẩu.",
      "Nhận xét của nhân viên, nếu được duyệt, hiện trên hồ sơ công khai.",
    ],
    guide: [
      { title: "Chọn một lô hàng", body: "Khai mã lô, ngày giao và nơi đến nếu có. RFQ trúng thầu không thay được chứng từ xuất hàng." },
      { title: "Tải chứng từ", body: "Tải ít nhất một chứng từ phù hợp; không bắt buộc vận đơn. Bạn có thể gửi thêm chứng từ để làm rõ giao dịch và vai trò của doanh nghiệp." },
      { title: "Nộp hồ sơ", body: "Link nguồn là tùy chọn. Nhân viên sẽ kiểm tra chứng từ và phản hồi; nộp hồ sơ không tự cấp xác minh." },
    ],
  },
} as const;

const PARTNER_L2 = {
  title: "Nhà máy đối tác",
  eyebrow: "Cổng nhà cung cấp · Xác minh L2",
  description: "Đối chiếu hợp đồng giữa doanh nghiệp của bạn và nhà máy đối tác. Không mặc định nhà máy thuộc sở hữu của bạn hoặc đã được kiểm thực địa.",
  benefits: [
    "Huy hiệu nhà máy đối tác hiện trên hồ sơ và thẻ sản phẩm.",
    "Người mua đọc được đúng mức đã đối chiếu, không phải một nhãn chung.",
    "Hồ sơ 2/3 luôn đứng trên hồ sơ 1/3 khi xếp hạng danh mục.",
    "Người mua lọc riêng được nhóm đã đối chiếu nhà máy đối tác.",
    "Nhận xét của nhân viên, nếu được duyệt, hiện trên hồ sơ công khai.",
  ],
  guide: [
    { title: "Tải hợp đồng", body: "Tải hợp đồng thể hiện doanh nghiệp của bạn và nhà máy đối tác. Có thể che giá và thông tin nhạy cảm, nhưng giữ đủ nội dung để đối chiếu." },
    { title: "Thêm ảnh nếu có", body: "Ảnh nhà máy đối tác là tùy chọn. Không cần bộ 9 ảnh hoặc tờ mã nhà máy." },
    { title: "Nộp hồ sơ", body: "Nhân viên kiểm tra hợp đồng và phạm vi đối tác. Tệp không hiển thị công khai; nộp không tự cấp xác minh." },
  ],
} as const;

export async function VerificationLevelPage({ level }: { level: 2 | 3 }) {
  const access = await supplierLevelAccess(level);
  if (!access) redirect("/login");
  const { store, supplier, user } = access;
  const scope = level === 2 ? l2ScopeForSupplier(supplier.supplier_type) : null;
  const partner = level === 2 && scope === "partner_contract";
  const copy = partner ? PARTNER_L2 : LEVELS[level];
  const specs = level === 2 ? partner ? partnerSpecs() : photoSpecs() : exportSpecs();
  if (level === 2 && !scope) return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · Xác minh L2" title="Chưa rõ loại hình nhà cung cấp" />
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      Hồ sơ của bạn chưa có loại hình nhà cung cấp. Liên hệ nhân viên để cập nhật trước khi mở L2. Hồ sơ và kết quả cũ vẫn được giữ.
    </div>
  </>;

  let view: Awaited<ReturnType<typeof buildPortalSubmission>> | null = null;
  try {
    const submission = await getOrCreateSubmission(store, { supplierId: supplier.id, level, userId: user.id, supplierType: supplier.supplier_type });
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

    <LevelTabs current={level} partner={supplier.supplier_type === "trading"} />

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
      ? <VerificationSubmissionPanel view={view} specs={specs} benefits={copy.benefits} />
      : <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Chưa mở được hồ sơ xác minh này. Thử tải lại trang; nếu vẫn lỗi, liên hệ bộ phận hỗ trợ.
      </div>}

  </>;
}
