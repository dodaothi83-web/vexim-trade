import "server-only";

import crypto from "node:crypto";

import brandColors from "@/lib/brand/colors.json";
import { getAuthSecret } from "@/lib/auth/secret";
import { FROM_ADDRESS } from "@/lib/config";
import { getSupabaseClient } from "@/lib/db/supabase";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { supplierTypeLabel } from "@/lib/public/catalog";
import { listPublicCategoryProducts, loadPublicProductCatalogSnapshot } from "@/lib/public/product-catalog";
import { supplierProvinceDisplay } from "@/lib/public/supplier-english";
import { SITE_URL } from "@/lib/site";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { VERIFICATION_DISPLAY_ORDER, type BuyerUser, type Category } from "@/lib/types";
import { verificationLabel } from "@/lib/verification-status";
import {
  buildBriefDigest, buildProductsDigest, DIGEST_DAY, DIGEST_REPEAT_DAYS, isoWeek, itemKey, postCategories, vietnamWeekday,
  type BriefDigest, type DigestCategory, type DigestKind, type DigestPost, type DigestProduct, type DigestSupplier, type ProductsDigest, type RecentShown,
} from "./digest";
import { introFrequency, readIntroductions, receivesIntroductions } from "./introductions";
import { issueIntroToken, listVerifiedBuyerUsers } from "./introductions-server";

/**
 * Thư giới thiệu cho người mua (đợt 2): hệ thống tự tổng hợp từ nội dung đã duyệt trên sàn và tự gửi.
 * Nhân viên chỉ làm nội dung (sản phẩm, bài blog, lịch mùa vụ) và có nút tạm dừng khẩn cấp trong CRM.
 */
export type DigestData = { categories: DigestCategory[]; products: DigestProduct[]; suppliers: DigestSupplier[]; posts: DigestPost[] };

export async function loadDigestData(now = new Date()): Promise<DigestData> {
  const snapshot = await loadPublicProductCatalogSnapshot();
  const catalog = await readPlanCatalog().catch(() => null);
  const tops = snapshot.categories.filter((c: Category) => !c.parent_id && c.status === "published" && c.is_published);
  const categories: DigestCategory[] = tops.map((c) => ({ id: c.id, slug: c.slug, name: c.name_i18n?.en || c.slug, harvest: c.harvest ?? null }));
  const raw = new Map(snapshot.products.map((p) => [p.id, p]));
  const suppliers = new Map(snapshot.suppliers.map((s) => [s.id, s]));
  const pro = (supplierId: string) => { const s = suppliers.get(supplierId); return !!s && supplierPlanRules(s, now, catalog).plan === "pro"; };
  const products: DigestProduct[] = [];
  const supplierCategories = new Map<string, Set<string>>();
  for (const c of tops) {
    const list = await listPublicCategoryProducts(c, { snapshot }).catch(() => []);
    for (const p of list) {
      if (p.isDemo || p.isDemoSupplier) continue;
      const source = raw.get(p.id);
      if (!source) continue;
      supplierCategories.set(p.supplierId, (supplierCategories.get(p.supplierId) ?? new Set()).add(c.id));
      products.push({ id: p.id, name: p.name, href: `/products/${encodeURIComponent(c.slug)}/${encodeURIComponent(p.id)}`, imagePath: p.cardImagePath ?? p.imagePaths[0] ?? null,
        categoryId: c.id, supplierId: p.supplierId, pro: pro(p.supplierId), moq: p.moq || "On request", leadTime: p.leadTimeText || "On request", price: p.price,
        createdAt: source.created_at, updatedAt: source.updated_at });
    }
  }
  const featured: DigestSupplier[] = [];
  for (const [id, cats] of supplierCategories) {
    const s = suppliers.get(id);
    if (!s || !pro(id) || s.status !== "published") continue;
    featured.push({ id, name: s.display_name || s.name, href: `/suppliers/${encodeURIComponent(s.slug || s.id)}`, location: supplierProvinceDisplay(s) ? `${supplierProvinceDisplay(s)}, Vietnam` : "Vietnam",
      type: supplierTypeLabel(s), products: products.filter((p) => p.supplierId === id).slice(0, 3).map((p) => p.name).join(" · "),
      checks: VERIFICATION_DISPLAY_ORDER.filter((level) => s.approved_verification_steps.includes(level)).map((level) => level === 1 ? "Business registration checked" : verificationLabel(level, s.approved_l2_scope ?? null)),
      categoryIds: [...cats] });
  }
  return { categories, products, suppliers: featured, posts: await loadPosts(categories) };
}

