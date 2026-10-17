import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/auth/secret";
import { getSupabaseClient } from "@/lib/db/supabase";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Explicit staging opt-in; no VERCEL_ENV=production path and no production default. */
export function sponsoredPilotEnabled(): boolean {
  return process.env.VEXIM_SPONSORED_PILOT === "true" &&
    process.env.VEXIM_DEPLOY_ENV === "staging" && process.env.VERCEL_ENV !== "production";
}

type Campaign = {
  id: string; category_slug: string; supplier_id: string; product_id: string;
  status: "draft" | "approved" | "paused"; starts_at: string; ends_at: string;
};
type Ticket = { campaignId: string; categorySlug: string; supplierId: string; productId: string; exp: number };

export function eligiblePilotCampaign(c: Campaign, card: PublicCategoryProduct | undefined, categorySlug: string, now = new Date()): boolean {
  return !!card && !card.isDemo && c.status === "approved" &&
    c.category_slug === categorySlug && card.supplierId === c.supplier_id && card.id === c.product_id &&
    Date.parse(c.starts_at) <= now.getTime() && Date.parse(c.ends_at) > now.getTime();
}

function signature(body: string): Buffer {
  return createHmac("sha256", getAuthSecret()).update("sponsored-pilot/v1:").update(body).digest();
}

export function createPilotTicket(c: Campaign): string {
  const ticket: Ticket = { campaignId: c.id, categorySlug: c.category_slug,
    supplierId: c.supplier_id, productId: c.product_id, exp: Date.now() + 30 * 60_000 };
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${body}.${signature(body).toString("base64url")}`;
}

export function verifyPilotTicket(input: unknown): Ticket | null {
  if (typeof input !== "string" || input.length > 1000) return null;
  const [body, mac, extra] = input.split(".");
  if (!body || !mac || extra) return null;
  const expected = signature(body);
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Ticket;
    if (!uuid.test(ticket.campaignId) || !uuid.test(ticket.supplierId) || !uuid.test(ticket.productId) ||
      typeof ticket.categorySlug !== "string" || ticket.categorySlug.length > 120 ||
      !Number.isSafeInteger(ticket.exp) || ticket.exp < Date.now() || ticket.exp > Date.now() + 31 * 60_000) return null;
    return ticket;
  } catch { return null; }
}

export type PilotPlacement = { product: PublicCategoryProduct; ticket: string; campaignId: string };

/** Only the first eligible, explicitly approved staging campaign. Organic products remain untouched. */
export async function pilotPlacement(categorySlug: string, products: PublicCategoryProduct[]): Promise<PilotPlacement | null> {
  if (!sponsoredPilotEnabled() || products.length === 0) return null;
  const db = getSupabaseClient();
  if (!db) return null;
  const { data, error } = await db.from("sponsored_pilot_campaigns")
    .select("id,category_slug,supplier_id,product_id,status,starts_at,ends_at")
    .eq("category_slug", categorySlug).eq("status", "approved")
    .lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString())
    .limit(1);
  if (error) { console.error("sponsored pilot unavailable", error); return null; }
  const campaign = data?.[0] as Campaign | undefined;
  const product = products.find((p) => p.id === campaign?.product_id && p.supplierId === campaign.supplier_id);
  if (!campaign || !eligiblePilotCampaign(campaign, product, categorySlug)) return null;
  return { product: product!, ticket: createPilotTicket(campaign), campaignId: campaign.id };
}

export async function readPilotCampaign(id: string): Promise<Campaign | null> {
  const db = getSupabaseClient();
  if (!db) return null;
  const { data, error } = await db.from("sponsored_pilot_campaigns")
    .select("id,category_slug,supplier_id,product_id,status,starts_at,ends_at")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`pilot campaign read: ${error.message}`);
  return data as Campaign | null;
}

export async function recordPilotEvent(id: string, event: "impression" | "click"): Promise<void> {
  const db = getSupabaseClient();
  if (!db) return;
  const { error } = await db.rpc("record_sponsored_pilot_event", { p_campaign_id: id, p_event_type: event });
  if (error) throw new Error(`pilot event write: ${error.message}`);
}
