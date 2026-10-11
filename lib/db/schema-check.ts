import "server-only";

import { getSupabaseClient, supabaseConfigured } from "@/lib/db/supabase";

/**
 * Kiểm tra schema Supabase đã đủ bảng/cột mà app cần chưa.
 * Dùng ở trang Cài đặt và ở lệnh `npm run check:supabase`.
 */

export interface TableCheck {
  table: string;
  ok: boolean;
  rows: number | null;
  note?: string;
}

export interface SchemaReport {
  /** Chưa cấu hình Supabase thì không kiểm tra được */
  configured: boolean;
  /** Có gọi được Supabase hay không */
  reachable: boolean;
  reason?: string;
  tables: TableCheck[];
  /** Cột bắt buộc còn thiếu (ví dụ ready_for_buyer) */
  missingColumns: string[];
  ready: boolean;
}

const TABLES = [
  "suppliers",
  "supplier_products",
  "buyers",
  "buyer_activities",
  "email_messages",
  "media_assets",
  "app_users",
];

const REQUIRED_COLUMNS: { table: string; column: string }[] = [
  { table: "supplier_products", column: "ready_for_buyer" },
];

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
}

export async function checkSchema(): Promise<SchemaReport> {
  const client = getSupabaseClient();
  if (!supabaseConfigured() || !client) {
    return {
      configured: false,
      reachable: false,
      tables: [],
      missingColumns: [],
      ready: false,
    };
  }

  const tables: TableCheck[] = [];
  let reachable = true;
  let reason: string | undefined;

  for (const table of TABLES) {
    try {
      const { count, error } = await client
        .from(table)
        .select("id", { count: "exact", head: true });
      if (error) {
        if (isMissingTable(error)) {
          tables.push({ table, ok: false, rows: null, note: "chưa có bảng" });
        } else {
          reachable = false;
          reason = reason ?? error.message;
          tables.push({ table, ok: false, rows: null, note: error.message });
        }
      } else {
        tables.push({ table, ok: true, rows: count ?? 0 });
      }
    } catch (err) {
      reachable = false;
      reason = reason ?? (err instanceof Error ? err.message : String(err));
      tables.push({ table, ok: false, rows: null, note: "không gọi được Supabase" });
      break;
    }
  }

  const missingColumns: string[] = [];
  if (reachable) {
    for (const req of REQUIRED_COLUMNS) {
      try {
        const { error } = await client
          .from(req.table)
          .select(req.column, { count: "exact", head: true });
        if (error) missingColumns.push(`${req.table}.${req.column}`);
      } catch {
        /* bỏ qua */
      }
    }
  }

  const ready = reachable && tables.every((t) => t.ok) && missingColumns.length === 0;

  return { configured: true, reachable, reason, tables, missingColumns, ready };
}
