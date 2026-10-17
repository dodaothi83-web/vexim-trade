import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/auth/secret";
import { getSupabaseClient } from "@/lib/db/supabase";
import type { TrafficRow } from "@/lib/supplier-portal/traffic-report";

type TrafficPage = { kind: "profile" | "product"; supplierId: string; resourceId: string; slug: string; exp: number };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function sign(body: string): Buffer {
  return createHmac("sha256", getAuthSecret()).update("supplier-traffic/v1:").update(body).digest();
}

export function createTrafficToken(page: Omit<TrafficPage, "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...page, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

export function verifyTrafficToken(token: unknown): TrafficPage | null {
  if (typeof token !== "string" || token.length > 1000) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const received = Buffer.from(signature, "base64url");
  const expected = sign(body);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const page = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TrafficPage;
    if ((page.kind !== "profile" && page.kind !== "product") ||
      !uuid.test(page.supplierId) || !uuid.test(page.resourceId) ||
      typeof page.slug !== "string" || page.slug.length > 120 ||
      !Number.isSafeInteger(page.exp) || page.exp < Date.now() || page.exp > Date.now() + 11 * 60_000 ||
      (page.kind === "profile" && page.resourceId !== page.supplierId)) return null;
    return page;
  } catch { return null; }
}

export async function recordPageView(page: TrafficPage): Promise<void> {
  const db = getSupabaseClient();
  if (!db) return; // No local/demo analytics: never imply counters are persisted in preview.
  const { error } = await db.rpc("record_supplier_page_view", {
    p_supplier_id: page.supplierId, p_page_kind: page.kind, p_resource_id: page.resourceId,
  });
  if (error) throw new Error(`supplier traffic write: ${error.message}`);
}

export async function readSupplierTraffic(supplierId: string, days: 7 | 30 | 90): Promise<TrafficRow[] | null> {
  const db = getSupabaseClient();
  if (!db) return null;
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  const rows: TrafficRow[] = [];
  // Supabase may cap a response at 1,000 rows; a 90-day period with many products can exceed that.
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from("supplier_traffic_daily")
      .select("day,page_kind,resource_id,views").eq("supplier_id", supplierId)
      .gte("day", cutoff.toISOString().slice(0, 10))
      .order("day").order("page_kind").order("resource_id").range(start, start + 999);
    if (error) throw new Error(`supplier traffic read: ${error.message}`);
    rows.push(...(data as TrafficRow[] ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
