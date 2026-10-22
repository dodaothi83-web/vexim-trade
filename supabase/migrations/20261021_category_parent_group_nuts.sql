-- ============================================================================
--  VEXIM TRADE – CÂY DANH MỤC 2 CẤP: BỔ SUNG DANH MỤC LỚN (NHÓM CHA)
--  Ngày: 21/10/2026
--
--  Bối cảnh
--    Trang công khai trước đây chỉ có một cấp: cashew được seed là danh mục gốc
--    (parent_id = null) nên buyer không thấy "Danh mục lớn" bao quanh nó.
--    Nay Vexim dùng cây 2 cấp:
--        Danh mục lớn (nhóm cha)  →  Nhóm nhỏ (danh mục con)  →  bộ lọc thông số
--
--    Migration này:
--      1. Tạo Danh mục lớn "nuts-kernels" (Hạt dinh dưỡng / Nuts & kernels) nếu chưa có.
--      2. Đưa cashew + macadamia vào nhóm cha đó — CHỈ khi chúng chưa có cha
--         (không ghi đè quyết định đã chốt trong CRM).
--      3. Khai báo "Trường dữ liệu cho từng sản phẩm" (product_fields) cho cashew
--         nếu đang trống, để bộ lọc thông số (grade) hoạt động và sửa được trong CRM.
--      4. Điền giá trị grade còn thiếu từ tên sản phẩm (W180/W240/W320/W450/SW/WS/LP/SP).
--
--    Toàn bộ idempotent: chạy lại nhiều lần không nhân đôi dữ liệu, không ghi đè
--    nội dung do nhân viên đã sửa trong CRM.
-- ============================================================================

begin;

-- 1. Danh mục lớn (nhóm cha) -------------------------------------------------

insert into public.categories (
  slug, parent_id, name_i18n, intro_i18n, h1_i18n, seo_title_i18n, seo_desc_i18n,
  homepage_kicker_i18n, active_on_homepage, seo_indexable, status, is_published, sort_order
)
values (
  'nuts-kernels',
  null,
  '{"en": "Nuts & kernels", "vi": "Hạt dinh dưỡng"}'::jsonb,
  '{"en": "Vietnamese cashew kernels, macadamia and processed nutritional nuts from factories Vexim has checked.", "vi": "Nhân điều, mắc ca và các loại hạt dinh dưỡng chế biến từ nhà máy đã được Vexim kiểm tra tại Việt Nam."}'::jsonb,
  '{"en": "Nutritional nuts & kernels from Vietnam", "vi": "Hạt dinh dưỡng & nhân hạt xuất khẩu Việt Nam"}'::jsonb,
  '{"en": "Nuts & Kernels Suppliers in Vietnam | Cashew, Macadamia | Vexim Trade"}'::jsonb,
  '{"en": "Compare verified Vietnamese nut and kernel suppliers by sub-category, grade, MOQ and certification. Request a quote from a supplier you choose, or send your requirements and Vexim will shortlist suppliers that match."}'::jsonb,
  '{"en": "Cashew, macadamia & processed nuts", "vi": "Điều, mắc ca & hạt chế biến"}'::jsonb,
  true,     -- bật thẻ trên trang chủ: các nhóm nhỏ nằm gọn bên trong thẻ này
  false,    -- bật lập chỉ mục sau khi nội dung ngành đã chốt
  'published',
  true,
  10
)
on conflict (slug) do nothing;

-- 2. Đưa các nhóm nhỏ vào nhóm cha (chỉ khi chưa có cha) ---------------------

update public.categories child
set parent_id = parent.id,
    updated_at = now()
from public.categories parent
where parent.slug = 'nuts-kernels'
  and child.slug in ('cashew', 'macadamia')
  and child.parent_id is null;

-- Nhóm nhỏ macadamia (nếu chưa có) — để danh mục lớn có nhiều hơn một nhóm nhỏ.
insert into public.categories (
  slug, parent_id, name_i18n, intro_i18n, status, is_published, sort_order
)
select
  'macadamia',
  parent.id,
  '{"en": "Macadamia", "vi": "Mắc ca"}'::jsonb,
  '{"en": "Vietnamese macadamia kernels and in-shell nuts from Central Highlands plantations.", "vi": "Nhân mắc ca và mắc ca nguyên vỏ từ vùng nguyên liệu Tây Nguyên."}'::jsonb,
  'published',
  true,
  12
from public.categories parent
where parent.slug = 'nuts-kernels'
on conflict (slug) do nothing;

-- 3. Bộ lọc thông số của nhóm nhỏ cashew -------------------------------------
--    Chỉ điền khi nhân viên chưa khai báo trường nào trong CRM.

update public.categories
set product_fields = '[
  {"key": "grade", "label": "Grade", "type": "select", "filterable": true,
   "options": ["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"]}
]'::jsonb,
    updated_at = now()
where slug = 'cashew'
  and (product_fields is null or product_fields = '[]'::jsonb);

-- 4. Điền grade còn thiếu từ tên sản phẩm (không ghi đè giá trị đã có) -------

update public.supplier_products sp
set specs = coalesce(sp.specs, '{}'::jsonb) || jsonb_build_object('grade', match.code),
    updated_at = now()
from (
  select
    p.id,
    (regexp_match(upper(coalesce(nullif(p.name_i18n ->> 'en', ''), p.name)),
       '(W180|W240|W320|W450|SW|WS|LP|SP)'))[1] as code
  from public.supplier_products p
) match
where sp.id = match.id
  and match.code is not null
  and coalesce(sp.specs ->> 'grade', '') = '';

commit;

-- Sau khi chạy:
--   * /crm/categories: "Nuts & kernels" là Danh mục lớn, cashew + macadamia là nhóm nhỏ.
--   * /products/nuts-kernels: trang Danh mục lớn liệt kê các nhóm nhỏ và gộp sản phẩm.
--   * /products/cashew: có bộ lọc Grade lấy từ "Trường dữ liệu cho từng sản phẩm".
