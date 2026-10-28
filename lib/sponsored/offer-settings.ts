import "server-only";
import { getSupabaseClient } from "@/lib/db/supabase";

/** This table is configuration only: no setting in it enables checkout. */
export interface OfferSettings {
  price_vnd: number | null;
  hold_minutes: number;
  packages_per_slot: number;
  updated_at: string;
}

export async function readOfferSettings(): Promise<OfferSettings> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Sponsored offer database is not configured");
  const { data, error } = await db.from("sponsored_offer_settings")
    .select("price_vnd,hold_minutes,packages_per_slot,updated_at").eq("id", true).single();
  if (error || !data) throw new Error(`Cannot read sponsored offer settings: ${error?.message ?? "missing settings"}`);
  const price = data.price_vnd === null ? null : Number(data.price_vnd);
  const hold = Number(data.hold_minutes), packages = Number(data.packages_per_slot);
  if ((price !== null && (!Number.isSafeInteger(price) || price < 1 || price > 1_000_000_000)) ||
      !Number.isInteger(hold) || hold < 1 || hold > 1440 || !Number.isInteger(packages) || packages < 1 || packages > 20) {
    throw new Error("Invalid sponsored offer settings");
  }
  return { price_vnd: price, hold_minutes: hold, packages_per_slot: packages, updated_at: data.updated_at };
}

export function parseOfferSettings(fd: FormData): Pick<OfferSettings, "price_vnd" | "hold_minutes" | "packages_per_slot"> | null {
  const parse = (value: FormDataEntryValue | null, min: number, max: number) => {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
  };
  const rawPrice = fd.get("price_vnd");
  const price = rawPrice === "" ? null : parse(rawPrice, 1, 1_000_000_000);
  const hold = parse(fd.get("hold_minutes"), 1, 1440);
  const packages = parse(fd.get("packages_per_slot"), 1, 20);
  if ((rawPrice !== "" && price === null) || hold === null || packages === null) return null;
  return { price_vnd: price, hold_minutes: hold, packages_per_slot: packages };
}
