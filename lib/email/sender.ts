import { COMPANY, MAIL_DOMAIN, ROLE_ADDRESS } from "@/lib/config";

/**
 * Địa chỉ gửi cá nhân của từng nhân viên kinh doanh.
 *
 * Vì sao phải đổi: thư gửi từ địa chỉ CHỨC NĂNG (sales@, contact@) được máy chủ
 * nhận thư đối xử như hộp thư nhận đại trà — công cụ chấm điểm không đo được độ sạch
 * của mailbox nên hạ điểm về "Risky" và đẩy thư vào Quảng cáo/Spam. Địa chỉ theo tên
 * người (dung@veximtrade.com) gắn với một người thật nên không bị phạt điểm đó.
 *
 * Không cần tạo mailbox mới: Resend cho phép gửi từ bất kỳ local-part nào của domain
 * đã verify, và domain nhận thư đang là catch-all nên thư trả lời vẫn về cùng webhook.
 *
 * Quy tắc đặt (theo tên tiếng Việt):
 *  - lấy TÊN CHÍNH = từ cuối cùng của họ tên, bỏ dấu, viết thường  -> "Nguyễn Văn Dung" -> dung@
 *  - trùng thì thêm số: dung2@, dung3@ (số thứ tự theo ngày tạo tài khoản)
 *  - tên không dùng được (quá ngắn/toàn ký tự đặc biệt) thì rơi về local-part của
 *    email đăng nhập, rồi đến họ tên liền không dấu
 *  - địa chỉ đã lưu trong DB (app_users.sender_email) luôn thắng và không bị đổi.
 */

/** Bản ghi người dùng tối thiểu cần cho việc đặt tên (AppUser thoả mãn) */
export interface SenderUserLike {
  id: string;
  email: string;
  name: string | null;
  sender_email?: string | null;
  is_active?: boolean;
  created_at?: string;
}

/** Bỏ dấu tiếng Việt (NFD không tách được "đ" nên xử lý riêng) */
export function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Chỉ giữ a-z0-9, viết thường, cắt theo độ dài an toàn cho local-part */
export function sanitizeLocalPart(raw: string): string {
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

/** Tên chính của một người: từ cuối với tên tiếng Việt, từ đầu nếu chỉ có một từ */
export function givenNameToken(name: string | null | undefined): string | null {
  const tokens = (name ?? "").trim().split(/[\s,.\-_()]+/).filter(Boolean);
  if (!tokens.length) return null;
  const local = sanitizeLocalPart(tokens[tokens.length - 1]);
  return local.length >= 2 ? local : null;
}

/** Họ tên liền không dấu, dùng khi tên chính đã bị chiếm: nguyenvandung */
export function fullNameLocalPart(name: string | null | undefined): string | null {
  const local = sanitizeLocalPart((name ?? "").trim().split(/\s+/).join(""));
  return local.length >= 3 ? local : null;
}

/**
 * Những local-part không được cấp cho cá nhân: địa chỉ chức năng thông dụng
 * (role address) + local-part của EMAIL_FROM. So sánh sau khi đã chuẩn hoá,
 * nên "no-reply" và "noreply" counted one.
 */
const RESERVED = new Set<string>(
  [
    "sales",
    "contact",
    "info",
    "admin",
    "support",
    "noreply",
    "no-reply",
    "donotreply",
    "abuse",
    "postmaster",
    "webmaster",
    "mailerdaemon",
    "hostmaster",
    "root",
    "hr",
    "marketing",
    "billing",
    "hello",
    "team",
    "office",
    "company",
    ROLE_ADDRESS.split("@")[0] ?? "",
  ]
    .map((entry) => sanitizeLocalPart(entry))
    .filter(Boolean),
);

/** Local-part có bị giữ cho địa chỉ chức năng không */
export function isReservedLocalPart(local: string): boolean {
  return RESERVED.has(sanitizeLocalPart(local));
}

export type SenderAddressCheck =
  | { ok: true; address: string }
  | { ok: false; reason: "empty" | "format" | "domain" | "reserved" };

/**
 * Kiểm tra + chuẩn hoá địa chỉ gửi do người dùng nhập: chấp nhận "dung",
 * "dung@veximtrade.com" hoặc "Dung Nguyen <dung@veximtrade.com>".
 * Domain KHÁC MAIL_DOMAIN bị từ chối — Resend chỉ cho gửi từ domain đã verify.
 */
export function checkSenderAddress(input: string | null | undefined): SenderAddressCheck {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  const domain = domainOf(raw);
  if (domain && domain !== MAIL_DOMAIN.toLowerCase()) return { ok: false, reason: "domain" };
  const local = localPartOf(raw);
  if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(local)) return { ok: false, reason: "format" };
  if (RESERVED.has(local)) return { ok: false, reason: "reserved" };
  return { ok: true, address: withDomain(local) };
}

/** Bản gọn: trả địa chỉ đã chuẩn hoá hoặc null (dành cho chỗ không cần lý do lỗi) */
export function normalizeSenderAddress(input: string | null | undefined): string | null {
  const res = checkSenderAddress(input);
  return res.ok ? res.address : null;
}

