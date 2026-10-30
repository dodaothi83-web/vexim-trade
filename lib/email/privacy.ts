import type { Buyer, Supplier, SupplierProduct } from "@/lib/types";

/**
 * Kiểm tra "rò rỉ" thông tin giữa hai chiều email.
 *
 * Quy tắc bảo mật của Vexim:
 *  - Email gửi BUYER không bao giờ chứa tên / email / điện thoại / giá của NCC.
 *  - Email gửi NCC mặc định ẩn danh buyer (chỉ nêu "khách hàng thị trường X").
 *
 * Ở đây chỉ KIỂM TRA và CẢNH BÁO (không chặn gửi) — người soạn tự quyết định.
 */

export interface SensitiveTerm {
  /** Nhãn hiển thị cho người dùng, ví dụ "Tên nhà cung cấp" */
  label: string;
  /** Chuỗi cần tìm trong nội dung email */
  value: string;
}

/** Bỏ dấu tiếng Việt để so khớp "Trần Văn Hùng" với "Tran Van Hung" */
export function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function normalizeForSearch(input: string): string {
  return stripDiacritics(input).toLowerCase().replace(/\s+/g, " ").trim();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/** Cụm từ ngắn (< 4 ký tự) rất dễ khớp nhầm nên bỏ qua khi dò. */
const MIN_TERM_LENGTH = 4;

export function findLeaks(text: string, terms: SensitiveTerm[]): SensitiveTerm[] {
  const haystack = normalizeForSearch(text);
  const haystackDigits = digitsOnly(text);
  const seen = new Set<string>();
  const found: SensitiveTerm[] = [];

  for (const term of terms) {
    const needle = normalizeForSearch(term.value ?? "");
    if (!needle || needle.length < MIN_TERM_LENGTH) continue;
    if (seen.has(needle)) continue;

    let hit = haystack.includes(needle);

    // Số điện thoại / mã số thuế thường được viết khác định dạng
    const termDigits = digitsOnly(term.value ?? "");
    if (!hit && termDigits.length >= 8) {
      hit = haystackDigits.includes(termDigits) || haystack.includes(termDigits);
    }

    if (hit) {
      seen.add(needle);
      found.push(term);
    }
  }

  return found;
}

const VIETNAMESE_CHARS =
  /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/gi;

/** Tỷ lệ ký tự đặc trưng tiếng Việt trên tổng số chữ cái (0 → 1) */
export function vietnameseRatio(text: string): number {
  const letters = text.replace(/[^A-Za-zÀ-ỹ]/g, "");
  if (letters.length < 20) return 0;
  const marks = text.match(VIETNAMESE_CHARS)?.length ?? 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return words < 5 ? 0 : marks / Math.max(letters.length, 1);
}

/** Các chuỗi của NCC không được xuất hiện trong email gửi buyer */
export function collectSupplierTerms(
  supplier: Pick<
    Supplier,
    "name" | "trade_name" | "contact_name" | "email" | "phone" | "tax_id"
  > | null,
  products: Pick<SupplierProduct, "name" | "ref_price" | "currency">[] = [],
): SensitiveTerm[] {
  if (!supplier) return [];
  const terms: SensitiveTerm[] = [
    { label: "Tên nhà cung cấp", value: supplier.name },
    { label: "Tên thương mại NCC", value: supplier.trade_name ?? "" },
    { label: "Người liên hệ NCC", value: supplier.contact_name ?? "" },
    { label: "Email NCC", value: supplier.email ?? "" },
    { label: "Điện thoại NCC", value: supplier.phone ?? "" },
    { label: "Mã số thuế NCC", value: supplier.tax_id ?? "" },
  ];

  for (const p of products) {
    if (p.ref_price === null || p.ref_price === undefined) continue;
    const currency = (p.currency ?? "USD").trim().toUpperCase();
    const amount = p.ref_price.toLocaleString("en-US", { maximumFractionDigits: 0 });
    const digits = String(Math.round(p.ref_price));
    terms.push({
      label: `Giá tham khảo của NCC (${p.name})`,
      value: `${currency} ${amount}`,
    });
    // Chỉ dò phần số khi đủ dài để tránh khớp nhầm với số lượng / năm
    if (digits.length >= 4) {
      terms.push({ label: `Giá tham khảo của NCC (${p.name})`, value: digits });
    }
  }

  return terms.filter((t) => (t.value ?? "").trim().length >= MIN_TERM_LENGTH);
}

/** Các chuỗi của buyer mặc định không gửi cho NCC */
export function collectBuyerTerms(
  buyer: Pick<Buyer, "company" | "contact_name" | "email" | "phone"> | null,
): SensitiveTerm[] {
  if (!buyer) return [];
  return [
    { label: "Tên buyer", value: buyer.company },
    { label: "Người liên hệ buyer", value: buyer.contact_name ?? "" },
    { label: "Email buyer", value: buyer.email ?? "" },
    { label: "Điện thoại buyer", value: buyer.phone ?? "" },
  ].filter((t) => (t.value ?? "").trim().length >= MIN_TERM_LENGTH);
}
