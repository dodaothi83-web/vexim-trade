-- Supplier portal dashboard. Run after supplier_self_registration and RFQ foundation migrations.
-- A clicked product is not an invitation: only an outreach with sent_to_supplier_at is supplier-visible.
alter table public.rfqs add column if not exists source_product_id uuid references public.supplier_products(id) on delete set null;
create index if not exists rfqs_source_product_idx on public.rfqs(source_product_id) where source_product_id is not null;
alter table public.rfq_matches add column if not exists response_due_at timestamptz;
alter table public.rfq_matches add column if not exists supplier_replied_at timestamptz;
create index if not exists rfq_matches_supplier_sent_idx on public.rfq_matches(supplier_id, sent_to_supplier_at desc)
  where sent_to_supplier_at is not null;

-- Read state belongs to one supplier, not to arbitrary CRM users. All access is through the server.
create table if not exists public.supplier_portal_notice_reads (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  notice_key text not null check (char_length(notice_key) between 1 and 100),
  read_at timestamptz not null default now(),
  primary key (supplier_id, notice_key)
);
alter table public.supplier_portal_notice_reads enable row level security;
revoke all on public.supplier_portal_notice_reads from anon, authenticated;
notify pgrst, 'reload schema';
