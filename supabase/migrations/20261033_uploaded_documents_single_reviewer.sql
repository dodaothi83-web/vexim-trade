-- Duyệt được đợt kiểm giấy tờ do NCC tự tải lên (không có người kiểm tách biệt).
--
-- Bối cảnh: hồ sơ L1 do nhà cung cấp tự tải lên được tạo với inspector_id = null.
-- Ràng buộc bốn mắt cũ đòi inspector_id not null, nên các đợt này không bao giờ
-- duyệt được: nhân viên bấm Duyệt chỉ nhận thông báo "Bản kiểm thiếu người kiểm".
--
-- Cách sửa: thêm cờ self_approved. Một đợt KHÔNG có người kiểm chỉ được duyệt
-- khi cờ này được ghi rõ ràng (kèm xác nhận của người duyệt và một dòng audit
-- log), tức là hồ sơ nói thật "một người vừa đối chiếu vừa duyệt". Mọi đợt ĐÃ
-- có người kiểm vẫn bắt buộc người duyệt khác người kiểm như trước.
--
-- Chạy trên Supabase project của app, trước hoặc cùng lúc với lần deploy này.
begin;

alter table public.verifications
  add column if not exists self_approved boolean not null default false;

-- Bỏ ràng buộc cũ trước: nếu không, chính lệnh update này bị chặn.
alter table public.verifications drop constraint if exists verifications_four_eyes;

alter table public.verifications add constraint verifications_four_eyes
  check (
    approved_by is null
    or (inspector_id is not null and (inspector_id <> approved_by or legacy_self_approved))
    or (inspector_id is null and self_approved)
  ) not valid;

commit;
notify pgrst, 'reload schema';
