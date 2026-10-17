-- Expand nullable checklist_key for factory visit and delivered-order evidence.
-- Existing L1 links and unassigned/legacy files remain untouched.
-- Run after 20261017_audit_checklist_evidence.sql, before deploying inline L2/L3 uploads.
begin;
alter table public.media_assets add column if not exists checklist_key text;
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type = 'verification' and verification_id is not null and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified',
    'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof'
  ))
);
commit;
notify pgrst, 'reload schema';
