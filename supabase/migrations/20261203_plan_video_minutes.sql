-- Tổng số phút video mỗi nhà cung cấp được lưu trên Cloudflare Stream, theo gói thành viên.
-- Cộng mọi video: video nhà máy, video sản phẩm, video A+. null là không giới hạn.
-- Mặc định: Basic 0 (không có quyền video), Premium 60, Pro 180. Admin chỉnh ở CRM > Gói thành viên > Nội dung và giá.
begin;
alter table public.supplier_plan_catalog add column if not exists video_minutes integer check (video_minutes is null or video_minutes >= 0);
update public.supplier_plan_catalog set video_minutes = case plan when 'basic' then 0 when 'premium' then 60 when 'pro' then 180 end
  where video_minutes is null;
commit;
notify pgrst, 'reload schema';
