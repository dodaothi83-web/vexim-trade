import "server-only";

import brandColors from "@/lib/brand/colors.json";
import { FROM_ADDRESS } from "@/lib/config";
import { getStore } from "@/lib/db";
import { getSupabaseClient } from "@/lib/db/supabase";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { rfqChannel } from "@/lib/rfq/channel";
import { SITE_URL } from "@/lib/site";
import type { BuyerUser } from "@/lib/types";
import {
  alertKey, buildAlerts, capAllows, snapshotOf, snapshotSignature, vietnamDay,
  type AlertSnapshot, type BuyerAlerts,
} from "./alerts";
import { clickUrl, digestPaused, link, loadDigestData, productGridHtml, section, unsubscribeUrl, type DigestData } from "./digest-server";
import { readIntroductions, receivesIntroductions } from "./introductions";
import { issueIntroToken, listVerifiedBuyerUsers } from "./introductions-server";

/**
 * Thư theo hành vi (chạy hằng ngày trong cron chung, sau thư hằng tuần). Gộp mọi mục mới của một người
 * mua thành một thư; giới hạn chung 1 thư/ngày và 4 thư/7 ngày, tính cả thư thứ Ba và thứ Sáu.
 * Công tắc tạm dừng trong CRM dừng cả loại thư này.
 */
const OPEN_RFQ = new Set(["new", "needs_review", "in_progress", "matching"]);

export async function runBuyerAlerts(now = new Date(), options: { limit?: number } = {}) {
  const result = { sent: 0, skipped: 0, failed: 0, capped: 0, paused: false };
  if (await digestPaused()) return { ...result, paused: true };
  const db = getSupabaseClient();
  if (!db) return result;
  const store = getStore();
  const users = await listVerifiedBuyerUsers();
  if (!users.length) return result;
  const data = await loadDigestData(now);
  const since = new Date(now.getTime() - 400 * 86_400_000).toISOString();
  const [{ data: sends, error: sendsError }, { data: snaps, error: snapError }] = await Promise.all([
    db.from("buyer_digest_sends").select("buyer_id, kind, items, sent_at").gte("sent_at", since),
    db.from("buyer_saved_snapshots").select("buyer_id, product_id, snapshot"),
  ]);
  if (sendsError) throw sendsError;
  if (snapError) throw snapError;
  const limit = options.limit ?? 1000;

  for (const user of users) {
    if (result.sent + result.failed >= limit) break;
    const mine = (sends ?? []).filter((r) => r.buyer_id === user.id);
    const consented = receivesIntroductions(user);
    const savedIds = (user.saved?.products ?? []).map((p) => p.id);
    const before = new Map((snaps ?? []).filter((r) => r.buyer_id === user.id).map((r) => [String(r.product_id), r.snapshot as AlertSnapshot]));

    // Sản phẩm đã lưu chưa có mốc: ghi mốc trước, lần sau mới so sánh (không báo thay đổi cũ).
    if (consented) await baselineSaved(user.id, savedIds, before, data);

    const rfqs = await rfqInputs(store, user.email);
    if (!consented && !rfqs.some((r) => r.open && !r.hasQuote)) continue;
    const sent = new Set<string>();
    for (const row of mine) if (row.kind === "alerts") for (const item of Array.isArray(row.items) ? row.items : []) sent.add(alertKey(item));
    const intro = readIntroductions(user.introductions);
    const followed = new Set<string>();
    for (const id of savedIds) { const p = data.products.find((x) => x.id === id); if (p) followed.add(p.supplierId); }
    for (const r of rfqs) for (const id of r.followed) followed.add(id);

    const alerts = buildAlerts({
      now, consented, categories: intro.categories ?? [], allCategories: data.categories, products: data.products,
      directory: data.directory ?? [], parentOf: data.parentOf ?? {},
      saved: savedIds.map((id) => ({ id, before: before.get(id) ?? null })), followedSuppliers: [...followed], rfqs, sent,
    });
    if (!alerts) { result.skipped++; continue; }
    if (!capAllows(mine.map((r) => r.sent_at), now)) { result.capped++; continue; }

    const mail = buildAlertsMail(alerts, user, consented);
    const res = await transport(mail).catch(() => null);
    if (!res?.ok) { result.failed++; continue; }
    const { error } = await db.from("buyer_digest_sends").insert({ buyer_id: user.id, kind: "alerts", week: vietnamDay(now), items: alerts.items });
    if (error) console.error("[buyer-alerts] log", error);
    // Đã báo thay đổi thì lấy trạng thái hiện tại làm mốc mới.
    for (const s of alerts.saved) await upsertSnapshot(user.id, s.product.id, s.snapshot);
    result.sent++;
  }
  return result;
}

