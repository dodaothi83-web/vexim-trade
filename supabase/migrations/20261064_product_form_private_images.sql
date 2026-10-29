-- KHÔNG CHẠY LÚC NÀY: nền tảng ảnh nháp đang phát triển, chưa có luồng duyệt hoàn chỉnh.
-- Chỉ tạo cấu trúc mới cho form. Không đổi, xóa hoặc chuyển ảnh/sản phẩm hiện có.
-- SQL62/63 cũng chưa sẵn sàng triển khai. Không áp dụng trên database thật.
begin;

-- A draft owns an ordered selection, not public media. Existing approved assets
-- and newly uploaded files remain separate until an atomic review transaction.
alter table public.product_form_drafts add column if not exists image_selection jsonb not null default '[]'::jsonb
  check (jsonb_typeof(image_selection) = 'array' and jsonb_array_length(image_selection) <= 8);

create table if not exists public.product_form_staged_images (
  id uuid primary key,
  product_id uuid not null references public.supplier_products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_by text not null check (length(btrim(created_by)) > 0),
  storage_path text not null unique,
  thumb_path text not null unique,
  caption text not null default '' check (length(caption) <= 150),
  mime text not null check (mime = 'image/webp'),
  bytes bigint not null check (bytes between 1 and 8388608),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  thumb_bytes bigint not null check (thumb_bytes between 1 and 8388608),
  thumb_sha256 text not null check (thumb_sha256 ~ '^[a-f0-9]{64}$'),
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  created_at timestamptz not null default now(),
  check (storage_path = 'products/' || product_id::text || '/' || id::text || '.webp'),
  check (thumb_path = 'products/' || product_id::text || '/' || id::text || '-thumb.webp')
);
create index if not exists product_form_staged_images_product_idx on public.product_form_staged_images(product_id, supplier_id);
alter table public.product_form_staged_images enable row level security;
revoke all on public.product_form_staged_images from public, anon, authenticated;
grant all on public.product_form_staged_images to service_role;

