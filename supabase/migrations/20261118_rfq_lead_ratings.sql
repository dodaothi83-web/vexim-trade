-- Optional supplier assessment of a direct RFQ ("lead quality"). One row per
-- invited match; the supplier may revise it. This is a private staff signal:
-- no buyer route, buyer email or other supplier may read it, and nothing in
-- the application changes a buyer's access or an RFQ's status because of it.
-- Kept in its own table (not on rfqs / rfq_matches) so existing buyer-side
-- reads of those tables can never project it.
-- Deploy this migration BEFORE the application release.
begin;

create table public.rfq_lead_ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.rfq_matches(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  buyer_id uuid not null references public.buyers(id) on delete cascade,
  rating text not null check (rating in ('good', 'normal', 'poor')),
  reasons text[] not null default '{}',
  note text check (note is null or length(note) <= 500),
  rated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rfq_lead_ratings_reasons_known check (reasons <@ array[
    'no_reply', 'incomplete', 'unrealistic', 'fake_identity', 'spam', 'abusive']::text[]),
  -- A poor rating must say what went wrong; other levels carry no reason.
  constraint rfq_lead_ratings_reasons_required check ((rating = 'poor') = (cardinality(reasons) > 0))
);
create index rfq_lead_ratings_rfq_idx on public.rfq_lead_ratings(rfq_id);
create index rfq_lead_ratings_buyer_idx on public.rfq_lead_ratings(buyer_id, updated_at desc);
create index rfq_lead_ratings_supplier_idx on public.rfq_lead_ratings(supplier_id);

-- The row must describe the match it is attached to, whatever the caller sent.
create function public.check_rfq_lead_rating()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.rfq_matches m join public.rfqs r on r.id = m.rfq_id
    where m.id = new.match_id and m.rfq_id = new.rfq_id and m.supplier_id = new.supplier_id
      and r.buyer_id = new.buyer_id and m.sent_to_supplier_at is not null;
  if not found then raise exception 'Invalid RFQ lead rating'; end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger rfq_lead_ratings_guard before insert or update on public.rfq_lead_ratings
for each row execute function public.check_rfq_lead_rating();

alter table public.rfq_lead_ratings enable row level security;
-- No policy: anon / authenticated clients cannot read or write. Only the server
-- (service_role) can, after the application has checked supplier ownership or staff role.
revoke all on public.rfq_lead_ratings from public, anon, authenticated, service_role;
grant select, insert, update on public.rfq_lead_ratings to service_role;
revoke all on function public.check_rfq_lead_rating() from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
