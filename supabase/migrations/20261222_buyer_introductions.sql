-- Người mua đồng ý nhận giới thiệu nhà cung cấp (đợt 1, chủ sàn chốt 2026-11-21).
-- `marketing_opt_in` (đã có, mặc định TẮT) là công tắc bật/tắt; cột `introductions` giữ ngành hàng
-- người mua tự chọn (mã ngành, đọc theo bảng categories nên mở rộng ngành không phải sửa code),
-- thời điểm và nguồn đồng ý, trạng thái thư mời/thư chào mừng/lời mời đúng lúc. Không lưu hành vi xem.
begin;

alter table public.buyer_users
  add column if not exists introductions jsonb not null default '{}'::jsonb;
alter table public.buyer_users drop constraint if exists buyer_users_introductions_check;
alter table public.buyer_users add constraint buyer_users_introductions_check check (jsonb_typeof(introductions) = 'object');
comment on column public.buyer_users.introductions is 'Ngành hàng quan tâm (mã ngành), thời điểm/nguồn đồng ý nhận giới thiệu, trạng thái thư mời. Công tắc bật/tắt là marketing_opt_in.';

commit;
notify pgrst, 'reload schema';
