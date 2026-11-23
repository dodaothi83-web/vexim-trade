-- Người phụ trách nhà cung cấp.
--
-- Nhân viên kinh doanh chỉ thấy và thao tác nhà cung cấp mình phụ trách (kiểm tra ở
-- máy chủ, xem lib/auth/supplier-access.ts). NULL = chưa giao; nhà cung cấp tự đăng ký
-- được hệ thống chia đều cho nhân viên kinh doanh đang hoạt động.
-- Xoá tài khoản nhân viên thì NCC quay về "chưa giao", không mất hồ sơ.

alter table public.suppliers
  add column if not exists owner_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists owner_assigned_at timestamptz;

create index if not exists suppliers_owner_user_id_idx on public.suppliers (owner_user_id);

-- Nhân viên kinh doanh được kiểm và duyệt nhà cung cấp MÌNH PHỤ TRÁCH (quyết định 2026-11-23).
-- Cơ sở dữ liệu kiểm lại lần nữa: kinh doanh chỉ duyệt được khi suppliers.owner_user_id là chính họ.
create or replace function public.supplier_owned_by(p_supplier_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.suppliers s
    join public.app_users u on u.id = p_user_id
    where s.id = p_supplier_id and s.owner_user_id = p_user_id and u.role = 'sale' and u.is_active
  );
$$;
-- Chỉ trả đúng/sai; chạy với quyền chủ hàm để trigger không phụ thuộc RLS của người gọi.
revoke all on function public.supplier_owned_by(uuid, uuid) from public;

create or replace function public.check_verification_self_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'approved' then
    raise exception 'A verification must be submitted before it can be approved';
  end if;
  if new.approved_by is not null
     and new.inspector_id = new.approved_by
     and not new.legacy_self_approved
     and not exists (select 1 from public.app_users u where u.id = new.approved_by
                     and u.role in ('admin', 'reviewer') and u.is_active)
     and not public.supplier_owned_by(new.supplier_id, new.approved_by) then
    raise exception 'Only active admin, review lead or the supplier owner can complete their own verification';
  end if;
  return new;
end;
$$;

create or replace function public.log_confirmed_verification_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare approver_email text;
begin
  if old.status = 'approved' and new.status = 'approved' and
     (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
      or new.evidence_confirmed_by is distinct from old.evidence_confirmed_by
      or new.evidence_confirmed_at is distinct from old.evidence_confirmed_at) then
    raise exception 'Verification has already been approved';
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if old.status <> 'submitted' then
      raise exception 'Only submitted verifications can be approved';
    end if;
    if new.approved_by is null or new.evidence_confirmed_by is distinct from new.approved_by
       or new.evidence_confirmed_at is null then
      raise exception 'Evidence comparison confirmation is required before approval';
    end if;
    select email into approver_email from public.app_users
    where id = new.approved_by and is_active
      and (role in ('admin', 'reviewer') or public.supplier_owned_by(new.supplier_id, new.approved_by));
    if not found then raise exception 'Approval requires active admin, review lead or the supplier owner'; end if;
    insert into public.audit_log (actor_id, actor_email, entity, entity_id, action, before, after)
    values (new.approved_by, approver_email, 'supplier', new.supplier_id::text,
      'verification.evidence_confirmation.l' || new.target_level::text,
      jsonb_build_object('id', old.id, 'status', old.status),
      jsonb_build_object('id', new.id, 'status', new.status,
        'confirmed_by', new.evidence_confirmed_by, 'confirmed_at', new.evidence_confirmed_at,
        'inspector_id', new.inspector_id, 'self_approved', new.self_approved));
  end if;
  return new;
end;
$$;

-- Duyệt sản phẩm NCC gửi: thêm đúng một điều kiện vào hàm hiện có, không chép lại cả hàm.
do $migration$
declare
  fn regprocedure := 'public.approve_product_form_submission(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure;
  def text;
  patched text;
begin
  def := pg_get_functiondef(fn);
  if position('supplier_owned_by' in def) > 0 then
    return;
  end if;
  patched := replace(def,
    $old$reviewer.role not in ('admin','reviewer') then$old$,
    $new$(reviewer.role not in ('admin','reviewer') and not public.supplier_owned_by((select sp.supplier_id from public.supplier_products sp where sp.id = p_product_id), reviewer.id)) then$new$);
  if patched = def then
    raise exception 'approve_product_form_submission: role check not found, migration needs review';
  end if;
  execute patched;
end;
$migration$;
