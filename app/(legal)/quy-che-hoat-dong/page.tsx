import Link from "next/link";
import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Quy chế hoạt động | Vexim Trade" },
  description: "Quy chế hoạt động của nền tảng giới thiệu nhà cung cấp và tiếp nhận yêu cầu báo giá Vexim Trade.",
  alternates: { canonical: `${SITE_URL}/quy-che-hoat-dong` },
  robots: { index: true, follow: true },
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section className="mt-9 space-y-3" aria-labelledby={id}>
    <h2 id={id} className="text-xl font-bold text-ink-900">{title}</h2>
    {children}
  </section>;
}

const p = "text-sm leading-7 text-ink-700";
const list = "list-disc space-y-2 pl-6 text-sm leading-7 text-ink-700";

export default function PlatformRulesPage() {
  return <article lang="vi" className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Vexim Trade · Quy định công khai</p>
    <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">Quy chế hoạt động</h1>
    <p className="mt-3 text-sm text-ink-500">Ngày hiệu lực: 18 tháng 10 năm 2026 · Phiên bản 1</p>
    <p className="mt-6 text-sm leading-7 text-ink-700">Quy chế này áp dụng cho website <a href={SITE_URL} className="font-semibold text-brand-700 underline">{SITE_URL}</a> do VEXIM GLOBAL CO., LTD quản lý và vận hành. Thông tin về chủ quản nền tảng được công khai tại trang <Link href="/thong-tin-chu-quan" className="font-semibold text-brand-700 underline">Thông tin chủ quản nền tảng</Link>.</p>

    <Section id="rules-model" title="1. Mô hình hoạt động">
      <p className={p}>Vexim Trade là nền tảng giới thiệu nhà cung cấp Việt Nam cho doanh nghiệp mua hàng trong nước và nước ngoài. Nhà cung cấp đăng ký tài khoản, gửi hồ sơ doanh nghiệp và thông tin sản phẩm. Vexim kiểm tra trước khi quyết định công khai. Doanh nghiệp mua hàng gửi yêu cầu báo giá, gọi tắt là RFQ, để Vexim tìm và kết nối nhà cung cấp phù hợp.</p>
      <p className={p}>Vexim hiện không cung cấp chức năng đặt hàng trực tuyến, không nhận thanh toán, không giữ tiền của người mua hoặc nhà cung cấp và không giao kết hợp đồng điện tử trên website. Việc gửi RFQ, nhận báo giá tham khảo hoặc được giới thiệu nhà cung cấp không tạo thành đơn đặt hàng. Giá mua, số lượng, giao hàng, thanh toán và các cam kết khác do người mua và nhà cung cấp thỏa thuận riêng bằng văn bản.</p>
    </Section>

    <Section id="rules-seller-join" title="2. Điều kiện tham gia đối với nhà cung cấp">
      <ul className={list}>
        <li>Nhà cung cấp phải cung cấp thông tin doanh nghiệp đúng với đăng ký kinh doanh, gồm tên pháp lý, địa chỉ trụ sở hoặc địa điểm kinh doanh, mã số thuế và người liên hệ được ủy quyền.</li>
        <li>Tài khoản chỉ được sử dụng sau khi Vexim kiểm tra hồ sơ. Việc tạo tài khoản, tải tài liệu lên hoặc gửi sản phẩm không đồng nghĩa với việc hồ sơ được công khai.</li>
        <li>Vexim thực hiện xác thực nhà cung cấp theo quy định của pháp luật về thương mại điện tử và định danh điện tử, gồm cả lộ trình xác thực điện tử danh tính áp dụng từ ngày 01 tháng 01 năm 2027.</li>
        <li>Nhà cung cấp phải cập nhật kịp thời khi thông tin doanh nghiệp, sản phẩm, giá tham khảo, thời gian giao hàng hoặc giấy chứng nhận thay đổi.</li>
      </ul>
    </Section>

    <Section id="rules-listing" title="3. Tiêu chuẩn thông tin sản phẩm">
      <ul className={list}>
        <li>Tên sản phẩm, quy cách, xuất xứ, giá tham khảo và thời gian giao hàng phải trung thực và còn hiệu lực tại thời điểm công khai.</li>
        <li>Thông tin về chất lượng, tiêu chuẩn áp dụng, đóng gói và thông tin bắt buộc trên nhãn hàng hóa được cung cấp theo quy định của pháp luật liên quan đến từng loại hàng hóa.</li>
        <li>Hàng hóa thuộc ngành, nghề kinh doanh có điều kiện chỉ được giới thiệu khi nhà cung cấp cung cấp đủ giấy tờ theo yêu cầu của pháp luật và của Vexim.</li>
        <li>Không giới thiệu hàng cấm, hàng giả, hàng xâm phạm quyền sở hữu trí tuệ, hàng nhập lậu, hàng không rõ nguồn gốc hoặc xuất xứ, hàng quá hạn sử dụng và hàng hóa vi phạm quy định về chất lượng.</li>
        <li>Hình ảnh, chứng nhận và nội dung mô tả phải thuộc quyền sử dụng hợp pháp của nhà cung cấp. Chứng nhận của bên thứ ba không được trình bày thành chứng nhận do Vexim cấp.</li>
      </ul>
    </Section>

    <Section id="rules-moderation" title="4. Kiểm duyệt, hiển thị và gỡ thông tin">
      <p className={p}>Vexim kiểm duyệt hồ sơ nhà cung cấp và thông tin sản phẩm trước khi cho phép hiển thị. Vexim có thể yêu cầu bổ sung tài liệu, sửa nội dung, từ chối công khai, tạm ẩn hoặc gỡ thông tin khi nội dung không chính xác, hết hiệu lực, có dấu hiệu vi phạm pháp luật hoặc vi phạm quy chế này.</p>
      <p className={p}>Thứ tự hiển thị nhà cung cấp và sản phẩm dựa trên các tiêu chí chính gồm mức độ phù hợp với danh mục và từ khóa tìm kiếm, số vòng kiểm chứng đã được Vexim phê duyệt, mức độ đầy đủ của hồ sơ và tính cập nhật của thông tin. Nội dung được trả phí để ưu tiên hiển thị, khi có, sẽ được gắn nhãn tài trợ rõ ràng và không làm thay đổi kết quả kiểm chứng của Vexim.</p>
      <p className={p}>Khi nhận yêu cầu của cơ quan nhà nước có thẩm quyền, Vexim thực hiện việc tạm ngừng, gỡ bỏ hoặc xử lý nội dung và tài khoản liên quan trong thời hạn theo quy định của pháp luật.</p>
    </Section>

    <Section id="rules-fees" title="5. Phí sử dụng nền tảng">
      <p className={p}>Hiện Vexim không thu phí mở hoặc duy trì tài khoản nhà cung cấp và không thu phí doanh nghiệp mua hàng khi gửi RFQ. Mức phí áp dụng cho các dịch vụ của nền tảng hiện là 0 đồng cho đến khi Vexim công bố biểu phí chính thức theo mục này.</p>
      <p className={p}>Trong thời gian tới, Vexim có thể xem xét áp dụng một hoặc một số loại phí như phí duy trì tài khoản nhà cung cấp, phí dịch vụ kết nối yêu cầu báo giá, phí quảng cáo hoặc ưu tiên hiển thị và phí cho dịch vụ bổ sung theo yêu cầu. Việc nêu các loại phí dự kiến này không có nghĩa là phí đã được áp dụng.</p>
      <p className={p}>Trước khi bắt đầu thu hoặc thay đổi phí, Vexim công bố biểu phí trên trang này và thông báo tới tài khoản hoặc email đã đăng ký của nhà cung cấp tối thiểu 20 ngày trước ngày áp dụng. Nội dung công bố gồm loại phí, đối tượng áp dụng, cách tính, thời điểm thu, phương thức thanh toán, điều kiện hoàn phí nếu có và ngày hiệu lực. Thay đổi phí không áp dụng hồi tố cho thời gian đã sử dụng trước ngày hiệu lực.</p>
      <p className={p}>Nhà cung cấp không đồng ý với biểu phí mới có thể ngừng sử dụng dịch vụ tính phí hoặc đề nghị chấm dứt tài khoản trước ngày áp dụng theo hướng dẫn của Vexim. Việc tiếp tục sử dụng dịch vụ tính phí sau ngày hiệu lực được hiểu là nhà cung cấp đã chấp nhận biểu phí đã công bố, trừ trường hợp hai bên có thỏa thuận riêng bằng văn bản.</p>
      <p className={p}>Giá hiển thị trên trang sản phẩm là giá tham khảo do nhà cung cấp cung cấp trong thời hạn đã xác nhận. Giá này chưa phải là báo giá cam kết cho một giao dịch cụ thể và cần được xác nhận lại trong báo giá chính thức.</p>
    </Section>

    <Section id="rules-rights" title="6. Quyền và nghĩa vụ của các bên">
      <p className={p}><strong>Vexim</strong> ban hành và tổ chức thực hiện quy chế này, kiểm tra thông tin trước khi công khai, tiếp nhận và xử lý phản ánh, bảo vệ dữ liệu của người sử dụng, phối hợp với cơ quan nhà nước có thẩm quyền và duy trì vận hành nền tảng ổn định trong khả năng kỹ thuật.</p>
      <p className={p}><strong>Nhà cung cấp</strong> chịu trách nhiệm về tính trung thực của thông tin doanh nghiệp và sản phẩm đã cung cấp, gồm tên sản phẩm, giá sản phẩm và thời gian giao hàng, đồng thời thực hiện đúng các thông tin đã cam kết với Vexim. Nhà cung cấp phối hợp cung cấp tài liệu và xử lý phản ánh liên quan đến hồ sơ của mình.</p>
      <p className={p}><strong>Doanh nghiệp mua hàng</strong> cung cấp yêu cầu mua hàng trung thực và đủ rõ để Vexim tìm nhà cung cấp, tự thực hiện các bước thẩm định thương mại, chất lượng, pháp lý và thanh toán trước khi ký kết giao dịch riêng với nhà cung cấp.</p>
    </Section>

    <Section id="rules-account" title="7. Tạm ngừng và chấm dứt tài khoản">
      <p className={p}>Vexim có thể tạm ngừng, hạn chế hoặc chấm dứt tài khoản khi nhà cung cấp cung cấp thông tin sai lệch, nhiều lần không cập nhật thông tin đã hết hiệu lực, giới thiệu hàng hóa vi phạm, không phối hợp xử lý phản ánh hoặc có yêu cầu của cơ quan nhà nước có thẩm quyền. Trừ trường hợp phải xử lý ngay theo yêu cầu của cơ quan nhà nước hoặc để ngăn chặn hành vi gian lận, Vexim thông báo lý do cho nhà cung cấp và hướng dẫn cách gửi ý kiến qua trang <Link href="/khieu-nai" className="font-semibold text-brand-700 underline">Khiếu nại và báo cáo vi phạm</Link>.</p>
      <p className={p}>Nhà cung cấp có quyền đề nghị chấm dứt tài khoản bất cứ lúc nào bằng văn bản hoặc qua email <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a> mà không phải chịu phí chấm dứt. Trong vòng 03 ngày làm việc kể từ khi nhận được đề nghị, Vexim ngừng chuyển yêu cầu báo giá mới, gỡ thông tin công khai của nhà cung cấp và xác nhận lại bằng email. Việc chấm dứt không làm mất hiệu lực các nghĩa vụ đã phát sinh trước thời điểm chấm dứt, gồm nghĩa vụ đối với giao dịch đã giao kết với người mua, nghĩa vụ phối hợp xử lý khiếu nại và nghĩa vụ cung cấp thông tin cho cơ quan nhà nước có thẩm quyền.</p>
    </Section>

    <Section id="rules-data" title="8. Lưu trữ và truy cập dữ liệu">
      <p className={p}>Thông tin hàng hóa và dịch vụ đã đăng tải được Vexim lưu trữ và bảo đảm nhà cung cấp truy cập được từ tài khoản của mình trong thời gian tối thiểu 01 năm kể từ thời điểm đăng tải, trừ trường hợp nhà cung cấp chủ động xóa tài khoản hoặc pháp luật có yêu cầu khác. Việc xử lý dữ liệu cá nhân thực hiện theo <Link href="/chinh-sach-bao-mat" className="font-semibold text-brand-700 underline">Chính sách bảo mật</Link>.</p>
    </Section>

    <Section id="rules-complaints" title="9. Phản ánh, yêu cầu và khiếu nại">
      <p className={p}>Người sử dụng gửi phản ánh, yêu cầu, khiếu nại hoặc báo cáo vi phạm qua trang <Link href="/khieu-nai" className="font-semibold text-brand-700 underline">Khiếu nại và báo cáo vi phạm</Link> hoặc email <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a>. Vexim phản hồi ban đầu trong 01 ngày làm việc và thông báo thời gian dự kiến giải quyết theo từng loại vấn đề tại trang khiếu nại.</p>
    </Section>

    <Section id="rules-changes" title="10. Thay đổi quy chế">
      <p className={p}>Khi quy chế thay đổi, Vexim công bố phiên bản mới và ngày hiệu lực tại trang này. Thay đổi về mô hình hoạt động, phí hoặc điều khoản với nhà cung cấp sẽ được thông báo trước khi áp dụng và thực hiện thủ tục sửa đổi đăng ký hoạt động thương mại điện tử khi pháp luật yêu cầu.</p>
    </Section>
  </article>;
}
