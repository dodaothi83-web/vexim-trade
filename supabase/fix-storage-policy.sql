-- ============================================================================
-- FIX: "must be owner of table objects" (42501)
-- Chạy đoạn này TRONG Supabase Dashboard → SQL Editor, sau khi schema.sql đã
-- bị dừng ở đoạn storage.objects. Nó chỉ tạo bucket + policy cho
-- email-attachments và rfq-attachments bằng đúng role owner của Storage.
-- ============================================================================

-- 1) Tạo bucket email-attachments nếu chưa có
insert into storage.buckets (id, name, public, file_size_limit)
values ('email-attachments', 'email-attachments', false, 25 * 1024 * 1024)
on conflict (id) do nothing;

-- 2) Tạo bucket rfq-attachments nếu chưa có
insert into storage.buckets (id, name, public, file_size_limit)
values ('rfq-attachments', 'rfq-attachments', false, 10 * 1024 * 1024)
on conflict (id) do nothing;

-- 3) Bật RLS + tạo policy dưới quyền supabase_storage_admin (owner của
--    storage.objects). DO block bắt lỗi để không làm hỏng cả giao dịch
--    nếu policy đã tồn tại hoặc role đổi tên ở phiên bản Supabase mới.
do $$
begin
  perform set_config('role', 'supabase_storage_admin', true);

  execute 'alter table storage.objects enable row level security';

  execute $pol$
    drop policy if exists "email attachments service only" on storage.objects
  $pol$;
  execute $pol$
    create policy "email attachments service only" on storage.objects
      for all to service_role
      using (bucket_id = 'email-attachments')
      with check (bucket_id = 'email-attachments')
  $pol$;

  execute $pol$
    drop policy if exists "rfq attachments service only" on storage.objects
  $pol$;
  execute $pol$
    create policy "rfq attachments service only" on storage.objects
      for all to service_role
      using (bucket_id = 'rfq-attachments')
      with check (bucket_id = 'rfq-attachments')
  $pol$;

  reset role;
exception
  when insufficient_privilege or object_not_in_prerequisite_state then
    -- Nếu Dashboard không cho phép set role: báo rõ trong log và bỏ qua
    raise notice 'Skipping storage.objects policy: run this block as supabase_storage_admin or via Supabase CLI.';
end $$;

-- 4) Cấp quyền cho service_role được làm việc với 2 bucket này (phòng hờ)
grant usage on schema storage to service_role;
grant all on storage.objects to service_role;
grant all on storage.buckets to service_role;

-- ============================================================================
-- XONG. Chạy thêm migration GĐ0:
--   supabase/migrations/20261016_rfq_foundation.sql
-- ============================================================================