-- Called only after trusted application authorization and successful storage
-- writes. A staged row is never inserted in media_assets here, so the existing
-- public media ACL cannot expose it, even for an already-approved product.
-- A server must NOT delete storage objects on an uncertain RPC result; the
-- transaction may have committed despite a lost response. Reload to reconcile.
create or replace function public.stage_product_form_image(
  p_supplier_id uuid, p_product_id uuid, p_user_id text, p_expected_revision integer,
  p_id uuid, p_caption text, p_bytes bigint, p_width integer, p_height integer,
  p_sha256 text, p_thumb_bytes bigint, p_thumb_sha256 text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  photo public.product_form_staged_images%rowtype;
  path text;
  thumb text;
begin
  if p_supplier_id is null or p_product_id is null or p_id is null or coalesce(btrim(p_user_id), '') = ''
     or p_expected_revision is null or p_expected_revision < 1 or length(coalesce(p_caption,'')) > 150
     or p_bytes is null or p_bytes not between 1 and 8388608
     or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_thumb_bytes is null or p_thumb_bytes not between 1 and 8388608
     or p_thumb_sha256 is null or p_thumb_sha256 !~ '^[a-f0-9]{64}$'
     or p_width is null or p_width not between 1 and 20000 or p_height is null or p_height not between 1 and 20000 then
    return jsonb_build_object('status','invalid');
  end if;
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','missing_draft'); end if;
  select * into photo from public.product_form_staged_images where id = p_id;
  if found then
    if photo.product_id = p_product_id and photo.supplier_id = p_supplier_id and photo.created_by = p_user_id
       and photo.caption = coalesce(p_caption,'') and photo.bytes = p_bytes and photo.sha256 = p_sha256
       and photo.thumb_bytes = p_thumb_bytes and photo.thumb_sha256 = p_thumb_sha256
       and photo.width = p_width and photo.height = p_height then
      return jsonb_build_object('status','exists','revision',draft.revision,'image_id',photo.id);
    end if;
    return jsonb_build_object('status','conflict');
  end if;
  if product.supplier_review_status is null or product.supplier_review_status not in ('draft','changes_requested','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  if draft.revision <> p_expected_revision then return jsonb_build_object('status','changed'); end if;
  if draft.base_product_updated_at is distinct from product.updated_at then return jsonb_build_object('status','product_changed'); end if;
  if jsonb_array_length(draft.image_selection) >= 8 then return jsonb_build_object('status','image_limit'); end if;
  path := 'products/' || p_product_id::text || '/' || p_id::text || '.webp';
  thumb := 'products/' || p_product_id::text || '/' || p_id::text || '-thumb.webp';
  -- Never create an ambiguous owner for a path served by public-media.
  if exists (select 1 from public.media_assets where id = p_id or storage_path in (path,thumb) or thumb_path in (path,thumb))
     or exists (select 1 from public.product_form_staged_images where storage_path in (path,thumb) or thumb_path in (path,thumb)) then
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.product_form_staged_images (id,product_id,supplier_id,created_by,storage_path,thumb_path,caption,mime,bytes,width,height,sha256,thumb_bytes,thumb_sha256)
    values (p_id,p_product_id,p_supplier_id,p_user_id,path,thumb,coalesce(p_caption,''),'image/webp',p_bytes,p_width,p_height,p_sha256,p_thumb_bytes,p_thumb_sha256);
  update public.product_form_drafts set revision = revision + 1, updated_at = now(),
    image_selection = image_selection || jsonb_build_array(jsonb_build_object('source','staged','id',p_id))
    where product_id = p_product_id returning * into draft;
  return jsonb_build_object('status','created','revision',draft.revision,'image_id',p_id);
end;
$$;

-- Ordering and removals affect only the private selection. They never delete or
-- unshare an existing buyer image. Staff access must be authorized separately
-- by the caller; untrusted clients do not have EXECUTE on this function.
create or replace function public.set_product_form_images(
  p_supplier_id uuid, p_product_id uuid, p_user_id text, p_staff boolean,
  p_expected_revision integer, p_selection jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  product public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  element jsonb;
  image_id uuid;
  image_source text;
  seen text[] := '{}';
  token text;
begin
  if p_supplier_id is null or p_product_id is null or coalesce(btrim(p_user_id),'') = '' or p_staff is null
     or p_expected_revision is null or p_expected_revision < 1 or jsonb_typeof(p_selection) is distinct from 'array' then
    return jsonb_build_object('status','invalid');
  end if;
  if jsonb_array_length(p_selection) > 8 then return jsonb_build_object('status','image_limit'); end if;
  select * into product from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','missing_draft'); end if;
  if product.supplier_review_status is null or product.supplier_review_status not in ('draft','changes_requested','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  if draft.revision <> p_expected_revision then return jsonb_build_object('status','changed'); end if;
  if draft.base_product_updated_at is distinct from product.updated_at then return jsonb_build_object('status','product_changed'); end if;
  for element in select value from jsonb_array_elements(p_selection) loop
    if jsonb_typeof(element) is distinct from 'object' then return jsonb_build_object('status','invalid'); end if;
    if (select count(*) from jsonb_object_keys(element)) <> 2
       or jsonb_typeof(element->'source') is distinct from 'string' or jsonb_typeof(element->'id') is distinct from 'string'
       or (element->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','invalid');
    end if;
    image_id := (element->>'id')::uuid;
    image_source := element->>'source';
    token := image_id::text;
    if token = any(seen) then return jsonb_build_object('status','invalid'); end if;
    seen := array_append(seen, token);
    if image_source = 'media' then
      if not exists (select 1 from public.media_assets m where m.id = image_id and m.owner_type = 'product'
        and m.product_id = p_product_id and m.supplier_id = p_supplier_id and m.kind = 'image'
        and m.storage_path is not null and btrim(m.storage_path) <> '' and m.status <> 'expired'
        and (m.expires_on is null or m.expires_on >= (now() at time zone 'UTC')::date)
        and (p_staff or m.audience = 'buyer' or m.created_by = p_user_id)) then
        return jsonb_build_object('status','image_unavailable');
      end if;
    elsif image_source = 'staged' then
      if not exists (select 1 from public.product_form_staged_images s where s.id = image_id and s.product_id = p_product_id
        and s.supplier_id = p_supplier_id and (p_staff or s.created_by = p_user_id)) then
        return jsonb_build_object('status','image_unavailable');
      end if;
    else return jsonb_build_object('status','invalid');
    end if;
  end loop;
  if draft.image_selection = p_selection then return jsonb_build_object('status','saved','revision',draft.revision); end if;
  update public.product_form_drafts set image_selection = p_selection, revision = revision + 1, updated_at = now()
    where product_id = p_product_id returning * into draft;
  return jsonb_build_object('status','saved','revision',draft.revision);
end;
$$;
-- The earlier preliminary submit function enumerates public media and cannot
-- represent a private selection. Do not allow it after this migration.
revoke all on function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) from service_role;
alter table public.product_form_submissions add column if not exists image_selection jsonb not null default '[]'::jsonb;
alter table public.product_form_submissions add column if not exists image_snapshot jsonb not null default '[]'::jsonb;

-- Trusted callers authorize staff or supplier and validate the payload and
-- pricing against the live category first. Locks serialize with other draft and
-- supplier media transactions. A later approval MUST compare each snapshot
-- again, and check the submitted product version before changing public data.
create or replace function public.submit_product_form_draft_selected_images(
  p_supplier_id uuid, p_product_id uuid, p_user_id text, p_staff boolean, p_expected_revision integer,
  p_validated_payload jsonb, p_quantity jsonb, p_warnings jsonb, p_selection jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  draft public.product_form_drafts%rowtype;
  previous public.product_form_submissions%rowtype;
  submission public.product_form_submissions%rowtype;
  element jsonb;
  photo_id uuid;
  source text;
  seen text[] := '{}';
  token text;
  image_ids uuid[] := '{}';
  snapshots jsonb := '[]'::jsonb;
  snapshot jsonb;
  path text;
  thumb text;
begin
  if p_supplier_id is null or p_product_id is null or coalesce(btrim(p_user_id),'') = '' or p_staff is null
     or p_expected_revision is null or p_expected_revision < 1
     or jsonb_typeof(p_validated_payload) is distinct from 'object' or octet_length(p_validated_payload::text) > 65536
     or jsonb_typeof(p_quantity) is distinct from 'object' or jsonb_typeof(p_warnings) is distinct from 'array'
     or jsonb_typeof(p_selection) is distinct from 'array' then return jsonb_build_object('status','invalid'); end if;
  if jsonb_array_length(p_selection) not between 1 and 8 then return jsonb_build_object('status','images_changed'); end if;
  select * into item from public.supplier_products where id = p_product_id and supplier_id = p_supplier_id for update;
  if not found then return jsonb_build_object('status','not_owned'); end if;
  select * into previous from public.product_form_submissions where product_id = p_product_id and draft_revision = p_expected_revision for update;
  if found then
    if previous.supplier_id = p_supplier_id and previous.payload = p_validated_payload and previous.quantity = p_quantity
       and previous.warnings = p_warnings and previous.image_selection = p_selection then
      if previous.status <> 'pending' then return jsonb_build_object('status','already_decided'); end if;
      return jsonb_build_object('status','submitted','submission_id',previous.id);
    end if;
    return jsonb_build_object('status','changed');
  end if;
  if item.supplier_review_status is null or item.supplier_review_status not in ('draft','changes_requested','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  if exists (select 1 from public.product_form_submissions where product_id = p_product_id and status = 'pending') then
    return jsonb_build_object('status','already_pending');
  end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id and supplier_id = p_supplier_id for update;
  if not found or draft.revision is distinct from p_expected_revision or draft.payload is distinct from p_validated_payload
     or draft.image_selection is distinct from p_selection then return jsonb_build_object('status','changed'); end if;
  if item.updated_at is distinct from draft.base_product_updated_at then return jsonb_build_object('status','product_changed'); end if;
  for element in select value from jsonb_array_elements(p_selection) loop
    if jsonb_typeof(element) is distinct from 'object' then return jsonb_build_object('status','images_changed'); end if;
    if (select count(*) from jsonb_object_keys(element)) <> 2
       or jsonb_typeof(element->'source') is distinct from 'string' or jsonb_typeof(element->'id') is distinct from 'string'
       or (element->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','images_changed');
    end if;
    photo_id := (element->>'id')::uuid;
    source := element->>'source';
    token := photo_id::text;
    if token = any(seen) then return jsonb_build_object('status','images_changed'); end if;
    seen := array_append(seen, token);
    snapshot := null; path := null; thumb := null;
    if source = 'media' then
      select to_jsonb(m),m.storage_path,m.thumb_path into snapshot,path,thumb from public.media_assets m
        where m.id = photo_id and m.owner_type = 'product' and m.product_id = p_product_id and m.supplier_id = p_supplier_id
          and m.kind = 'image' and m.storage_path is not null and btrim(m.storage_path) <> '' and m.status <> 'expired'
          and (m.expires_on is null or m.expires_on >= (now() at time zone 'UTC')::date)
          and (p_staff or m.audience = 'buyer' or m.created_by = p_user_id) for update;
      if snapshot is null or (select count(*) from public.media_assets m where m.storage_path in (path,thumb) or m.thumb_path in (path,thumb)) <> 1
        or exists (select 1 from public.product_form_staged_images s where s.storage_path in (path,thumb) or s.thumb_path in (path,thumb)) then
        return jsonb_build_object('status','images_changed');
      end if;
    elsif source = 'staged' then
      select to_jsonb(s),s.storage_path,s.thumb_path into snapshot,path,thumb from public.product_form_staged_images s
        where s.id = photo_id and s.product_id = p_product_id and s.supplier_id = p_supplier_id
          and (p_staff or s.created_by = p_user_id) for update;
      if snapshot is null or exists (select 1 from public.media_assets m where m.storage_path in (path,thumb) or m.thumb_path in (path,thumb))
        or exists (select 1 from public.product_form_staged_images s where s.id <> photo_id and (s.storage_path in (path,thumb) or s.thumb_path in (path,thumb))) then
        return jsonb_build_object('status','images_changed');
      end if;
    else return jsonb_build_object('status','images_changed'); end if;
    image_ids := array_append(image_ids, photo_id);
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('source',source,'row',snapshot));
  end loop;
  if item.supplier_review_status in ('draft','changes_requested') then
    update public.supplier_products set supplier_review_status = 'pending',ready_for_buyer = false,
      supplier_review_note = null,updated_at = now() where id = p_product_id returning * into item;
  end if;
  insert into public.product_form_submissions (product_id,supplier_id,draft_revision,base_product_updated_at,
    submitted_product_updated_at,payload,quantity,warnings,image_ids,image_selection,image_snapshot)
    values (p_product_id,p_supplier_id,p_expected_revision,draft.base_product_updated_at,item.updated_at,
      p_validated_payload,p_quantity,p_warnings,image_ids,p_selection,snapshots) returning * into submission;
  return jsonb_build_object('status','submitted','submission_id',submission.id);
end;
$$;
revoke all on function public.submit_product_form_draft_selected_images(uuid,uuid,text,boolean,integer,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_product_form_draft_selected_images(uuid,uuid,text,boolean,integer,jsonb,jsonb,jsonb,jsonb) to service_role;

-- A rejection must not replace any approved name, price, public fields or
-- images. Store the reason on the submission; only an unpublished shell gets
-- its workflow status changed. The actor is authenticated by the server action.
alter table public.product_form_submissions add column if not exists decision_note text;
alter table public.product_form_submissions add column if not exists decided_by uuid;
create or replace function public.request_product_form_changes(
  p_product_id uuid, p_submission_id uuid, p_actor_id uuid,
  p_expected_product_updated_at timestamptz, p_note text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  submission public.product_form_submissions%rowtype;
  draft public.product_form_drafts%rowtype;
begin
  if p_product_id is null or p_submission_id is null or p_actor_id is null or p_expected_product_updated_at is null
     or p_note is null or length(btrim(p_note)) = 0 or length(p_note) > 1000 then
    return jsonb_build_object('status','invalid');
  end if;
  select * into item from public.supplier_products where id = p_product_id for update;
  if not found then return jsonb_build_object('status','missing_product'); end if;
  select * into submission from public.product_form_submissions where id = p_submission_id and product_id = p_product_id for update;
  if not found then return jsonb_build_object('status','changed'); end if;
  if submission.status = 'changes_requested' and submission.decided_by = p_actor_id
     and submission.decision_note = btrim(p_note) then
    return jsonb_build_object('status','changes_requested','already_decided',true);
  end if;
  if submission.status <> 'pending' then return jsonb_build_object('status','changed'); end if;
  if item.updated_at is distinct from p_expected_product_updated_at
     or item.updated_at is distinct from submission.submitted_product_updated_at then
    return jsonb_build_object('status','product_changed');
  end if;
  if item.supplier_id is distinct from submission.supplier_id or item.supplier_review_status is null
     or item.supplier_review_status not in ('pending','approved','paused') then
    return jsonb_build_object('status','state_changed');
  end if;
  select * into draft from public.product_form_drafts where product_id = p_product_id for update;
  if item.supplier_review_status = 'pending' then
    -- Check the original draft before refreshing its baseline. A different or
    -- missing draft must not silently inherit a newer product version.
    if draft.product_id is null or draft.supplier_id is distinct from submission.supplier_id
       or draft.revision is distinct from submission.draft_revision
       or draft.base_product_updated_at is distinct from submission.base_product_updated_at
       or draft.payload is distinct from submission.payload or draft.image_selection is distinct from submission.image_selection then
      return jsonb_build_object('status','changed');
    end if;
    update public.supplier_products set supplier_review_status = 'changes_requested', supplier_review_note = btrim(p_note),
      ready_for_buyer = false, updated_at = now() where id = p_product_id returning * into item;
  end if;
  -- Give an unchanged submitted draft a fresh revision, so an exact retry of
  -- the old submission cannot be mistaken for a new request. A newer private
  -- draft on an already-approved product is left entirely untouched.
  if draft.product_id is not null and draft.supplier_id = submission.supplier_id
     and draft.revision = submission.draft_revision and draft.base_product_updated_at = submission.base_product_updated_at
     and draft.payload = submission.payload and draft.image_selection = submission.image_selection then
    update public.product_form_drafts set revision = revision + 1, base_product_updated_at = item.updated_at, updated_at = now()
      where product_id = p_product_id;
  end if;
  update public.product_form_submissions set status = 'changes_requested', decided_at = now(),
    decided_by = p_actor_id, decision_note = btrim(p_note) where id = p_submission_id;
  return jsonb_build_object('status','changes_requested','already_decided',false);
end;
$$;
revoke all on function public.request_product_form_changes(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.request_product_form_changes(uuid,uuid,uuid,timestamptz,text) to service_role;

revoke all on function public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text) from public, anon, authenticated;
revoke all on function public.set_product_form_images(uuid,uuid,text,boolean,integer,jsonb) from public, anon, authenticated;
grant execute on function public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text) to service_role;
grant execute on function public.set_product_form_images(uuid,uuid,text,boolean,integer,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
