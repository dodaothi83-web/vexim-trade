import type { ChatSender } from "@/lib/types";

/** Ngôn ngữ đọc của mỗi bên: nhà cung cấp đọc tiếng Việt, người mua đọc tiếng Anh. */
export function viewerLanguage(side: ChatSender): "vi" | "en" {
  return side === "supplier" ? "vi" : "en";
}

const VI_MARKS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

/**
 * Đoán ngôn ngữ tin: có dấu tiếng Việt là "vi", còn chữ cái khác là "other" (thường là tiếng Anh).
 * Tin không có chữ (chỉ số, biểu tượng, link) hoặc quá ngắn thì không dịch.
 */
export function detectChatLanguage(body: string): "vi" | "other" | null {
  const text = body.replace(/https?:\/\/\S+|\S+@\S+/g, " ");
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 3) return null;
  return VI_MARKS.test(text) ? "vi" : "other";
}

/** Dịch sang ngôn ngữ của bên nhận; tin đã đúng ngôn ngữ bên nhận thì không cần dịch. */
export function translationTargetFor(sender: ChatSender, lang: "vi" | "other"): "vi" | "en" | null {
  const target = viewerLanguage(sender === "buyer" ? "supplier" : "buyer");
  if (target === "vi" && lang === "vi") return null;
  if (target === "en" && lang === "other") return null;
  return target;
}

/** Nội dung hiện cho người xem: tin của bên kia có bản dịch đúng ngôn ngữ người xem thì hiện bản dịch. */
export function messageTextFor<T extends { sender: ChatSender; body: string; translation?: string | null; translation_lang?: string | null }>(
  message: T, side: ChatSender,
): { body: string; original: string | null } {
  if (message.sender !== side && message.translation && message.translation_lang === viewerLanguage(side))
    return { body: message.translation, original: message.body };
  return { body: message.body, original: null };
}
