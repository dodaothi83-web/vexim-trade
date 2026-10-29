-- KHÔNG CHẠY LÚC NÀY: migration đang phát triển, chưa sẵn sàng triển khai.
-- Không xóa, thay thế hay chuyển đổi sản phẩm hiện có khi chạy migration này.
-- ON DELETE CASCADE chỉ xóa bản gửi con nếu sản phẩm/NCC cha bị xóa bằng
-- thao tác khác; nó không tự xóa sản phẩm hoặc NCC.
-- Private immutable submission snapshots for the shared five-section form.
-- This migration is a foundation only. SQL64 revokes the preliminary submit
-- RPC and introduces an ordered private image selection. Neither migration is
-- ready to deploy: the review transaction and buyer cutover are incomplete.
begin;

create table if not exists public.product_form_submissions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  draft_revision integer not null check (draft_revision > 0),
  base_product_updated_at timestamptz not null,
  submitted_product_updated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  quantity jsonb not null check (jsonb_typeof(quantity) = 'object'),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  image_ids uuid[] not null check (cardinality(image_ids) between 1 and 8),
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(product_id, draft_revision)
);
create unique index if not exists product_form_submissions_one_pending
  on public.product_form_submissions(product_id) where status = 'pending';
alter table public.product_form_submissions enable row level security;
revoke all on public.product_form_submissions from public, anon, authenticated;
grant all on public.product_form_submissions to service_role;

-- The trusted server action must authorize the actor, validate the complete
-- payload and recompute normalized quantities from the current category policy.
-- The payload equality and revision prevent a validation/save race. Every
-- product media insert/delete uses the same product lock. A future approval RPC
-- must recheck these image IDs and the product baseline before publication.
create or replace function public.submit_product_form_draft(
  p_supplier_id uuid, p_product_id uuid, p_expected_revision integer,
  p_validated_payload jsonb, p_quantity jsonb, p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  previous public.product_form_submissions%rowtype;
  submission public.product_form_submissions%rowtype;
  photo_ids uuid[];
  all_photos integer;
begin
  if p_supplier_id is null or p_product_id is null or p_expected_revision is null or p_expected_revision < 1
    or jsonb_typeof(p_validated_payload) is distinct from 'object'
    or jsonb_typeof(p_quantity) is distinct from 'object'
    or jsonb_typeof(p_warnings) is distinct from 'array'
    or octet_length(p_validated_payload::text) > 65536 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;

  -- A lost response is safe to retry; it must match the exact submission.
  select * into previous from public.product_form_submissions
    where product_id = p_product_id and draft_revision = p_expected_revision for update;
  if found then
    if previous.supplier_id = p_supplier_id and previous.payload = p_validated_payload
      and previous.quantity = p_quantity and previous.warnings = p_warnings then
      if previous.status <> 'pending' then return jsonb_build_object('status', 'already_decided'); end if;
      return jsonb_build_object('status', 'submitted', 'submission_id', previous.id);
    end if;
    return jsonb_build_object('status', 'changed');
  end if;
  if item.supplier_review_status is null or item.supplier_review_status not in ('draft', 'changes_requested', 'approved', 'paused') then
    return jsonb_build_object('status', 'state_changed');
  end if;
  if exists (select 1 from public.product_form_submissions where product_id = p_product_id and status = 'pending') then
    return jsonb_build_object('status', 'already_pending');
  end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id for update;
  if not found or draft.supplier_id is distinct from p_supplier_id or draft.revision is distinct from p_expected_revision
     or draft.payload is distinct from p_validated_payload then
    return jsonb_build_object('status', 'changed');
  end if;
  if item.updated_at is distinct from draft.base_product_updated_at then
    return jsonb_build_object('status', 'product_changed');
  end if;
  select count(*) into all_photos from public.media_assets
    where owner_type = 'product' and product_id = p_product_id and kind = 'image';
  select array_agg(id order by sort_order, created_at, id) into photo_ids from public.media_assets
    where owner_type = 'product' and product_id = p_product_id and supplier_id = p_supplier_id and kind = 'image'
      and storage_path is not null and btrim(storage_path) <> '' and status <> 'expired'
      and (expires_on is null or expires_on >= (now() at time zone 'UTC')::date);
  if all_photos < 1 or all_photos > 8 or cardinality(coalesce(photo_ids, '{}'::uuid[])) <> all_photos then
    return jsonb_build_object('status', 'images_changed');
  end if;
  -- A previously approved listing and its buyer-visible price remain unchanged.
  -- For an unpublished draft, block ordinary edits until this review resolves.
  if item.supplier_review_status in ('draft', 'changes_requested') then
    update public.supplier_products set supplier_review_status = 'pending', ready_for_buyer = false,
      supplier_review_note = null, updated_at = now() where id = p_product_id returning * into item;
  end if;
  insert into public.product_form_submissions
    (product_id, supplier_id, draft_revision, base_product_updated_at, submitted_product_updated_at, payload, quantity, warnings, image_ids)
    values (p_product_id, p_supplier_id, p_expected_revision, draft.base_product_updated_at, item.updated_at,
      p_validated_payload, p_quantity, p_warnings, photo_ids)
    returning * into submission;
  return jsonb_build_object('status', 'submitted', 'submission_id', submission.id);
end;
$$;
revoke all on function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
