import Link from "next/link";
import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Điều khoản sử dụng | Vexim Trade" },
  description: "Điều khoản sử dụng website, dịch vụ yêu cầu báo giá và cổng nhà cung cấp của Vexim Trade.",
  alternates: { canonical: `${SITE_URL}/dieu-khoan-su-dung` },
  robots: { index: true, follow: true },
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section className="mt-9 space-y-3" aria-labelledby={id}>
    <h2 id={id} className="text-xl font-bold text-ink-900">{title}</h2>
    {children}
  </section>;
}

const p = "text-sm leading-7 text-ink-700";

export default function TermsViPage() {
  return <article lang="vi" className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Vexim Trade · Pháp lý</p>
    <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">Điều khoản sử dụng</h1>
    <p className="mt-3 text-sm text-ink-500">Ngày hiệu lực: 18 tháng 10 năm 2026 · Phiên bản 1</p>
    <p className="mt-6 text-sm leading-7 text-ink-700">Điều khoản này áp dụng cho website <a href={SITE_URL} className="font-semibold text-brand-700 underline">{SITE_URL}</a> và các dịch vụ do VEXIM GLOBAL CO., LTD, gọi tắt là Vexim, cung cấp qua website. Vui lòng đọc kỹ trước khi gửi yêu cầu báo giá, tạo tài khoản hoặc sử dụng cổng nhà cung cấp. Nếu không đồng ý, vui lòng không sử dụng các dịch vụ này. Cách vận hành nền tảng được quy định chi tiết tại <Link href="/quy-che-hoat-dong" className="font-semibold text-brand-700 underline">Quy chế hoạt động</Link>.</p>

    <Section id="terms-vi-service" title="1. Dịch vụ của Vexim">
      <p className={p}>Vexim Trade là dịch vụ tìm nguồn cung và giới thiệu nhà cung cấp giữa doanh nghiệp với doanh nghiệp. Người mua xem thông tin và gửi yêu cầu báo giá, gọi tắt là RFQ. Nhà cung cấp gửi hồ sơ doanh nghiệp và sản phẩm để Vexim kiểm tra. Vexim có thể giới thiệu các bên, hỗ trợ so sánh báo giá và điều phối trao đổi tiếp theo. Việc gửi RFQ, được giới thiệu nhà cung cấp hoặc xem giá tham khảo không tạo thành đơn đặt hàng, không bảo đảm có báo giá và không xác nhận một giao dịch mua bán. Điều kiện thương mại do các bên liên quan tự thỏa thuận riêng bằng văn bản.</p>
    </Section>

    <Section id="terms-vi-account" title="2. Tài khoản và quyền truy cập">
      <p className={p}>Người sử dụng phải cung cấp thông tin tài khoản chính xác, giữ bí mật thông tin đăng nhập và thông báo cho Vexim khi nghi ngờ tài khoản bị truy cập trái phép. Đăng nhập bằng Google chỉ xác thực email cho tài khoản đã được phép hoặc cho việc đăng ký của nhà cung cấp. Việc đăng nhập không tự động phê duyệt quyền truy cập của nhà cung cấp, sản phẩm, kết quả kiểm chứng hoặc thông tin công khai. Vexim có thể kiểm tra hồ sơ, yêu cầu sửa thông tin, giới hạn hoặc tạm ngừng quyền truy cập khi cần thiết để bảo vệ dịch vụ hoặc xử lý hành vi sử dụng sai quy định.</p>
    </Section>

    <Section id="terms-vi-content" title="3. Nội dung gửi lên và thông tin nhà cung cấp">
      <p className={p}>Người gửi chịu trách nhiệm về tính chính xác, tính hợp pháp và quyền sử dụng đối với văn bản, hình ảnh, tài liệu, quy cách sản phẩm và các nội dung đã gửi. Không gửi chứng nhận giả, thông tin gây hiểu nhầm, dữ liệu cá nhân không được phép chia sẻ hoặc tài liệu mà người gửi không có quyền sử dụng. Người gửi cho phép Vexim lưu trữ, kiểm tra, định dạng và hiển thị nội dung doanh nghiệp hoặc sản phẩm khi cần để vận hành dịch vụ, theo cơ chế kiểm duyệt công khai và <Link href="/chinh-sach-bao-mat" className="font-semibold text-brand-700 underline">Chính sách bảo mật</Link>. Tài liệu nội bộ không tự động được công khai. Vexim có thể từ chối hoặc gỡ nội dung không chính xác, vi phạm pháp luật hoặc không phù hợp với nền tảng.</p>
      <p className={p}>Kiểm tra tài liệu, thăm nhà máy và kiểm tra lịch sử giao hàng là các vòng kiểm tra riêng biệt. Huy hiệu chỉ thể hiện đúng vòng kiểm tra đã được Vexim phê duyệt, không phải là chứng nhận sản phẩm và không bảo đảm kết quả giao dịch trong tương lai. Thông tin sản phẩm, khả năng cung ứng, giá, thời gian giao hàng và chứng nhận cần được xác nhận lại với nhà cung cấp cho từng giao dịch.</p>
      <p className={p}>Khi nộp hồ sơ doanh nghiệp, nhà cung cấp xác nhận đã đọc và đồng ý với điều khoản này, đồng ý gửi thông tin và tài liệu để Vexim kiểm tra nội bộ, đồng thời chịu trách nhiệm về tính trung thực của thông tin đã cung cấp, gồm tên sản phẩm, giá sản phẩm và thời gian giao hàng, và cam kết thực hiện đúng các thông tin này.</p>
    </Section>

    <Section id="terms-vi-rfq" title="4. Yêu cầu báo giá và giới thiệu nhà cung cấp">
      <p className={p}>Người mua cần cung cấp yêu cầu có thật, tương đối đầy đủ và sử dụng dịch vụ RFQ cho nhu cầu mua hàng hợp pháp. Vexim có thể chia sẻ nội dung yêu cầu cho các nhà cung cấp được chọn để xin phản hồi, đồng thời giữ kín email, điện thoại và thông tin liên hệ trực tiếp của người mua cho đến khi người mua đồng ý được giới thiệu. Vexim không cam kết một nhà cung cấp cụ thể sẽ phản hồi, mức giá hoặc ngày giao hàng yêu cầu sẽ được đáp ứng, hoặc một giao dịch sẽ được hoàn tất. Việc làm mẫu, kiểm định, thanh toán, vận chuyển và các cam kết ràng buộc khác phải được thỏa thuận riêng.</p>
    </Section>

    <Section id="terms-vi-conduct" title="5. Hành vi được phép và sở hữu trí tuệ">
      <p className={p}>Không sử dụng website sai mục đích, không truy cập trái phép, không thu thập dữ liệu riêng tư, không gửi thư rác, không tải nội dung gây hại và không can thiệp vào việc sử dụng dịch vụ của người khác. Thiết kế, thương hiệu và nội dung gốc của website thuộc về chủ sở hữu tương ứng. Người sử dụng có thể dùng thông tin công khai để đánh giá cơ hội mua hàng nhưng không sao chép hoặc đăng lại theo cách gây hiểu nhầm. Nội dung của bên thứ ba vẫn thuộc quyền của chủ sở hữu nội dung đó.</p>
    </Section>

    <Section id="terms-vi-limits" title="6. Khả dụng của dịch vụ và giới hạn trách nhiệm">
      <p className={p}>Vexim nỗ lực duy trì thông tin chính xác và dịch vụ ổn định, tuy nhiên thông tin công khai có thể thay đổi và dịch vụ có thể bị gián đoạn kỹ thuật. Quyết định của người mua và nhà cung cấp không nên chỉ dựa vào nội dung trên website. Nội dung trên website không thay thế việc kiểm tra thương mại, pháp lý, an toàn và tuân thủ của chính các bên. Trong phạm vi pháp luật cho phép, Vexim không chịu trách nhiệm đối với tổn thất phát sinh chỉ từ việc tin vào thông tin chưa được xác nhận của nhà cung cấp, giá tham khảo hoặc tính năng chưa khả dụng. Mục này không giới hạn các quyền không thể bị loại trừ theo pháp luật.</p>
    </Section>

    <Section id="terms-vi-contact" title="7. Thay đổi, câu hỏi và liên hệ">
      <p className={p}>Vexim có thể cập nhật điều khoản khi dịch vụ thay đổi và sẽ điều chỉnh ngày hiệu lực khi công bố phiên bản mới. Việc sử dụng thông tin cá nhân được mô tả tại <Link href="/chinh-sach-bao-mat" className="font-semibold text-brand-700 underline">Chính sách bảo mật</Link>. Câu hỏi và khiếu nại vui lòng gửi tới VEXIM GLOBAL CO., LTD, Số 25/6 Ngõ 51 Ngoạ Long, Tây Tựu, Hà Nội, Việt Nam, qua email <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a> hoặc trang <Link href="/khieu-nai" className="font-semibold text-brand-700 underline">Khiếu nại và báo cáo vi phạm</Link>. Điều khoản này được điều chỉnh bởi pháp luật Việt Nam.</p>
      <p className={p}>Bản tiếng Anh của điều khoản được đăng tại <Link href="/terms-of-service" className="font-semibold text-brand-700 underline">Terms of Service</Link>. Khi có khác biệt về cách hiểu, bản tiếng Việt là bản được dùng để đối chiếu việc vận hành nền tảng tại Việt Nam.</p>
    </Section>
  </article>;
}
