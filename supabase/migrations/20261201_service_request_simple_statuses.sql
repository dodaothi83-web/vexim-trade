-- Yêu cầu dịch vụ chỉ còn 4 trạng thái: Mới, Đã mở, Đã huỷ, Hết hạn.
--   submitted: nhà cung cấp vừa gửi, chờ Vexim xử lý.
--   active:    đã mở dịch vụ. Với nâng gói, hệ thống tự đặt khi nhân viên kích hoạt gói trả phí.
--   cancelled: nhà cung cấp không chốt.
--   expired:   dịch vụ đã hết hạn. Với nâng gói, tác vụ hằng ngày tự đặt khi gói hết hạn.
-- Chỉ "Mới" được tính là đang mở, nên nhà cung cấp gửi lại được sau khi huỷ, mở hoặc hết hạn.
--
-- Nhật ký nhắc gia hạn gói: mỗi mốc (30 ngày, 7 ngày, đã hết hạn) của một ngày hết hạn chỉ gửi
-- một lần. Gia hạn sang ngày khác thì nhắc lại từ đầu.
begin;

alter table public.supplier_service_requests drop constraint if exists supplier_service_requests_status_check;
update public.supplier_service_requests set status = 'submitted' where status in ('in_consultation', 'quoted');
update public.supplier_service_requests set status = 'cancelled' where status = 'closed';
alter table public.supplier_service_requests add constraint supplier_service_requests_status_check
  check (status in ('submitted', 'active', 'cancelled', 'expired'));

drop index if exists public.supplier_service_requests_one_open;
create unique index if not exists supplier_service_requests_one_open
  on public.supplier_service_requests (supplier_id, service_key)
  where status = 'submitted';

create table if not exists public.supplier_plan_reminders (
  supplier_id      uuid not null references public.suppliers(id) on delete cascade,
  plan_expires_at  timestamptz not null,
  kind             text not null check (kind in ('d30', 'd7', 'expired')),
  sent_at          timestamptz not null default now(),
  primary key (supplier_id, plan_expires_at, kind)
);
alter table public.supplier_plan_reminders enable row level security;
revoke all on table public.supplier_plan_reminders from public, anon, authenticated;
grant select, insert, delete on table public.supplier_plan_reminders to service_role;

commit;
notify pgrst, 'reload schema';
