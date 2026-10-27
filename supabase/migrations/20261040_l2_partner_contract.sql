-- L2 thương mại: phạm vi là hợp đồng với nhà máy đối tác, KHÔNG phải kiểm nhà máy sở hữu.
-- Chạy sau 20261031_supplier_submission_media_owner.sql và 20261039_l3_other_export_evidence.sql.
-- Không sửa hồ sơ, kết luận hoặc loại hình cũ. NULL ở L2 giữ nghĩa luồng nhà máy cũ.
begin;

alter table public.supplier_submissions add column if not exists l2_scope text;
alter table public.verifications add column if not exists l2_scope text;
alter table public.supplier_submissions drop constraint if exists supplier_submissions_l2_scope_ck;
alter table public.supplier_submissions add constraint supplier_submissions_l2_scope_ck check (
  l2_scope is null or (target_level = 2 and l2_scope in ('factory', 'partner_contract'))
);
alter table public.verifications drop constraint if exists verifications_l2_scope_ck;
alter table public.verifications add constraint verifications_l2_scope_ck check (
  l2_scope is null or (target_level = 2 and l2_scope in ('factory', 'partner_contract'))
);

-- Retain an existing factory draft, including one on a trader's account. A new
-- partner case is separate; neither case is rewritten or silently transferred.
drop index if exists public.supplier_submissions_one_open_per_level;
create unique index if not exists supplier_submissions_one_open_per_scope
  on public.supplier_submissions (supplier_id, target_level, coalesce(l2_scope, 'factory'))
  where status <> 'accepted';

alter table public.supplier_submission_items drop constraint if exists supplier_submission_items_key_ck;
alter table public.supplier_submission_items add constraint supplier_submission_items_key_ck check (
  checklist_key in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control',
    'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  )
);
alter table public.media_assets drop constraint if exists media_checklist_key_ck;
alter table public.media_assets add constraint media_checklist_key_ck check (
  checklist_key is null or
  (owner_type in ('verification', 'submission') and checklist_key in (
    'business_license', 'tax_certificate', 'bank_letter', 'food_safety',
    'haccp_or_brc', 'product_certs', 'export_license',
    'factory_address_confirmed', 'production_line_seen', 'warehouse_seen',
    'qc_lab_seen', 'documents_original', 'capacity_verified', 'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof',
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control',
    'partner_factory_contract', 'partner_factory_photos',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  ))
);

-- New cases follow the registered type; a legacy NULL scope still means factory.
-- Existing records are left untouched and may be inspected as history.
create or replace function public.guard_new_l2_scope_type()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text; expected_scope text;
begin
  if new.target_level <> 2 then return new; end if;
  select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
  expected_scope := case when current_type = 'trading' then 'partner_contract'
                         when current_type in ('manufacturer', 'cooperative') then 'factory' else null end;
  if expected_scope is null or coalesce(new.l2_scope, 'factory') <> expected_scope then
    raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
  end if;
  if tg_table_name = 'verifications' and new.l2_scope = 'partner_contract' and new.status = 'approved' then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_APPROVAL_REQUIRES_REVIEW';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_new_l2_scope_type() from public;
drop trigger if exists guard_new_submission_l2_scope on public.supplier_submissions;
create trigger guard_new_submission_l2_scope before insert on public.supplier_submissions
  for each row execute function public.guard_new_l2_scope_type();
drop trigger if exists guard_new_review_l2_scope on public.verifications;
create trigger guard_new_review_l2_scope before insert on public.verifications
  for each row execute function public.guard_new_l2_scope_type();

-- Neither type changes nor a later staff edit can change the legal entity,
-- level or meaning of an existing submission/review.
create or replace function public.guard_verification_scope_identity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.supplier_id is distinct from old.supplier_id or
     new.target_level is distinct from old.target_level or
     new.l2_scope is distinct from old.l2_scope then
    raise exception using errcode = 'P0001', message = 'VERIFICATION_SCOPE_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_verification_scope_identity() from public;
drop trigger if exists guard_submission_scope_identity on public.supplier_submissions;
create trigger guard_submission_scope_identity before update of supplier_id, target_level, l2_scope on public.supplier_submissions
  for each row execute function public.guard_verification_scope_identity();
drop trigger if exists guard_review_scope_identity on public.verifications;
create trigger guard_review_scope_identity before update of supplier_id, target_level, l2_scope on public.verifications
  for each row execute function public.guard_verification_scope_identity();

