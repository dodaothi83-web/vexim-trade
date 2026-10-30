/**
 * RFQ helpers – GĐ2.
 *
 * Cung cấp:
 *  - generateRfqCode(): mã RFQ-YYYYMMDD-XXXXX (tăng dần trong ngày, khi có va chạm thử lại).
 *  - generateAccessToken(): token 128-bit an toàn URL-friendly.
 *  - scoreSpam(): chấm điểm RFQ cho heuristic spam (không thay thế MX/challenge chống bot).
 *  - isLikelyWebmail(): kiểm tra tên miền webmail (chặn mua dùng gmail/yahoo khi cờ bật).
 *  - resolveMx(): (light) kiểm tra MX tồn tại của domain qua DNS — cần NODE tls, fallback bằng allowlist phổ thông khi DNS fail.
 */
import { createHash, randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";

const WEBMAIL_DOMAINS_DEFAULT = [
  "gmail.com","googlemail.com","yahoo.com","yahoo.co.jp","yahoo.co.uk","outlook.com",
  "hotmail.com","live.com","msn.com","icloud.com","me.com","aol.com","proton.me",
  "protonmail.com","gmx.com","gmx.net","mail.com","zoho.com","qq.com","163.com",
  "126.com","yeah.net","foxmail.com",
];

export function generateAccessToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tạo code RFQ-YYYYMMDD-XXXXX dựa trên số thứ tự trong ngày (seq: 0..99999). */
export function generateRfqCode(seqInDay: number): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const seq = String(seqInDay).padStart(5, "0");
  return `RFQ-${yyyy}${mm}${dd}-${seq}`;
}

export function isLikelyWebmail(email: string, extra: string[] = []): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  const list = new Set([...WEBMAIL_DOMAINS_DEFAULT, ...extra.map((d) => d.toLowerCase())]);
  return list.has(domain);
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

export function normalizeCompanyWebsite(input: string | null | undefined): string | null {
  if (!input) return null;
  let v = input.trim().toLowerCase();
  if (!v) return null;
  if (!/^https?:\/\//.test(v)) v = "https://" + v;
  try {
    const u = new URL(v);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Chấm điểm thô dựa trên tín hiệu spam. Điểm >= 100 bị cách ly (spam quarantine).
 * Quy tắc này theo đặc tả MVP và có thể tinh chỉnh sau khi có dữ liệu thật.
 */
export interface SpamScore {
  score: number;
  flags: string[];
}

export function scoreSpam(input: {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  website?: string | null;
  message?: string | null;
  productText?: string | null;
  phone?: string | null;
  honeypot?: string | null;
  challengeOk?: boolean;
}): SpamScore {
  const flags: string[] = [];
  let score = 0;

  if (input.honeypot && input.honeypot.trim().length > 0) {
    flags.push("honeypot_filled");
    score += 100;
  }
  if (!input.challengeOk) {
    flags.push("challenge_missing");
    score += 60;
  }
  if (input.email && isLikelyWebmail(input.email)) {
    flags.push("webmail_domain");
    score += 25;
  }
  if (!input.company || input.company.trim().length < 2) {
    flags.push("missing_company");
    score += 15;
  }
  if (!input.phone || input.phone.replace(/\D/g, "").length < 7) {
    flags.push("invalid_phone");
    score += 10;
  }
  const msg = (input.message ?? "").trim();
  const prod = (input.productText ?? "").trim();
  if (msg.length + prod.length < 20) {
    flags.push("too_short");
    score += 20;
  }
  if (/https?:\/\//i.test(msg) || /https?:\/\//i.test(prod)) {
    flags.push("contains_link");
    score += 25;
  }
  // Spam heuristic: lặp từ khoá bitcoin/casino...
  if (/\b(bitcoin|casino|seo|backlink|cheap pill|viagra)\b/i.test(`${msg} ${prod}`)) {
    flags.push("spam_keyword");
    score += 100;
  }
  if (!input.name || input.name.trim().length < 2) {
    flags.push("missing_name");
    score += 10;
  }
  return { score, flags };
}

/**
 * Kiểm tra MX record của domain. Khi không chạy được DNS (ví dụ Edge runtime hoặc
 * mạng chặn), trả về { ok: true, skipReason } để không chặn nhầm người dùng.
 */
export async function hasMxRecord(domain: string): Promise<{ ok: boolean; skipReason?: string; exchange?: string }> {
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) return { ok: false };
    records.sort((a, b) => a.priority - b.priority);
    return { ok: true, exchange: records[0]?.exchange };
  } catch (err) {
    // Không block người dùng nếu DNS lookup fail (do runtime/network)
    return { ok: true, skipReason: String((err as Error)?.message ?? "dns_unavailable") };
  }
}

/** Chuẩn hoá fingerprint người dùng (IP + UA hash) để rate-limit thô trên server. */
export function fingerprint(ip: string | null, ua: string | null): string {
  const data = `${ip ?? "0.0.0.0"}|${ua ?? ""}`;
  return createHash("sha256").update(data).digest("hex").slice(0, 32);
}
