-- Independent sourcing inbox. Access is exclusively via verified server-side sessions.
create table if not exists public.sourcing_requests (
  id uuid primary key,
  buyer_email text not null check (buyer_email = lower(btrim(buyer_email))),
  submission_key uuid not null,
  content text not null check (char_length(content) between 1 and 6000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 3),
  status text not null default 'new' check (status in ('new','in_progress','needs_info','closed')),
  assigned_to uuid references public.app_users(id) on delete set null,
  internal_note text,
  buyer_reply text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_email, submission_key)
);
create index if not exists sourcing_buyer_history_idx on public.sourcing_requests(buyer_email, created_at desc);
create index if not exists sourcing_status_idx on public.sourcing_requests(status, created_at desc);
alter table public.sourcing_requests enable row level security;
revoke all on public.sourcing_requests from anon, authenticated;
grant all on public.sourcing_requests to service_role;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sourcing-files', 'sourcing-files', false, 2097152, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No client policies: attachments are downloaded only through the owner/staff-checked API.
notify pgrst, 'reload schema';
