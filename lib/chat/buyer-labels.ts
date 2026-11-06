import type { ChatLabels } from "@/components/chat/chat-workspace";

/** Nhãn khung chat phía người mua: dùng ở trang Tin nhắn và cửa sổ chat trên trang sản phẩm. */
export const BUYER_CHAT_LABELS: Record<"en" | "vi", ChatLabels> = {
  en: {
    title: "Messages", empty: "No messages yet",
    emptyHint: "Click Ask supplier on any product page to start a conversation with the supplier.",
    pick: "Choose a conversation to read and reply.", placeholder: "Type your message…", send: "Send",
    back: "Back to conversations", about: "About:", unread: "Unread",
    failed: "Message not sent. Please try again.", rateLimited: "You are sending too fast. Wait a few minutes and try again.",
    tooLong: "The message is too long (maximum 4,000 characters).", loadError: "Could not load this conversation. Reload the page to try again.",
    enterHint: "Enter to send, Shift + Enter for a new line.",
    notice: "Your email address is not shared with the supplier. You get an email when they reply.",
    attached: "Asking about", removeAttached: "Remove product", quickTitle: "Start with a common question",
    newConversation: "New conversation", productUnavailable: "This product cannot receive messages right now.",
  },
  vi: {
    title: "Tin nhắn", empty: "Chưa có tin nhắn",
    emptyHint: "Bấm Ask supplier trên trang sản phẩm để bắt đầu trò chuyện với nhà cung cấp.",
    pick: "Chọn một cuộc trò chuyện để đọc và trả lời.", placeholder: "Nhập tin nhắn…", send: "Gửi",
    back: "Quay lại danh sách", about: "Về:", unread: "Chưa đọc",
    failed: "Chưa gửi được tin. Hãy thử lại.", rateLimited: "Bạn đang gửi quá nhanh. Đợi vài phút rồi thử lại.",
    tooLong: "Tin nhắn quá dài (tối đa 4.000 ký tự).", loadError: "Chưa tải được cuộc trò chuyện. Tải lại trang để thử lại.",
    enterHint: "Enter để gửi, Shift + Enter để xuống dòng.",
    notice: "Email của bạn không được chia sẻ cho nhà cung cấp. Bạn nhận email khi họ trả lời.",
    attached: "Đang hỏi về", removeAttached: "Bỏ sản phẩm", quickTitle: "Bắt đầu bằng câu hỏi hay gặp",
    newConversation: "Cuộc trò chuyện mới", productUnavailable: "Sản phẩm này hiện chưa nhận tin nhắn.",
  },
};
