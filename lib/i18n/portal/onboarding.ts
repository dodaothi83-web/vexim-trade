/**
 * Chuỗi biểu mẫu hoàn thiện hồ sơ doanh nghiệp (cụm 2 của giai đoạn 2).
 *
 * Đây là biểu mẫu ba bước mà nhà cung cấp mới thấy trên trang tổng quan, cộng cột hướng dẫn
 * bên phải. `en` là bản gốc; `vi` khai theo kiểu suy ra từ nó.
 */
const en = {
  steps: ["Company information", "First documents", "Public page and submit"],
  progressSteps: ["Company information", "Documents", "Submit"],
  unlock: [
    "Publish products and photos to your storefront.",
    "Receive buyer RFQs and send quotes.",
    "A public company page with the verified badge.",
    "Add quality certificates to your profile.",
  ],
  docs: {
    business_license: "Business registration certificate",
    food_safety: "Food safety certificate",
    haccp_or_brc: "HACCP / ISO / FSSC / Halal",
    product_certs: "Product certificates (if any)",
    export_license: "Export licence (if applicable)",
  },
  fileHint: "PDF, JPG, PNG or WEBP, up to 15 MB",
  company: {
    title: "Company information",
    intro: "Enter it exactly as it appears on your documents.",
    introLocked: "The supplier type you already sent cannot be changed here.",
    introOpen:
      "Pick a type so the profile is filed under the right group of companies; this choice does not unlock any extra access.",
    labels: {
      name: "Legal company name *",
      tradeName: "Trade name (if any)",
      supplierType: "Supplier type *",
      products: "Main products *",
      taxNumber: "Tax number (digits only) *",
      bankAccount: "Bank account number",
      province: "Province / city",
      address: "Address",
    },
    placeholders: {
      name: "e.g. Saigon Brick Co., Ltd",
      tradeName: "e.g. Saigon Brick",
      products: "e.g. W320 cashew kernels, black pepper",
      taxNumber: "e.g. 0103884103",
      bankAccount: "e.g. 0123456789",
      province: "e.g. Hanoi",
      address: "e.g. 25/6 Alley 51 Ngoa Long, Tay Tuu",
    },
    typeUnset: "Not set",
    typeLockedHint: "If it is wrong or missing, contact a staff member to check and update it.",
    typeSelectPlaceholder: "Choose factory / trader / cooperative",
  },
  contact: {
    title: "Contact person",
    intro:
      "Vexim calls this person when the profile needs checking. Buyers see contact details only after the profile is published.",
    labels: {
      contactName: "Contact person *",
      phone: "Phone *",
      email: "Sign-in email",
    },
    placeholders: { contactName: "e.g. Nguyen Van An", phone: "e.g. 0987 654 321" },
    emailHint: "Review results and every notice go to this email.",
  },
  documents: {
    title: "First documents · Documents check",
    intro: [
      "Only the business registration certificate is needed.",
      "The certificate must be in the name of the company you entered in step 1; one issued to another entity does not count.",
      "Quality certificates (HACCP, ISO, BRC, Halal...) are uploaded after the account is approved.",
      "Each file is up to 15 MB; uploading does not approve anything by itself.",
    ],
    extraTitle: "Want more checks?",
    extraIntro:
      "Tick if you want to be contacted for an extra check. Each review is decided on its own; asking does not grant verification.",
    factoryTitle: "Factory verification",
    partnerTitle: "Partner factory review",
    factoryHint:
      "You will be contacted to arrange a check and upload evidence in a round; asking does not approve anything.",
    partnerHint: "A contract with the partner factory is required; photos are optional. Staff check it, nothing is auto-approved.",
    exportTitle: "Delivery history",
    exportHint:
      "You will be contacted to arrange a check and upload evidence in a round; asking does not approve anything.",
  },
  publicPage: {
    title: "What shows on your company page",
    intro: [
      "These fields build the company introduction page.",
      "It only goes public once the profile is published; products and photos are entered separately after approval.",
      "Write in Vietnamese: MOQ, export markets and the introduction are translated into English for you.",
    ],
    labels: {
      displayName: "Display name on the page",
      website: "Website (https://...)",
      country: "Country",
      contactTitle: "Contact person's role",
      zalo: "Zalo",
      foundedYear: "Year founded",
      employees: "Employees",
      capacity: "Capacity per month",
      moq: "MOQ",
      leadTime: "Lead time (days)",
      markets: "Markets served",
      exportMarkets: "Export markets (comma separated)",
      ports: "Export ports (comma separated)",
      incoterms: "Incoterms (comma separated)",
      paymentTerms: "Payment terms",
    },
    introLabel: "Introduction",
    introPlaceholder: "Describe what makes your company or products different.",
    privateLabel: "Private label / OEM available",
  },
  commitments: {
    title: "Confirm before sending",
    termsBefore: "I agree to the",
    termsLink: "Terms of Service",
    termsAfter:
      "and allow the information and documents I sent to be used for internal checks. The account opens once the profile is approved.",
    accuracyBefore: "I am responsible for the accuracy of the information provided.",
    accuracyAfter:
      "This covers product names, prices and delivery times; I commit to delivering as stated.",
  },
  categories: {
    title: "Business categories",
    intro: [
      "Choose from the categories that are open.",
      "Once the account is approved, products can only be filed under these, and still need review before they go public.",
    ],
    none: "No category is open yet. Contact support before sending the profile.",
  },
  picker: {
    aria: "Choose an open category",
    atLimit: "5 categories already chosen",
    choose: "Choose a category…",
    allChosen: "All open categories chosen",
    remove: "Remove {slug}",
    counter: "{count}/5 chosen.",
    hint: "Picking one adds it straight away; press × to remove.",
    note: "Only open categories are listed, and your products must sit inside one of them.",
  },
  form: {
    header: "Complete your company profile",
    stepOf: "Step {step}/3",
    stepOfTitle: "Step {step}/3 · {title}",
    progressAria: "Step {step} of 3",
    back: "Back",
    next: "Continue",
    submitting: "Sending the profile...",
    submit: "Send for review",
    errors: {
      requiredInStep: "A required field in this step is empty or malformed. Please check it again.",
      noCategory: "Choose at least one business category in the box above.",
      noCategorySubmit: "Choose at least one business category before sending the profile.",
      noCoreDoc: "Upload the business registration certificate for your company.",
      consent: "Please tick the box agreeing to the Terms of Service before sending.",
      accuracy:
        "Please tick the box accepting responsibility for the truthfulness of product names, prices and delivery times.",
      requiredInStepShort: "A required field is empty or malformed. Please check this step again.",
      generic: "Could not connect to the server. Please try again.",
    },
    noNotification: "The internal notification email may not have been sent; the profile is still in the review queue.",
  },
  aside: {
    aria: "Guide to completing the profile",
    progressTitle: "Profile progress",
    done: "Done",
    current: "Filling in",
    todo: "Not yet",
    clickDone: "Press a finished step to edit it again.",
    prepareTitle: "What to prepare",
    prepare: [
      "Your company tax number.",
      "A photo or PDF of the business registration certificate.",
      "Phone number and Zalo of the contact person.",
      "The category names you want to sell on Vexim.",
    ],
    prepareHint: "The documents must be in the name of the company you entered in step 1.",
    afterTitle: "Once the profile is approved",
    afterHint: "Approval does not mean factory verification, and your documents are not made public.",
    timingTitle: "Review time and support",
    timing: "Profiles are reviewed in the order they arrive, usually within a few working days.",
    timingEmail: "The result goes to the sign-in email.",
    hotline: "Hotline:",
    email: "Email:",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type OnboardingMessages = DeepStrings<typeof en>;

const vi: OnboardingMessages = {
  steps: ["Thông tin doanh nghiệp", "Giấy tờ bước đầu", "Hiển thị cho người mua & gửi hồ sơ"],
  progressSteps: ["Thông tin doanh nghiệp", "Giấy tờ", "Gửi duyệt"],
  unlock: [
    "Đăng sản phẩm và ảnh lên gian hàng của bạn.",
    "Nhận RFQ từ người mua và gửi báo giá.",
    "Trang doanh nghiệp công khai, có huy hiệu đã kiểm.",
    "Tải chứng nhận chất lượng cho hồ sơ.",
  ],
  docs: {
    business_license: "Giấy chứng nhận đăng ký kinh doanh",
    food_safety: "Giấy ATTP",
    haccp_or_brc: "HACCP / ISO / FSSC / Halal",
    product_certs: "Chứng chỉ sản phẩm (nếu có)",
    export_license: "Giấy phép xuất khẩu (nếu áp dụng)",
  },
  fileHint: "PDF, JPG, PNG hoặc WEBP, tối đa 15 MB",
  company: {
    title: "Thông tin doanh nghiệp",
    intro: "Khai đúng như trên giấy tờ.",
    introLocked: "Loại hình đã gửi không tự sửa tại đây.",
    introOpen:
      "Chọn loại hình để hồ sơ được xếp đúng nhóm doanh nghiệp; lựa chọn này không mở thêm quyền truy cập nào.",
    labels: {
      name: "Tên pháp lý doanh nghiệp *",
      tradeName: "Tên thương mại (nếu có)",
      supplierType: "Loại hình nhà cung cấp *",
      products: "Mặt hàng chính *",
      taxNumber: "Mã số thuế (chỉ nhập số) *",
      bankAccount: "Số tài khoản ngân hàng",
      province: "Tỉnh / thành",
      address: "Địa chỉ",
    },
    placeholders: {
      name: "vd: Công ty TNHH Gạch Sài Gòn",
      tradeName: "vd: Gạch Sài Gòn",
      products: "vd: Hạt điều W320, hồ tiêu đen",
      taxNumber: "vd: 0103884103",
      bankAccount: "vd: 0123456789",
      province: "vd: Hà Nội",
      address: "vd: 25/6 Ngõ 51 Ngoạ Long, Tây Tựu",
    },
    typeUnset: "Chưa khai",
    typeLockedHint: "Nếu sai hoặc chưa khai, liên hệ nhân viên để kiểm tra và cập nhật.",
    typeSelectPlaceholder: "Chọn nhà máy / thương nhân / hợp tác xã",
  },
  contact: {
    title: "Người liên hệ",
    intro:
      "Vexim gọi cho người này khi cần đối chiếu hồ sơ. Người mua chỉ thấy thông tin liên hệ sau khi hồ sơ được công khai.",
    labels: {
      contactName: "Người liên hệ *",
      phone: "Điện thoại *",
      email: "Email đăng nhập",
    },
    placeholders: { contactName: "vd: Nguyễn Văn An", phone: "vd: 0987 654 321" },
    emailHint: "Kết quả duyệt và mọi thông báo gửi về email này.",
  },
  documents: {
    title: "Giấy tờ bước đầu · Kiểm tra giấy tờ",
    intro: [
      "Chỉ cần Giấy chứng nhận đăng ký kinh doanh.",
      "Giấy phải đứng tên doanh nghiệp bạn khai ở bước 1; giấy đứng tên đơn vị khác không tính.",
      "Chứng nhận chất lượng (HACCP, ISO, BRC, Halal…) tải sau khi tài khoản được duyệt.",
      "Mỗi tệp tối đa 15 MB; tải lên không tự duyệt.",
    ],
    extraTitle: "Muốn được xác minh thêm?",
    extraIntro:
      "Chọn nếu bạn muốn được liên hệ để kiểm tra thêm. Mỗi đánh giá được xét riêng; gửi yêu cầu không tự cấp xác minh.",
    factoryTitle: "Xác thực nhà máy",
    partnerTitle: "Đối chiếu nhà máy đối tác",
    factoryHint:
      "Bạn sẽ được liên hệ để kiểm tra và tải bằng chứng theo đợt; gửi yêu cầu không tự duyệt.",
    partnerHint: "Cần hợp đồng với nhà máy đối tác; ảnh là tùy chọn. Nhân viên sẽ đối chiếu, không tự duyệt.",
    exportTitle: "Lịch sử giao hàng",
    exportHint:
      "Bạn sẽ được liên hệ để kiểm tra và tải bằng chứng theo đợt; gửi yêu cầu không tự duyệt.",
  },
  publicPage: {
    title: "Thông tin hiển thị trên trang doanh nghiệp",
    intro: [
      "Các trường này dựng nên trang giới thiệu doanh nghiệp.",
      "Chỉ hiện công khai khi hồ sơ được xuất bản; sản phẩm và ảnh khai riêng sau khi được duyệt.",
      "Cứ nhập bằng tiếng Việt: MOQ, thị trường xuất khẩu và phần giới thiệu sẽ được dịch sang tiếng Anh.",
    ],
    labels: {
      displayName: "Tên hiển thị trên trang",
      website: "Website (https://...)",
      country: "Quốc gia",
      contactTitle: "Chức vụ người liên hệ",
      zalo: "Zalo",
      foundedYear: "Năm thành lập",
      employees: "Số nhân viên",
      capacity: "Công suất mỗi tháng",
      moq: "MOQ",
      leadTime: "Lead time (ngày)",
      markets: "Thị trường đã phục vụ",
      exportMarkets: "Thị trường xuất khẩu (ngăn cách bằng dấu phẩy)",
      ports: "Cảng xuất (ngăn cách bằng dấu phẩy)",
      incoterms: "Incoterms (ngăn cách bằng dấu phẩy)",
      paymentTerms: "Điều khoản thanh toán",
    },
    introLabel: "Giới thiệu",
    introPlaceholder: "Mô tả về điểm khác biệt của công ty hay sản phẩm của bạn.",
    privateLabel: "Nhận làm nhãn riêng / OEM",
  },
  commitments: {
    title: "Xác nhận trước khi gửi hồ sơ",
    termsBefore: "Tôi đồng ý với",
    termsLink: "Điều khoản sử dụng",
    termsAfter:
      "và cho phép dùng thông tin, tài liệu đã gửi để kiểm tra nội bộ. Tài khoản mở sau khi hồ sơ được chấp thuận.",
    accuracyBefore: "Tôi chịu trách nhiệm về tính trung thực của thông tin đã cung cấp.",
    accuracyAfter:
      "Thông tin gồm tên sản phẩm, giá và thời gian giao hàng; tôi cam kết thực hiện đúng.",
  },
  categories: {
    title: "Danh mục kinh doanh",
    intro: [
      "Chọn trong các danh mục đang mở.",
      "Sau khi tài khoản được duyệt, sản phẩm chỉ gắn trong phạm vi này và vẫn phải duyệt trước khi công khai.",
    ],
    none: "Chưa có danh mục nào đang mở. Liên hệ bộ phận hỗ trợ trước khi gửi hồ sơ.",
  },
  picker: {
    aria: "Chọn danh mục đang mở",
    atLimit: "Đã chọn đủ 5 danh mục",
    choose: "Chọn danh mục…",
    allChosen: "Đã chọn hết danh mục đang mở",
    remove: "Bỏ {slug}",
    counter: "Đã chọn {count}/5.",
    hint: "Chọn trong ô là danh mục được thêm ngay, bấm dấu × để bỏ.",
    note: "Chỉ chọn được danh mục đang mở; sản phẩm của bạn phải thuộc một trong các danh mục này.",
  },
  form: {
    header: "Hoàn thành hồ sơ doanh nghiệp",
    stepOf: "Bước {step}/3",
    stepOfTitle: "Bước {step}/3 · {title}",
    progressAria: "Bước {step} trên 3",
    back: "Quay lại",
    next: "Tiếp tục",
    submitting: "Đang nộp hồ sơ...",
    submit: "Gửi hồ sơ duyệt",
    errors: {
      requiredInStep: "Còn trường bắt buộc chưa điền hoặc chưa đúng định dạng ở bước này. Vui lòng kiểm tra lại.",
      noCategory: "Chọn ít nhất một danh mục kinh doanh ở ô phía trên.",
      noCategorySubmit: "Chọn ít nhất một danh mục kinh doanh trước khi gửi hồ sơ.",
      noCoreDoc: "Tải Giấy chứng nhận đăng ký kinh doanh của doanh nghiệp bạn.",
      consent: "Vui lòng tích ô đồng ý với Điều khoản sử dụng trước khi gửi hồ sơ.",
      accuracy:
        "Vui lòng tích ô chịu trách nhiệm về tính trung thực của tên, giá sản phẩm và thời gian giao hàng.",
      requiredInStepShort: "Còn trường bắt buộc chưa điền hoặc chưa đúng định dạng. Vui lòng kiểm tra lại bước này.",
      generic: "Không kết nối được máy chủ. Vui lòng thử lại.",
    },
    noNotification: "Email thông báo nội bộ có thể chưa gửi; hồ sơ vẫn nằm trong hàng chờ duyệt.",
  },
  aside: {
    aria: "Hướng dẫn hoàn thành hồ sơ",
    progressTitle: "Tiến trình hồ sơ",
    done: "Đã xong",
    current: "Đang điền",
    todo: "Chưa tới",
    clickDone: "Bấm vào bước đã xong để sửa lại.",
    prepareTitle: "Cần chuẩn bị gì",
    prepare: [
      "Mã số thuế của doanh nghiệp.",
      "Ảnh hoặc PDF Giấy chứng nhận đăng ký kinh doanh.",
      "Số điện thoại và Zalo của người liên hệ.",
      "Tên danh mục hàng bạn muốn bán trên Vexim.",
    ],
    prepareHint: "Giấy tờ phải đứng tên doanh nghiệp bạn khai ở bước 1.",
    afterTitle: "Sau khi hồ sơ được duyệt",
    afterHint: "Duyệt hồ sơ không đồng nghĩa xác thực nhà máy hay công khai giấy tờ.",
    timingTitle: "Thời gian duyệt và hỗ trợ",
    timing: "Hồ sơ được xem theo thứ tự gửi đến, thường trong vài ngày làm việc.",
    timingEmail: "Kết quả duyệt gửi về email đăng nhập.",
    hotline: "Hotline:",
    email: "Email:",
  },
};

export const onboardingMessages = { en, vi } as const;