/** Các phương án đặt tên cho một người, theo thứ tự ưu tiên */
function candidatesFor(user: SenderUserLike): string[] {
  const out: string[] = [];
  const push = (v: string | null) => {
    if (v && !out.includes(v)) out.push(v);
  };
  push(givenNameToken(user.name));
  push(sanitizeLocalPart(user.email.split("@")[0] ?? "") || null);
  push(fullNameLocalPart(user.name));
  // Người không có tên lẫn email hợp lệ: vẫn có địa chỉ deterministic
  if (!out.length) out.push("sale");
  return out;
}

/** Bỏ phần "Tên hiển thị <...>" và danh sách ngăn cách bằng dấu phẩy */
export function bareAddress(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1] : raw).split(",")[0].trim();
}

/** Tách local-part từ một chuỗi địa chỉ (có thể kèm "Tên <addr>") */
export function localPartOf(address: string | null | undefined): string {
  return (bareAddress(address).split("@")[0] ?? "").toLowerCase();
}

/** Tách domain (đã viết thường, bỏ dấu chấm đầu) từ một chuỗi địa chỉ */
export function domainOf(address: string | null | undefined): string {
  return (bareAddress(address).split("@")[1] ?? "").trim().toLowerCase().replace(/^@/, "");
}

export function withDomain(localPart: string): string {
  return `${localPart}@${MAIL_DOMAIN}`;
}

/**
 * Gán địa chỉ gửi cho toàn bộ danh sách người dùng.
 * Deterministic: thứ tự cố định (ngày tạo -> email) nên cùng một đội ngũ luôn cho
 * ra cùng một bảng địa chỉ, không đổi lung tung mỗi lần mở app.
 */
export function assignSenderEmails(users: SenderUserLike[]): Map<string, string> {
  // Thứ tự ổn định: ngày tạo -> email -> id. Cùng đội ngũ thì lần tính sau cho ra
  // đúng bảng địa chỉ như lần tính trước (không đổi chỗ dung@/dung2@ lung tung).
  const ordered = [...users].sort(
    (a, b) =>
      (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
      a.email.localeCompare(b.email) ||
      a.id.localeCompare(b.id),
  );
  const assigned = new Map<string, string>();
  const taken = new Set<string>(RESERVED);

  // 1. Địa chỉ quản trị/nhân viên đã lưu tay: giữ nguyên, đánh dấu đã chiếm
  for (const u of ordered) {
    const stored = (u.sender_email ?? "").trim();
    if (!stored || !stored.includes("@")) continue;
    const local = localPartOf(stored);
    if (!local) continue;
    // Trùng với địa chỉ đã lưu khác (do dữ liệu cũ) thì vẫn giữ nguyên giá trị
    // người dùng/admin đã đặt — app không tự ý đổi địa chỉ đã lưu.
    taken.add(local);
    assigned.set(u.id, stored.toLowerCase());
  }

  // 2. Còn lại: lấy tên chính, trùng thì đánh số dung2@, dung3@ (xem doc đầu file)
  for (const u of ordered) {
    if (assigned.has(u.id)) continue;
    let done = false;
    for (const base of candidatesFor(u)) {
      if (RESERVED.has(base)) continue; // không cấp "sales@", "info@"... cho cá nhân
      for (let n = 1; n <= 999 && !done; n += 1) {
        const local = n === 1 ? base : `${base}${n}`;
        if (taken.has(local)) continue;
        taken.add(local);
        assigned.set(u.id, withDomain(local));
        done = true;
      }
      if (done) break;
    }
    // Hãn hữu: mọi phương án tên đều bị chặn (vd. trùng hết 999 số) -> lấy id làm hậu tố
    if (!done) assigned.set(u.id, withDomain(`seller${u.id.replace(/[^a-z0-9]/gi, "").slice(0, 6)}`));
  }

  return assigned;
}

/** Địa chỉ gửi của MỘT người (tính trên toàn đội ngũ để xử lý trùng tên) */
export function senderAddressFor(
  user: SenderUserLike | null | undefined,
  users: SenderUserLike[],
): string | null {
  if (!user) return null;
  const stored = (user.sender_email ?? "").trim();
  if (stored && stored.includes("@")) return stored.toLowerCase();
  return assignSenderEmails(users).get(user.id) ?? null;
}

/** Header From: "Nguyễn Văn Dung <dung@veximtrade.com>"; thiếu tên thì lấy tên công ty */
export function formatFrom(name: string | null | undefined, address: string): string {
  const label = (name ?? "").trim().replace(/\s+/g, " ") || COMPANY.name;
  return /[",<>\\]/.test(label)
    ? `"${label.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${address}>`
    : `${label} <${address}>`;
}

/** Địa chỉ có thuộc domain gửi của hệ thống không (dùng để chặn thư tự quay vòng) */
export function isOwnMailAddress(address: string | null | undefined): boolean {
  const raw = (address ?? "").trim();
  if (!raw) return false;
  const addr = bareAddress(raw).toLowerCase();
  return domainOf(addr) === MAIL_DOMAIN || addr === ROLE_ADDRESS.toLowerCase();
}

/** Tra người sở hữu một địa chỉ nhận — dùng để quy thư đến về đúng nhân viên */
export function findUserByAddress(
  users: SenderUserLike[],
  address: string | null | undefined,
): SenderUserLike | null {
  const needle = localPartOf(address);
  if (!needle) return null;
  const assigned = assignSenderEmails(users);
  return (
    users.find(
      (u) => localPartOf(u.sender_email ?? null) === needle || localPartOf(assigned.get(u.id) ?? "") === needle,
    ) ?? null
  );
}
