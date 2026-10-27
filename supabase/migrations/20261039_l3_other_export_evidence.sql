-- Chấp nhận thêm chứng từ xuất khẩu khác trong hồ sơ L3 và đợt kiểm nhân viên.
-- Chạy sau 20261031_supplier_submission_media_owner.sql và trước khi deploy code.
-- Không sửa loại, kết quả hay trạng thái của bằng chứng/hồ sơ hiện có.
begin;

alter table public.supplier_submission_items drop constraint if exists supplier_submission_items_key_ck;
alter table public.supplier_submission_items add constraint supplier_submission_items_key_ck check (
  checklist_key in (
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control',
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
    'qc_lab_seen', 'documents_original', 'capacity_verified',
    'worker_interview', 'management_interview', 'photos_taken',
    'order_matched', 'shipping_proof', 'delivery_proof',
    'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
    'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
    'pest_control',
    'bill_of_lading', 'customs_declaration', 'commercial_invoice', 'packing_list',
    'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence'
  ))
);

-- Serialize L3 file mutations with submission and keep the pending queue meaningful.
-- The shared parent-row lock prevents a delete/upload racing a manual submission.
create or replace function public.guard_l3_submission_item_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_id uuid;
  parent_level smallint;
  parent_status text;
begin
  if tg_op = 'INSERT' then parent_id := new.submission_id;
  else parent_id := old.submission_id;
  end if;

  select target_level, status into parent_level, parent_status
    from public.supplier_submissions where id = parent_id for update;
  -- A parent already deleted by a cascade need not be locked or checked.
  if not found or parent_level <> 3 then
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

create or replace function public.guard_l3_pending_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.target_level = 3 and new.status = 'pending_review' and old.status <> 'pending_review'
    and not exists (
      select 1 from public.supplier_submission_items i
      where i.submission_id = new.id and i.media_id is not null
        and nullif(btrim(i.storage_path), '') is not null
        and i.checklist_key in ('bill_of_lading', 'customs_declaration', 'commercial_invoice',
          'packing_list', 'certificate_of_origin', 'phytosanitary_or_health', 'other_export_evidence')
    ) then
    raise exception using errcode = 'P0001', message = 'L3_EVIDENCE_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_l3_pending_evidence() from public;
drop trigger if exists guard_l3_pending_evidence on public.supplier_submissions;
create trigger guard_l3_pending_evidence before update of status on public.supplier_submissions
  for each row execute function public.guard_l3_pending_evidence();

commit;
notify pgrst, 'reload schema';
