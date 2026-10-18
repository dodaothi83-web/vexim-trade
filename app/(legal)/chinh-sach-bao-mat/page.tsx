import Link from "next/link";
import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Chính sách bảo mật | Vexim Trade" },
  description: "Cách Vexim Trade thu thập, sử dụng, chia sẻ, lưu trữ và bảo vệ thông tin của người sử dụng.",
  alternates: { canonical: `${SITE_URL}/chinh-sach-bao-mat` },
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

export default function PrivacyViPage() {
  return <article lang="vi" className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Vexim Trade · Pháp lý</p>
    <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">Chính sách bảo mật</h1>
    <p className="mt-3 text-sm text-ink-500">Ngày hiệu lực: 18 tháng 10 năm 2026 · Phiên bản 1</p>
    <p className="mt-6 text-sm leading-7 text-ink-700">Chính sách này mô tả cách VEXIM GLOBAL CO., LTD, đơn vị vận hành Vexim Trade, xử lý thông tin khi bạn truy cập <a className="font-semibold text-brand-700 underline" href={SITE_URL}>{SITE_URL}</a>, gửi yêu cầu báo giá, tạo tài khoản nhà cung cấp hoặc sử dụng công cụ nội bộ của Vexim. Vexim Trade là nền tảng tìm nguồn cung giữa doanh nghiệp với doanh nghiệp, kết nối người mua với nhà cung cấp Việt Nam. Câu hỏi và yêu cầu về dữ liệu cá nhân vui lòng gửi tới <a className="font-semibold text-brand-700 underline" href="mailto:hello@veximtrade.com">hello@veximtrade.com</a>.</p>

    <Section id="privacy-vi-data" title="1. Thông tin Vexim thu thập">
      <ul className={list}>
        <li><strong>Yêu cầu mua hàng:</strong> thông tin doanh nghiệp và người liên hệ, email, số điện thoại nếu được cung cấp, sản phẩm, quy cách, số lượng, nơi giao hàng, dịch vụ yêu cầu, nội dung trao đổi, bản ghi đồng ý và trạng thái xử lý yêu cầu. Biểu mẫu có thể gửi kèm thông số chiến dịch hoặc trang giới thiệu.</li>
        <li><strong>Tài khoản và hồ sơ nhà cung cấp:</strong> tên và email tài khoản, thông tin doanh nghiệp và người liên hệ, thông tin sản phẩm, hình ảnh, chứng nhận, tài liệu thuế, ngân hàng và tài liệu kiểm chứng mà nhà cung cấp chọn cung cấp, cùng quyết định kiểm tra của nhân viên Vexim. Một phần tài liệu này là hồ sơ kinh doanh nhạy cảm và chỉ lưu nội bộ, trừ khi có quyết định công khai riêng.</li>
        <li><strong>Hoạt động trên website:</strong> tổng lượt xem theo ngày và trang công khai, cùng một số nhật ký bảo mật và vận hành giới hạn. Báo cáo lượt xem là số liệu xấp xỉ, không xác định từng người mua và không lưu địa chỉ IP hoặc định danh người truy cập trong bảng lượt xem. Trình duyệt có thể dùng bộ nhớ phiên để tránh đếm lặp một trang trong cùng một tab.</li>
        <li><strong>Trao đổi liên lạc:</strong> email bạn gửi hoặc nhận từ Vexim, nội dung trả lời và hồ sơ cần thiết để theo dõi yêu cầu hoặc quản lý tài khoản.</li>
        <li><strong>Phản ánh và khiếu nại:</strong> họ tên, email liên hệ, loại vấn đề, nội dung phản ánh và bằng chứng bạn gửi khi sử dụng trang khiếu nại hoặc email.</li>
      </ul>
    </Section>

    <Section id="privacy-vi-google" title="2. Đăng nhập bằng Google">
      <p className={p}>Nếu bạn chọn đăng nhập hoặc đăng ký bằng Google, Vexim chỉ yêu cầu phạm vi <strong>email</strong> và <strong>hồ sơ cơ bản</strong>. Qua đơn vị cung cấp dịch vụ xác thực, Vexim nhận địa chỉ email đã xác thực, mã định danh gắn với lần đăng nhập và thông tin tên hoặc hồ sơ sẵn có để xác minh danh tính, tạo tài khoản nhà cung cấp khi bạn đăng ký rõ ràng, hoặc đối chiếu với tài khoản Vexim hiện có. Đăng nhập bằng Google tự nó không phê duyệt nhà cung cấp, không công khai thông tin và không cấp quyền nhân viên. Vexim không yêu cầu quyền truy cập Gmail, Google Drive, Danh bạ hoặc Lịch và không dùng dữ liệu hồ sơ Google cho quảng cáo hoặc bán dữ liệu.</p>
      <p className={p}>Việc xác thực qua Google được xử lý qua Supabase Auth. Vexim lưu tên, email và vai trò tài khoản cần thiết để vận hành tài khoản. Ứng dụng của Vexim không dùng mã truy cập Google để gọi các dịch vụ khác của Google thay cho bạn. Bạn có thể thu hồi quyền truy cập của Vexim trong phần cài đặt Tài khoản Google. Việc thu hồi này khác với yêu cầu xóa tài khoản Vexim và hồ sơ đã gửi, vui lòng liên hệ riêng với Vexim nếu bạn muốn yêu cầu xóa.</p>
    </Section>

    <Section id="privacy-vi-use" title="3. Mục đích sử dụng thông tin">
      <p className={p}>Vexim sử dụng thông tin để xác thực người dùng, kiểm tra hồ sơ nhà cung cấp và sản phẩm, trả lời yêu cầu mua hàng, tìm nhà cung cấp phù hợp, sắp xếp việc giới thiệu khi được yêu cầu, liên lạc về tài khoản hoặc yêu cầu báo giá, xử lý phản ánh và khiếu nại, bảo vệ dịch vụ khỏi hành vi lạm dụng, đồng thời duy trì và cải thiện nền tảng. Việc kiểm tra tài liệu, thăm nhà máy và kiểm tra lịch sử giao hàng là các quyết định riêng biệt do con người thực hiện. Tải thông tin lên không tự động tạo huy hiệu kiểm chứng công khai.</p>
    </Section>

    <Section id="privacy-vi-share" title="4. Các bên có thể tiếp cận thông tin">
      <p className={p}>Nhân viên được ủy quyền của Vexim tiếp cận thông tin trong phạm vi công việc. Để xin báo giá, Vexim có thể chia sẻ nội dung yêu cầu của người mua cho các nhà cung cấp được chọn, nhưng không cung cấp email, điện thoại hoặc thông tin liên hệ trực tiếp của người mua cho đến khi người mua đồng ý được giới thiệu. Hồ sơ nhà cung cấp, sản phẩm, chứng nhận và tóm tắt kiểm chứng chỉ công khai sau các bước kiểm tra và công bố tương ứng. Bằng chứng nội bộ và tài liệu riêng tư không tự động được công khai.</p>
      <p className={p}>Vexim sử dụng các nhà cung cấp dịch vụ cho lưu trữ và hạ tầng, cơ sở dữ liệu và xác thực, gửi email và đăng nhập Google. Công cụ chống thư rác và hỗ trợ kiểm tra tài liệu, khi được bật, chỉ xử lý thông tin cần thiết cho tính năng đó và quyết định kiểm chứng do nhân viên Vexim thực hiện. Vexim có thể tiết lộ thông tin khi pháp luật yêu cầu hoặc để bảo vệ an toàn của dịch vụ. Vexim không bán dữ liệu người dùng Google và không cung cấp dữ liệu này cho mạng quảng cáo.</p>
    </Section>

    <Section id="privacy-vi-retention" title="5. Thời gian lưu trữ và bảo mật">
      <ul className={list}>
        <li>Thông tin tài khoản được lưu trong thời gian tài khoản còn hoạt động và một thời gian hợp lý sau đó để xử lý yêu cầu còn tồn, tranh chấp, bảo mật và nghĩa vụ pháp luật.</li>
        <li>Thông tin hàng hóa và dịch vụ đã đăng tải được lưu và bảo đảm nhà cung cấp truy cập được tối thiểu 01 năm kể từ thời điểm đăng tải theo quy định về vận hành nền tảng thương mại điện tử.</li>
        <li>Hồ sơ yêu cầu mua hàng, phản ánh, khiếu nại và kiểm chứng được lưu trong thời gian cần thiết để xử lý, theo dõi kết quả và đáp ứng yêu cầu của cơ quan nhà nước có thẩm quyền.</li>
        <li>Khi không còn cần thiết, thông tin được xóa hoặc ẩn danh trong khả năng hợp lý, trừ phần phải lưu theo quy định của pháp luật. Số liệu lượt xem đã tổng hợp không gắn với tài khoản cá nhân.</li>
      </ul>
      <p className={p}>Vexim áp dụng kiểm soát truy cập, xử lý phía máy chủ và kết nối an toàn. Không có dịch vụ trực tuyến nào bảo đảm an toàn tuyệt đối.</p>
    </Section>

    <Section id="privacy-vi-rights" title="6. Quyền và cách gửi yêu cầu của bạn">
      <p className={p}>Bạn có thể gửi email tới <a href="mailto:hello@veximtrade.com" className="font-semibold text-brand-700 underline">hello@veximtrade.com</a> để yêu cầu xem, chỉnh sửa hoặc yêu cầu chỉnh sửa, xóa, hủy hoặc hạn chế xử lý dữ liệu cá nhân của mình, rút lại đồng ý trong trường hợp áp dụng, hoặc hỏi về cách Vexim xử lý dữ liệu. Vui lòng gửi yêu cầu từ email đã đăng ký và mô tả rõ nội dung cần xử lý. Vexim có thể cần xác minh danh tính trước khi thực hiện và có thể lưu giữ một phần hồ sơ khi pháp luật yêu cầu hoặc cho mục đích bảo mật và giải quyết tranh chấp chính đáng. Vexim phản hồi ban đầu trong 01 ngày làm việc và thông báo thời gian xử lý dự kiến tùy loại yêu cầu.</p>
      <p className={p}>Khiếu nại liên quan đến bảo mật thông tin được tiếp nhận qua cùng địa chỉ email hoặc trang <Link href="/khieu-nai" className="font-semibold text-brand-700 underline">Khiếu nại và báo cáo vi phạm</Link> và được chuyển cho nhân viên phụ trách xem xét. Quyết định cuối cùng không chỉ dựa trên cơ chế tự động. Dịch vụ của Vexim dành cho người dùng doanh nghiệp, không dành cho trẻ em.</p>
    </Section>

    <Section id="privacy-vi-changes" title="7. Cập nhật và liên hệ">
      <p className={p}>Vexim có thể cập nhật chính sách khi dịch vụ thay đổi. Ngày hiệu lực ở đầu trang sẽ được điều chỉnh khi phiên bản thay đổi quan trọng được công bố. Liên hệ: VEXIM GLOBAL CO., LTD, Số 25/6 Ngõ 51 Ngoạ Long, Tây Tựu, Hà Nội, Việt Nam · <a href="mailto:hello@veximtrade.com" className="font-semibold text-brand-700 underline">hello@veximtrade.com</a>. Quy định sử dụng website được đăng tại <Link href="/dieu-khoan-su-dung" className="font-semibold text-brand-700 underline">Điều khoản sử dụng</Link>. Bản tiếng Anh được đăng tại <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link>.</p>
    </Section>
  </article>;
}
