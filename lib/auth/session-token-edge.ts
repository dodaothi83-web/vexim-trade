/**
 * Xác minh cookie phiên nhân viên bằng Web Crypto — bản dành cho middleware.ts chạy
 * trên Edge runtime (gần người dùng, không phải vòng về vùng máy chủ của Functions).
 *
 * PHẢI cho ra đúng kết quả như `verifySessionToken()` ở lib/auth/session-token.ts:
 *   token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(khoá, phần body))
 * và khoá lấy theo cùng thứ tự với lib/auth/secret.ts:
 *   1. AUTH_SECRET (>= 16 ký tự) — cách cấu hình chuẩn trên Vercel.
 *   2. HKDF-SHA256 từ khoá Supabase phía máy chủ (cùng salt/info với secret.ts).
 * Bước "đọc file data/auth-secret" của secret.ts chỉ có ở máy dev có ổ đĩa ghi được; Edge
 * runtime không đọc được file nên ở trường hợp đó hàm này trả null (không chuyển hướng).
 *
 * Kết quả chỉ dùng cho chuyển hướng "lạc quan" ở middleware (nhân viên vào "/" → CRM).
 * Trả null nhầm thì nhân viên chỉ thấy trang chủ như khách; xác thực có thẩm quyền vẫn do
 * requireSession() ở app/crm/layout.tsx đảm nhiệm (tra CSDL đầy đủ).
 * scripts/check-home-static.mjs đối chiếu hai bản để chúng không lệch nhau.
 */

const HKDF_SALT = "vexim-trade/session-cookie/v1";
const HKDF_INFO = "vxt_session hmac-sha256";
const encoder = new TextEncoder();

export interface EdgeSessionClaims {
  uid: string;
  role: string;
  exp: number;
}

let keyPromise: Promise<CryptoKey | null> | null = null;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function deriveFrom(material: string): Promise<string> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(material), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode(HKDF_SALT), info: encoder.encode(HKDF_INFO) },
    base,
    256,
  );
  return toHex(bits);
}

async function resolveSecret(): Promise<string | null> {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  // Không bao giờ dùng SUPABASE_ANON_KEY (công khai trên trình duyệt) — giống secret.ts.
  for (const value of [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_JWT_SECRET]) {
    const v = value?.trim();
    if (v && v.length >= 16) return deriveFrom(v);
  }
  return null;
}

function signingKey(): Promise<CryptoKey | null> {
  keyPromise ??= resolveSecret()
    .then((secret) => secret
      ? crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      : null)
    .catch(() => null);
  return keyPromise;
}

/** So sánh hai chuỗi không dừng sớm ở ký tự khác đầu tiên. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Đúng chữ ký + chưa hết hạn → claims; mọi trường hợp khác → null. KHÔNG tra CSDL. */
export async function verifySessionTokenEdge(token: string | undefined | null): Promise<EdgeSessionClaims | null> {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  try {
    const key = await signingKey();
    if (!key) return null;
    const expected = toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
    if (!sameString(mac, expected)) return null;
    const payload = JSON.parse(fromBase64Url(body)) as Partial<EdgeSessionClaims>;
    if (!payload?.uid || !payload?.role || !payload.exp) return null;
    if (payload.exp < Date.now()) return null;
    return { uid: payload.uid, role: payload.role, exp: payload.exp };
  } catch {
    return null;
  }
}
