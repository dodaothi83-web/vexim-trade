import type { SponsoredPush } from "@/lib/types";

export type SupplierPushState = "draft" | "scheduled" | "live" | "paused" | "ended" | "unavailable" | "unknown";

/** Live means eligible for the rotation, not that the card is on every page view. */
export function supplierPushState(
  push: Pick<SponsoredPush, "surface" | "status" | "starts_at" | "ends_at" | "product_id" | "category_slug">,
  now: number,
  eligible: ReadonlySet<string> | null,
): SupplierPushState {
  if (push.surface !== "category") return "unavailable";
  if (push.status === "draft") return "draft";
  const start = Date.parse(push.starts_at);
  const end = Date.parse(push.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "unknown";
  if (now >= end) return "ended";
  if (push.status === "paused") return "paused";
  if (now < start) return "scheduled";
  if (!eligible) return "unknown";
  return eligible.has(`${push.product_id}\0${push.category_slug}`) ? "live" : "unavailable";
}
