-- Lý do từ chối chứng nhận, gửi cho nhà cung cấp.
--
-- Nhân viên bấm "Từ chối" trong CRM và chọn lý do: mã có sẵn (holder_without_contract,
-- unreadable, duplicate) hoặc "other:<câu viết cho nhà cung cấp>". Cột này tách khỏi
-- review_note (ghi chú nội bộ, không hiện trên cổng). Trạng thái 'rejected' đã có từ
-- migration 20261017. Thiếu cột này thì vẫn từ chối được, nhà cung cấp thấy câu chung.
begin;

alter table public.certificates add column if not exists rejection_reason text;

alter table public.certificates drop constraint if exists certificates_rejection_reason_check;
alter table public.certificates add constraint certificates_rejection_reason_check check (
  rejection_reason is null
  or rejection_reason in ('holder_without_contract', 'unreadable', 'duplicate')
  or (rejection_reason like 'other:%' and length(rejection_reason) between 7 and 306)
);

commit;
notify pgrst, 'reload schema';
