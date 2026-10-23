/**
 * Khi PostgREST báo thiếu bảng hoặc thiếu cột, gần như chắc chắn là một file migration
 * chưa được chạy trên Supabase. Câu lỗi mặc định chỉ có tên bảng, người vận hành phải
 * tự dò trong `supabase/migrations`. Hàm này nói thẳng cần chạy file nào.
 *
 * Chỉ dùng để ghi log. Không đưa nội dung này ra giao diện cho buyer hoặc nhà cung cấp.
 */
const HINTS: Array<{ match: RegExp; migration: string }> = [
  { match: /supplier_portal_notice_reads/i, migration: "supabase/migrations/20261017_supplier_dashboard.sql" },
  { match: /response_due_at|supplier_replied_at|source_product_id/i, migration: "supabase/migrations/20261017_supplier_dashboard.sql" },
  { match: /supplier_submissions|supplier_submission_items|supplier_submission_links/i, migration: "supabase/migrations/20261020_supplier_self_verification_submissions.sql" },
  { match: /sponsored_push/i, migration: "supabase/migrations/20261028_sponsored_product_push.sql" },
  { match: /display_name/i, migration: "supabase/migrations/20261030_product_display_name.sql" },
];

/** 'Thiếu bảng supplier_portal_notice_reads: chạy supabase/migrations/…' hoặc null. */
export function migrationHint(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return null;
  // Chỉ coi là thiếu schema khi PostgREST nói rõ điều đó, để lỗi mạng không bị gắn nhãn sai.
  const schemaMissing = /schema cache|does not exist|Could not find the table|Could not find the .* column/i.test(message);
  if (!schemaMissing) return null;
  const hint = HINTS.find((item) => item.match.test(message));
  return hint ? `Có thể thiếu migration: chạy ${hint.migration}` : "Nhiều khả năng còn file migration chưa chạy trong supabase/migrations.";
}
