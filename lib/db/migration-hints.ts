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
  { match: /l2_scope/i, migration: "supabase/migrations/20261040_l2_partner_contract.sql" },
  // L3 mở thêm key chứng từ khác; CHECK cũ từ 20261020/20261031 chưa nhận key này.
  { match: /supplier_submission_items_key_ck/i, migration: "supabase/migrations/20261039_l3_other_export_evidence.sql và supabase/migrations/20261040_l2_partner_contract.sql" },
  { match: /media_checklist_key_ck/i, migration: "supabase/migrations/20261031_supplier_submission_media_owner.sql, supabase/migrations/20261039_l3_other_export_evidence.sql và supabase/migrations/20261040_l2_partner_contract.sql" },
  { match: /supplier_submissions|supplier_submission_items|supplier_submission_links/i, migration: "supabase/migrations/20261020_supplier_self_verification_submissions.sql" },
  { match: /sponsored_push/i, migration: "supabase/migrations/20261028_sponsored_product_push.sql" },
  { match: /display_name/i, migration: "supabase/migrations/20261030_product_display_name.sql" },
  { match: /raw_material_region|input_material_origin/i, migration: "supabase/migrations/20261037_product_raw_material_profile.sql" },
  {
    match: /intro_source|moq_text_i18n|export_markets_i18n|profile_translation_meta/i,
    migration: "supabase/migrations/20261036_supplier_translation_schema_repair.sql",
  },
  // Thông số NCC tự thêm cho nhóm hàng.
  { match: /supplier_product_fields/i, migration: "supabase/migrations/20261032_supplier_attribute_pool.sql" },
  // Bằng chứng hồ sơ tự gửi: thiếu cột submission_id / ràng buộc cũ chưa được nới
  // → lỗi khoá ngoại media_assets_verification_id_fkey khi NCC tải ảnh L2/L3.
  {
    match: /submission_id|media_assets_verification_id_fkey|media_assets_submission_id_fkey|media_owner_ck|media_checklist_key_ck/i,
    migration: "supabase/migrations/20261031_supplier_submission_media_owner.sql",
  },
];

/** 'Thiếu bảng supplier_portal_notice_reads: chạy supabase/migrations/…' hoặc null. */
export function migrationHint(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return null;
  const hint = HINTS.find((item) => item.match.test(message));
  // Chỉ coi là thiếu schema khi PostgREST nói rõ điều đó (hoặc khi đúng một ràng buộc
  // đã biết bị vi phạm), để lỗi mạng không bị gắn nhãn sai.
  const schemaMissing = /schema cache|does not exist|Could not find the table|Could not find the .* column/i.test(message);
  const constraintBroken = !!hint && /violates (foreign key|check) constraint/i.test(message);
  if (!schemaMissing && !constraintBroken) return null;
  return hint ? `Có thể thiếu migration: chạy ${hint.migration}` : "Nhiều khả năng còn file migration chưa chạy trong supabase/migrations.";
}
