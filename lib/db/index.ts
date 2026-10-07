import "server-only";

import { localStore } from "@/lib/db/local";
import { supabaseConfigured, supabaseStore } from "@/lib/db/supabase";
import type { DataStore } from "@/lib/db/types";

/**
 * Tự chọn tầng dữ liệu:
 *  - Có SUPABASE_URL + key  -> dùng Supabase
 *  - Chưa có               -> dùng kho local (data/local-db.json) để chạy demo
 */
export function getStore(): DataStore {
  return supabaseConfigured() ? supabaseStore : localStore;
}

export function dataMode(): "supabase" | "local" {
  return supabaseConfigured() ? "supabase" : "local";
}
