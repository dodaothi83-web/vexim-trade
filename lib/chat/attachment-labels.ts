/** Chữ trên giao diện tệp đính kèm chat (khung chat, CRM). Không đánh dấu "use client" để trang máy chủ dùng được. */

export interface ChatFileLabels {
  attach: string;
  hint: string;
  uploading: string;
  retry: string;
  remove: string;
  download: string;
  expired: string;
  waitUploads: string;
  attachmentGone: string;
  drop: string;
  errors: { type: string; size: string; count: string; quota: string; content: string; rate: string; failed: string };
}

export const CHAT_FILE_LABELS: Record<"en" | "vi", ChatFileLabels> = {
  en: {
    attach: "Attach files",
    hint: "PDF, images, Excel, Word or CSV. Up to 10 MB each, 5 files per message.",
    uploading: "Uploading",
    retry: "Try again",
    remove: "Remove file",
    download: "Download",
    expired: "File expired",
    waitUploads: "Wait until your files finish uploading.",
    attachmentGone: "A file is no longer available. Remove it and attach it again.",
    drop: "Drop files here to attach them",
    errors: {
      type: "This file type is not supported. Send PDF, images, Excel, Word or CSV.",
      size: "This file is larger than 10 MB.",
      count: "You can send up to 5 files in one message.",
      quota: "Your file storage is full. Contact Vexim to get more space.",
      content: "This file looks damaged or is not the type its name says.",
      rate: "You sent many files in the last hour. Try again later.",
      failed: "Upload failed.",
    },
  },
  vi: {
    attach: "Đính kèm tệp",
    hint: "PDF, ảnh, Excel, Word hoặc CSV. Tối đa 10 MB mỗi tệp, 5 tệp mỗi tin.",
    uploading: "Đang tải lên",
    retry: "Thử lại",
    remove: "Bỏ tệp",
    download: "Tải về",
    expired: "Tệp đã hết hạn",
    waitUploads: "Đợi tệp tải lên xong rồi gửi.",
    attachmentGone: "Có tệp không còn dùng được. Hãy bỏ tệp đó và đính kèm lại.",
    drop: "Thả tệp vào đây để đính kèm",
    errors: {
      type: "Loại tệp này chưa được hỗ trợ. Hãy gửi PDF, ảnh, Excel, Word hoặc CSV.",
      size: "Tệp lớn hơn 10 MB.",
      count: "Mỗi tin gửi tối đa 5 tệp.",
      quota: "Tài khoản đã dùng hết dung lượng tệp. Hãy liên hệ Vexim để thêm dung lượng.",
      content: "Tệp có vẻ bị lỗi hoặc không đúng loại như tên tệp.",
      rate: "Bạn đã gửi nhiều tệp trong một giờ. Hãy thử lại sau.",
      failed: "Chưa tải lên được.",
    },
  },
};

export function chatFileLabels(locale: string): ChatFileLabels {
  return CHAT_FILE_LABELS[locale.startsWith("vi") ? "vi" : "en"];
}
