/**
 * Sanitizer rất nhỏ cho body category (admin-entered HTML, không markdown).
 * Chỉ cho phép thẻ: p, h2-h4, ul, ol, li, a[href,rel,target], strong, em, br.
 * Tự loại bỏ <script>, on* handlers, href="javascript:", style, class, id, v.v.
 */
const ALLOWED_TAGS = new Set([
  "p", "h2", "h3", "h4", "ul", "ol", "li", "a", "strong", "em", "br", "b", "i",
  "blockquote",
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel", "title"]),
};
const BLOCK_TAGS = new Set(["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote"]);

export function sanitizeHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  if (typeof DOMParser !== "undefined") return sanitizeBrowser(raw);
  // Server (Node không có DOMParser) — dùng regex rất hẹp.
  return sanitizeServer(raw);
}

function sanitizeBrowser(raw: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__root">${raw}</div>`, "text/html");
  const root = doc.getElementById("__root");
  if (!root) return "";
  walk(root);
  return root.innerHTML;
}

function walk(node: Node) {
  const remove: Node[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === 1 /* Element */) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Thay thẻ không hợp lệ bằng nội dung (textContent) nhưng không xoá con.
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
        remove.push(child);
        return;
      }
      // Lọc thuộc tính
      const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
      const toRemove: string[] = [];
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "style" || name === "class" || name === "id") {
          toRemove.push(attr.name); continue;
        }
        if (!allowed.has(name)) { toRemove.push(attr.name); continue; }
        if (name === "href") {
          const v = attr.value.trim().toLowerCase();
          if (v.startsWith("javascript:") || v.startsWith("data:")) toRemove.push(attr.name);
        }
        if (name === "target" && attr.value === "_blank") {
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      toRemove.forEach((n) => el.removeAttribute(n));
      if (tag === "a" && !el.getAttribute("href")) {
        el.removeAttribute("href");
      }
      walk(el);
    } else if (child.nodeType === 8 /* comment */) {
      remove.push(child);
    }
  });
  remove.forEach((n) => n.parentNode?.removeChild(n));
}

function sanitizeServer(raw: string): string {
  // Bước 1: loại <script>...</script>, <!-- -->, <style>
  let out = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // loại bỏ on*="..."
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "")
    // href=javascript: / data:
    .replace(/\s+href\s*=\s*["']\s*(javascript|data):[^"']*["']/gi, "");
  // Bước 2: loại thẻ không trong whitelist, nhưng giữ nội dung bên trong.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    const t = String(tag).toLowerCase();
    if (ALLOWED_TAGS.has(t)) return match;
    return "";
  });
  // Bước 3: đóng thẻ block cuối cùng nếu bị lở — chỉ phòng trường hợp, không cố sửa sâu.
  for (const t of BLOCK_TAGS) {
    const open = (out.match(new RegExp(`<${t}\\b`, "gi")) ?? []).length;
    const close = (out.match(new RegExp(`</${t}>`, "gi")) ?? []).length;
    for (let i = 0; i < open - close; i++) out += `</${t}>`;
  }
  return out;
}
