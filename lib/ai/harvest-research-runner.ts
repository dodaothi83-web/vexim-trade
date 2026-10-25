import "server-only";

import { researchHarvest, type HarvestResearchReport } from "@/lib/ai/harvest-research";
import type { DataStore } from "@/lib/db/types";
import { normalizeHarvest } from "@/lib/public/harvest";
import type { AuditLogEntry, Category } from "@/lib/types";

const UPDATED_ACTION = "category.harvest_research_updated";
const FAILED_ACTION = "category.harvest_research_failed";

type Research = typeof researchHarvest;
type RunRow = Pick<AuditLogEntry, "entity_id" | "action" | "created_at">;

export interface HarvestResearchRunResult {
  category_id: string;
  slug: string;
  status: "updated" | "unchanged";
  code: string;
  message: string;
  report?: Partial<HarvestResearchReport>;
  audit_error?: string;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function sameHarvest(left: Category["harvest"], right: Category["harvest"]): boolean {
  return JSON.stringify(normalizeHarvest(left)) === JSON.stringify(normalizeHarvest(right));
}

function reviewTime(category: Category): number {
  const value = category.harvest?.reviewed_on;
  const time = value ? Date.parse(`${value}T00:00:00Z`) : 0;
  return Number.isFinite(time) ? time : 0;
}

/** Unscanned categories go first; after that, the least recently attempted category goes first. */
export function selectHarvestResearchCategories(categories: Category[], runs: RunRow[], limit: number): Category[] {
  const latest = new Map<string, string>();
  for (const run of runs) {
    const previous = latest.get(run.entity_id);
    if (!previous || run.created_at > previous) latest.set(run.entity_id, run.created_at);
  }
  return categories.slice().sort((a, b) => {
    const aRun = latest.get(a.id);
    const bRun = latest.get(b.id);
    if (!aRun && bRun) return -1;
    if (aRun && !bRun) return 1;
    if (!aRun && !bRun) return reviewTime(a) - reviewTime(b) || a.slug.localeCompare(b.slug);
    return aRun!.localeCompare(bRun!) || a.slug.localeCompare(b.slug);
  }).slice(0, Math.max(0, limit));
}

async function writeAudit(
  store: DataStore,
  category: Category,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<string | undefined> {
  try {
    await store.addAuditLog({
      actor_id: null,
      actor_email: null,
      entity: "category",
      entity_id: category.id,
      action,
      before,
      after,
    });
    return undefined;
  } catch (error) {
    console.error("[harvest-research] Could not write audit log", category.slug, error);
    return errorMessage(error);
  }
}

async function runOne(store: DataStore, category: Category, research: Research): Promise<HarvestResearchRunResult> {
  const before = { harvest: category.harvest ?? null, updated_by: category.updated_by ?? null };
  try {
    const result = await research(category);
    if (!result.ok) {
      const auditError = await writeAudit(store, category, FAILED_ACTION, before, {
        status: "unchanged",
        code: result.code,
        message: result.message,
        report: result.report ?? null,
      });
      return {
        category_id: category.id, slug: category.slug, status: "unchanged", code: result.code,
        message: result.message, report: result.report, audit_error: auditError,
      };
    }

    // Do not overwrite a manual edit or publication change made while web research was running.
    const latest = await store.getCategory(category.id);
    if (!latest || latest.is_published === false || !sameHarvest(latest.harvest, category.harvest)) {
      const auditError = await writeAudit(store, category, FAILED_ACTION, before, {
        status: "unchanged",
        code: "concurrent_change",
        message: "The category changed during research, so the verified result was not written.",
        report: result.report,
      });
      return {
        category_id: category.id, slug: category.slug, status: "unchanged", code: "concurrent_change",
        message: "The category changed during research; the current calendar was preserved.", report: result.report, audit_error: auditError,
      };
    }

    await store.updateCategory(category.id, { harvest: result.harvest, updated_by: null });
    const auditError = await writeAudit(store, category, UPDATED_ACTION, before, {
      status: "updated",
      harvest: result.harvest,
      updated_by: null,
      report: result.report,
    });
    return {
      category_id: category.id, slug: category.slug, status: "updated", code: "updated",
      message: "The source-backed calendar replaced the previous calendar.", report: result.report, audit_error: auditError,
    };
  } catch (error) {
    const message = errorMessage(error);
    const auditError = await writeAudit(store, category, FAILED_ACTION, before, {
      status: "unchanged", code: "run_error", message,
    });
    return {
      category_id: category.id, slug: category.slug, status: "unchanged", code: "run_error",
      message, audit_error: auditError,
    };
  }
}

export async function runHarvestResearchBatch(options: {
  store: DataStore;
  batchSize?: number;
  research?: Research;
}): Promise<{ considered: number; selected: number; updated: number; unchanged: number; results: HarvestResearchRunResult[] }> {
  const { store } = options;
  const requestedBatch = Number(options.batchSize ?? 1);
  const batchSize = Number.isFinite(requestedBatch) ? Math.min(4, Math.max(1, Math.floor(requestedBatch))) : 1;
  const [categories, runs] = await Promise.all([
    store.listCategories({ publishedOnly: true }),
    store.listHarvestResearchRuns(),
  ]);
  const selected = selectHarvestResearchCategories(categories, runs, batchSize);
  const results: HarvestResearchRunResult[] = [];
  for (const category of selected) {
    results.push(await runOne(store, category, options.research ?? researchHarvest));
  }
  return {
    considered: categories.length,
    selected: selected.length,
    updated: results.filter((result) => result.status === "updated").length,
    unchanged: results.filter((result) => result.status === "unchanged").length,
    results,
  };
}
