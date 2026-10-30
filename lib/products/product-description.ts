import sanitizeHtmlLib from "sanitize-html";

import {
  normalizeProductDescriptionSource,
  PRODUCT_DESCRIPTION_ALLOWED_TAGS,
} from "./product-description-format";

/**
 * The only HTML vocabulary accepted for buyer-facing product descriptions.
 * No attributes, links, images, tables, classes or inline styles are retained.
 */
export function sanitizeProductDescriptionHtml(raw: string | null | undefined): string {
  const normalized = normalizeProductDescriptionSource(raw);
  if (!normalized) return "";
  return sanitizeHtmlLib(normalized, {
    allowedTags: [...PRODUCT_DESCRIPTION_ALLOWED_TAGS, "b", "i"],
    allowedAttributes: {},
    allowedSchemes: [],
    allowProtocolRelative: false,
    transformTags: {
      b: "strong",
      i: "em",
    },
    disallowedTagsMode: "discard",
  }).trim();
}

/** Readable text used for length checks without ever slicing through an HTML tag. */
export function productDescriptionPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h2|h3|li)>/gi, "\n");
  return sanitizeHtmlLib(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  }).replace(/[\t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/**
 * Canonicalize content at every write boundary. Existing plain text becomes
 * paragraphs; rich content is reduced to the same safe vocabulary.
 */
export function sanitizeProductDescriptionForSave(
  raw: unknown,
  { maxTextLength = 6000, maxHtmlLength = 24000 }: { maxTextLength?: number; maxHtmlLength?: number } = {},
): string {
  const html = sanitizeProductDescriptionHtml(typeof raw === "string" ? raw : "");
  if (!html) return "";
  const plainText = productDescriptionPlainText(html);
  if (!plainText) return "";
  if (plainText.length > maxTextLength) {
    throw new Error(`Mô tả chi tiết không được vượt quá ${maxTextLength.toLocaleString("vi-VN")} ký tự, không tính phần định dạng.`);
  }
  if (html.length > maxHtmlLength) {
    throw new Error("Mô tả chi tiết có quá nhiều định dạng. Hãy bớt định dạng hoặc chia nội dung thành phần ngắn hơn.");
  }
  return html;
}
