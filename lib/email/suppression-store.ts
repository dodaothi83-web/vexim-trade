import "server-only";

import { getSupabaseClient } from "@/lib/db/supabase";
import { normalizeEmail, type SuppressionEvent } from "@/lib/email/suppression";

/**
 * Lớp đọc/ghi danh sách ngừng gửi thư (bảng public.email_suppressions).
 *
 * Nguyên tắc: KHÔNG chặn oan đường thư. Bảng chưa được tạo, Supabase chưa cấu
 * hình hay mạng lỗi thì trả về rỗng và ghi log, thư vẫn đi như trước. Bounce chỉ
 * được ghi khi Resend thực sự báo.
 */

function client() {
  return getSupabaseClient();
}

/** Tập địa chỉ (đã chuẩn hoá) đang bị ngừng gửi trong số `emails` được hỏi. */
export async function suppressedEmails(emails: string[]): Promise<Set<string>> {
  const wanted = [...new Set(emails.map(normalizeEmail).filter((email) => email.includes("@") && email.length <= 320))];
  if (!wanted.length) return new Set();
  const supabase = client();
  if (!supabase) return new Set();
  try {
    const { data, error } = await supabase.from("email_suppressions").select("email").in("email", wanted);
    if (error) {
      console.error("[email/suppression] không đọc được danh sách ngừng gửi:", error.message);
      return new Set();
    }
    return new Set((data ?? []).map((row) => normalizeEmail((row as { email?: string }).email)));
  } catch (err) {
    console.error("[email/suppression] lỗi khi đọc danh sách ngừng gửi:", err instanceof Error ? err.message : err);
    return new Set();
  }
}

export interface RecordSuppressionResult {
  saved: string[];
  skipped: string[];
  deactivatedAccounts: number;
}

/**
 * Ghi bounce/complaint vào bảng và tắt tài khoản nhà cung cấp dùng địa chỉ đó.
 * Việc tắt tài khoản nằm trong hàm RPC để chỉ một nơi quyết định (xem migration
 * 20261104_email_bounce_suppression.sql).
 */
export async function recordSuppressions(event: SuppressionEvent): Promise<RecordSuppressionResult> {
  const result: RecordSuppressionResult = { saved: [], skipped: [], deactivatedAccounts: 0 };
  const supabase = client();
  if (!supabase) {
    result.skipped = event.emails;
    return result;
  }
  for (const email of event.emails) {
    try {
      const { data, error } = await supabase.rpc("record_email_suppression", {
        p_email: email,
        p_reason: event.reason,
        p_event_type: event.eventType,
        p_detail: event.detail,
      });
      if (error) {
        console.error(`[email/suppression] không ghi được ${email}:`, error.message);
        result.skipped.push(email);
        continue;
      }
      const payload = (data ?? {}) as { status?: string; deactivated_accounts?: number };
      if (payload.status === "saved") {
        result.saved.push(email);
        result.deactivatedAccounts += Number(payload.deactivated_accounts ?? 0) || 0;
      } else {
        result.skipped.push(email);
      }
    } catch (err) {
      console.error(`[email/suppression] lỗi khi ghi ${email}:`, err instanceof Error ? err.message : err);
      result.skipped.push(email);
    }
  }
  return result;
}

/** Cho phép gửi lại sau khi người nhận đã sửa hộp thư (CRM gọi). */
export async function clearSuppression(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const supabase = client();
  if (!supabase || !normalized.includes("@")) return false;
  const { data, error } = await supabase.rpc("clear_email_suppression", { p_email: normalized });
  if (error) {
    console.error("[email/suppression] không gỡ được địa chỉ:", error.message);
    return false;
  }
  return (data as { status?: string } | null)?.status === "cleared";
}

/** Danh sách cho CRM xem ai đang bị chặn và vì sao. */
export async function listSuppressions(limit = 200) {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("email_suppressions")
    .select("email, reason, event_type, detail, first_seen_at, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) {
    console.error("[email/suppression] không đọc được danh sách ngừng gửi:", error.message);
    return [];
  }
  return data ?? [];
}