-- Share the parent row lock with pending transition; enforce scope-specific keys,
-- a maximum of three files and no edits while a manual case is in the queue.
create or replace function public.guard_l3_submission_item_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  parent_id uuid;
  parent_supplier uuid;
  parent_level smallint;
  parent_scope text;
  parent_status text;
  manual_case boolean;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id; else parent_id := old.submission_id; end if;
  select target_level, l2_scope, status, supplier_id into parent_level, parent_scope, parent_status, parent_supplier
    from public.supplier_submissions where id = parent_id for update;
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'INSERT' then
    if (parent_level = 2 and parent_scope = 'partner_contract' and new.supplier_id is distinct from parent_supplier)
       or (parent_level = 2 and parent_scope = 'partner_contract' and new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos'))
       or (coalesce(parent_scope, '') <> 'partner_contract' and new.checklist_key in ('partner_factory_contract', 'partner_factory_photos')) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
  end if;
  manual_case := parent_level = 3 or (parent_level = 2 and coalesce(parent_scope, 'factory') = 'partner_contract');
  if not manual_case then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if parent_status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
  end if;
  if tg_op = 'INSERT' and new.media_id is not null and (
    select count(*) from public.supplier_submission_items
    where submission_id = parent_id and checklist_key = new.checklist_key and media_id is not null
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_LIMIT';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_l3_submission_item_mutation() from public;
drop trigger if exists guard_l3_submission_items on public.supplier_submission_items;
create trigger guard_l3_submission_items before insert or delete on public.supplier_submission_items
  for each row execute function public.guard_l3_submission_item_mutation();

create or replace function public.guard_partner_submission_item_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare p_level smallint; p_scope text; p_status text; destination_scope text;
begin
  select target_level, l2_scope, status into p_level, p_scope, p_status
    from public.supplier_submissions where id = old.submission_id for update;
  if new.submission_id is distinct from old.submission_id then
    select l2_scope into destination_scope from public.supplier_submissions where id = new.submission_id for update;
    if destination_scope = 'partner_contract' or p_level = 3 or (p_level = 2 and p_scope = 'partner_contract') or exists (select 1 from public.supplier_submissions where id = new.submission_id and target_level = 3) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
  end if;
  if found and (p_level = 3 or (p_level = 2 and p_scope = 'partner_contract')) then
    if p_status not in ('draft', 'returned') then
      raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
    end if;
    if new.submission_id is distinct from old.submission_id or new.supplier_id is distinct from old.supplier_id or
       new.checklist_key is distinct from old.checklist_key or (p_level = 2 and new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos')) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_KEY_MISMATCH';
    end if;
    if old.media_id is null and new.media_id is not null and (
      select count(*) from public.supplier_submission_items
      where submission_id = old.submission_id and checklist_key = old.checklist_key and media_id is not null
    ) >= 3 then
      raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_LIMIT';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_submission_item_update() from public;
drop trigger if exists guard_partner_submission_item_update on public.supplier_submission_items;
create trigger guard_partner_submission_item_update before update of submission_id, supplier_id, checklist_key, media_id, storage_path on public.supplier_submission_items
  for each row execute function public.guard_partner_submission_item_update();

create or replace function public.guard_l3_pending_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text; expected_scope text;
begin
  if new.status = 'pending_review' and old.status <> 'pending_review' then
    if new.target_level = 2 then
      select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
      expected_scope := case when current_type = 'trading' then 'partner_contract'
                             when current_type in ('manufacturer', 'cooperative') then 'factory' else null end;
      if expected_scope is null or coalesce(new.l2_scope, 'factory') <> expected_scope then
        raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
      end if;
    end if;
    if new.target_level = 3 and not exists (
      select 1 from public.supplier_submission_items i
      where i.submission_id = new.id and i.media_id is not null and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('bill_of_lading', 'customs_declaration', 'commercial_invoice',
          'packing_list', 'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence')
    ) then
      raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_REQUIRED';
    end if;
    if new.target_level = 2 and new.l2_scope = 'partner_contract' and not exists (
      select 1 from public.supplier_submission_items i
      join public.media_assets m on m.id = i.media_id
      where i.submission_id = new.id and i.supplier_id = new.supplier_id
        and i.checklist_key = 'partner_factory_contract' and nullif(btrim(i.storage_path), '') is not null
        and m.owner_type = 'submission' and m.submission_id = new.id and m.supplier_id = new.supplier_id
        and m.storage_path = i.storage_path and m.checklist_key = i.checklist_key
        and m.audience = 'internal' and m.kind in ('image', 'document')
    ) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_CONTRACT_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l3_pending_evidence() from public;
drop trigger if exists guard_l3_pending_evidence on public.supplier_submissions;
create trigger guard_l3_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l3_pending_evidence();

-- Manual submission files share the same parent lock as the queue transition.
-- Reject moving them between submissions/entities and allow cleanup of an
-- unattached upload that lost a race with submit.
create or replace function public.guard_manual_submission_media()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare old_parent uuid; new_parent uuid; p_level smallint; p_scope text; p_status text; p_supplier uuid; manual_case boolean := false;
begin
  if tg_op <> 'INSERT' then old_parent := old.submission_id; end if;
  if tg_op <> 'DELETE' then new_parent := new.submission_id; end if;
  if old_parent is not null then
    select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
      from public.supplier_submissions where id = old_parent for update;
    manual_case := found and (p_level = 3 or (p_level = 2 and coalesce(p_scope, 'factory') = 'partner_contract'));
    if manual_case and tg_op = 'UPDATE' and new_parent is distinct from old_parent then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if new_parent is not null and (old_parent is null or new_parent is distinct from old_parent) then
    select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
      from public.supplier_submissions where id = new_parent for update;
    manual_case := found and (p_level = 3 or (p_level = 2 and coalesce(p_scope, 'factory') = 'partner_contract'));
    if manual_case and tg_op = 'UPDATE' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if not manual_case then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if p_status not in ('draft', 'returned') then
    if tg_op = 'DELETE' and not exists (select 1 from public.supplier_submission_items where media_id = old.id) then return old; end if;
    raise exception using errcode = 'P0001', message = 'L3_SUBMISSION_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.owner_type <> 'submission' or new.submission_id is distinct from coalesce(old_parent, new_parent)
      or new.supplier_id is distinct from p_supplier or new.audience is distinct from 'internal' or new.kind is null or new.kind not in ('image', 'document', 'certificate') or new.checklist_key is null
      or (p_scope = 'partner_contract' and (new.checklist_key not in ('partner_factory_contract', 'partner_factory_photos')
          or (new.checklist_key = 'partner_factory_photos' and new.kind <> 'image') or (new.checklist_key = 'partner_factory_contract' and new.kind not in ('image', 'document'))))
      or (p_level = 3 and new.checklist_key not in ('bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
          'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'))) then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_manual_submission_media() from public;
drop trigger if exists guard_manual_submission_media on public.media_assets;
create trigger guard_manual_submission_media before insert or update or delete on public.media_assets
  for each row execute function public.guard_manual_submission_media();

-- Lock partner evidence to its review and keep it private. Taking the same
-- review lock serializes edits/deletes against approval.
create or replace function public.guard_partner_review_media()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare review_id uuid; review_scope text; review_status text; review_supplier uuid;
begin
  -- Never move an existing file into or out of a partner review; create a new
  -- internal evidence record instead. Check the destination as well as source.
  if tg_op = 'UPDATE' and new.verification_id is distinct from old.verification_id and new.verification_id is not null then
    select l2_scope into review_scope from public.verifications where id = new.verification_id for update;
    if found and review_scope = 'partner_contract' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
    end if;
  end if;
  if tg_op = 'INSERT' then review_id := new.verification_id; else review_id := old.verification_id; end if;
  if review_id is null then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  select l2_scope, status, supplier_id into review_scope, review_status, review_supplier
    from public.verifications where id = review_id for update;
  if not found or review_scope is distinct from 'partner_contract' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if review_status not in ('scheduled', 'in_progress', 'returned') then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_REVIEW_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.verification_id is distinct from review_id or new.supplier_id is distinct from review_supplier
      or new.owner_type <> 'verification' or new.audience <> 'internal') then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_PRIVATE_EVIDENCE';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_partner_review_media() from public;
drop trigger if exists guard_partner_review_media on public.media_assets;
create trigger guard_partner_review_media before insert or update or delete on public.media_assets
  for each row execute function public.guard_partner_review_media();

-- The human reviewer must mark the contract checked and confirm the parties
-- and restricted scope. This is not a factory ownership or site-visit claim.
create or replace function public.guard_partner_review_approval()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare current_type text;
begin
  if new.target_level = 2 and new.status = 'approved' and old.status <> 'approved' then
    select supplier_type into current_type from public.suppliers where id = new.supplier_id for share;
    if (new.l2_scope = 'partner_contract' and current_type is distinct from 'trading') or
       (coalesce(new.l2_scope, 'factory') = 'factory' and (current_type is null or current_type not in ('manufacturer', 'cooperative'))) then
      raise exception using errcode = 'P0001', message = 'L2_SCOPE_TYPE_MISMATCH';
    end if;
  end if;
  if new.target_level = 2 and new.l2_scope = 'partner_contract' and new.status = 'approved' and old.status <> 'approved' then
    if not exists (
      select 1 from public.media_assets m where m.verification_id = new.id and m.owner_type = 'verification'
        and m.supplier_id = new.supplier_id and m.checklist_key = 'partner_factory_contract'
        and m.kind in ('image', 'document') and m.audience = 'internal' and m.status = 'checked'
        and nullif(btrim(m.storage_path), '') is not null
    ) then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_CONTRACT_CHECK_REQUIRED';
    end if;
    if new.checklist->>'partner_identity_confirmed' is distinct from 'true' or
       new.checklist->>'partner_scope_confirmed' is distinct from 'true' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_SCOPE_CONFIRM_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_review_approval() from public;
drop trigger if exists guard_partner_review_approval on public.verifications;
create trigger guard_partner_review_approval before update of status on public.verifications
  for each row execute function public.guard_partner_review_approval();

commit;
notify pgrst, 'reload schema';
