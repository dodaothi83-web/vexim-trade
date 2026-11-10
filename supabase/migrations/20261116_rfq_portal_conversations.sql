-- RFQ portal: buyer-visible quotes and per-supplier conversations are the source of truth.
-- Deploy BEFORE the application code. A successful email is no longer a prerequisite for
-- showing an offer in the buyer account. No old internal supplier notes are backfilled.
begin;

alter table public.rfq_matches
  alter column quote_price type numeric(14,4),
  add column if not exists quote_buyer_note text,
  add column if not exists legacy_sent_to_buyer_at timestamptz,
  add column if not exists buyer_last_read_at timestamptz,
  add column if not exists supplier_last_read_at timestamptz,
  add column if not exists last_thread_message_at timestamptz,
  add column if not exists last_thread_sender text,
  add column if not exists last_buyer_message_at timestamptz,
  add column if not exists last_supplier_message_at timestamptz;

alter table public.rfq_matches
  add constraint rfq_matches_quote_buyer_note_length check (quote_buyer_note is null or length(quote_buyer_note) <= 1000),
  add constraint rfq_matches_last_thread_sender_check check (last_thread_sender is null or last_thread_sender in ('buyer', 'supplier'));

-- Append-only published snapshots: pending revisions remain on rfq_matches and cannot
-- overwrite the last offer the buyer has seen. A version is created ONLY on publication.
create table public.rfq_quote_versions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.rfq_matches(id) on delete cascade,
  version integer not null check (version > 0),
  quote_price numeric(14,4) not null check (quote_price > 0),
  quote_currency text not null,
  quote_unit text not null,
  quote_incoterm text,
  quote_lead_time_days integer,
  quote_valid_until date,
  buyer_note text check (buyer_note is null or length(buyer_note) <= 1000),
  published_at timestamptz not null default now(),
  unique (match_id, version)
);
create index rfq_quote_versions_match_idx on public.rfq_quote_versions(match_id, version desc);

-- Legacy email delivery left sent_to_buyer_at populated even after a later quote
-- revision changed status back to 'quoted'. The former price cannot be recovered:
-- preserve that old email timestamp for staff, but remove it as portal permission.
-- The new meaning of sent_to_buyer_at is strictly an available portal snapshot.
update public.rfq_matches set legacy_sent_to_buyer_at = sent_to_buyer_at,
  sent_to_buyer_at = null
where status = 'quoted' and sent_to_buyer_at is not null;

-- Preserve only quotes that were already presented. Neither a pending quote nor a
-- pre-existing private CRM timeline note becomes visible because of this migration.
insert into public.rfq_quote_versions
  (match_id, version, quote_price, quote_currency, quote_unit, quote_incoterm,
   quote_lead_time_days, quote_valid_until, published_at)
select id, 1, quote_price, coalesce(quote_currency, 'USD'), coalesce(quote_unit, 'unit'),
       quote_incoterm, quote_lead_time_days, quote_valid_until, sent_to_buyer_at
-- A legacy match may retain the old sent_to_buyer_at while status='quoted' holds
-- an UNPUBLISHED revision. We cannot reconstruct its previous price; fail closed.
from public.rfq_matches where sent_to_buyer_at is not null and status <> 'quoted' and quote_price > 0
on conflict (match_id, version) do nothing;

create table public.rfq_thread_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.rfq_matches(id) on delete cascade,
  sender text not null check (sender in ('buyer', 'supplier')),
  sender_email text not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index rfq_thread_messages_match_idx on public.rfq_thread_messages(match_id, created_at, id);

-- Transactional outbox. Entries are created with the publication/message, so email
-- failures never remove the in-app update; the existing 5-minute chat cron retries.
create table public.rfq_portal_alerts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.rfq_matches(id) on delete cascade,
  version_id uuid references public.rfq_quote_versions(id) on delete cascade,
  message_id uuid references public.rfq_thread_messages(id) on delete cascade,
  recipient text not null check (recipient in ('buyer', 'supplier')),
  event_at timestamptz not null,
  not_before timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint rfq_portal_alerts_one_event check ((version_id is not null) <> (message_id is not null))
);
create unique index rfq_portal_alerts_version_key on public.rfq_portal_alerts(version_id) where version_id is not null;
create unique index rfq_portal_alerts_message_key on public.rfq_portal_alerts(message_id) where message_id is not null;
create index rfq_portal_alerts_due_idx on public.rfq_portal_alerts(not_before, created_at)
  where status in ('pending', 'failed', 'sending');

