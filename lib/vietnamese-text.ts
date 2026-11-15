/**
 * Nhận biết đoạn văn viết bằng tiếng Việt để chặn nó khỏi ô chỉ dành cho tiếng Anh.
 *
 * Cần ít nhất một chữ cái riêng của tiếng Việt (ă â đ ê ô ơ ư hoặc dấu thanh trên nguyên âm
 * không có trong tiếng Anh/Pháp) để không bắt nhầm "café", "résumé". Khi đã có, mọi từ có
 * dấu đều được đếm (cả à, á, ý…); coi là tiếng Việt khi có từ 2 từ có dấu và chúng chiếm từ
 * 30% số từ trở lên. Tên riêng trong câu tiếng Anh ("reviewed by Nguyễn Văn An",
 * "sourcing in Bình Phước") vẫn hợp lệ vì chiếm tỉ lệ nhỏ.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */
const VIETNAMESE_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịĩọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/i;
const ACCENTED = /[\u0300-\u036f]|đ/i;

export function looksVietnamese(text: string | null | undefined): boolean {
  const words = (text ?? "").normalize("NFC").split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length === 0 || !words.some((word) => VIETNAMESE_LETTER.test(word))) return false;
  const accented = words.filter((word) => ACCENTED.test(word.normalize("NFD"))).length;
  return accented >= 2 && accented / words.length >= 0.3;
}

/** Bỏ dấu tiếng Việt cho tên địa danh: "Long Bình Tân" -> "Long Binh Tan". */
export function stripVietnameseMarks(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
