/**
 * Nhận biết đoạn văn viết bằng tiếng Việt để chặn nó khỏi ô chỉ dành cho tiếng Anh.
 *
 * Chỉ dựa vào chữ cái riêng của tiếng Việt (ă â đ ê ô ơ ư và các dấu thanh trên nguyên
 * âm), không bắt é/è/à hay gặp trong tiếng Anh/Pháp. Một tên riêng tiếng Việt trong câu
 * tiếng Anh (ví dụ "reviewed by Nguyễn Văn An") vẫn hợp lệ: chỉ coi là tiếng Việt khi
 * có ít nhất 2 từ mang dấu và chúng chiếm từ 30% số từ trở lên.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */
const VIETNAMESE_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịĩọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/i;

export function looksVietnamese(text: string | null | undefined): boolean {
  const words = (text ?? "").normalize("NFC").split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length === 0) return false;
  const marked = words.filter((word) => VIETNAMESE_LETTER.test(word)).length;
  return marked >= 2 && marked / words.length >= 0.3;
}

/** Bỏ dấu tiếng Việt cho tên địa danh: "Long Bình Tân" -> "Long Binh Tan". */
export function stripVietnameseMarks(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
