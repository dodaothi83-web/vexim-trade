import sanitizeHtmlLib from "sanitize-html";

/**
 * Sanitize body HTML do admin nhập vào (category/blog).
 * Dùng thư viện sanitize-html đã được kiểm chứng rộng rãi, thay cho regex tự viết.
 *
 * Whitelist: p, h2-h4, ul, ol, li, blockquote, a[href,target,rel,title], strong, b, em, i, br.
 * - Chặn <script>/<style>/<iframe>/<form>/<svg>/<object>/<embed>.
 * - Bỏ mọi thuộc tính trừ href/target/rel/title trên thẻ <a>; tự động set rel=noopener noreferrer
 *   cho link target=_blank; chặn href=javascript:/data:; class/id/style luôn bị loại.
 * - Giữ text content của thẻ bị loại (không xoá chữ).
 */
const ALLOWED_TAGS = [
  "p", "h2", "h3", "h4",
  "ul", "ol", "li", "blockquote",
  "a", "strong", "b", "em", "i", "br",
];

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "target", "rel", "title"],
};

export function sanitizeHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return sanitizeHtmlLib(String(raw), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = (attribs.href || "").trim();
        const target = (attribs.target || "").toLowerCase();
        const rel = (attribs.rel || "").toLowerCase();
        const outAttribs: Record<string, string> = {};
        if (href) outAttribs.href = href;
        if (target === "_blank") {
          outAttribs.target = "_blank";
          if (!/noopener/.test(rel) || !/noreferrer/.test(rel)) {
            outAttribs.rel = Array.from(new Set([...rel.split(/\s+/), "noopener", "noreferrer"])).filter(Boolean).join(" ");
          } else if (rel) {
            outAttribs.rel = rel;
          }
        } else if (rel) {
          outAttribs.rel = rel;
        }
        if (attribs.title) outAttribs.title = attribs.title;
        return { tagName, attribs: outAttribs };
      },
    },
    disallowedTagsMode: "discard", // giữ text content của thẻ bị loại
    nonBooleanAttributes: ["href", "target", "rel", "title", "cite", "alt"],
  });
}
