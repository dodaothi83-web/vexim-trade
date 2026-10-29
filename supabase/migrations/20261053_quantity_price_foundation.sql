-- Additive foundation only: existing products and public views keep their current
-- behavior until the new editor, approval actions and public projection are wired.
-- Do not infer prices or confirmation dates from ambiguous legacy records.
begin;

create table if not exists public.quantity_price_settings (
  singleton boolean primary key default true check (singleton),
  max_tiers integer not null default 4 check (max_tiers between 1 and 100),
  max_price_ratio numeric(10,4) not null default 1.5 check (max_price_ratio >= 1),
  max_last_moq_ratio numeric(12,4) not null default 100 check (max_last_moq_ratio >= 1),
  reminder_days integer not null default 30 check (reminder_days > 0),
  stale_days integer not null default 90 check (stale_days > 0),
  offer_max_discount_percent numeric(5,2) not null default 30 check (offer_max_discount_percent > 0 and offer_max_discount_percent <= 100),
  offer_max_days integer not null default 60 check (offer_max_days > 0),
  offer_cooldown_days integer not null default 30 check (offer_cooldown_days >= 0),
  offer_price_lock_days integer not null default 30 check (offer_price_lock_days >= 0),
  updated_at timestamptz not null default now()
);
insert into public.quantity_price_settings (singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.category_grade_price_bounds (
  category_id uuid not null references public.categories(id) on delete cascade,
  grade text not null check (length(btrim(grade)) > 0),
  min_usd_per_kg numeric(14,4) not null check (min_usd_per_kg > 0),
  max_usd_per_kg numeric(14,4) not null,
  updated_at timestamptz not null default now(),
  primary key (category_id, grade),
  check (max_usd_per_kg >= min_usd_per_kg)
);

-- Exactly one approved and one pending revision per product can coexist. The
-- old approved revision remains readable until a transactional approval swaps it.
create table if not exists public.product_quantity_price_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  status text not null check (status in ('draft', 'pending', 'approved', 'rejected', 'superseded')),
  grade text not null check (length(btrim(grade)) > 0),
  incoterm text not null check (incoterm in ('FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'DAP', 'DDP')),
  tiers jsonb not null check (jsonb_typeof(tiers) = 'array' and jsonb_array_length(tiers) > 0),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  check (status <> 'approved' or confirmed_at is not null)
);
create unique index if not exists product_quantity_price_revision_active_key
  on public.product_quantity_price_revisions (product_id, status)
  where status in ('draft', 'pending', 'approved');
create index if not exists product_quantity_price_revision_review_queue_idx
  on public.product_quantity_price_revisions (created_at) where status = 'pending';

-- English title approvals are independent of price approval. Do not expose the
-- pending name through legacy name_i18n or a public SQL view during transition.
create table if not exists public.product_english_name_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  status text not null check (status in ('draft', 'pending', 'approved', 'rejected', 'superseded')),
  source_name text not null check (length(btrim(source_name)) > 0),
  english_name text not null check (length(btrim(english_name)) > 0),
  origin text not null check (origin in ('supplier', 'ai', 'staff')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create unique index if not exists product_english_name_revision_active_key
  on public.product_english_name_revisions (product_id, status)
  where status in ('draft', 'pending', 'approved');
create index if not exists product_english_name_revision_review_queue_idx
  on public.product_english_name_revisions (created_at) where status = 'pending';

-- All access is through authorized server actions using service_role. No public
-- view of these tables exists, in particular pending prices and names stay private.
alter table public.quantity_price_settings enable row level security;
alter table public.category_grade_price_bounds enable row level security;
alter table public.product_quantity_price_revisions enable row level security;
alter table public.product_english_name_revisions enable row level security;
revoke all on public.quantity_price_settings, public.category_grade_price_bounds,
  public.product_quantity_price_revisions, public.product_english_name_revisions from public, anon, authenticated;
grant all on public.quantity_price_settings, public.category_grade_price_bounds,
  public.product_quantity_price_revisions, public.product_english_name_revisions to service_role;

notify pgrst, 'reload schema';
commit;