-- Call with IDs AND updated_at from the draft reviewed by the authenticated supplier
-- or staff. Row locks serialize submits; an intervening revision is NOT silently
-- published under the staff member's stale approval.
create or replace function public.publish_rfq_quotes(p_rfq_id uuid, p_match_ids uuid[], p_expected jsonb)
returns setof public.rfq_quote_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  request public.rfqs%rowtype;
  match_row public.rfq_matches%rowtype;
  published public.rfq_quote_versions%rowtype;
  published_count integer := 0;
  stamp timestamptz;
begin
  if coalesce(cardinality(p_match_ids), 0) > 100 then raise exception 'Too many RFQ matches'; end if;
  if p_expected is null or jsonb_typeof(p_expected) <> 'object' then raise exception 'Expected RFQ quote versions required'; end if;
  select * into request from public.rfqs where id = p_rfq_id for update;
  if not found or request.status in ('won', 'lost', 'spam') or
     request.source_page = '/rfq?intent=question' or
     request.specs->>'inquiry_kind' = 'supplier_question' then
    raise exception 'RFQ not open for publication';
  end if;
  for match_row in
    select * from public.rfq_matches
    where rfq_id = p_rfq_id and id = any(p_match_ids) and status = 'quoted'
      and sent_to_supplier_at is not null and quote_price > 0
      and updated_at = (p_expected->>id::text)::timestamptz
    order by id for update
  loop
    stamp := clock_timestamp();
    insert into public.rfq_quote_versions
      (match_id, version, quote_price, quote_currency, quote_unit, quote_incoterm,
       quote_lead_time_days, quote_valid_until, buyer_note, published_at)
    values (
      match_row.id,
      (select coalesce(max(version), 0) + 1 from public.rfq_quote_versions where match_id = match_row.id),
      match_row.quote_price, coalesce(match_row.quote_currency, 'USD'), coalesce(match_row.quote_unit, 'unit'),
      match_row.quote_incoterm, match_row.quote_lead_time_days, match_row.quote_valid_until,
      match_row.quote_buyer_note, stamp
    ) returning * into published;
    -- This timestamp now means "available to the buyer in the portal", NOT "email delivered".
    update public.rfq_matches set status = 'presented_to_buyer', sent_to_buyer_at = stamp
    where id = match_row.id;
    insert into public.rfq_portal_alerts(match_id, version_id, recipient, event_at)
    values(match_row.id, published.id, 'buyer', stamp);
    published_count := published_count + 1;
    return next published;
  end loop;
  if published_count > 0 then
    update public.rfqs set status = 'quoted', first_response_at = coalesce(first_response_at, clock_timestamp())
    where id = p_rfq_id;
  end if;
end;
$$;

-- The service checks verified ownership/consent; the database also refuses messages
-- for uninvited or closed matches and keeps sourcing correspondence behind publication.
create or replace function public.rfq_thread_message_after_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  match_row public.rfq_matches%rowtype;
  request public.rfqs%rowtype;