async function loadPosts(categories: DigestCategory[]): Promise<DigestPost[]> {
  const db = getSupabaseClient();
  if (!db) return [];
  const { data, error } = await db.from("posts").select("*").eq("status", "published").order("published_at", { ascending: false }).limit(60);
  if (error) { console.error("[digest] posts", error); return []; }
  return (data ?? []).filter((p) => p.published_at).map((p) => ({
    id: String(p.id), title: String(p.title), href: `/blog/${encodeURIComponent(String(p.slug))}`, excerpt: String(p.excerpt ?? ""),
    imageUrl: typeof p.featured_image === "string" && /^https:\/\//.test(p.featured_image) ? p.featured_image : null, publishedAt: String(p.published_at),
    categoryIds: postCategories({ title: String(p.title), excerpt: String(p.excerpt ?? ""), related: Array.isArray(p.related_categories) ? p.related_categories : [] }, categories),
  }));
}

/** Mục đã gửi cho từng người mua trong 4 tuần qua. */
async function recentShown(): Promise<Map<string, RecentShown>> {
  const db = getSupabaseClient();
  const out = new Map<string, RecentShown>();
  if (!db) return out;
  const since = new Date(Date.now() - DIGEST_REPEAT_DAYS * 86_400_000).toISOString();
  const { data, error } = await db.from("buyer_digest_sends").select("buyer_id, items, sent_at").gte("sent_at", since);
  if (error) throw error;
  for (const row of data ?? []) {
    const map = out.get(row.buyer_id) ?? new Map<string, string>();
    for (const item of Array.isArray(row.items) ? row.items : []) {
      const key = itemKey(item);
      if (!map.has(key) || map.get(key)! < row.sent_at) map.set(key, row.sent_at);
    }
    out.set(row.buyer_id, map);
  }
  return out;
}

// ----- Link đếm lượt bấm (không chứa mã người mua) -----
type ClickPayload = { k: DigestKind; t: "product" | "supplier" | "post" | "category" | "rfq"; i: string; s?: string; u: string };
const sign = (body: string) => crypto.createHmac("sha256", getAuthSecret()).update(`digest-click:${body}`).digest("base64url");

