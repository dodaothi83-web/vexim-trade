import Link from "next/link";
import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";
import { ComplaintForm } from "./complaint-form";

export const metadata: Metadata = {
  title: { absolute: "Khiếu nại và báo cáo vi phạm | Vexim Trade" },
  description: "Cách gửi phản ánh, yêu cầu, khiếu nại và báo cáo thông tin vi phạm trên Vexim Trade.",
  alternates: { canonical: `${SITE_URL}/khieu-nai` },
  robots: { index: true, follow: true },
};

type Props = { searchParams: Promise<{ supplier?: string; product?: string; url?: string }> };

const p = "text-sm leading-7 text-ink-700";
const list = "list-disc space-y-2 pl-6 text-sm leading-7 text-ink-700";

export default async function ComplaintsPage({ searchParams }: Props) {
  const query = await searchParams;
  const target = query.url || (query.supplier ? `${SITE_URL}/suppliers/${query.supplier}` : query.product ? `Sản phẩm mã ${query.product} trên Vexim Trade` : "");
  return <article lang="vi" className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Vexim Trade · Hỗ trợ và tuân thủ</p>
    <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">Khiếu nại và báo cáo vi phạm</h1>
    <p className="mt-3 text-sm text-ink-500">Trang tiếp nhận phản ánh, yêu cầu, khiếu nại và báo cáo nội dung trên Vexim Trade</p>
    <p className="mt-6 text-sm leading-7 text-ink-700">Trang này dùng để báo thông tin sản phẩm hoặc nhà cung cấp không chính xác, hàng hóa có dấu hiệu vi phạm, nội dung xâm phạm quyền sở hữu trí tuệ, hành vi lừa đảo, vấn đề dữ liệu cá nhân và các vấn đề khác liên quan đến hoạt động của nền tảng. Khiếu nại về một giao dịch riêng đã ký ngoài Vexim cần được gửi kèm thông tin giao dịch để Vexim hỗ trợ liên hệ các bên trong phạm vi nền tảng.</p>

    <section className="mt-9 space-y-3" aria-labelledby="complaint-form-title">
      <h2 id="complaint-form-title" className="text-xl font-bold text-ink-900">1. Gửi phản ánh trực tuyến</h2>
      <p className={p}>Điền biểu mẫu dưới đây hoặc gửi email trực tiếp tới <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a>. Vui lòng cung cấp đường liên kết đến trang liên quan và bằng chứng ban đầu nếu có, ví dụ ảnh chụp màn hình, tài liệu chứng minh quyền sở hữu trí tuệ hoặc giấy tờ liên quan đến hàng hóa.</p>
      <ComplaintForm initialTarget={target} />
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="complaint-steps">
      <h2 id="complaint-steps" className="text-xl font-bold text-ink-900">2. Quy trình xử lý</h2>
      <ol className="list-decimal space-y-2 pl-6 text-sm leading-7 text-ink-700">
        <li>Tiếp nhận phản ánh và gửi xác nhận đã nhận qua email.</li>
        <li>Kiểm tra nội dung, đường liên kết và bằng chứng ban đầu. Vexim có thể tạm ẩn thông tin bị báo cáo khi có dấu hiệu vi phạm rõ ràng hoặc rủi ro cho người mua.</li>
        <li>Liên hệ nhà cung cấp hoặc bên liên quan để yêu cầu giải trình và tài liệu bổ sung khi cần.</li>
        <li>Thông báo kết quả xử lý, gồm giữ nguyên, yêu cầu chỉnh sửa, tạm ẩn, gỡ thông tin, hạn chế hoặc chấm dứt tài khoản, hoặc chuyển cơ quan có thẩm quyền khi thuộc thẩm quyền của cơ quan nhà nước.</li>
      </ol>
      <p className={p}>Kết quả xử lý do nhân viên Vexim xem xét và quyết định trên cơ sở bằng chứng và quy định liên quan, không chỉ dựa trên cơ chế tự động.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="complaint-timeline">
      <h2 id="complaint-timeline" className="text-xl font-bold text-ink-900">3. Thời hạn phản hồi</h2>
      <ul className={list}>
        <li>Phản hồi ban đầu: trong 01 ngày làm việc kể từ khi nhận được phản ánh đầy đủ thông tin liên hệ.</li>
        <li>Thông tin sai lệch thông thường: dự kiến xử lý trong 03 ngày làm việc.</li>
        <li>Xâm phạm sở hữu trí tuệ, hàng cấm, hàng giả hoặc lừa đảo: ưu tiên kiểm tra ban đầu trong 01 ngày làm việc và dự kiến kết luận trong 05 ngày làm việc.</li>
        <li>Vấn đề dữ liệu cá nhân: phản hồi ban đầu trong 01 ngày làm việc, thời gian xử lý dự kiến được thông báo theo loại yêu cầu.</li>
        <li>Trường hợp cần bổ sung bằng chứng hoặc chờ ý kiến cơ quan chuyên môn, Vexim thông báo lý do và thời gian dự kiến mới qua email.</li>
        <li>Yêu cầu của cơ quan nhà nước có thẩm quyền được xử lý trong thời hạn theo quy định của pháp luật, gồm việc gỡ thông tin hoặc tạm ngừng tài khoản trong 24 giờ khi thuộc trường hợp phải thực hiện.</li>
      </ul>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="complaint-notes">
      <h2 id="complaint-notes" className="text-xl font-bold text-ink-900">4. Lưu ý khi gửi</h2>
      <ul className={list}>
        <li>Không gửi mật khẩu tài khoản, số tài khoản ngân hàng, mã OTP hoặc giấy tờ tùy thân không cần thiết.</li>
        <li>Chủ thể quyền sở hữu trí tuệ vui lòng gửi tài liệu chứng minh quyền và xác định rõ nội dung bị cho là xâm phạm.</li>
        <li>Nếu bạn không đồng ý với kết quả xử lý, hãy trả lời email kết quả và ghi rõ yêu cầu xem xét lại. Vexim sẽ chuyển hồ sơ cho nhân viên khác hoặc cấp quản lý xem xét khi có căn cứ bổ sung.</li>
        <li>Phương thức tiếp nhận này là một phần của <Link href="/quy-che-hoat-dong" className="font-semibold text-brand-700 underline">Quy chế hoạt động</Link>. Thông tin về chủ quản nền tảng được đăng tại <Link href="/thong-tin-chu-quan" className="font-semibold text-brand-700 underline">Thông tin chủ quản nền tảng</Link>.</li>
      </ul>
    </section>
  </article>;
}
