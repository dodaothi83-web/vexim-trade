-- L2 thương mại: ghi tên nhà máy đối tác trên hợp đồng để đối chiếu giấy chứng nhận.
-- Chạy trong Supabase SQL Editor sau 20261040_l2_partner_contract.sql (và các migration trước đó).
--
-- Vì sao cần: hồ sơ L2 chỉ lưu tệp hợp đồng, không có trường tên nhà máy đối tác, nên
-- hệ thống không có căn cứ máy đọc để biết giấy chứng nhận có đúng nhà máy mà đơn vị
-- thương mại đã ký hợp đồng hay không. Cột mới lưu đúng tên đó:
--   1. Nhà cung cấp khai tên nhà máy đối tác khi nộp L2 partner_contract.
--   2. Nhân viên đối chiếu với hợp đồng và xác nhận/sửa lại ở bước kiểm.
--   3. Giấy chứng nhận chỉ được công bố khi tên trên giấy trùng tên này.
--
-- Không backfill và không suy đoán tên cho hồ sơ cũ: cột mới để trống. Hồ sơ L2 đã
-- duyệt trước migration giữ nguyên trạng thái; chỉ lần duyệt mới bắt buộc có tên, và
-- nhân viên có thể điền vào đợt kiểm đang mở trước khi bấm duyệt.
begin;

alter table public.supplier_submissions add column if not exists partner_factory_name text;
alter table public.verifications add column if not exists partner_factory_name text;

-- Chỉ L2 partner_contract mới có tên nhà máy đối tác; tên phải là chuỗi thật, không
-- phải khoảng trắng. NOT VALID: không quét lại dữ liệu cũ, vẫn chặn mọi ghi mới.
alter table public.supplier_submissions drop constraint if exists supplier_submissions_partner_name_ck;
alter table public.supplier_submissions add constraint supplier_submissions_partner_name_ck check (
  partner_factory_name is null or (
    coalesce(l2_scope, '') = 'partner_contract' and char_length(btrim(partner_factory_name)) between 2 and 200
  )
) not valid;
alter table public.verifications drop constraint if exists verifications_partner_name_ck;
alter table public.verifications add constraint verifications_partner_name_ck check (
  partner_factory_name is null or (
    coalesce(l2_scope, '') = 'partner_contract' and char_length(btrim(partner_factory_name)) between 2 and 200
  )
) not valid;

-- Nhà cung cấp chỉ sửa tên khi hồ sơ còn mở; đã nộp thì giữ nguyên để đối chiếu.
create or replace function public.guard_partner_factory_name_edit()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.partner_factory_name is not distinct from old.partner_factory_name then return new; end if;
  if tg_table_name = 'verifications' then
    -- Kết quả đã duyệt là mốc đối chiếu của giấy chứng nhận; không đổi tên sau đó.
    if old.status = 'approved' then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_NAME_LOCKED';
    end if;
  elsif old.status not in ('draft', 'returned') then
    raise exception using errcode = 'P0001', message = 'L2_PARTNER_NAME_LOCKED';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_partner_factory_name_edit() from public;
drop trigger if exists guard_submission_partner_name_edit on public.supplier_submissions;
create trigger guard_submission_partner_name_edit before update of partner_factory_name on public.supplier_submissions
  for each row execute function public.guard_partner_factory_name_edit();
drop trigger if exists guard_review_partner_name_edit on public.verifications;
create trigger guard_review_partner_name_edit before update of partner_factory_name on public.verifications
  for each row execute function public.guard_partner_factory_name_edit();

-- Duyệt L2 đối tác bắt buộc có tên nhà máy đối tác, cùng lúc với hợp đồng đã được
-- nhân viên đánh dấu đã kiểm và hai ô xác nhận phạm vi.
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
    if nullif(btrim(coalesce(new.partner_factory_name, '')), '') is null then
      raise exception using errcode = 'P0001', message = 'L2_PARTNER_NAME_REQUIRED';
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
