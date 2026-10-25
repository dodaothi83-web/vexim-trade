/**
 * Scheduled source-backed crop-calendar research.
 *
 * External cron: GET /api/cron/harvest-research
 * Header: Authorization: Bearer <CRON_SECRET>
 * Suggested schedule: once daily. One category is researched per run by default;
 * HARVEST_RESEARCH_BATCH_SIZE can raise this to at most four.
 */
import { NextResponse } from "next/server";

import { runHarvestResearchBatch } from "@/lib/ai/harvest-research-runner";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const url = new URL(req.url);
    const requested = url.searchParams.get("batch") ?? process.env.HARVEST_RESEARCH_BATCH_SIZE ?? "1";
    const batchSize = Number(requested);
    const report = await runHarvestResearchBatch({
      store: getStore(),
      batchSize: Number.isFinite(batchSize) ? batchSize : 1,
    });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    console.error("[harvest-research] Cron run failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
