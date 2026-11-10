-- New sourcing conversations are buyer <-> Vexim (one per RFQ) and
-- supplier <-> Vexim (one per invited match). Existing buyer/supplier RFQ
-- messages remain immutable history; no legacy message is copied or disclosed
-- to another supplier. Deploy this migration BEFORE the application release.
begin;

create table public.rfq_mediated_threads (
  id uuid primary key, -- RFQ id for buyer desk; match id for supplier desk
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  match_id uuid references public.rfq_matches(id) on delete cascade,
  audience text not null check (audience in ('buyer', 'supplier')),
  party_last_read_at timestamptz,
  staff_last_read_at timestamptz,
  last_party_message_at timestamptz,
  last_staff_message_at timestamptz,
  constraint rfq_mediated_thread_scope check ((audience = 'buyer') = (match_id is null)),
  constraint rfq_mediated_thread_identity check (id = coalesce(match_id, rfq_id))
);
create unique index rfq_mediated_buyer_key on public.rfq_mediated_threads(rfq_id) where match_id is null;
create unique index rfq_mediated_supplier_key on public.rfq_mediated_threads(match_id) where match_id is not null;
create index rfq_mediated_threads_rfq_idx on public.rfq_mediated_threads(rfq_id);

create table public.rfq_mediated_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.rfq_mediated_threads(id) on delete cascade,
  sender text not null check (sender in ('buyer', 'supplier', 'staff')),
  sender_email text not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index rfq_mediated_messages_thread_idx on public.rfq_mediated_messages(thread_id, created_at, id);

-- A failed notification never rolls back a saved message. Notifications contain
-- a link only; recipients can access content only after portal authentication.
create table public.rfq_mediated_alerts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.rfq_mediated_messages(id) on delete cascade,
  thread_id uuid not null references public.rfq_mediated_threads(id) on delete cascade,
  recipient text not null check (recipient in ('party', 'staff')),
  event_at timestamptz not null,
  not_before timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index rfq_mediated_alerts_due_idx on public.rfq_mediated_alerts(not_before, created_at)
  where status in ('pending', 'failed', 'sending');

-- The application authenticates sender ownership/role on every call. This RPC
-- independently validates the RFQ, match, channel, consent and availability,
-- serializes concurrent posts and creates the message + notification atomically.
-- service_role cannot INSERT directly into any mediated table.
create function public.post_rfq_mediated_message(
  p_rfq_id uuid, p_match_id uuid, p_sender text, p_email text, p_body text
) returns public.rfq_mediated_messages
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  request public.rfqs%rowtype;
  matched public.rfq_matches%rowtype;
  v_thread_id uuid := coalesce(p_match_id, p_rfq_id);
  posted public.rfq_mediated_messages%rowtype;
  consent jsonb;
