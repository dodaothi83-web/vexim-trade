export type PlatformRulesLocale = "vi" | "en";

export interface PlatformRulesSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface PlatformRulesCopy {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: PlatformRulesSection[];
  noteTitle: string;
  note: string;
  resourcesTitle: string;
  resources: Array<{ label: string; href: string }>;
  languageLabel: string;
  languageHref: string;
  languageName: string;
  governingText?: string;
  metaDescription: string;
}

export const PLATFORM_RULES_COPY: Record<PlatformRulesLocale, PlatformRulesCopy> = {
  vi: {
    eyebrow: "Vexim Trade · Quy định nền tảng",
    title: "Quy chế hoạt động",
    updated: "Cập nhật ngày 01 tháng 11 năm 2026 · Phiên bản 2",
    intro: "Quy chế này giải thích cách Vexim Trade kết nối doanh nghiệp mua hàng với nhà cung cấp, cách thông tin được kiểm tra và những điều mỗi bên cần lưu ý khi sử dụng nền tảng.",
    sections: [
      {
        id: "rules-how-it-works",
        title: "1. Vexim Trade hoạt động thế nào?",
        paragraphs: [
          "Vexim Trade giúp doanh nghiệp tìm nhà cung cấp Việt Nam và gửi yêu cầu báo giá. Vexim có thể chuyển yêu cầu tới nhà cung cấp phù hợp và hỗ trợ hai bên trao đổi.",
          "Nền tảng hiện không nhận đơn hàng hoặc thanh toán và không giữ tiền của hai bên. Gửi yêu cầu báo giá, nhận báo giá hoặc được giới thiệu nhà cung cấp không có nghĩa là giao dịch đã được xác nhận. Người mua và nhà cung cấp tự thống nhất giá, hàng hóa, giao hàng và thanh toán bằng thỏa thuận riêng.",
        ],
      },
      {
        id: "rules-supplier-profile",
        title: "2. Tài khoản và hồ sơ nhà cung cấp",
        paragraphs: [
          "Tạo tài khoản hoặc gửi hồ sơ không đồng nghĩa doanh nghiệp đã được xác minh hay đã xuất hiện công khai. Vexim xem xét hồ sơ trước khi mở các chức năng phù hợp và trước khi công khai thông tin.",
          "Nhà cung cấp cần cung cấp thông tin đúng, cập nhật khi có thay đổi và chỉ tải lên giấy tờ, hình ảnh mà mình có quyền sử dụng. Nhà cung cấp chịu trách nhiệm về thông tin sản phẩm, nguồn hàng, khả năng cung ứng, giá tham khảo và thời gian giao hàng đã khai.",
        ],
      },
      {
        id: "rules-checks",
        title: "3. Các bước xác minh",
        paragraphs: [
          "Vexim ghi nhận riêng từng bước đã được duyệt; hoàn thành một bước không có nghĩa các bước khác cũng đã hoàn thành. Việc tham gia nền tảng cũng không đồng nghĩa doanh nghiệp đã được xác minh.",
        ],
        bullets: [
          "Kiểm tra giấy tờ doanh nghiệp: Vexim xem GCN ĐKKD và ghi nhận mã số thuế do doanh nghiệp cung cấp; mã số thuế không được xác minh riêng với cơ quan thuế. Chứng nhận chất lượng không thay thế GCN ĐKKD.",
          "Kiểm tra nhà máy: nhà sản xuất hoặc hợp tác xã có thể gửi bằng chứng về cơ sở. Doanh nghiệp thương mại có thể gửi hợp đồng với nhà máy đối tác. Hợp đồng xác nhận mối liên hệ được xem xét, không chứng minh quyền sở hữu nhà máy hoặc việc Vexim đã đến kiểm tra tại chỗ.",
          "Kiểm tra lịch sử giao hàng: Vexim xem xét chứng từ phù hợp. Một yêu cầu báo giá hoặc giao dịch được đánh dấu thành công không tự nó chứng minh hàng đã được giao.",
        ],
      },
      {
        id: "rules-products-certificates",
        title: "4. Sản phẩm và chứng nhận",
        paragraphs: [
          "Nhà cung cấp cần mô tả đúng sản phẩm, quy cách, xuất xứ và nơi sản xuất. Nếu hàng do nhà máy đối tác sản xuất, không được trình bày nhà máy đó như cơ sở thuộc sở hữu của mình khi không đúng sự thật.",
          "Chứng nhận được nộp và xem xét riêng với giấy tờ doanh nghiệp. Công cụ tự động có thể hỗ trợ đọc thông tin trên chứng nhận và gợi ý danh mục; gợi ý của AI không tự gắn chứng nhận vào danh mục hoặc sản phẩm. Nhân viên Vexim chọn phạm vi áp dụng sau khi đối chiếu nội dung giấy. Chứng nhận chỉ được hiển thị khi đáp ứng điều kiện của nền tảng; chứng nhận hiện trên hồ sơ không có nghĩa là áp dụng cho mọi sản phẩm.",
        ],
      },
      {
        id: "rules-public-information",
        title: "5. Thông tin công khai và tài liệu riêng tư",
        paragraphs: [
          "Người mua có thể xem hồ sơ, sản phẩm, các bước xác minh đã được duyệt và thông tin chứng nhận đủ điều kiện hiển thị. Thông tin trên chứng nhận được công khai có thể gồm tên chứng nhận, số giấy, đơn vị cấp, đơn vị đứng tên và ngày hết hạn. Tệp gốc và bằng chứng dùng để kiểm tra được giữ nội bộ, không tự động đăng công khai.",
          "Khi người mua gửi yêu cầu báo giá, Vexim có thể chia sẻ yêu cầu với nhà cung cấp được chọn. Thông tin liên hệ trực tiếp của người mua chỉ được chia sẻ khi họ đồng ý được giới thiệu. Việc sử dụng và bảo vệ dữ liệu được giải thích thêm trong Chính sách bảo mật.",
        ],
      },
      {
        id: "rules-buyers",
        title: "6. Điều người mua cần lưu ý",
        bullets: [
          "Gửi yêu cầu mua hàng có thật, mô tả nhu cầu đủ rõ và chỉ cung cấp thông tin mình có quyền chia sẻ.",
          "Tự kiểm tra nhà cung cấp, sản phẩm, giấy tờ và điều kiện giao dịch trước khi ký kết hoặc thanh toán. Huy hiệu xác minh không bảo đảm chất lượng của mọi sản phẩm hay kết quả của một giao dịch cụ thể.",
          "Xác nhận trực tiếp với nhà cung cấp các điều kiện cuối cùng về giá, số lượng, mẫu, chất lượng, giao hàng và thanh toán.",
        ],
      },
      {
        id: "rules-suppliers",
        title: "7. Điều nhà cung cấp cần lưu ý",
        bullets: [
          "Khai đúng thông tin doanh nghiệp, sản phẩm, nguồn hàng và nhà máy sản xuất; cập nhật khi thông tin thay đổi.",
          "Chỉ sử dụng chứng nhận còn phù hợp với hàng hóa và đúng đơn vị đứng tên. Không sửa đổi giấy tờ hoặc tạo ấn tượng rằng Vexim là đơn vị cấp chứng nhận.",
          "Phối hợp cung cấp bằng chứng khi Vexim xem xét hồ sơ hoặc xử lý phản ánh. Nhà cung cấp vẫn chịu trách nhiệm thực hiện thỏa thuận đã ký trực tiếp với người mua.",
        ],
      },
      {
        id: "rules-fees-and-reports",
        title: "8. Phí, nội dung vi phạm và phản ánh",
        paragraphs: [
          "Hiện tại, Vexim không thu phí tạo tài khoản nhà cung cấp hoặc gửi yêu cầu báo giá. Nếu có dịch vụ tính phí trong tương lai, Vexim sẽ công bố rõ mức phí và thời điểm áp dụng trước khi thu.",
          "Vexim có thể yêu cầu sửa, tạm ẩn hoặc gỡ thông tin sai lệch, hết hiệu lực hoặc vi phạm quy định; đồng thời có thể hạn chế tài khoản khi cần thiết. Người dùng có thể gửi phản ánh hoặc khiếu nại qua trang Khiếu nại và báo cáo vi phạm hoặc email contact@veximglobal.com.",
        ],
      },
    ],
    noteTitle: "Bản tiếng Việt",
    note: "Bản tiếng Việt là bản gốc của quy chế. Bản tiếng Anh được cung cấp để người dùng quốc tế tham khảo.",
    resourcesTitle: "Thông tin liên quan",
    resources: [
      { label: "Điều khoản sử dụng", href: "/dieu-khoan-su-dung" },
      { label: "Chính sách bảo mật", href: "/chinh-sach-bao-mat" },
      { label: "Khiếu nại và báo cáo vi phạm", href: "/khieu-nai" },
      { label: "Thông tin chủ quản nền tảng", href: "/thong-tin-chu-quan" },
    ],
    languageLabel: "Language",
    languageHref: "/platform-rules",
    languageName: "English",
    metaDescription: "Quy chế hoạt động Vexim Trade: cách kết nối người mua với nhà cung cấp, xác minh hồ sơ, hiển thị thông tin và xử lý yêu cầu.",
  },
  en: {
    eyebrow: "Vexim Trade · Platform rules",
    title: "Platform Operating Rules",
    updated: "Updated November 1, 2026 · Version 2",
    intro: "These rules explain how Vexim Trade connects business buyers with suppliers, how information is reviewed, and what each side should know when using the platform.",
    sections: [
      {
        id: "rules-how-it-works",
        title: "1. How Vexim Trade works",
        paragraphs: [
          "Vexim Trade helps businesses find Vietnamese suppliers and send requests for quotation. Vexim may forward a request to suitable suppliers and help the parties communicate.",
          "The platform does not currently accept orders or payments or hold money for either side. Sending a quote request, receiving a quote or being introduced to a supplier does not confirm a transaction. Buyers and suppliers agree separately on price, goods, delivery and payment.",
        ],
      },
      {
        id: "rules-supplier-profile",
        title: "2. Supplier accounts and profiles",
        paragraphs: [
          "Creating an account or submitting a profile does not mean the business has been verified or published. Vexim reviews information before enabling relevant tools and before making profile information public.",
          "Suppliers must provide accurate information, update it when it changes, and only upload documents or images they are allowed to use. Suppliers are responsible for the product, sourcing, availability, indicative prices and lead times they state.",
        ],
      },
      {
        id: "rules-checks",
        title: "3. Supplier checks",
        paragraphs: [
          "Vexim records each approved check separately. Passing one check does not mean the others have been passed, and joining the platform does not mean a supplier is verified.",
        ],
        bullets: [
          "Business documents: Vexim reviews the business registration and records the tax number supplied by the company; the tax number is not independently checked with the tax authority. A quality certificate does not replace business registration.",
          "Factory review: manufacturers and cooperatives may submit evidence about their facility. Trading companies may submit a contract with a partner factory. A reviewed contract shows that a relationship was considered; it does not prove factory ownership or an on-site inspection by Vexim.",
          "Delivery history: Vexim reviews suitable shipment evidence. A quote request or an enquiry marked successful does not by itself prove goods were delivered.",
        ],
      },
      {
        id: "rules-products-certificates",
        title: "4. Products and certificates",
        paragraphs: [
          "Suppliers must describe products, specifications, origin and place of production accurately. If a partner factory makes the goods, suppliers must not claim to own that factory when they do not.",
          "Certificates are submitted and considered separately from business documents. Automated tools may help read certificate information and suggest categories; an AI suggestion does not attach a certificate to a category or product. Vexim staff choose the applicable scope after reviewing the document. A certificate is shown only when it meets the platform's display conditions; a certificate on a supplier profile does not mean it applies to every product.",
        ],
      },
      {
        id: "rules-public-information",
        title: "5. Public information and private documents",
        paragraphs: [
          "Buyers may see supplier profiles, products, approved checks and certificates that meet the platform's display conditions. Public certificate details may include the certificate name and number, issuer, holder and expiry date. Original files and review evidence remain internal and are not automatically published.",
          "When a buyer submits a quote request, Vexim may share the request with suppliers selected to respond. The buyer's direct contact details are shared only after the buyer agrees to an introduction. More information about data use is available in the Privacy Policy.",
        ],
      },
      {
        id: "rules-buyers",
        title: "6. What buyers should know",
        bullets: [
          "Send genuine buying requests, describe your needs clearly and only provide information you are allowed to share.",
          "Check suppliers, products, documents and transaction terms before signing or paying. A verification badge does not guarantee the quality of every product or the outcome of a specific transaction.",
          "Confirm final terms for price, quantity, samples, quality, delivery and payment directly with the supplier.",
        ],
      },
      {
        id: "rules-suppliers",
        title: "7. What suppliers should know",
        bullets: [
          "Provide accurate business, product, sourcing and factory information, and update it when it changes.",
          "Use certificates that apply to the goods and show the correct holder. Do not alter documents or suggest that Vexim issued a certificate.",
          "Help provide evidence when Vexim reviews a profile or handles a report. Suppliers remain responsible for agreements they make directly with buyers.",
        ],
      },
      {
        id: "rules-fees-and-reports",
        title: "8. Fees, unsuitable content and reports",
        paragraphs: [
          "Vexim currently does not charge to create a supplier account or submit a quote request. If paid services are introduced, Vexim will publish the fees and start date before charging.",
          "Vexim may ask users to correct, temporarily hide or remove inaccurate, outdated or rule-breaking information, and may restrict an account when necessary. Users can send a report or complaint through the Complaints and Violation Reports page or email contact@veximglobal.com.",
        ],
      },
    ],
    noteTitle: "Language",
    note: "The Vietnamese version is the original text of these rules. The English version is provided for international users' convenience.",
    resourcesTitle: "Related information",
    resources: [
      { label: "Terms of Service", href: "/terms-of-service" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Complaints and Violation Reports", href: "/khieu-nai" },
      { label: "Platform Owner Information", href: "/thong-tin-chu-quan" },
    ],
    languageLabel: "Ngôn ngữ",
    languageHref: "/quy-che-hoat-dong",
    languageName: "Tiếng Việt",
    governingText: "The Vietnamese version is the authoritative version if the two versions differ.",
    metaDescription: "Vexim Trade platform rules: how buyers connect with suppliers, profile checks, public information and requests.",
  },
};
