/**
 * Chuẩn hoá câu hỏi thường gặp của danh mục trước khi render.
 *
 * Tách khỏi trang để kiểm thử được bằng Node. Đây là chỗ đã có lỗi thật: một câu
 * trong database ghi "a shortlist of 2 to 4 matching suppliers" bị hai quy tắc
 * thay thế chồng nhau, cho ra "a shortlist of matching suppliers matching
 * suppliers" trên trang công khai.
 *
 * Cách sửa: chỉ còn một quy tắc, và nó phải ăn luôn cả chữ "matching" phía sau
 * con số. Không còn quy tắc nào thay một con số trần, vì "2 to 4 weeks" là thời
 * gian giao hàng, không phải số nhà cung cấp, và thay nó sẽ làm hỏng câu.
 */

export const STANDARD_CATEGORY_FAQS = [
  {
    q: "Can I request a quote from a specific supplier?",
    a: "Yes. Your request goes to that supplier first. If they cannot meet it, Vexim will ask you before suggesting anyone else.",
  },
  {
    q: "How does Vexim match suppliers for an open request?",
    a: "Suppliers are matched on your requirements only, including your specs, quantity and market. Paid listings never affect who Vexim recommends.",
  },
  {
    q: "How are supplier certificates verified on Vexim Trade?",
    a: "When suppliers upload quality certificates (HACCP, ISO 22000, BRC, Halal, FDA, Organic), Vexim's automated recognition scans the certified holder name and expiration date, labeling each certificate as Owner or Partner Entity.",
  },
] as const;

const SUPPLIER_COUNT = /\b2\s*(?:to|–|-|—)\s*4\s+(?:matching\s+)?(?:supplier\s+options|supplier\s+quotes|suppliers|options|quotes)\b/gi;

/** Bỏ cụm "2 to 4 suppliers" đã lỗi thời và gộp khoảng trắng thừa. */
export function normalizeCategoryFaqText(text: string): string {
  return text.replace(SUPPLIER_COUNT, "matching suppliers").replace(/\s+/g, " ").trim();
}

/**
 * Đọc `faq_i18n` từ database và bổ sung hai câu chuẩn nếu danh mục chưa có.
 * Chỉ thêm khi thiếu, để nội dung biên tập không bị nhân đôi.
 */
export function categoryFaqs(raw: unknown): Array<{ q: string; a: string }> {
  const faqs = Array.isArray(raw)
    ? raw
        .map((f) => {
          const item = (f ?? {}) as { q?: unknown; a?: unknown; question?: unknown; answer?: unknown };
          return {
            q: normalizeCategoryFaqText(typeof item.q === "string" ? item.q : typeof item.question === "string" ? item.question : ""),
            a: normalizeCategoryFaqText(typeof item.a === "string" ? item.a : typeof item.answer === "string" ? item.answer : ""),
          };
        })
        .filter((f) => f.q && f.a)
    : [];

  if (faqs.length === 0) return faqs;

  const hasSpecificSupplierFaq = faqs.some((f) =>
    /specific supplier|supplier you choose|goes to (?:that|this) supplier first/i.test(`${f.q} ${f.a}`),
  );
  const hasMatchingBasisFaq = faqs.some((f) => /paid listings|matched on your requirements/i.test(`${f.q} ${f.a}`));

  return [
    ...faqs,
    ...(!hasSpecificSupplierFaq ? [STANDARD_CATEGORY_FAQS[0]] : []),
    ...(!hasMatchingBasisFaq ? [STANDARD_CATEGORY_FAQS[1]] : []),
  ];
}
