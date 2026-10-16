-- RFQ email completion — run on existing Supabase installation BEFORE deploying code.
-- Idempotent. Requires public.rfqs, public.rfq_matches, public.email_messages.
begin;

-- Existing RFQ tables from the foundation migration may still have old statuses.
alter table public.rfqs add column if not exists lost_reason text;
alter table public.rfqs drop constraint if exists rfqs_status_check;
update public.rfqs set status = case status
  when 'qualified' then 'in_progress'
  when 'quoting' then 'matching'
  when 'closed' then 'lost'
  else status end
where status in ('qualified', 'quoting', 'closed');
update public.rfqs set lost_reason = 'legacy_unspecified'
where status = 'lost' and nullif(trim(lost_reason), '') is null;
alter table public.rfqs add constraint rfqs_status_check check (status in
  ('new','needs_review','in_progress','matching','quoted','sampling','won','lost','spam'));
alter table public.rfqs drop constraint if exists rfqs_lost_reason_check;
alter table public.rfqs add constraint rfqs_lost_reason_check check (
  status <> 'lost' or nullif(trim(lost_reason), '') is not null);

alter table public.email_messages
  add column if not exists rfq_id uuid references public.rfqs(id) on delete set null;
alter table public.email_messages
  add column if not exists rfq_match_id uuid references public.rfq_matches(id) on delete set null;
alter table public.email_messages add column if not exists rfc_message_id text;
alter table public.email_messages add column if not exists read_at timestamptz;
create index if not exists email_messages_rfq_idx
  on public.email_messages (rfq_id, created_at desc);
create unique index if not exists email_messages_buyer_status_once_idx
  on public.email_messages (rfq_id, stage) where kind = 'buyer_status_update';
alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in
  ('auto','manual','inbound','rfq_outreach','rfq_followup','shortlist_buyer','buyer_status_update'));
alter table public.email_messages drop constraint if exists email_messages_status_check;
alter table public.email_messages add constraint email_messages_status_check check (status in
  ('draft','sent','failed','simulated','received'));

commit;