begin
  if p_body is null or length(btrim(p_body)) not between 1 and 2000 or
     p_email is null or length(btrim(p_email)) not between 3 and 320 then
    raise exception 'Invalid RFQ message';
  end if;
  select * into request from public.rfqs where id = p_rfq_id for update;
  if not found or request.status in ('won', 'lost', 'spam') or
     request.source_page = '/rfq?intent=question' or request.specs->>'inquiry_kind' = 'supplier_question' or
     (nullif(request.specs->>'sourcing_request_id', '') is null and
      (request.source_product_id is not null or coalesce(cardinality(request.preferred_supplier_ids), 0) > 0)) then
    raise exception 'Sourcing RFQ is not open';
  end if;
  if p_match_id is null then
    if p_sender not in ('buyer', 'staff') then raise exception 'Buyer desk only'; end if;
  else
    if p_sender not in ('supplier', 'staff') then raise exception 'Supplier desk only'; end if;
    select * into matched from public.rfq_matches where id = p_match_id and rfq_id = p_rfq_id for update;
    if not found or matched.sent_to_supplier_at is null or
       matched.status in ('proposed', 'declined', 'not_selected') then
      raise exception 'Supplier not invited to sourcing RFQ';
    end if;
    consent := request.specs;
    -- Mirror authorizedBuyerContact() in the app. A JSON object or an expired
    -- allowlist cannot impersonate a form grant; an empty/invalid snapshot is not
    -- permission merely because it has a policy label.
    if not coalesce(consent->>'buyer_contact_policy_version' in ('rfq_contact_v2', 'rfq_mediated_v1'), false) or
       not coalesce(consent->>'buyer_contact_consent_source' in ('rfq_form', 'sourcing_form', 'confirmed_by_buyer'), false) or
       nullif(btrim(consent->>'buyer_contact_consent_at'), '') is null or
       nullif(btrim(consent #>> '{buyer_contact,company}'), '') is null or
       not coalesce((consent #>> '{buyer_contact,email}') ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$', false) then
      raise exception 'RFQ consent missing';
    end if;
    begin
      perform (consent->>'buyer_contact_consent_at')::timestamptz;
    exception when others then raise exception 'RFQ consent missing';
    end;
    if consent->>'buyer_contact_consent_source' = 'confirmed_by_buyer' then
      if jsonb_typeof(consent->'buyer_contact_supplier_ids') is distinct from 'array' or
         not coalesce(consent->'buyer_contact_supplier_ids' ? matched.supplier_id::text, false) then
        raise exception 'RFQ recipient not confirmed';
      end if;
    elsif consent->'buyer_contact_supplier_ids' is not null and
          consent->'buyer_contact_supplier_ids' <> 'null'::jsonb then
      raise exception 'RFQ recipient not confirmed';
    end if;
    -- Staff cannot turn a private Vexim desk into buyer/supplier direct contact.
    -- The application performs the same check; this also guards RPC callers.
    if p_sender = 'staff' and (
      p_body ~* '[[:alnum:]_.+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}' or
      p_body ~* '(https?://|www[.])[^[:space:]]+' or
      p_body ~* '([0-9][[:space:]().+-]?){9,15}[0-9]'
    ) then raise exception 'RFQ desk contact details not allowed'; end if;
  end if;
  insert into public.rfq_mediated_threads(id, rfq_id, match_id, audience)
  values(v_thread_id, p_rfq_id, p_match_id, case when p_match_id is null then 'buyer' else 'supplier' end)
  on conflict (id) do nothing;
  -- In addition to serializing posts, reject any mismatched pre-existing thread.
  perform 1 from public.rfq_mediated_threads t where t.id = v_thread_id and
    t.rfq_id = p_rfq_id and t.match_id is not distinct from p_match_id for update;
  if not found then raise exception 'RFQ thread scope mismatch'; end if;
  if (select count(*) from public.rfq_mediated_messages m where m.thread_id = v_thread_id
      and m.sender = p_sender and m.created_at > clock_timestamp() - interval '10 minutes') >= 12 then
    raise exception 'RFQ desk rate limited';
  end if;
  insert into public.rfq_mediated_messages(thread_id, sender, sender_email, body)
  values(v_thread_id, p_sender, lower(btrim(p_email)), btrim(p_body)) returning * into posted;
  update public.rfq_mediated_threads set
    last_staff_message_at = case when p_sender = 'staff' then posted.created_at else last_staff_message_at end,
    last_party_message_at = case when p_sender <> 'staff' then posted.created_at else last_party_message_at end
  where id = v_thread_id;
  insert into public.rfq_mediated_alerts(message_id, thread_id, recipient, event_at, not_before)
  values(posted.id, v_thread_id, case when p_sender = 'staff' then 'party' else 'staff' end,
         posted.created_at, posted.created_at + interval '10 minutes');
  return posted;
end;
$$;

create function public.mark_rfq_mediated_read(p_thread_id uuid, p_side text, p_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare latest timestamptz;
begin
  if p_side not in ('party', 'staff') or p_at is null then raise exception 'Invalid RFQ read marker'; end if;
  -- Cannot mark an event not in this thread as read. The app verifies ownership
  -- and passes only the timestamp that was rendered to the current participant.
  select max(created_at) into latest from public.rfq_mediated_messages where thread_id = p_thread_id;
  if latest is null then return; end if;
  if p_side = 'party' then
    update public.rfq_mediated_threads set party_last_read_at = greatest(
      coalesce(party_last_read_at, '-infinity'::timestamptz), least(p_at, latest, clock_timestamp())) where id = p_thread_id;
  else
    update public.rfq_mediated_threads set staff_last_read_at = greatest(
      coalesce(staff_last_read_at, '-infinity'::timestamptz), least(p_at, latest, clock_timestamp())) where id = p_thread_id;
  end if;
end;
$$;

-- Old sourcing buyer/supplier messages remain visible as history to their
-- original participants; no new direct exchange can be appended even if an
-- older server version attempts to post during a rolling deployment.
create function public.block_sourcing_direct_rfq_thread()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare request public.rfqs%rowtype;
begin
  select r.* into request from public.rfqs r join public.rfq_matches m on m.rfq_id = r.id where m.id = new.match_id;
  if request.id is not null and (nullif(request.specs->>'sourcing_request_id', '') is not null or
      (request.source_product_id is null and coalesce(cardinality(request.preferred_supplier_ids), 0) = 0)) then
    raise exception 'Sourcing conversations go through Vexim';
  end if;
  return new;
end;
$$;
create trigger rfq_thread_mediation_guard before insert on public.rfq_thread_messages
for each row execute function public.block_sourcing_direct_rfq_thread();

alter table public.rfq_mediated_threads enable row level security;
alter table public.rfq_mediated_messages enable row level security;
alter table public.rfq_mediated_alerts enable row level security;
-- Supabase grants ALL by default to service_role. Deny direct writes to immutable
-- messages and thread state; the only write paths are the guarded RPCs above.
revoke all on public.rfq_mediated_threads, public.rfq_mediated_messages, public.rfq_mediated_alerts
  from public, anon, authenticated, service_role;
grant select on public.rfq_mediated_threads, public.rfq_mediated_messages to service_role;
grant select, update on public.rfq_mediated_alerts to service_role;
revoke all on function public.post_rfq_mediated_message(uuid,uuid,text,text,text),
  public.mark_rfq_mediated_read(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.post_rfq_mediated_message(uuid,uuid,text,text,text),
  public.mark_rfq_mediated_read(uuid,text,timestamptz) to service_role;

commit;
notify pgrst, 'reload schema';
