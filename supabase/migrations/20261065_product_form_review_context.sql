-- KHÔNG CHẠY LÚC NÀY: chỉ là nền tảng kiểm tra duyệt, chưa có transaction công bố.
-- Không xóa hoặc sửa sản phẩm, ảnh hay dữ liệu đang công khai.
begin;

-- A future atomic approval records the precise approved price revision here.
-- This link lets buyer projections prove the per-product consent belongs to
-- that revision; it does not itself publish or approve anything.
alter table public.product_form_submissions add column if not exists approved_price_revision_id uuid
  references public.product_quantity_price_revisions(id) on delete restrict;
create unique index if not exists product_form_submission_price_revision_key
  on public.product_form_submissions(approved_price_revision_id) where approved_price_revision_id is not null;

-- This service-role-only helper must be called INSIDE the eventual approval
-- transaction. A separate RPC call releases its locks at the end of that call;
-- it is not an approval and cannot guarantee that a later RPC sees the same data.
-- The approval transaction must compare this exact JSONB with the snapshot the
-- authorized server used for its current-policy, HTML, English and byte checks.
-- All known quantity-revision writers lock the product first. The revision-table
-- locks additionally prevent unguarded inserts/updates during the final decision.
create or replace function public.product_form_review_context(p_product_id uuid, p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.supplier_products%rowtype;
  submission public.product_form_submissions%rowtype;
  category public.categories%rowtype;
  settings public.quantity_price_settings%rowtype;
  grade_bounds jsonb;
  prices jsonb;
  names jsonb;
  entry jsonb;
  selected jsonb;
  current_photo jsonb;
  photo_id uuid;
  photo_path text;
  photo_thumb text;
  index_ integer;
  seen uuid[] := '{}';
begin
  if p_product_id is null or p_submission_id is null then return jsonb_build_object('status','invalid'); end if;
  select * into item from public.supplier_products where id = p_product_id for update;
  if not found then return jsonb_build_object('status','missing_product'); end if;
  select * into submission from public.product_form_submissions where id = p_submission_id and product_id = p_product_id for update;
  if not found or submission.status <> 'pending' or submission.supplier_id is distinct from item.supplier_id then
    return jsonb_build_object('status','submission_changed');
  end if;
  if item.updated_at is distinct from submission.submitted_product_updated_at
     or item.supplier_review_status is null or item.supplier_review_status not in ('pending','approved','paused') then
    return jsonb_build_object('status','product_changed');
  end if;
  -- Never reinterpret an existing multi-grade listing as one grade. The user
  -- will create and review separate drafts manually; the original stays intact.
  if item.specs is not null and jsonb_typeof(item.specs) is distinct from 'object' then
    return jsonb_build_object('status','legacy_grade_unmapped');
  end if;
  if item.specs->'grade_rows' is not null and item.specs->'grade_rows' <> 'null'::jsonb then
    if jsonb_typeof(item.specs->'grade_rows') is distinct from 'array' then return jsonb_build_object('status','legacy_grade_unmapped'); end if;
    if jsonb_array_length(item.specs->'grade_rows') > 1 then return jsonb_build_object('status','legacy_grade_unmapped'); end if;
  end if;
  -- Prevent policy/category changes, including new grade-bound rows (row locks
  -- alone cannot prevent an insert into an otherwise empty category).
  lock table public.categories, public.quantity_price_settings, public.category_grade_price_bounds in share mode;
  lock table public.product_quantity_price_revisions, public.product_english_name_revisions,
    public.media_assets, public.product_form_staged_images in share row exclusive mode;
  select * into category from public.categories where slug = submission.payload->>'category';
  if not found or category.status <> 'published' or category.is_published is distinct from true then
    return jsonb_build_object('status','category_changed');
  end if;
  select * into settings from public.quantity_price_settings where singleton = true;
  if not found then return jsonb_build_object('status','policy_unavailable'); end if;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.grade),'[]'::jsonb) into grade_bounds
    from public.category_grade_price_bounds b where b.category_id = category.id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) into prices
    from public.product_quantity_price_revisions p where p.product_id = item.id and p.status in ('draft','pending','approved');
  select coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]'::jsonb) into names
    from public.product_english_name_revisions n where n.product_id = item.id and n.status in ('draft','pending','approved');
  if jsonb_typeof(submission.image_selection) is distinct from 'array' or jsonb_typeof(submission.image_snapshot) is distinct from 'array' then
    return jsonb_build_object('status','images_changed');
  end if;
  if jsonb_array_length(submission.image_selection) not between 1 and 8
     or jsonb_array_length(submission.image_selection) <> jsonb_array_length(submission.image_snapshot)
     or cardinality(submission.image_ids) is distinct from jsonb_array_length(submission.image_selection) then
    return jsonb_build_object('status','images_changed');
  end if;
  for index_ in 0..jsonb_array_length(submission.image_selection)-1 loop
    selected := submission.image_selection->index_;
    entry := submission.image_snapshot->index_;
    if jsonb_typeof(selected) is distinct from 'object' or jsonb_typeof(entry) is distinct from 'object' then
      return jsonb_build_object('status','images_changed');
    end if;
    if (select count(*) from jsonb_object_keys(selected)) <> 2 or jsonb_typeof(selected->'id') is distinct from 'string'
       or jsonb_typeof(selected->'source') is distinct from 'string' or jsonb_typeof(entry->'row') is distinct from 'object'
       or entry->>'source' is distinct from selected->>'source' or (selected->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','images_changed');
    end if;
    photo_id := (selected->>'id')::uuid;
    if photo_id is null or photo_id = any(seen) or submission.image_ids[index_ + 1] is distinct from photo_id then
      return jsonb_build_object('status','images_changed');
    end if;
    seen := array_append(seen,photo_id);
    current_photo := null; photo_path := null; photo_thumb := null;
    if selected->>'source' = 'staged' then
      select to_jsonb(s), s.storage_path, s.thumb_path into current_photo, photo_path, photo_thumb
        from public.product_form_staged_images s where s.id = photo_id and s.product_id = item.id and s.supplier_id = item.supplier_id for update;
      if current_photo is null or exists (select 1 from public.media_assets m where m.storage_path in (photo_path,photo_thumb) or m.thumb_path in (photo_path,photo_thumb))
        or exists (select 1 from public.product_form_staged_images s where s.id <> photo_id and (s.storage_path in (photo_path,photo_thumb) or s.thumb_path in (photo_path,photo_thumb))) then
        return jsonb_build_object('status','images_changed');
      end if;
    elsif selected->>'source' = 'media' then
      select to_jsonb(m), m.storage_path, m.thumb_path into current_photo, photo_path, photo_thumb
        from public.media_assets m where m.id = photo_id and m.product_id = item.id and m.supplier_id = item.supplier_id
          and m.owner_type = 'product' and m.kind = 'image' and m.status <> 'expired'
          and (m.expires_on is null or m.expires_on >= (now() at time zone 'UTC')::date) for update;
      if current_photo is null or coalesce(btrim(photo_path),'') = ''
        or (select count(*) from public.media_assets m where m.storage_path in (photo_path,photo_thumb) or m.thumb_path in (photo_path,photo_thumb)) <> 1
        or exists (select 1 from public.product_form_staged_images s where s.storage_path in (photo_path,photo_thumb) or s.thumb_path in (photo_path,photo_thumb)) then
        return jsonb_build_object('status','images_changed');
      end if;
    else return jsonb_build_object('status','images_changed'); end if;
    if current_photo is distinct from entry->'row' then return jsonb_build_object('status','images_changed'); end if;
  end loop;
  return jsonb_build_object('status','ok','product',to_jsonb(item),'submission',to_jsonb(submission),
    'category',to_jsonb(category),'settings',to_jsonb(settings),'bounds',grade_bounds,'prices',prices,'names',names);
end;
$$;
revoke all on function public.product_form_review_context(uuid,uuid) from public, anon, authenticated;
grant execute on function public.product_form_review_context(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
