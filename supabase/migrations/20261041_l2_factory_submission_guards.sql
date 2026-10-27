-- Keep factory submissions complete and immutable while a person reviews them.
-- Apply after 20261040_l2_partner_contract.sql. No existing status is changed.
-- AI findings (including historical `hard` flags) never block submission.
begin;

-- Item mutations share the submission row lock with the transition to pending.
-- AI may still update its advisory fields on an already-submitted item.
create or replace function public.guard_l2_factory_item_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  parent_id uuid;
  p_level smallint;
  p_scope text;
  p_status text;
  p_supplier uuid;
  destination_factory boolean := false;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id; else parent_id := old.submission_id; end if;
  select target_level, l2_scope, status, supplier_id into p_level, p_scope, p_status, p_supplier
    from public.supplier_submissions where id = parent_id for update;
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE' and new.submission_id is distinct from old.submission_id then
    select exists(select 1 from public.supplier_submissions s where s.id = new.submission_id
      and s.target_level = 2 and coalesce(s.l2_scope, 'factory') = 'factory') into destination_factory;
    if (p_level = 2 and coalesce(p_scope, 'factory') = 'factory') or destination_factory then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_ITEM_INVALID';
    end if;
  end if;
  if p_level <> 2 or coalesce(p_scope, 'factory') <> 'factory' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if p_status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L2_FACTORY_LOCKED';
  end if;
  if tg_op <> 'DELETE' and (new.supplier_id is distinct from p_supplier or new.checklist_key not in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control'
  )) then
    raise exception using errcode = 'P0001', message = 'L2_FACTORY_ITEM_INVALID';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_l2_factory_item_mutation() from public;
drop trigger if exists guard_l2_factory_item_insert_delete on public.supplier_submission_items;
create trigger guard_l2_factory_item_insert_delete before insert or delete on public.supplier_submission_items
  for each row execute function public.guard_l2_factory_item_mutation();
drop trigger if exists guard_l2_factory_item_identity on public.supplier_submission_items;
create trigger guard_l2_factory_item_identity before update of submission_id, supplier_id, checklist_key, media_id, storage_path, thumb_path, mime
  on public.supplier_submission_items for each row execute function public.guard_l2_factory_item_mutation();

-- Check structural requirements in the same transaction that locks the row.
-- Missing/incorrect codes reported by AI are suggestions for staff, not gates.
create or replace function public.guard_l2_factory_pending_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.target_level = 2 and coalesce(new.l2_scope, 'factory') = 'factory'
    and new.status = 'pending_review' and old.status <> 'pending_review' then
    if nullif(btrim(new.verification_code), '') is null or new.code_issued_at is null
      or new.code_issued_at < now() - interval '72 hours' then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_CODE_REQUIRED';
    end if;
    if (select count(distinct i.checklist_key) from public.supplier_submission_items i
      where i.submission_id = new.id and i.supplier_id = new.supplier_id
        and i.media_id is not null and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('factory_gate', 'raw_material_warehouse', 'production_line_running',
          'packing_area', 'finished_goods_warehouse', 'open_carton_lot_label',
          'hygiene_station', 'worker_ppe', 'pest_control')) < 9 then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_PHOTOS_REQUIRED';
    end if;
    if exists (
      select 1 from public.supplier_submission_items i
      cross join lateral jsonb_array_elements(case when jsonb_typeof(i.flags) = 'array' then i.flags else '[]'::jsonb end) flag
      where i.submission_id = new.id and i.media_id is not null
        and i.checklist_key in ('factory_gate', 'production_line_running', 'finished_goods_warehouse')
        and flag->>'severity' = 'hard' and flag->>'source' is distinct from 'ai'
        and flag->>'flag' in ('code_missing', 'code_mismatch')
    ) then
      raise exception using errcode = 'P0001', message = 'L2_FACTORY_CODE_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l2_factory_pending_evidence() from public;
drop trigger if exists guard_l2_factory_pending_evidence on public.supplier_submissions;
create trigger guard_l2_factory_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l2_factory_pending_evidence();

commit;
notify pgrst, 'reload schema';
