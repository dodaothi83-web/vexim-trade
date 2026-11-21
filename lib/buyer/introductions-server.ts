import "server-only";

import crypto from "node:crypto";

import brandColors from "@/lib/brand/colors.json";
import { getAuthSecret } from "@/lib/auth/secret";
import { FROM_ADDRESS } from "@/lib/config";
import { getStore } from "@/lib/db";
import { getSupabaseClient } from "@/lib/db/supabase";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { listPublicCategoryProducts, loadPublicProductCatalogSnapshot } from "@/lib/public/product-catalog";
import { SITE_URL } from "@/lib/site";
import type { BuyerIntroductions, BuyerUser, Category } from "@/lib/types";
import { emailCategories, readIntroductions } from "./introductions";

/**
 * Phần máy chủ của "người mua nhận giới thiệu" (đợt 1): ngành hàng đang đăng (đọc từ bảng
 * categories), link ký cho thư mời (không cần đăng nhập), và thư mời / thư nhắc / thư chào mừng.
 */
export type IntroCategory = { id: string; slug: string; name: string; products: number };

/** Ngành lớn đang đăng, kèm số sản phẩm đang hiện; ngành mới đăng tự xuất hiện. */
export async function introCategories(): Promise<IntroCategory[]> {
  const store = getStore();
  const categories = (await store.listCategories({ publishedOnly: true })).filter((c) => !c.parent_id && c.status === "published" && c.is_published);
  const snapshot = await loadPublicProductCatalogSnapshot().catch(() => null);
  const counts = await Promise.all(categories.map((c: Category) => snapshot
    ? listPublicCategoryProducts(c, { snapshot }).then((list) => list.length).catch(() => 0) : Promise.resolve(0)));
  return categories.map((c, i) => ({ id: c.id, slug: c.slug, name: c.name_i18n?.en || c.name_i18n?.vi || c.slug, products: counts[i] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Ngành lớn chứa một ngành (ngành con thì đi lên cha). */
export async function topCategoryOf(categoryId: string | null | undefined): Promise<IntroCategory | null> {
  if (!categoryId) return null;
  const all = await getStore().listCategories({ publishedOnly: true }).catch(() => []);
  const own = all.find((c) => c.id === categoryId);
  const top = own?.parent_id ? all.find((c) => c.id === own.parent_id) : own;
  return top && top.status === "published" && top.is_published ? { id: top.id, slug: top.slug, name: top.name_i18n?.en || top.slug, products: 0 } : null;
}

// ----- Link ký trong thư (30 ngày, chỉ cho trang chọn ngành / ngừng mời) -----
const TOKEN_DAYS = 30;
type IntroToken = { e: string; exp: number };
const mac = (body: string) => crypto.createHmac("sha256", getAuthSecret()).update(`buyer-intro:${body}`).digest("base64url");

export function issueIntroToken(email: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ e: email.toLowerCase(), exp: now + TOKEN_DAYS * 86_400_000 } satisfies IntroToken)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyIntroToken(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 1024) return null;
  const [body, sig, extra] = raw.split(".");
  if (!body || !sig || extra) return null;
  const expected = Buffer.from(mac(body));
  const actual = Buffer.from(sig);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const token = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as IntroToken;
    return typeof token.e === "string" && typeof token.exp === "number" && token.exp > Date.now() ? token.e : null;
  } catch { return null; }
}

export const introPageUrl = (token: string, categoryId?: string) =>
  `${SITE_URL}/buyer/introductions?t=${encodeURIComponent(token)}${categoryId ? `&c=${encodeURIComponent(categoryId)}` : ""}`;
export const introStopUrl = (token: string) => `${SITE_URL}/buyer/introductions?t=${encodeURIComponent(token)}&stop=1`;

// ----- Thư -----
export type IntroMailKind = "invite" | "reminder" | "welcome" | "welcome-plain";

export function buildIntroMail(kind: IntroMailKind, email: string, categories: IntroCategory[], token: string) {
  const invite = kind !== "welcome-plain";
  const chips = categories.map((c) => `<a href="${escapeHtml(introPageUrl(token, c.id))}" style="display:inline-block;margin:0 6px 8px 0;padding:8px 14px;border:1px solid #DFE5EE;border-radius:999px;color:#141C2E;font-weight:600;font-size:14px;text-decoration:none;">${escapeHtml(c.name)}</a>`).join("");
  const button = (href: string, label: string) => `<p style="margin:6px 0 18px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 20px;background:${brandColors.primary};color:#ffffff;border-radius:8px;font-weight:700;text-decoration:none;">${label}</a></p>`;
  const intro = {
    invite: { subject: "Which Vietnamese products do you source? We'll match suppliers for you", title: "Get matched suppliers for the products you source",
      lead: "You have a buyer account on Vexim Trade. Tell us what you source and we'll send you a short note when checked Vietnamese suppliers list matching products. Up to two emails a week; you choose." },
    reminder: { subject: "Still sourcing from Vietnam? Pick your products", title: "Pick the products you source",
      lead: "A quick reminder: choose what you source and we'll introduce matching checked Vietnamese suppliers. Up to two emails a week; you choose." },
    welcome: { subject: "Welcome to Vexim Trade", title: "Welcome to Vexim Trade",
      lead: "Thanks for creating a buyer account. You can send quote requests, save products and talk to checked Vietnamese suppliers through Vexim. Tell us what you source and we'll introduce matching suppliers, up to twice a week." },
    "welcome-plain": { subject: "Welcome to Vexim Trade", title: "Welcome to Vexim Trade",
      lead: "Thanks for creating a buyer account. You can send quote requests, save products and talk to checked Vietnamese suppliers through Vexim. We'll introduce suppliers for the products you chose, up to twice a week." },
  }[kind];
  const body = invite ? `
    <p style="margin:0 0 14px;">${escapeHtml(intro.lead)}</p>
    <p style="margin:0 0 8px;font-weight:700;">Tap what you source:</p>
    <div style="margin:0 0 12px;">${chips}</div>
    ${button(introPageUrl(token), "Choose my products")}
    <p style="margin:0 0 18px;color:${brandColors.muted};font-size:13px;">Nothing changes unless you confirm. Suppliers never see your name or email.</p>
    <p style="margin:0;color:${brandColors.muted};font-size:12px;">${kind === "reminder" ? "This is the only reminder we send." : "You receive this because you created a buyer account on Vexim Trade."} <a href="${escapeHtml(introStopUrl(token))}" style="color:${brandColors.muted};">Don't ask me again</a></p>`
    : `
    <p style="margin:0 0 14px;">${escapeHtml(intro.lead)}</p>
    ${button(`${SITE_URL}/buyer/account`, "Open my account")}
    <p style="margin:0;color:${brandColors.muted};font-size:12px;">Change your products or turn introductions off anytime in your account.</p>`;
  const text = [intro.title, "", intro.lead, "", ...(invite ? [`Choose your products: ${introPageUrl(token)}`, "", `Don't ask me again: ${introStopUrl(token)}`] : [`Your account: ${SITE_URL}/buyer/account`])].join("\n");
  return { to: [email], from: FROM_ADDRESS, subject: intro.subject, html: wrapPlainEmail({ title: intro.title, body, preheader: intro.lead.slice(0, 110) }), text };
}

export async function sendIntroMail(kind: IntroMailKind, user: Pick<BuyerUser, "email">, preferred: string[] = []) {
  const categories = emailCategories(await introCategories(), preferred);
  return transport(buildIntroMail(kind, user.email, categories, issueIntroToken(user.email)));
}

/** Tất cả tài khoản người mua đã xác thực (để gửi đợt thư mời, thư nhắc, thư chào mừng). */
export async function listVerifiedBuyerUsers(): Promise<BuyerUser[]> {
  const db = getSupabaseClient();
  if (!db) return [];
  const out: BuyerUser[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("buyer_users").select("*").not("verified_at", "is", null).order("created_at").range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as BuyerUser[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Ghi một mốc vào `introductions` của người mua (đọc lại bản mới nhất trước khi ghi). */
export async function patchIntroductions(userId: string, patch: (current: BuyerIntroductions) => BuyerIntroductions, extra: Partial<Pick<BuyerUser, "marketing_opt_in">> = {}) {
  const store = getStore();
  const user = await store.getBuyerUser(userId);
  if (!user) return null;
  return store.updateBuyerUser(userId, { introductions: patch(readIntroductions(user.introductions)), ...extra });
}

/**
 * Tác vụ hằng ngày (gọi trong cron): thư chào mừng cho tài khoản mới sau 24 giờ (kèm lời mời nếu
 * người mua chưa chọn ngành; tính là lần mời), và thư nhắc một lần sau 14 ngày cho người đã được mời.
 */
export async function runIntroductionMail(now = new Date(), limit = 200): Promise<{ welcome: number; reminders: number; failed: number }> {
  const { welcomeDue, welcomeIncludesInvite, reminderDue } = await import("./introductions");
  const result = { welcome: 0, reminders: 0, failed: 0 };
  const users = await listVerifiedBuyerUsers();
  for (const user of users) {
    if (result.welcome + result.reminders + result.failed >= limit) break;
    const stamp = now.toISOString();
    if (welcomeDue(user, now)) {
      const invite = welcomeIncludesInvite(user);
      const sent = await sendIntroMail(invite ? "welcome" : "welcome-plain", user).catch(() => null);
      if (!sent?.ok) { result.failed++; continue; }
      await patchIntroductions(user.id, (current) => ({ ...current, welcome_sent_at: stamp, ...(invite && !current.invite_sent_at ? { invite_sent_at: stamp } : {}) }));
      result.welcome++;
    } else if (reminderDue(user, now)) {
      const sent = await sendIntroMail("reminder", user).catch(() => null);
      if (!sent?.ok) { result.failed++; continue; }
      await patchIntroductions(user.id, (current) => ({ ...current, invite_reminded_at: stamp }));
      result.reminders++;
    }
  }
  return result;
}
