import { normalizeHarvest } from "@/lib/public/harvest";
import type { HarvestCalendar } from "@/lib/types";

/** Parse the category editor payload. An explicitly empty list removes the calendar. */
export function parseHarvestInput(raw: unknown): HarvestCalendar | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new Error("Lịch mùa vụ không hợp lệ.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Lịch mùa vụ không phải JSON hợp lệ.");
  }
  if (parsed === null) return null;
  const windows = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>).windows
    : parsed;
  if (Array.isArray(windows) && windows.length === 0) return null;
  const normalized = normalizeHarvest(parsed);
  if (!normalized) throw new Error("Lịch mùa vụ phải có ít nhất một cửa sổ với tháng bắt đầu và kết thúc hợp lệ.");
  // A manual save must not retain or fabricate machine-research provenance.
  return { ...normalized, sources: undefined, review_origin: "staff" };
}