async function baselineSaved(buyerId: string, savedIds: string[], before: Map<string, AlertSnapshot>, data: DigestData) {
  for (const id of savedIds) {
    if (before.has(id)) continue;
    const product = data.products.find((p) => p.id === id);
    if (!product) continue;
    const snapshot = snapshotOf(product);
    await upsertSnapshot(buyerId, id, snapshot);
    before.set(id, snapshot);
  }
}

async function upsertSnapshot(buyerId: string, productId: string, snapshot: AlertSnapshot) {
  const db = getSupabaseClient();
  if (!db) return;
  const { error } = await db.from("buyer_saved_snapshots")
    .upsert({ buyer_id: buyerId, product_id: productId, snapshot, signature: snapshotSignature(snapshot), updated_at: new Date().toISOString() }, { onConflict: "buyer_id,product_id" });
  if (error) console.error("[buyer-alerts] snapshot", error);
}

async function rfqInputs(store: ReturnType<typeof getStore>, email: string) {
  const rfqs = await store.listBuyerRfqsByEmail(email).catch(() => []);
  const out = [];
  for (const r of rfqs) {
    if (rfqChannel(r) === "question") continue;
    const open = OPEN_RFQ.has(r.status);
    const matches = await store.listRfqMatches(r.id).catch(() => []);
    const hasQuote = matches.some((m) => !!m.sent_to_buyer_at || m.status === "presented_to_buyer" || m.status === "selected");
    out.push({
      id: r.id, code: r.code, product: r.product_text, createdAt: r.created_at, categoryId: r.category_id,
      preferredSupplierIds: r.preferred_supplier_ids ?? [], open, hasQuote,
      followed: [...(r.preferred_supplier_ids ?? []), ...matches.filter((m) => !!m.sent_to_buyer_at).map((m) => m.supplier_id)],
    });
  }
  return out;
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Ho_Chi_Minh" });

/** Tiêu đề theo nội dung chính; nhiều loại thì dùng tiêu đề chung. */
export function alertsSubject(a: BuyerAlerts): string {
  const kinds = [a.saved.length, a.fresh.length, a.rfqs.length, a.seasons.length].filter(Boolean).length;
  if (kinds > 1) return "Updates on products and suppliers you follow";
  if (a.saved.length) return a.saved.length === 1 ? `Update on ${a.saved[0].product.name}` : `${a.saved.length} products you saved have updates`;
  if (a.fresh.length) return a.fresh.length === 1 ? `New product from a supplier you follow: ${a.fresh[0].name}` : `${a.fresh.length} new products from suppliers you follow`;
  if (a.rfqs.length) return `Your request ${a.rfqs[0].code}: Vexim is still matching suppliers`;
  return `${a.seasons[0].category.name} harvest starts this month`;
}

export function buildAlertsMail(a: BuyerAlerts, buyer: Pick<BuyerUser, "email">, consented: boolean) {
  const subject = alertsSubject(a);
  const parts: string[] = [];
  const text: string[] = [subject, ""];

  if (a.saved.length) {
    parts.push(section("Products you saved", a.saved.map((s) => {
      const href = clickUrl({ k: "alerts", t: "product", i: s.product.id, s: s.product.supplierId, u: s.product.href });
      text.push(`${s.product.name}: ${s.changes.join(". ")}. ${href}`);
      return `<div style="border:1px solid #DFE5EE;border-radius:12px;padding:14px;margin:0 0 10px;">
        <p style="margin:0 0 6px;font-weight:700;color:#141C2E;">${escapeHtml(s.product.name)}</p>
        ${s.changes.map((c) => `<p style="margin:0 0 4px;font-size:14px;">${escapeHtml(c)}.</p>`).join("")}
        <p style="margin:8px 0 0;">${link(href, "View product")}</p></div>`;
    }).join("")));
  }

  if (a.fresh.length) {
    parts.push(section("New from suppliers you follow", productGridHtml(a.fresh, "alerts")));
    for (const p of a.fresh) text.push(`New: ${p.name}: ${clickUrl({ k: "alerts", t: "product", i: p.id, s: p.supplierId, u: p.href })}`);
  }

  for (const r of a.rfqs) {
    const open = `${SITE_URL}${r.href}`;
    const suggestions = r.suppliers.length ? `<p style="margin:12px 0 6px;font-size:14px;">Suppliers with checked profiles${r.categoryName ? ` in ${escapeHtml(r.categoryName)}` : ""}:</p>
      ${r.suppliers.map((s) => `<p style="margin:0 0 6px;font-size:14px;"><b>${escapeHtml(s.name)}</b>, ${escapeHtml(s.location)}. ${link(clickUrl({ k: "alerts", t: "supplier", i: s.id, s: s.id, u: s.href }), "View supplier")}</p>`).join("")}` : "";
    parts.push(section(`Your request ${r.code}`, `<div style="border:1px solid #DFE5EE;border-radius:12px;padding:14px;">
      <p style="margin:0 0 6px;font-weight:700;color:#141C2E;">${escapeHtml(r.product)}</p>
      <p style="margin:0;font-size:14px;">Sent ${escapeHtml(dateLabel(r.sentAt))}. No quotes yet. Vexim is still contacting suppliers and will email you when a quote is ready.</p>
      ${suggestions}
      <p style="margin:12px 0 0;">${link(open, "Open your request")}</p></div>`));
    text.push(`Request ${r.code} (${r.product}): no quotes yet. Vexim is still contacting suppliers. ${open}`);
    for (const s of r.suppliers) text.push(`Supplier: ${s.name}, ${s.location}: ${SITE_URL}${s.href}`);
  }

  for (const s of a.seasons) {
    const regions = s.regions.length ? ` Main regions: ${s.regions.join(", ")}.` : "";
    parts.push(section(`${s.category.name} harvest`, `<p style="margin:0 0 10px;font-size:14px;">${escapeHtml(s.label)} runs ${escapeHtml(s.months)}.${escapeHtml(regions)} This is a good time to ask suppliers for new crop prices.</p>
      ${s.products.length ? productGridHtml(s.products, "alerts") : ""}`));
    text.push(`${s.category.name} harvest: ${s.label} runs ${s.months}.${regions}`);
  }

  const rfq = clickUrl({ k: "alerts", t: "rfq", i: "rfq", u: "/rfq" });
  const token = consented ? issueIntroToken(buyer.email) : null;
  const footer = consented && token
    ? `You get this because you saved products, sent a request or chose products on Vexim Trade. At most one email a day.<br>
      <a href="${escapeHtml(`${SITE_URL}/buyer/introductions?t=${encodeURIComponent(token)}`)}" style="color:${brandColors.muted};">Change my products</a> | <a href="${escapeHtml(unsubscribeUrl(token))}" style="color:${brandColors.muted};">Unsubscribe</a>`
    : "You get this because you sent a request on Vexim Trade.";
  const html = wrapPlainEmail({ title: subject, preheader: subject, body: `
    <p style="margin:0;font-size:20px;font-weight:800;color:#141C2E;">${escapeHtml(subject)}</p>
    ${parts.join("")}
    <div style="margin:26px 0 0;padding:16px;border:1px solid #DFE5EE;border-radius:12px;background:#F2F5FA;">
      <p style="margin:0;font-weight:700;color:#141C2E;">Need a quote?</p>
      <p style="margin:2px 0 10px;font-size:14px;">Send one request. Vexim matches checked suppliers and keeps your contact private.</p>
      <a href="${escapeHtml(rfq)}" style="display:inline-block;padding:10px 16px;background:${brandColors.primary};color:#ffffff;border-radius:8px;font-weight:700;text-decoration:none;">Request a quote</a></div>
    <p style="margin:24px 0 0;font-size:12px;color:${brandColors.muted};">${footer}</p>` });
  text.push("", `Request a quote: ${rfq}`);
  if (token) text.push("", `Unsubscribe: ${unsubscribeUrl(token)}`);
  return {
    to: [buyer.email], from: FROM_ADDRESS, subject, html, text: text.join("\n"),
    ...(token ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
  };
}
