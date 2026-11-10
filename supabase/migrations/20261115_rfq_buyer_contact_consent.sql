-- New sourcing requests record an explicit, per-request buyer-provided contact snapshot.
-- Pre-existing requests remain NULL: old privacy wording is NOT retroactive consent.
-- RFQs store the same snapshot/consent provenance inside rfqs.specs (existing jsonb);
-- no CRM data or buyer account row is exposed to the supplier portal.
begin;

alter table public.sourcing_requests
  add column if not exists buyer_contact_consent_at timestamptz,
  add column if not exists buyer_contact jsonb;

alter table public.sourcing_requests drop constraint if exists sourcing_buyer_contact_grant_ck;
alter table public.sourcing_requests add constraint sourcing_buyer_contact_grant_ck
  check ((buyer_contact_consent_at is null and buyer_contact is null)
     or (buyer_contact_consent_at is not null and jsonb_typeof(buyer_contact) = 'object'));

comment on column public.sourcing_requests.buyer_contact is
  'Buyer-entered transaction contact snapshot. Never copied from staff CRM fields; suppliers see it only after an RFQ is actually sent to them.';

notify pgrst, 'reload schema';
commit;
