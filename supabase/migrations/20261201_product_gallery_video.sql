-- Video sản phẩm trong dãy ảnh (Premium/Pro). Một video Cloudflare Stream mỗi sản phẩm:
-- {"video_uid": "<32 hex>", "duration": 95, "uploaded_at": "..."}. Gói không có quyền video
-- (rich_content = false) thì video vẫn lưu nhưng không hiện cho người mua.
alter table public.supplier_products
  add column if not exists gallery_video jsonb;
alter table public.supplier_products drop constraint if exists supplier_products_gallery_video_check;
alter table public.supplier_products add constraint supplier_products_gallery_video_check
  check (gallery_video is null or (jsonb_typeof(gallery_video) = 'object' and gallery_video->>'video_uid' ~ '^[a-f0-9]{32}$'));
comment on column public.supplier_products.gallery_video is 'Video sản phẩm hiện cùng ảnh sản phẩm (Cloudflare Stream). Chỉ hiện khi gói nhà cung cấp có rich_content.';

-- Câu chữ quyền lợi gói: video sản phẩm và nội dung A+ đi cùng nhau. Chỉ đổi khi CRM chưa sửa câu gốc.
update public.supplier_plan_catalog
  set features = jsonb_set(features, '{1}', to_jsonb('Ảnh sản phẩm và mô tả bằng chữ; không có video và nội dung A+'::text))
  where plan = 'basic' and features->>1 = 'Mô tả chi tiết sản phẩm chỉ gồm nội dung chữ, không có ảnh và video A+';
update public.supplier_plan_catalog
  set features = jsonb_set(features, '{0}', to_jsonb('Đăng tối đa 20 sản phẩm, có video sản phẩm và nội dung A+ (ảnh, video)'::text))
  where plan = 'premium' and features->>0 = 'Đăng tối đa 20 sản phẩm, bao gồm hình ảnh và video';
update public.supplier_plan_catalog
  set features = jsonb_set(features, '{0}', to_jsonb('Đăng không giới hạn sản phẩm, có video sản phẩm và nội dung A+ (ảnh, video)'::text))
  where plan = 'pro' and features->>0 = 'Đăng không giới hạn sản phẩm, bao gồm hình ảnh và video';
