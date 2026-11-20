-- Nội dung A+ trong mô tả chi tiết sản phẩm (Premium/Pro).
--
-- Chủ sở hữu làm rõ ngày 20/11/2026: mọi gói đều đăng được ảnh sản phẩm; gói Basic chỉ khác
-- ở chỗ mô tả chi tiết chỉ có chữ. Premium/Pro mở thêm khối ảnh, ảnh + chữ, lưới ảnh và video
-- (Cloudflare Stream). Vì vậy cột media_allowed của bảng gói đổi tên thành rich_content.
begin;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'supplier_plan_catalog' and column_name = 'media_allowed') then
    alter table public.supplier_plan_catalog rename column media_allowed to rich_content;
  end if;
end $$;

-- Câu quyền lợi khởi tạo của Basic nói "không bao gồm hình ảnh" dễ hiểu nhầm là không có ảnh
-- sản phẩm. Chỉ sửa khi CRM chưa sửa câu đó.
update public.supplier_plan_catalog
  set features = jsonb_set(features, '{1}', to_jsonb('Mô tả chi tiết sản phẩm chỉ gồm nội dung chữ, không có ảnh và video A+'::text))
  where plan = 'basic' and features->>1 = 'Tin sản phẩm chỉ gồm nội dung chữ, không bao gồm hình ảnh và video';

alter table public.supplier_products
  add column if not exists aplus_content jsonb not null default '[]'::jsonb;
alter table public.supplier_products drop constraint if exists supplier_products_aplus_content_check;
alter table public.supplier_products add constraint supplier_products_aplus_content_check
  check (jsonb_typeof(aplus_content) = 'array' and jsonb_array_length(aplus_content) <= 10);
comment on column public.supplier_products.aplus_content is 'Khối nội dung A+ (ảnh, ảnh + chữ, lưới ảnh, chữ, video Cloudflare Stream). Chỉ hiện khi gói nhà cung cấp có rich_content.';

commit;
notify pgrst, 'reload schema';
