import "server-only";

import { isIP } from "node:net";

/**
 * Đọc CHÍNH WEBSITE của buyer để lấy bằng chứng trước khi viết thư chào.
 *
 * Vì sao cần thêm bước này: tra web qua OpenAI chỉ cho ra "công ty đó làm gì", còn bên mình
 * cần biết họ ĐANG BÁN MÓN GÌ VÀ BÁN Ở DẠNG NÀO (gói thành phẩm có nhãn hay nông sản tươi/
 * chưa chín) — thứ chỉ nhìn thấy rõ khi đọc danh mục và ẢNH sản phẩm trên site của họ.
 *
 * An toàn: chỉ lấy URL http(s) công khai, chặn dải IP nội bộ, tự đi qua từng bước redirect
 * (không để fetch âm thầm nhảy vào 169.254/127.0.0.1), giới hạn dung lượng & số ảnh, timeout
 * 8 giây/1 request. Đọc lỗi thì trả null — thư vẫn dựng được, chỉ để placeholder.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 400_000;
const MAX_IMAGE_BYTES = 900_000;
const MAX_IMAGES = 4;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type SiteSignals = {
  url: string;
  title: string | null;
  description: string | null;
  headings: string[];
  navLabels: string[];
  /** Tên sản phẩm khai báo bằng schema.org/Product — bằng chứng mạnh nhất */
  productNames: string[];
  /** Ảnh sản phẩm đã tải được (base64) để model NHÌN, không chỉ đoán qua alt text */
  images: { mediaType: string; base64: string; alt: string | null }[];
  imageAlts: string[];
  error: string | null;
};

const EMPTY: SiteSignals = {
  url: "",
  title: null,
  description: null,
  headings: [],
  navLabels: [],
  productNames: [],
  images: [],
  imageAlts: [],
  error: null,
};

function privateV4(host: string): boolean {
  const parts = host.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateAddress(host: string): boolean {
  const value = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!isIP(value)) return false;
  if (isIP(value) === 4) return privateV4(value);
  if (value === "::1" || value === "::") return true;
  const mapped = value.match(/::ffff:([\d.]+)$/);
  if (mapped) return privateV4(mapped[1]);
  return /^(fc|fd|fe80|::)/.test(value);
}

/** http(s), không port lạ, không user:pass, không host nội bộ */
export function publicHttpUrl(raw: string | null | undefined): URL | null {
  const value = (raw ?? "").trim();
  if (!value || value.length > 300) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  if (url.username || url.password) return null;
  if (url.port && !["80", "443"].includes(url.port)) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test")) return null;
  if (privateAddress(host)) return null;
  return url;
}

async function get(url: URL, accept: string, maxBytes: number): Promise<{ buffer: Buffer; type: string; url: string } | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "VeximTradeOutreach/1.0 (email research)", Accept: accept },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    // Tự lần redirect để không nhảy vào địa chỉ nội bộ ở bước nhảy thứ 2 trở đi
    let current = response;
    let hops = 0;
    while ([301, 302, 303, 307, 308].includes(current.status) && hops < 3) {
      const location = current.headers.get("location");
      if (!location) return null;
      const next = publicHttpUrl(new URL(location, current.url ?? url.href).href);
      if (!next) return null;
      hops += 1;
      current = await fetch(next, {
        headers: { "User-Agent": "VeximTradeOutreach/1.0 (email research)", Accept: accept },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
    }
    if (!current.ok) return null;
    const type = (current.headers.get("content-type") ?? "").toLowerCase();
    const buffer = Buffer.from(await current.arrayBuffer());
    const finalUrl = current.url || url.href;
    if (buffer.byteLength > maxBytes) return { buffer: buffer.subarray(0, maxBytes) as unknown as Buffer, type, url: finalUrl };
    return { buffer, type, url: finalUrl };
  } catch {
    return null;
  }
}

function decode(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } catch {
    return "";
  }
}

