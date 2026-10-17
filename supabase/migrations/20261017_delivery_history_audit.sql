-- Apply after 20261017_verification_workflow.sql, before deploying the delivery audit pages.
-- Add evidence fields for one actual, completed shipment; never infer from RFQ won.
begin;
alter table public.verifications
  add column if not exists shipment_ref text,
  add column if not exists shipped_on date,
  add column if not exists shipment_destination text;
commit;
notify pgrst, 'reload schema';
