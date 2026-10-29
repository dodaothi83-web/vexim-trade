-- KHÔNG CHẠY LÚC NÀY: migration đang phát triển, chưa sẵn sàng triển khai.
-- Không xóa, thay thế hay chuyển đổi sản phẩm hiện có khi chạy migration này.
-- ON DELETE CASCADE chỉ xóa bản nháp con nếu sản phẩm/NCC cha bị xóa bằng
-- thao tác khác; nó không tự xóa sản phẩm hoặc NCC.
-- Storage foundation for incomplete product forms. No existing product is
-- migrated or published. The application must authorize the supplier or staff
-- actor before invoking these service-role-only functions.
begin;

create table if not exists public.product_form_drafts (
  product_id uuid primary key references public.supplier_products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  request_id uuid unique,
  creation_hash text,
  revision integer not null default 1 check (revision > 0),
  -- The eventual submit transaction must compare this snapshot with the
  -- product before applying any draft to an existing approved record.
  base_product_updated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_form_drafts enable row level security;
revoke all on public.product_form_drafts from public, anon, authenticated;
grant all on public.product_form_drafts to service_role;

-- Creates a private shell so images can be attached before the form is complete.
-- Retries with the same request and payload return the existing shell; a changed
-- payload must be saved using the separate revision-checked update function.
create or replace function public.create_product_form_draft(
  p_supplier_id uuid, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  draft public.product_form_drafts%rowtype;
  product public.supplier_products%rowtype;
  digest text;
begin
  if p_supplier_id is null or p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object'
     or octet_length(p_payload::text) > 65536 then
    return jsonb_build_object('status', 'invalid');
  end if;
  digest := md5(jsonb_build_array(p_supplier_id, p_payload)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into draft from public.product_form_drafts where request_id = p_request_id for update;
  if found then
    if draft.supplier_id is distinct from p_supplier_id or draft.creation_hash is distinct from digest then
      return jsonb_build_object('status', 'request_conflict');
    end if;
    return jsonb_build_object('status', 'saved', 'product_id', draft.product_id, 'revision', draft.revision);
  end if;
  -- Mark the shell as a quantity product so the existing submit/publication
  -- guards cannot publish it before a complete price revision exists.
  if exists (select 1 from public.quantity_product_creation_requests where request_id = p_request_id) then
    return jsonb_build_object('status', 'request_conflict');
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  insert into public.supplier_products (supplier_id, name, category, supplier_review_status, supplier_originated, ready_for_buyer)
    values (p_supplier_id, '', null, 'draft', true, false) returning * into product;
  insert into public.product_form_drafts (product_id, supplier_id, request_id, creation_hash, base_product_updated_at, payload)
    values (product.id, p_supplier_id, p_request_id, digest, product.updated_at, p_payload) returning * into draft;
  insert into public.quantity_product_creation_requests (request_id, supplier_id, product_id, payload_hash)
    values (p_request_id, p_supplier_id, product.id, digest);
  return jsonb_build_object('status', 'saved', 'product_id', product.id, 'revision', draft.revision);
end;
$$;

-- A private draft never changes approved product fields or the buyer-visible
-- price. The caller supplies the last observed revision; stale edits fail closed.
create or replace function public.save_product_form_draft(
  p_supplier_id uuid, p_product_id uuid, p_expected_revision integer, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
begin
  if p_supplier_id is null or p_product_id is null or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 65536 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  if product.supplier_review_status not in ('draft', 'changes_requested', 'approved', 'paused')
     or product.supplier_review_status is null then return jsonb_build_object('status', 'state_changed'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id for update;
  if found then
    if draft.supplier_id is distinct from p_supplier_id or draft.revision <> p_expected_revision then
      return jsonb_build_object('status', 'changed');
    end if;
    update public.product_form_drafts set payload = p_payload, revision = revision + 1, updated_at = now()
      where product_id = p_product_id returning * into draft;
  else
    if p_expected_revision <> 0 then return jsonb_build_object('status', 'changed'); end if;
    insert into public.product_form_drafts (product_id, supplier_id, base_product_updated_at, payload)
      values (p_product_id, p_supplier_id, product.updated_at, p_payload) returning * into draft;
  end if;
  return jsonb_build_object('status', 'saved', 'product_id', draft.product_id, 'revision', draft.revision);
end;
$$;

revoke all on function public.create_product_form_draft(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.save_product_form_draft(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.create_product_form_draft(uuid,uuid,jsonb) to service_role;
grant execute on function public.save_product_form_draft(uuid,uuid,integer,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
