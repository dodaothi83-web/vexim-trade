-- Four additional top-level groups requested by the site owner.
-- Keep existing categories, product assignments and URLs unchanged.
-- Do not overwrite later CRM edits when this migration is replayed.
insert into public.categories (
  slug, parent_id, name_i18n, intro_i18n, seo_title_i18n, seo_desc_i18n,
  status, is_published, active_on_homepage, seo_indexable, sort_order
) values
(
  'coffee-tea-specialty-brewing-products', null,
  '{"vi":"Cà phê, trà và đồ pha uống đặc sản","en":"Coffee, tea & specialty brewing products"}'::jsonb,
  '{"vi":"Cà phê, trà và các sản phẩm đặc sản dùng để pha uống từ Việt Nam.","en":"Coffee, tea and specialty brewing products from Vietnam."}'::jsonb,
  '{"vi":"Cà phê, trà và đồ pha uống đặc sản | Vexim Trade","en":"Coffee, Tea & Specialty Brewing Products | Vexim Trade"}'::jsonb,
  '{"vi":"Tìm sản phẩm và nhà cung cấp cà phê, trà và đồ pha uống đặc sản từ Việt Nam.","en":"Browse coffee, tea and specialty brewing products and suppliers from Vietnam."}'::jsonb,
  'published', true, true, false, 60
),
(
  'frozen-fruits', null,
  '{"vi":"Trái cây cấp đông","en":"Frozen fruits"}'::jsonb,
  '{"vi":"Trái cây cấp đông từ Việt Nam dành cho chế biến, dịch vụ ăn uống và bán lẻ.","en":"Frozen fruits from Vietnam for processing, food service and retail."}'::jsonb,
  '{"vi":"Trái cây cấp đông | Vexim Trade","en":"Frozen Fruits from Vietnam | Vexim Trade"}'::jsonb,
  '{"vi":"Tìm sản phẩm và nhà cung cấp trái cây cấp đông từ Việt Nam.","en":"Browse frozen fruit products and suppliers from Vietnam."}'::jsonb,
  'published', true, true, false, 70
),
(
  'juices-canned-foods-bottled-beverages', null,
  '{"vi":"Nước ép, thực phẩm đồ hộp và đồ uống đóng chai","en":"Juices, canned foods & bottled beverages"}'::jsonb,
  '{"vi":"Nước ép, thực phẩm đồ hộp và đồ uống đóng chai từ Việt Nam.","en":"Juices, canned foods and bottled beverages from Vietnam."}'::jsonb,
  '{"vi":"Nước ép, thực phẩm đồ hộp và đồ uống đóng chai | Vexim Trade","en":"Juices, Canned Foods & Bottled Beverages | Vexim Trade"}'::jsonb,
  '{"vi":"Tìm sản phẩm và nhà cung cấp nước ép, thực phẩm đồ hộp và đồ uống đóng chai từ Việt Nam.","en":"Browse juices, canned foods and bottled beverages from Vietnamese suppliers."}'::jsonb,
  'published', true, true, false, 80
),
(
  'rice-cereal-products', null,
  '{"vi":"Gạo và các sản phẩm ngũ cốc","en":"Rice & cereal products"}'::jsonb,
  '{"vi":"Gạo và các sản phẩm từ ngũ cốc của Việt Nam.","en":"Rice and cereal-based products from Vietnam."}'::jsonb,
  '{"vi":"Gạo và các sản phẩm ngũ cốc | Vexim Trade","en":"Rice & Cereal Products from Vietnam | Vexim Trade"}'::jsonb,
  '{"vi":"Tìm sản phẩm và nhà cung cấp gạo, các sản phẩm ngũ cốc từ Việt Nam.","en":"Browse rice and cereal products and suppliers from Vietnam."}'::jsonb,
  'published', true, true, false, 90
)
on conflict (slug) do nothing;
