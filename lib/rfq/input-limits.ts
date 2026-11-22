/**
 * Độ dài tối đa của các ô form RFQ — dùng chung cho form (maxLength) và bước kiểm tra dữ liệu
 * trên máy chủ (lib/rfq/submit-input.ts), để người dùng thật không bao giờ gõ được một giá trị
 * mà máy chủ sẽ từ chối. Mức trần rộng rãi: chỉ nhằm chặn dữ liệu bất thường gửi thẳng vào
 * Server Action (giới hạn thân request là 4 MB), không nhằm gò người mua.
 */
export const RFQ_TEXT_MAX = 4_000;

export const RFQ_FIELD_LIMITS = {
  company: 200,
  contact_name: 160,
  email: 254,
  phone: 50,
  country: 100,
  website: 500,
  business_type: 100,
  grade: 200,
  destination_country: 100,
  destination_port: 200,
  packaging: 1_000,
  certifications: 1_000,
} as const;
