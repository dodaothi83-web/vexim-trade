/**
 * Từ điển cụm chat của cổng nhà cung cấp (mục Tin nhắn). `en` là bản gốc, `vi` là bản dịch.
 */
export const en = {
  metaTitle: "Messages",
  title: "Messages",
  sub: "Chat with buyers who ask about your products.",
  empty: "No messages yet",
  emptyHint: "When a buyer clicks Chat with supplier on one of your products, the conversation appears here.",
  pick: "Choose a conversation to read and reply.",
  placeholder: "Type your reply…",
  send: "Send",
  back: "Back to conversations",
  about: "Product",
  unread: "Unread",
  failed: "Message not sent. Please try again.",
  rateLimited: "You are sending too fast. Wait a few minutes and try again.",
  tooLong: "The message is too long (maximum 4,000 characters).",
  loadError: "Could not load this conversation. Reload the page to try again.",
  enterHint: "Enter to send, Shift + Enter for a new line.",
  notice: "Messages stay on Vexim. The buyer gets an email when you reply.",
};

export type ChatMessages = typeof en;

export const vi: ChatMessages = {
  metaTitle: "Tin nhắn",
  title: "Tin nhắn",
  sub: "Trao đổi với người mua hỏi về sản phẩm của bạn.",
  empty: "Chưa có tin nhắn",
  emptyHint: "Khi người mua bấm Chat with supplier trên sản phẩm của bạn, cuộc trò chuyện sẽ hiện ở đây.",
  pick: "Chọn một cuộc trò chuyện để đọc và trả lời.",
  placeholder: "Nhập câu trả lời…",
  send: "Gửi",
  back: "Quay lại danh sách",
  about: "Sản phẩm",
  unread: "Chưa đọc",
  failed: "Chưa gửi được tin. Hãy thử lại.",
  rateLimited: "Bạn đang gửi quá nhanh. Đợi vài phút rồi thử lại.",
  tooLong: "Tin nhắn quá dài (tối đa 4.000 ký tự).",
  loadError: "Chưa tải được cuộc trò chuyện. Tải lại trang để thử lại.",
  enterHint: "Enter để gửi, Shift + Enter để xuống dòng.",
  notice: "Tin nhắn được lưu trên Vexim. Người mua nhận email khi bạn trả lời.",
};

export const chatMessages = { en, vi } as const;
