-- Prospect cold outreach, activity history, and mail linkage.
-- Safe to run once on the live Supabase project.
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text,
  contact_title text,
  email text,
  email_status text,
  phone text,
  country text,
  city text,
  website text,
  linkedin_url text,
  company_linkedin_url text,
  industry text,
  employee_range text,
  apollo_id text,
  source_list text,
  status text not null default 'new' check (status in
    ('new','researched','ready','contacted','replied','meeting','qualified','converted','disqualified','unsubscribed')),
  owner text,
  next_action text,
  next_action_at timestamptz,
  notes text,
  converted_buyer_id uuid references public.buyers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospects_status_idx on public.prospects (status);
create index if not exists prospects_email_idx on public.prospects (lower(email));
create index if not exists prospects_company_idx on public.prospects (lower(company));
create index if not exists prospects_owner_idx on public.prospects (owner);

create table if not exists public.prospect_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  channel text not null check (channel in ('email','linkedin','phone','meeting','note')),
  summary text not null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists prospect_activities_prospect_idx
  on public.prospect_activities (prospect_id, created_at desc);

-- Separate, editable cold-outreach copy. It does not share Buyer stage templates.
create table if not exists public.prospect_outreach_templates (
  id text primary key check (id in ('intro', 'followup')),
  label text not null,
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.email_messages
  add column if not exists prospect_id uuid references public.prospects(id) on delete set null;
create index if not exists email_messages_prospect_idx
  on public.email_messages (prospect_id, created_at desc);