begin
  select * into match_row from public.rfq_matches where id = new.match_id for update;
  select * into request from public.rfqs where id = match_row.rfq_id;
  if match_row.sent_to_supplier_at is null or match_row.status in ('proposed', 'declined', 'not_selected') or
     request.status in ('won', 'lost', 'spam') or request.source_page = '/rfq?intent=question' or
     request.specs->>'inquiry_kind' = 'supplier_question' then
    raise exception 'RFQ thread is not available';
  end if;
  if request.specs->>'buyer_contact_policy_version' is distinct from 'rfq_contact_v2' or
     request.specs->>'buyer_contact_consent_source' not in ('rfq_form', 'sourcing_form', 'confirmed_by_buyer') or
     nullif(request.specs->>'buyer_contact_consent_at', '') is null or
     nullif(request.specs #>> '{buyer_contact,email}', '') is null then
    raise exception 'RFQ contact consent missing';
  end if;
  if request.specs->>'buyer_contact_consent_source' = 'confirmed_by_buyer' then
    if not coalesce(request.specs->'buyer_contact_supplier_ids' ? match_row.supplier_id::text, false) then
      raise exception 'RFQ contact recipient not confirmed';
    end if;
  elsif request.specs ? 'buyer_contact_supplier_ids' then
    raise exception 'RFQ contact recipient not confirmed';
  end if;
  if (request.source_product_id is not null or cardinality(request.preferred_supplier_ids) > 0) and
     not (match_row.supplier_id = any(request.preferred_supplier_ids)) and
     request.specs->>'buyer_contact_consent_source' <> 'confirmed_by_buyer' then
    raise exception 'Direct RFQ supplier not named by buyer';
  end if;
  if (nullif(request.specs->>'sourcing_request_id', '') is not null or
      (request.source_product_id is null and cardinality(request.preferred_supplier_ids) = 0))
      and match_row.sent_to_buyer_at is null then
    raise exception 'Sourcing thread has not been presented';
  end if;
  -- The insert is still in this transaction. The match lock serializes simultaneous
  -- submissions so two tabs cannot both pass a stale application-side rate check.
  if (select count(*) from public.rfq_thread_messages
      where match_id = new.match_id and sender = new.sender
        and created_at > clock_timestamp() - interval '10 minutes') > 12 then
    raise exception 'RFQ thread rate limited';
  end if;
  update public.rfq_matches set
    last_thread_sender = case when new.created_at >= coalesce(last_thread_message_at, '-infinity'::timestamptz)
      then new.sender else last_thread_sender end,
    last_thread_message_at = greatest(coalesce(last_thread_message_at, '-infinity'::timestamptz), new.created_at),
    last_buyer_message_at = case when new.sender = 'buyer'
      then greatest(coalesce(last_buyer_message_at, '-infinity'::timestamptz), new.created_at) else last_buyer_message_at end,
    last_supplier_message_at = case when new.sender = 'supplier'
      then greatest(coalesce(last_supplier_message_at, '-infinity'::timestamptz), new.created_at) else last_supplier_message_at end
  where id = new.match_id;
  insert into public.rfq_portal_alerts(match_id, message_id, recipient, event_at, not_before)
  values (new.match_id, new.id, case when new.sender = 'buyer' then 'supplier' else 'buyer' end,
          new.created_at, new.created_at + interval '10 minutes');
  return new;
end;
$$;
create trigger rfq_thread_message_event after insert on public.rfq_thread_messages
for each row execute function public.rfq_thread_message_after_insert();

create or replace function public.mark_rfq_thread_read(p_match_id uuid, p_side text, p_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_side not in ('buyer', 'supplier') or p_at is null then raise exception 'Invalid read marker'; end if;
  if p_side = 'buyer' then
    update public.rfq_matches set buyer_last_read_at = greatest(coalesce(buyer_last_read_at, '-infinity'::timestamptz), least(p_at, clock_timestamp())) where id = p_match_id;
  else
    update public.rfq_matches set supplier_last_read_at = greatest(coalesce(supplier_last_read_at, '-infinity'::timestamptz), least(p_at, clock_timestamp())) where id = p_match_id;
  end if;
end;
$$;

alter table public.rfq_quote_versions enable row level security;
alter table public.rfq_thread_messages enable row level security;
alter table public.rfq_portal_alerts enable row level security;
-- Supabase grants ALL on new public tables to service_role by default. Explicitly
-- revoke that default too: adding SELECT/INSERT alone does not remove UPDATE/DELETE.
revoke all on public.rfq_quote_versions, public.rfq_thread_messages, public.rfq_portal_alerts from public, anon, authenticated, service_role;
-- Application code may append/view versions and messages, never edit published history.
-- FK cascades still allow an explicit privacy deletion of a parent RFQ.
grant select, insert on public.rfq_quote_versions, public.rfq_thread_messages to service_role;
grant select, insert, update on public.rfq_portal_alerts to service_role;
revoke all on function public.publish_rfq_quotes(uuid, uuid[], jsonb), public.mark_rfq_thread_read(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.publish_rfq_quotes(uuid, uuid[], jsonb), public.mark_rfq_thread_read(uuid, text, timestamptz) to service_role;

commit;
notify pgrst, 'reload schema';