export function clickUrl(payload: ClickPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${SITE_URL}/r/digest?d=${body}.${sign(body)}`;
}

export function readClick(raw: string | null): ClickPayload | null {
  if (!raw || raw.length > 2048) return null;
  const [body, sig, extra] = raw.split(".");
  if (!body || !sig || extra) return null;
  const expected = Buffer.from(sign(body)), actual = Buffer.from(sig);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ClickPayload;
    // Chỉ chuyển về trang của Vexim.
    return typeof p.u === "string" && p.u.startsWith("/") && !p.u.startsWith("//") ? p : null;
  } catch { return null; }
}

export async function recordClick(p: ClickPayload): Promise<void> {
  const db = getSupabaseClient();
  if (!db) return;
  const { error } = await db.rpc("record_buyer_digest_click", { p_kind: p.k, p_item_type: p.t, p_item_id: p.i.slice(0, 100), p_supplier_id: p.s ?? null });
  if (error) console.error("[digest] click", error);
}

// ----- Thư -----
const unsubscribeUrl = (token: string) => `${SITE_URL}/buyer/introductions/unsubscribe?t=${encodeURIComponent(token)}`;
const link = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="color:${brandColors.primary};font-weight:700;text-decoration:none;">${label}</a>`;
const section = (title: string, body: string, note = "") => `<div style="margin:26px 0 0;"><p style="margin:0 0 10px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${brandColors.muted};font-weight:700;">${escapeHtml(title)}${note}</p>${body}</div>`;

function seasonsHtml(d: { seasons: ProductsDigest["seasons"] }): string {
  if (!d.seasons.length) return "";
  return section("Season watch", d.seasons.map((s) => `<p style="margin:0 0 8px;font-size:14px;"><b>${escapeHtml(s.categoryName)}</b> · ${escapeHtml(s.label)}: ${escapeHtml(s.months)}${s.now ? " (now)" : " (starts soon)"}${s.regions.length ? `<br><span style="color:${brandColors.muted};font-size:13px;">${escapeHtml(s.regions.join(", "))}</span>` : ""}</p>`).join(""));
}

export function buildDigestMail(digest: ProductsDigest | BriefDigest, buyer: Pick<BuyerUser, "email">, chosen: string[], weekLabel: string) {
  const token = issueIntroToken(buyer.email);
  const names = chosen.join(", ");
  const rfq = clickUrl({ k: digest.kind, t: "rfq", i: "rfq", u: "/rfq" });
  let subject: string, title: string, body: string;
  if (digest.kind === "products") {
    const parts = [digest.featured.length ? `${digest.featured.length} featured supplier${digest.featured.length > 1 ? "s" : ""}` : "", digest.products.length ? `${digest.products.length} new product${digest.products.length > 1 ? "s" : ""}` : ""].filter(Boolean);
    subject = `${names}: ${parts.join(", ")} this week`;
    title = "Your weekly Vietnam sourcing brief";
    const featured = digest.featured.length ? section("Featured suppliers", digest.featured.map((s) => `<div style="border:1px solid #DFE5EE;border-radius:12px;padding:14px;margin:0 0 10px;">
        <p style="margin:0;font-weight:700;color:#141C2E;">${escapeHtml(s.name)}</p>
        <p style="margin:2px 0 6px;font-size:13px;color:${brandColors.muted};">${escapeHtml([s.location, s.type, s.products].filter(Boolean).join(" · "))}</p>
        ${s.checks.map((c) => `<span style="display:inline-block;margin:0 4px 6px 0;padding:2px 8px;border-radius:999px;background:#E7F5EF;color:#0E7A4E;font-size:12px;font-weight:700;">✓ ${escapeHtml(c)}</span>`).join("")}
        <p style="margin:4px 0 0;">${link(clickUrl({ k: "products", t: "supplier", i: s.id, s: s.id, u: s.href }), "View supplier →")}</p></div>`).join(""),
      ` <span style="text-transform:none;letter-spacing:0;color:#93370D;background:#FFF4DE;border-radius:999px;padding:2px 8px;font-size:11px;">Sponsored</span>`) : "";
    // Lưới thẻ ảnh 3 cột (bảng HTML để hiện đúng trên Gmail/Outlook): ảnh vuông, tên 2 dòng, giá hoặc MOQ.
    const card = (p: (typeof digest.products)[number]) => {
      const href = clickUrl({ k: "products", t: "product", i: p.id, s: p.supplierId, u: p.href });
      const img = p.imagePath
        ? `<img src="${escapeHtml(`${SITE_URL}/public-media/${p.imagePath.replace(/^\//, "")}`)}" width="180" height="180" alt="${escapeHtml(p.name)}" style="display:block;width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;border-radius:10px;border:1px solid #DFE5EE;">`
        : `<div style="width:100%;padding-top:100%;border-radius:10px;background:#E8EEF8;"></div>`;
      return `<td width="33%" valign="top" style="padding:0 5px 16px;"><a href="${escapeHtml(href)}" style="text-decoration:none;color:#141C2E;display:block;">
        ${img}
        <p style="margin:8px 0 0;font-size:10.5px;font-weight:800;color:${brandColors.primary};">${p.badge}</p>
        <p style="margin:2px 0 0;font-size:13px;line-height:18px;font-weight:600;color:#141C2E;height:36px;overflow:hidden;">${escapeHtml(p.name)}</p>
        <p style="margin:4px 0 0;font-size:13px;font-weight:800;color:#141C2E;">${escapeHtml(p.price ?? `MOQ ${p.moq}`)}</p></a></td>`;
    };
    const rows: string[] = [];
    for (let i = 0; i < digest.products.length; i += 3) {
      const cells = digest.products.slice(i, i + 3).map(card);
      while (cells.length < 3) cells.push('<td width="33%" style="padding:0 5px 16px;"></td>');
      rows.push(`<tr>${cells.join("")}</tr>`);
    }
    const products = digest.products.length ? section("New products this week",
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;margin:0 -5px;">${rows.join("")}</table>`) : "";
    body = `${featured}${products}${seasonsHtml(digest)}`;
  } else {
    subject = `${digest.post.title}`;
    title = "Vietnam market brief";
    body = section("Market notes from Vexim", `<div style="border:1px solid #DFE5EE;border-radius:12px;padding:14px;">
        ${digest.post.imageUrl ? `<img src="${escapeHtml(digest.post.imageUrl)}" width="100%" alt="" style="display:block;border-radius:8px;margin:0 0 10px;max-height:260px;object-fit:cover;">` : ""}
        <p style="margin:0 0 6px;font-weight:700;color:#141C2E;font-size:16px;">${escapeHtml(digest.post.title)}</p>
        ${digest.post.excerpt ? `<p style="margin:0 0 8px;font-size:14px;">${escapeHtml(digest.post.excerpt)}</p>` : ""}
        ${link(clickUrl({ k: "brief", t: "post", i: digest.post.id, u: digest.post.href }), "Read the article →")}</div>`) + seasonsHtml(digest);
  }
  const html = wrapPlainEmail({ title, preheader: subject, body: `
    <p style="margin:0;font-size:20px;font-weight:800;color:#141C2E;">${escapeHtml(title)}</p>
    <p style="margin:4px 0 0;font-size:13px;color:${brandColors.muted};">${escapeHtml(weekLabel)} · For ${escapeHtml(names)}</p>
    ${body}
    <div style="margin:26px 0 0;padding:16px;border:1px solid #DFE5EE;border-radius:12px;background:#F2F5FA;">
      <p style="margin:0;font-weight:700;color:#141C2E;">Need a quote?</p>
      <p style="margin:2px 0 10px;font-size:14px;">Send one request. Vexim matches checked suppliers and keeps your contact private.</p>
      <a href="${escapeHtml(rfq)}" style="display:inline-block;padding:10px 16px;background:${brandColors.primary};color:#ffffff;border-radius:8px;font-weight:700;text-decoration:none;">Request a quote</a></div>
    <p style="margin:24px 0 0;font-size:12px;color:${brandColors.muted};">You get this because you chose ${escapeHtml(names)} on Vexim Trade.${digest.kind === "products" && digest.featured.length ? " Featured suppliers pay for placement; checks are shown exactly as Vexim reviewed them." : ""}<br>
      <a href="${escapeHtml(`${SITE_URL}/buyer/introductions?t=${encodeURIComponent(token)}`)}" style="color:${brandColors.muted};">Change my products</a> · <a href="${escapeHtml(unsubscribeUrl(token))}" style="color:${brandColors.muted};">Unsubscribe</a></p>` });
  const text = [title, `${weekLabel} · For ${names}`, "", ...(digest.kind === "products"
    ? [...digest.featured.map((s) => `${s.name} (${s.location}): ${clickUrl({ k: "products", t: "supplier", i: s.id, s: s.id, u: s.href })}`), ...digest.products.map((p) => `${p.badge} ${p.name}: ${clickUrl({ k: "products", t: "product", i: p.id, s: p.supplierId, u: p.href })}`)]
    : [`${digest.post.title}: ${clickUrl({ k: "brief", t: "post", i: digest.post.id, u: digest.post.href })}`]),
    "", `Request a quote: ${rfq}`, "", `Unsubscribe: ${unsubscribeUrl(token)}`].join("\n");
  return {
    to: [buyer.email], from: FROM_ADDRESS, subject, html, text,
    // Nút "Unsubscribe" của Gmail/Outlook (huỷ một bấm, RFC 8058).
    headers: { "List-Unsubscribe": `<${unsubscribeUrl(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// ----- Công tắc tạm dừng -----
export async function digestPaused(): Promise<boolean> {
  const db = getSupabaseClient();
  if (!db) return false;
  const { data } = await db.from("buyer_digest_settings").select("paused").eq("id", true).maybeSingle();
  return !!data?.paused;
}

export async function setDigestPaused(paused: boolean, by: string | null): Promise<void> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Database unavailable");
  const { error } = await db.from("buyer_digest_settings").upsert({ id: true, paused, paused_by: by, updated_at: new Date().toISOString() });
  if (error) throw error;
}

const weekLabel = (now: Date) => `Week of ${now.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Ho_Chi_Minh" })}`;

/** Thư của một người mua cho một loại thư (null khi không đủ nội dung). Dùng cho gửi thật và xem trước. */
export function digestFor(kind: DigestKind, categories: string[], data: DigestData, recent: RecentShown, now: Date) {
  return kind === "products" ? buildProductsDigest(categories, data, recent, now) : buildBriefDigest(categories, data, recent, now);
}

export async function previewDigest(kind: DigestKind, categoryId: string, now = new Date()) {
  const data = await loadDigestData(now);
  const category = data.categories.find((c) => c.id === categoryId);
  if (!category) return null;
  const digest = digestFor(kind, [categoryId], data, new Map(), now);
  return digest ? buildDigestMail(digest, { email: "preview@veximtrade.com" }, [category.name], weekLabel(now)) : null;
}

/**
 * Tác vụ hằng ngày: thứ Ba gửi thư sản phẩm, thứ Sáu gửi thư thị trường (giờ Việt Nam), cho người mua
 * đang nhận giới thiệu và đúng mức nhận. Mỗi người tối đa một thư mỗi loại mỗi tuần; thiếu nội dung thì bỏ.
 */
export async function runBuyerDigest(now = new Date(), options: { kind?: DigestKind; limit?: number } = {}) {
  const kinds = options.kind ? [options.kind] : (Object.keys(DIGEST_DAY) as DigestKind[]).filter((k) => DIGEST_DAY[k] === vietnamWeekday(now));
  const result = { kinds, sent: 0, skipped: 0, failed: 0, paused: false };
  if (!kinds.length) return result;
  if (await digestPaused()) return { ...result, paused: true };
  const db = getSupabaseClient();
  if (!db) return result;
  const week = isoWeek(now);
  const users = (await listVerifiedBuyerUsers()).filter(receivesIntroductions);
  if (!users.length) return result;
  const [data, recent] = await Promise.all([loadDigestData(now), recentShown()]);
  const names = new Map(data.categories.map((c) => [c.id, c.name]));
  const limit = options.limit ?? 1000;
  for (const kind of kinds) {
    const { data: done } = await db.from("buyer_digest_sends").select("buyer_id").eq("kind", kind).eq("week", week);
    const already = new Set((done ?? []).map((r) => r.buyer_id));
    for (const user of users) {
      if (result.sent + result.failed >= limit) break;
      if (already.has(user.id)) continue;
      const intro = readIntroductions(user.introductions);
      if (kind === "brief" && introFrequency(intro) !== "twice") continue;
      const categories = (intro.categories ?? []).filter((id) => names.has(id));
      const digest = digestFor(kind, categories, data, recent.get(user.id) ?? new Map(), now);
      if (!digest) { result.skipped++; continue; }
      const sent = await transport(buildDigestMail(digest, user, categories.map((id) => names.get(id)!), weekLabel(now))).catch(() => null);
      if (!sent?.ok) { result.failed++; continue; }
      await db.from("buyer_digest_sends").insert({ buyer_id: user.id, kind, week, items: digest.items });
      result.sent++;
    }
  }
  return result;
}

/** Số liệu cho CRM: thư đã gửi và lượt bấm trong 7 ngày qua. */
export async function digestStats() {
  const db = getSupabaseClient();
  if (!db) return { sends: 0, clicks: 0, rfqClicks: 0 };
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [{ count }, { data: clicks }] = await Promise.all([
    db.from("buyer_digest_sends").select("id", { count: "exact", head: true }).gte("sent_at", since.toISOString()),
    db.from("buyer_digest_clicks_daily").select("item_type, clicks").gte("day", since.toISOString().slice(0, 10)),
  ]);
  return { sends: count ?? 0, clicks: (clicks ?? []).reduce((n, r) => n + Number(r.clicks), 0), rfqClicks: (clicks ?? []).filter((r) => r.item_type === "rfq").reduce((n, r) => n + Number(r.clicks), 0) };
}