function text(value: string | null | undefined, max = 120): string {
  return (value ?? "")
    .replace(/<[^>]{1,400}>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function pushUnique(list: string[], value: string, cap: number): string[] {
  const key = value.toLowerCase();
  if (!value || list.some((item) => item.toLowerCase() === key)) return list;
  if (list.length >= cap) return list;
  list.push(value);
  return list;
}

/** Bới HTML thô: không thêm dependency parse HTML chỉ cho một lần đọc site khách */
function parseHtml(html: string, baseUrl: URL): { signals: SiteSignals; candidates: { url: URL; alt: string | null }[] } {
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const out: SiteSignals = { ...EMPTY, url: baseUrl.href, images: [], productNames: [], headings: [], navLabels: [], imageAlts: [] };

  out.title = text(/<title[^>]*>([\s\S]{1,400}?)<\/title>/i.exec(stripped)?.[1], 160) || null;
  const meta = (name: string) =>
    new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']{1,400})["']`, "i").exec(stripped)?.[1] ??
    new RegExp(`<meta[^>]+content=["']([^"']{1,400})["'][^>]*(?:property|name)=["']${name}["']`, "i").exec(stripped)?.[1];
  out.description = text(meta("og:description") ?? meta("description"), 300) || null;

  for (const match of stripped.matchAll(/<h[12][^>]*>([\s\S]{1,300}?)<\/h[12]>/gi)) {
    const value = text(match[1], 140);
    if (value) pushUnique(out.headings, value, 12);
  }
  for (const match of stripped.matchAll(/<nav[\s\S]{0,4000}?<\/nav>/gi)) {
    for (const link of match[0].matchAll(/<a[^>]*>([\s\S]{1,120}?)<\/a>/gi)) {
      const value = text(link[1], 60);
      if (value && value.split(" ").length <= 6) pushUnique(out.navLabels, value, 12);
    }
  }

  // schema.org Product (JSON-LD) — tên hàng khai báo rõ ràng nhất.
  // Đọc từ HTML gốc: `stripped` đã bị bỏ hết <script> nên không còn JSON-LD ở đó.
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]{1,20000}?)<\/script>/gi)) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      const payload = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ")) as unknown;
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        const entry = node as Record<string, unknown>;
        const type = entry["@type"];
        const typeName = Array.isArray(type) ? type.join(" ") : String(type ?? "");
        if (/product/i.test(typeName)) {
          const name = typeof entry.name === "string" ? text(entry.name, 90) : "";
          if (name) pushUnique(out.productNames, name, 8);
        }
        Object.values(entry).forEach(walk);
      };
      walk(payload);
    } catch {
      // JSON-LD hỏng thì bỏ qua, còn tín hiệu khác vẫn dùng được
    }
  }

  const absolute = (src: string | null | undefined) => {
    const value = (src ?? "").trim();
    if (!value || value.startsWith("data:") || value.startsWith("svg")) return null;
    try {
      return new URL(value, baseUrl);
    } catch {
      return null;
    }
  };

  const candidates: { url: URL; alt: string | null }[] = [];
  const og = text(meta("og:image"), 400);
  if (og) {
    const url = absolute(og.replace(/\\"/g, ""));
    if (url) candidates.push({ url, alt: out.title });
  }
  for (const match of stripped.matchAll(/<img\b[^>]{1,900}>/gi)) {
    const tag = match[0];
    const src = absolute(/(?:data-src|data-srcset|src)=["']([^"']{1,400})["']/i.exec(tag)?.[1]?.split(" ")[0]);
    if (!src) continue;
    const alt = text(/alt=["']([^"']{1,240})["']/i.exec(tag)?.[1], 160);
    // Bỏ logo/icon/ảnh trang trí: ảnh sản phẩm mới cho biết hàng thành phẩm hay còn tươi
    if (/(?:logo|icon|sprite|avatar|banner|bg-|background|placeholder|1x1|pixel)/i.test(src.pathname)) continue;
    pushUnique(out.imageAlts, alt ?? "", 12);
    if (alt) candidates.push({ url: src, alt: alt || null });
  }
  return { signals: out, candidates: candidates.slice(0, MAX_IMAGES) };
}

/** Tải ảnh để model nhìn trực tiếp (nhiều site chặn hotlink nên phải tự tải) */
async function loadImages(candidates: { url: URL; alt: string | null }[]): Promise<SiteSignals["images"]> {
  const images: SiteSignals["images"] = [];
  for (const candidate of candidates) {
    if (images.length >= MAX_IMAGES) break;
    const fetched = await get(candidate.url, "image/avif,image/webp,image/png,image/jpeg,*/*", MAX_IMAGE_BYTES);
    if (!fetched) continue;
    const type = fetched.type.split(";")[0];
    if (!ALLOWED_IMAGE_TYPES.has(type)) continue;
    if (fetched.buffer.byteLength < 4_000) continue; // ảnh 1x1, placeholder
    images.push({ mediaType: type, base64: fetched.buffer.toString("base64"), alt: candidate.alt });
  }
  return images;
}

/**
 * Một lần đọc trang chủ. Không crawler đầy đủ: đủ tên mục, tên sản phẩm khai báo,
 * vài ảnh để model trả lời "họ bán thành phẩm hay nông sản tươi".
 */
export async function readSiteSignals(website: string | null | undefined): Promise<SiteSignals> {
  const url = publicHttpUrl(website);
  if (!url) return { ...EMPTY, error: website ? "website trong hồ sơ không hợp lệ" : "hồ sơ chưa có website" };
  const page = await get(url, "text/html,application/xhtml+xml", MAX_HTML_BYTES);
  if (!page) return { ...EMPTY, url: url.href, error: "không truy cập được website" };
  if (!/html|\*\/\*/.test(page.type)) return { ...EMPTY, url: url.href, error: "trang về không phải html" };

  const parsed = parseHtml(decode(page.buffer), url);
  parsed.signals.images = await loadImages(parsed.candidates);
  return parsed.signals;
}

/**
 * Đọc văn bản của một nguồn công khai để kiểm chứng trích dẫn nghiên cứu.
 * Không tải ảnh và dùng lại toàn bộ giới hạn URL, redirect, dung lượng và timeout ở trên.
 */
export async function readPublicHtml(raw: string | null | undefined): Promise<{ url: string; title: string; text: string } | null> {
  const url = publicHttpUrl(raw);
  if (!url) return null;
  const page = await get(url, "text/html,application/xhtml+xml", MAX_HTML_BYTES);
  if (!page || !/html|\*\/\*/.test(page.type)) return null;
  const html = decode(page.buffer)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const codePoint = (fallback: string, value: number) => Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : fallback;
  const title = text(rawTitle, 200) || new URL(page.url).hostname;
  const plainText = html
    .replace(/<[^>]{1,1000}>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => codePoint(match, Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, code: string) => codePoint(match, Number(code)))
    .replace(/\s+/g, " ")
    .trim();
  return plainText ? { url: page.url, title, text: plainText } : null;
}
