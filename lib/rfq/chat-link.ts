/**
 * Đường dẫn mở Tin nhắn với một nhà cung cấp từ một RFQ: đã có cuộc trò chuyện thì mở lại đúng
 * cuộc đó, chưa có thì mở cuộc mới (chỉ tạo khi gửi tin đầu). Mã RFQ chỉ để điền sẵn câu mở đầu.
 */
export function buyerRfqChatHref(supplierId: string, rfqCode?: string | null): string {
  const rfq = rfqCode && RFQ_CODE.test(rfqCode) ? `&rfq=${rfqCode}` : "";
  return `/buyer/account/messages?supplier=${encodeURIComponent(supplierId)}${rfq}`;
}

/** Mã RFQ dạng RFQ-20261122-00001: chỉ nhận đúng dạng này từ đường dẫn. */
export const RFQ_CODE = /^RFQ-\d{8}-\d{3,6}$/;
