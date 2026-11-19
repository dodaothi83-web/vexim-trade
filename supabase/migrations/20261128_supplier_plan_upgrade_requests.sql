-- Nhà cung cấp gửi yêu cầu nâng gói (Premium/Pro) từ "Trang của tôi" trong cổng.
-- Dùng chung hàng yêu cầu dịch vụ: CRM, email nội bộ và chặn gửi trùng đã có sẵn.
begin;
alter table public.supplier_service_requests drop constraint if exists supplier_service_requests_service_key_check;
alter table public.supplier_service_requests add constraint supplier_service_requests_service_key_check
  check (service_key in ('international_website', 'featured_ads', 'fda_compliance', 'plan_upgrade'));
commit;
