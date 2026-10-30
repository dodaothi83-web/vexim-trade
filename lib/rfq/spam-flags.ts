export interface SpamFlagDetail {
  label: string;
  description: string;
}

const SPAM_FLAG_DETAILS: Record<string, SpamFlagDetail> = {
  honeypot_filled: {
    label: "Biểu mẫu có dấu hiệu tự động",
    description: "Trường ẩn chống spam đã bị điền. Dấu hiệu này thường gặp khi bot gửi biểu mẫu.",
  },
  challenge_missing: {
    label: "Chưa xác minh được bước bảo mật",
    description: "Hệ thống chưa xác nhận được bước kiểm tra người dùng (challenge chống bot) khi yêu cầu được gửi.",
  },
  webmail_domain: {
    label: "Dùng email miễn phí",
    description: "Buyer dùng Gmail, Yahoo, Outlook hoặc dịch vụ tương tự thay vì email tên miền công ty. Đây không phải bằng chứng spam.",
  },
  missing_company: {
    label: "Thiếu tên công ty",
    description: "Tên công ty bị bỏ trống hoặc quá ngắn. Cần đối chiếu danh tính doanh nghiệp.",
  },
  invalid_phone: {
    label: "Số điện thoại cần kiểm tra",
    description: "Buyer chưa nhập số điện thoại, hoặc số nhập vào có ít hơn 7 chữ số. Nên đối chiếu trước khi liên hệ.",
  },
  too_short: {
    label: "Nội dung yêu cầu quá ngắn",
    description: "Thông tin sản phẩm và nhu cầu còn quá ít để đánh giá. Cần đọc kỹ hoặc yêu cầu buyer bổ sung.",
  },
  contains_link: {
    label: "Nội dung có liên kết",
    description: "Yêu cầu chứa đường dẫn. Cần kiểm tra đích liên kết trước khi mở hoặc chuyển cho NCC.",
  },
  spam_keyword: {
    label: "Có từ khóa thường gặp trong spam",
    description: "Nội dung chứa từ khóa quảng cáo hoặc lừa đảo trong danh sách kiểm tra tự động.",
  },
  missing_name: {
    label: "Thiếu tên người liên hệ",
    description: "Tên người liên hệ bị bỏ trống hoặc quá ngắn. Cần đối chiếu thông tin buyer.",
  },
  rate_limit_not_configured: {
    label: "Chưa cấu hình giới hạn lượt gửi",
    description: "Cấu hình chống gửi lặp chưa sẵn sàng nên yêu cầu cần được xem xét thủ công.",
  },
  rate_limit_unavailable: {
    label: "Không kiểm tra được giới hạn lượt gửi",
    description: "Dịch vụ chống gửi lặp tạm thởi không khả dụng nên yêu cầu cần được xem xét thủ công.",
  },
};

export function spamFlagDetail(flag: string): SpamFlagDetail {
  return SPAM_FLAG_DETAILS[flag] ?? {
    label: "Dấu hiệu khác",
    description: `Hệ thống ghi nhận mã ${flag}. Hãy kiểm tra yêu cầu thủ công.`,
  };
}
