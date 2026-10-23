-- ============================================================================
--  VEXIM TRADE – BỘ DANH MỤC RA MẮT ĐỢT 1
--  Ngày: 23/10/2026
--
--  Ba danh mục ra mắt, chốt với chủ dự án ngày 23/10/2026:
--    1. cashew-kernels          Hạt điều nhân        tạo mới
--    2. pepper                  Hồ tiêu              đổi tên từ "spices"
--    3. cinnamon-star-anise     Quế và hồi           tạo mới
--
--  Xử lý danh mục demo còn lại:
--    dried-fruits   giữ nguyên, không đụng vào
--    seafood-processed-fisheries-products   ẩn khỏi website, KHÔNG xoá
--
--  Vì sao ẩn chứ không xoá: sản phẩm và RFQ cũ trỏ tới slug này. Xoá dòng danh
--  mục là để dữ liệu mồ côi và làm hỏng đường dẫn. Ẩn chỉ đổi trạng thái, và bật
--  lại được bất cứ lúc nào trong CRM khi có ngành thủy sản thật.
--
--  Nguồn mùa vụ (đối chiếu 23/10/2026)
--
--    Hồ tiêu
--      Hiệp hội Hồ tiêu và Cây gia vị Việt Nam (VPSA): vụ 2026 bắt đầu cuối
--      tháng 2 và kết thúc cuối tháng 4. Vùng trồng chính Đắk Lắk, Gia Lai,
--      Đắk Nông, Đồng Nai, Bà Rịa - Vũng Tàu.
--
--    Hạt điều
--      Báo Bình Phước và Báo Đồng Nai: thu hoạch bắt đầu tháng 1 ở vùng Bình
--      Phước cũ, kết thúc tháng 4. Đồng Nai và Tây Nguyên muộn hơn hai đến bốn
--      tuần. Diện tích điều của Đồng Nai sau sáp nhập khoảng 176.000 ha, chiếm
--      gần 58% diện tích cả nước, sản lượng khoảng 186.000 tấn.
--
--      Lưu ý hành chính: Bình Phước đã sáp nhập vào Đồng Nai từ năm 2025. Vì vậy
--      vùng trồng ghi "Dong Nai" và ghi chú nói rõ Bình Phước cũ nằm trong đó,
--      thay vì liệt kê một tỉnh không còn tồn tại.
--
--    Quế và hồi
--      Sở Nông nghiệp và Môi trường Yên Bái, Lạng Sơn cùng tài liệu của các
--      doanh nghiệp xuất khẩu quế hồi: quế vỏ hai vụ, vụ chính tháng 3 đến 5,
--      vụ hai tháng 8 đến 10. Hoa hồi tháng 3 đến 4, thu quả tháng 8 đến 11, vụ
--      thu mang hương mạnh hơn và giá cao hơn.
--
--  Nguyên tắc đã áp dụng
--    - Không con số nào chưa đối chiếu. Chỗ nào chưa chắc thì không điền, không
--      để ngoặc vuông trên trang công khai.
--    - Nguồn dẫn là nguồn Việt (mục 9.1 của docs/market-overview-spec.md).
--    - Nội dung viết theo luồng buyer liên hệ nhà cung cấp trước; Vexim là đường
--      dự phòng khi trang không có thứ buyer cần.
--    - Không dùng chữ "shortlist", không gạch ngang dài, không sáo ngữ.
--
--  An toàn khi chạy lại
--    Mọi câu lệnh đều có điều kiện theo slug hiện tại, nên chạy lần hai không
--    nhân đôi dữ liệu. Phần nội dung ghi đè có chủ đích: đây là bản ra mắt, và
--    nội dung cũ của "spices" là bản tự sinh còn lỗi.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Đổi tên danh mục gia vụ khô thành hồ tiêu
--
--    Chỉ đổi khi chưa có dòng "pepper", để chạy lại không vi phạm ràng buộc
--    duy nhất trên slug. Slug cũ vào previous_slugs để /products/spices tự
--    chuyển hướng 301 sang /products/pepper.
-- ---------------------------------------------------------------------------
update public.categories
set
  slug = 'pepper',
  previous_slugs = case
    when 'spices' = any (coalesce(previous_slugs, '{}'::text[])) then coalesce(previous_slugs, '{}'::text[])
    else coalesce(previous_slugs, '{}'::text[]) || 'spices'::text
  end,
  updated_at = now()
where slug = 'spices'
  and not exists (select 1 from public.categories c2 where c2.slug = 'pepper');

-- Sản phẩm đang gắn slug cũ phải theo sang slug mới, nếu không chúng rơi khỏi
-- danh mục và biến mất khỏi lưới sản phẩm.
update public.supplier_products set category = 'pepper' where category = 'spices';
update public.supplier_products set reviewed_category_slug = 'pepper' where reviewed_category_slug = 'spices';

-- ---------------------------------------------------------------------------
-- 2. Nội dung hồ tiêu
-- ---------------------------------------------------------------------------
update public.categories
set
  name_i18n = '{"en": "Pepper", "vi": "Hồ tiêu"}'::jsonb,
  h1_i18n = '{"en": "Pepper suppliers in Vietnam"}'::jsonb,
  intro_i18n = '{"en": "Vietnamese black and white pepper, graded by bulk density from 500 to 580 grams per litre, from mills in the Central Highlands and the southeast. Compare grade, moisture and packing, then contact the supplier directly. Send your requirements to Vexim only for what is not on this page."}'::jsonb,
  body_i18n = '{"en": "<p>Vietnam supplies around half of the pepper traded internationally, most of it as whole black or white pepper, cleaned and graded before it leaves the mill. The crop comes from the Central Highlands and the southeast, where the dry season makes sun drying practical and keeps moisture consistent from lot to lot.</p><p>Grade is quoted by bulk density: 500, 550, 570 or 580 grams per litre. A higher number means heavier, more mature berries and fewer light ones. It is a starting point, not a full specification, so the contract still needs moisture, light berries, extraneous matter, piperine and, if your market asks for it, steam sterilisation.</p><p>Moisture is usually capped between 12 and 13.5 percent depending on grade and treatment. Machine cleaned lots run at lower admixture than FAQ material, and buyers shipping into the EU often ask for the stricter cleanliness specification rather than the cheaper FAQ grade.</p><p>White pepper is a separate product, not a grade of black pepper. It comes from riper berries with the outer skin removed, and it is quoted at a higher density with a milder heat. Say which one you want before anyone quotes you a price.</p>"}'::jsonb,
  faq_i18n = $json$[
    {"q": "What does 500 g/L or 550 g/L mean?", "a": "It is bulk density, the weight of pepper that fills one litre. Higher density usually means more mature berries and fewer light ones. It is one line of the specification, so ask for moisture, light berries, extraneous matter and piperine as well."},
    {"q": "Can I buy machine cleaned or ASTA grade?", "a": "Yes. Machine cleaned and ASTA grade carry tighter limits on admixture and light berries than FAQ material, and they cost more. Tell the supplier which one your buyer expects, because the two are not interchangeable."},
    {"q": "Do you also supply white pepper?", "a": "Yes. White pepper is quoted separately from black pepper, at a different density and price. Ask for both if your product line uses both."},
    {"q": "How much do I have to order?", "a": "The minimum order is set by each supplier, not by Vexim. A full container is the usual export lot, and some mills accept smaller trial orders. Ask the supplier you are talking to before you plan volumes."},
    {"q": "Which port does pepper ship from?", "a": "Most lots leave from Ho Chi Minh City, usually on FOB terms. CIF to your port can be arranged at quotation time. The port and the Incoterm are named in the quote, not assumed."},
    {"q": "Can I get a sample before committing to a container?", "a": "Yes, in most cases. Sample and courier costs are paid by the buyer, and the supplier confirms the amount before anything is sent."},
    {"q": "Who do I deal with once we agree?", "a": "The supplier. Vexim introduces you and then steps back, and the contract, payment and shipping run between you and the mill. We stay reachable if something needs clarifying."}
  ]$json$::jsonb,
  seo_title_i18n = '{"en": "Pepper Suppliers in Vietnam | Black and White Pepper | Vexim Trade"}'::jsonb,
  seo_desc_i18n = '{"en": "Vietnamese black and white pepper graded 500 to 580 g/L, from mills in the Central Highlands and the southeast. Compare grade, moisture and packing, then contact the supplier directly."}'::jsonb,
  spec_columns = $json$[
    {"key": "grade", "label": "Grade", "width": "w-28", "emphasis": true},
    {"key": "density", "label": "Bulk density", "width": "w-32"},
    {"key": "use", "label": "What it is usually bought for"}
  ]$json$::jsonb,
  spec_rows = $json$[
    {"key": "p500", "values": {"grade": "500 g/L", "density": "500 g/L minimum", "use": "FAQ and machine cleaned lots for grinding and blending"}},
    {"key": "p550", "values": {"grade": "550 g/L", "density": "550 g/L minimum", "use": "The grade most spice houses specify, and where Codex Class I starts"}},
    {"key": "p570", "values": {"grade": "570 g/L", "density": "570 g/L minimum", "use": "Heavier berries for premium retail and higher piperine"}},
    {"key": "p580", "values": {"grade": "580 g/L", "density": "580 g/L minimum", "use": "Top of the standard range, sold at a premium"}},
    {"key": "white", "values": {"grade": "White pepper", "density": "600 g/L typical", "use": "Milder heat, light coloured sauces and fillings"}}
  ]$json$::jsonb,
  buying_facts = $json$[
    {"key": "grade", "icon": "tag", "label": "Grades", "value": "Black pepper at 500, 550, 570 and 580 g/L. White pepper quoted separately."},
    {"key": "inco", "icon": "ship", "label": "Incoterms", "value": "FOB Ho Chi Minh City is the usual basis. CIF to your port on request."},
    {"key": "port", "icon": "anchor", "label": "Port", "value": "Most lots leave from Ho Chi Minh City. The port is named in each quote."},
    {"key": "season", "icon": "calendar", "label": "Season", "value": "Picked from late February to the end of April. Dried and stored, so it ships all year."}
  ]$json$::jsonb,
  product_fields = $json$[
    {"key": "grade", "label": "Grade", "type": "select", "options": ["500 g/L", "550 g/L", "570 g/L", "580 g/L", "White pepper"], "filterable": true}
  ]$json$::jsonb,
  filters = $json$[
    {"key": "grade", "label": "Grades", "options": [
      {"value": "500 g/L", "label": "500 g/L"},
      {"value": "550 g/L", "label": "550 g/L"},
      {"value": "570 g/L", "label": "570 g/L"},
      {"value": "580 g/L", "label": "580 g/L"},
      {"value": "White pepper", "label": "White pepper"}
    ]}
  ]$json$::jsonb,
  harvest = $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 2,
        "end_month": 4,
        "regions": ["Dak Lak", "Gia Lai", "Dak Nong", "Dong Nai", "Ba Ria - Vung Tau"],
        "peak": true,
        "note": "Picking starts late in February and finishes at the end of April. Binh Phuoc, long the largest pepper province, is now part of Dong Nai."
      }
    ],
    "note_i18n": {
      "en": "Pepper is dried and stored, so it ships all year. These months are when the crop is picked, which is when farm-gate prices move. Seasons follow the Vietnam Pepper and Spice Association."
    },
    "reviewed_on": "2026-10-23"
  }$json$::jsonb,
  price_unit = 'mt',
  hero_alt_i18n = coalesce(hero_alt_i18n, '{"en": "Vietnamese black peppercorns, dried and graded"}'::jsonb),
  is_published = true,
  status = 'published',
  sort_order = 20,
  updated_at = now()
where slug = 'pepper';

-- ---------------------------------------------------------------------------
-- 3. Hạt điều nhân
-- ---------------------------------------------------------------------------
insert into public.categories (
  slug, parent_id, name_i18n, h1_i18n, intro_i18n, body_i18n, faq_i18n,
  seo_title_i18n, seo_desc_i18n, hero_image, hero_alt_i18n,
  spec_columns, spec_rows, buying_facts, product_fields, filters, harvest,
  price_unit, is_published, status, seo_indexable, sort_order, active_on_homepage,
  created_by
) values (
  'cashew-kernels', null,
  '{"en": "Cashew kernels", "vi": "Hạt điều nhân"}'::jsonb,
  '{"en": "Cashew kernel suppliers in Vietnam"}'::jsonb,
  '{"en": "Vietnamese cashew kernels graded to the AFI count system, from W180 whole kernels down to splits and pieces. Compare the grade, the packing and what has been checked on each profile, then deal with the processor directly. Send Vexim only the spec that is not on the page."}'::jsonb,
  '{"en": "<p>Vietnam processes more cashew than any other country, and supplies most of the kernels traded worldwide. The raw nuts mostly come in from West Africa and Cambodia, with the domestic crop a smaller share, so the factories run all year and the season below is about raw nut arrivals rather than factory downtime.</p><p>Kernels are graded by count per pound under the AFI system. W240 means roughly 240 whole kernels to a pound, and the lower the number the larger the kernel and the higher the price. Scorched wholes, white splits, large pieces and small pieces are separate grades with their own prices, and they are never interchangeable in a specification.</p><p>Raw cashew nuts and cashew kernels are different products under different HS codes, 080131 and 080132, and they trade at very different levels. If you compare one against the other you are comparing two markets.</p><p>Count, moisture, the tolerance for broken and split kernels, packing format and inspection method all belong in the contract. Ask for them in writing before you compare prices from two processors.</p>"}'::jsonb,
  $json$[
    {"q": "What do the W numbers mean?", "a": "They are kernel counts per pound. W240 is about 240 whole kernels to a pound, W320 about 320. Lower numbers mean larger kernels and higher prices. Splits and pieces are graded separately."},
    {"q": "Do you supply raw cashew nuts as well as kernels?", "a": "Raw cashew nuts are a separate product under HS 080131, traded by processors and importers rather than as a finished export lot. If you need raw nuts, say so and we will look outside the listings on this page."},
    {"q": "Can I buy roasted or salted kernels?", "a": "Some processors run roasting and flavouring lines for private label. It depends on the factory and the volume, so ask before you plan a retail pack."},
    {"q": "How much do I have to order?", "a": "The minimum order is set by each processor. A full container is the usual export lot, and some accept smaller trial orders. Confirm it with the supplier before you plan volumes."},
    {"q": "Where do kernels ship from?", "a": "Most containers leave from Cat Lai in Ho Chi Minh City, usually on FOB terms. CIF to your port is quoted on request. The port is named in the quote."},
    {"q": "How do I check a factory before ordering?", "a": "Look at what has been verified on their profile: business registration, certificate holder status and expiry, factory evidence, and delivery history from completed orders. Ask for the same documents directly if you want to run your own check."},
    {"q": "Can I get samples?", "a": "Yes in most cases. Sample and courier costs are paid by the buyer, and the supplier confirms the amount before anything is sent."}
  ]$json$::jsonb,
  '{"en": "Cashew Kernel Suppliers in Vietnam | W180 to W450 | Vexim Trade"}'::jsonb,
  '{"en": "Vietnamese cashew kernels graded to AFI counts, from W180 wholes to splits and pieces. Compare grade, packing and verification, then contact the processor directly."}'::jsonb,
  '/images/categories/cashew-hero.jpg',
  '{"en": "Vietnamese cashew kernels graded by count"}'::jsonb,
  $json$[
    {"key": "code", "label": "Grade", "width": "w-20", "emphasis": true},
    {"key": "count", "label": "Kernels per lb", "width": "w-32"},
    {"key": "use", "label": "What it is usually bought for"}
  ]$json$::jsonb,
  $json$[
    {"key": "w180", "values": {"code": "W180", "count": "170 to 180", "use": "Premium retail and gift packs"}},
    {"key": "w240", "values": {"code": "W240", "count": "220 to 240", "use": "Premium retail"}},
    {"key": "w320", "values": {"code": "W320", "count": "300 to 320", "use": "The most traded grade, a balance of size and price"}},
    {"key": "w450", "values": {"code": "W450", "count": "400 to 450", "use": "Snacks, bakery and confectionery"}},
    {"key": "sw", "values": {"code": "SW", "count": "Not graded by count", "use": "Scorched wholes for roasted and salted snacks"}},
    {"key": "ws", "values": {"code": "WS", "count": "Not graded by count", "use": "White splits for snacks, chocolate and cereals"}},
    {"key": "lp", "values": {"code": "LP", "count": "Not graded by count", "use": "Large pieces for bakery and ice cream"}},
    {"key": "sp", "values": {"code": "SP", "count": "Not graded by count", "use": "Small pieces for butter, paste and processing"}}
  ]$json$::jsonb,
  $json$[
    {"key": "grade", "icon": "tag", "label": "Grades", "value": "AFI counts from W180 to W450, plus scorched wholes, splits and pieces."},
    {"key": "inco", "icon": "ship", "label": "Incoterms", "value": "FOB Ho Chi Minh City is the usual basis. CIF to your port on request."},
    {"key": "port", "icon": "anchor", "label": "Port", "value": "Most containers leave from Cat Lai. The port is named in each quote."},
    {"key": "season", "icon": "calendar", "label": "Season", "value": "Domestic nuts arrive from January to May. Processors also import raw nuts, so kernels ship all year."}
  ]$json$::jsonb,
  $json$[
    {"key": "grade", "label": "Grade", "type": "select", "options": ["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"], "filterable": true}
  ]$json$::jsonb,
  $json$[
    {"key": "grade", "label": "Grades", "options": [
      {"value": "W180", "label": "W180"},
      {"value": "W240", "label": "W240"},
      {"value": "W320", "label": "W320"},
      {"value": "W450", "label": "W450"},
      {"value": "SW", "label": "SW"},
      {"value": "WS", "label": "WS"},
      {"value": "LP", "label": "LP"},
      {"value": "SP", "label": "SP"}
    ]}
  ]$json$::jsonb,
  $json${
    "windows": [
      {
        "id": "main",
        "label": "Main crop",
        "start_month": 1,
        "end_month": 5,
        "regions": ["Dong Nai", "Dak Lak", "Gia Lai", "Lam Dong"],
        "peak": true,
        "note": "Picking starts in January in the area that was Binh Phuoc, now part of Dong Nai, and finishes in April. The rest of Dong Nai and the Central Highlands follow two to four weeks later."
      }
    ],
    "note_i18n": {
      "en": "Processors also buy raw nuts from West Africa and Cambodia, so kernels leave the factory in every month. These months are when the domestic crop arrives, which is when raw nut prices move."
    },
    "reviewed_on": "2026-10-23"
  }$json$::jsonb,
  'kg', true, 'published', false, 10, false, 'migration-20261027'
)
on conflict (slug) do update set
  name_i18n = excluded.name_i18n,
  h1_i18n = excluded.h1_i18n,
  intro_i18n = excluded.intro_i18n,
  body_i18n = excluded.body_i18n,
  faq_i18n = excluded.faq_i18n,
  seo_title_i18n = excluded.seo_title_i18n,
  seo_desc_i18n = excluded.seo_desc_i18n,
  hero_image = coalesce(public.categories.hero_image, excluded.hero_image),
  hero_alt_i18n = coalesce(public.categories.hero_alt_i18n, excluded.hero_alt_i18n),
  spec_columns = excluded.spec_columns,
  spec_rows = excluded.spec_rows,
  buying_facts = excluded.buying_facts,
  product_fields = excluded.product_fields,
  filters = excluded.filters,
  harvest = excluded.harvest,
  price_unit = excluded.price_unit,
  is_published = true,
  status = 'published',
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Quế và hồi
--
--    Gộp một danh mục vì cùng một spice house mua cả hai và cùng một chuyến
--    thăm nhà máy phục vụ cả hai. Hai cửa sổ mùa vụ, chi tiết từng loại nằm
--    trong ghi chú của cửa sổ.
-- ---------------------------------------------------------------------------
insert into public.categories (
  slug, parent_id, name_i18n, h1_i18n, intro_i18n, body_i18n, faq_i18n,
  seo_title_i18n, seo_desc_i18n, hero_image, hero_alt_i18n,
  spec_columns, spec_rows, buying_facts, product_fields, filters, harvest,
  price_unit, is_published, status, seo_indexable, sort_order, active_on_homepage,
  created_by
) values (
  'cinnamon-star-anise', null,
  '{"en": "Cinnamon and star anise", "vi": "Quế và hồi"}'::jsonb,
  '{"en": "Cassia cinnamon and star anise suppliers in Vietnam"}'::jsonb,
  '{"en": "Whole cassia bark and star anise from the northern highlands, the two crops that fill the same spice-house order. Compare grade, oil content and packing, then contact the mill directly. Vexim steps in only when the spec you need is not listed here."}'::jsonb,
  '{"en": "<p>Cassia cinnamon and star anise grow in the northern highlands, mostly in Yen Bai, Lao Cai, Lang Son and Cao Bang. Vietnam is the largest supplier of both, and most of the material leaves whole for spice houses and essential oil extractors.</p><p>Cassia is not the same product as Ceylon cinnamon. It is thicker, darker and stronger, and it is what most industrial buyers mean when they buy cinnamon in volume. It is graded by tube diameter and wall thickness, with oil content quoted separately.</p><p>Star anise is graded by flower size, colour and moisture. The autumn crop carries the stronger aroma and commands the higher price, which is why the same grade can be quoted at two different levels in the same year.</p><p>Both products are dried and stable, so you can buy in any month. What changes is how fresh the material is and what the mill is asking, and that follows the picking calendar below.</p>"}'::jsonb,
  $json$[
    {"q": "Is Vietnamese cassia the same as Ceylon cinnamon?", "a": "No. Cassia is a different species, with thicker bark, a darker colour and a stronger, warmer flavour. It is what most industrial buyers mean by cinnamon, and it is priced differently from Ceylon."},
    {"q": "Do you sell whole bark or ground?", "a": "Whole bark, split cassia and powder are all quoted. Powder loses aroma faster and carries different microbiological requirements, so the grade and the treatment belong in the contract."},
    {"q": "How is cassia graded?", "a": "Mainly by tube diameter and wall thickness, with a separate figure for oil content. Buyers usually name the diameter they want and then compare oil content and cleanliness across suppliers."},
    {"q": "Why is autumn star anise more expensive?", "a": "The autumn crop carries a stronger aroma and a higher oil content than the spring flowers. Buyers that extract oil or sell premium retail pay more for it, so the two crops do not trade at the same level."},
    {"q": "Can I combine cinnamon and star anise in one order?", "a": "Yes. They are often bought together by the same spice house, and combining them into one shipment is normal. Each product keeps its own grade and price in the contract."},
    {"q": "How much do I have to order?", "a": "The minimum is set by each supplier, not by Vexim. Ask the mill you are talking to before you plan volumes."},
    {"q": "Where do shipments leave from?", "a": "Most lots move to Hai Phong or Cai Mep before loading, depending on the mill and the buyer. The port and the Incoterm are named in each quote."}
  ]$json$::jsonb,
  '{"en": "Cassia Cinnamon and Star Anise Suppliers in Vietnam | Vexim Trade"}'::jsonb,
  '{"en": "Whole cassia bark and star anise from Yen Bai, Lao Cai and Lang Son. Compare grade, oil content and packing, then contact the mill directly."}'::jsonb,
  '/images/categories/cinnamon.jpg',
  '{"en": "Vietnamese cassia cinnamon bark and star anise"}'::jsonb,
  $json$[
    {"key": "product", "label": "Product", "width": "w-32", "emphasis": true},
    {"key": "crop", "label": "Crop", "width": "w-32"},
    {"key": "use", "label": "What it is usually bought for"}
  ]$json$::jsonb,
  $json$[
    {"key": "cassia-whole", "values": {"product": "Cassia, whole bark", "crop": "Spring and autumn", "use": "Spice houses that cut and pack in the destination market"}},
    {"key": "cassia-split", "values": {"product": "Cassia, split", "crop": "Spring and autumn", "use": "Grinding and blending, lower freight per tonne"}},
    {"key": "cassia-powder", "values": {"product": "Cassia, powder", "crop": "Any", "use": "Food manufacturing and bakery mixes"}},
    {"key": "anise-spring", "values": {"product": "Star anise, spring", "crop": "Spring", "use": "Volume buyers where price matters more than aroma"}},
    {"key": "anise-autumn", "values": {"product": "Star anise, autumn", "crop": "Autumn", "use": "Oil extraction and premium retail, stronger aroma"}}
  ]$json$::jsonb,
  $json$[
    {"key": "grade", "icon": "tag", "label": "Grades", "value": "Cassia by tube diameter and wall thickness. Star anise by flower size, colour and moisture."},
    {"key": "inco", "icon": "ship", "label": "Incoterms", "value": "FOB named port is the usual basis. CIF to your port on request."},
    {"key": "port", "icon": "anchor", "label": "Port", "value": "Northern mills usually ship through Hai Phong. The port is named in each quote."},
    {"key": "season", "icon": "calendar", "label": "Season", "value": "Two crops a year, March to May and August to November. Dried and stored, so it ships all year."}
  ]$json$::jsonb,
  $json$[
    {"key": "product_type", "label": "Product", "type": "select", "options": ["Cassia whole", "Cassia split", "Cassia powder", "Star anise", "Star anise oil"], "filterable": true}
  ]$json$::jsonb,
  $json$[
    {"key": "product_type", "label": "Products", "options": [
      {"value": "Cassia whole", "label": "Cassia whole"},
      {"value": "Cassia split", "label": "Cassia split"},
      {"value": "Cassia powder", "label": "Cassia powder"},
      {"value": "Star anise", "label": "Star anise"},
      {"value": "Star anise oil", "label": "Star anise oil"}
    ]}
  ]$json$::jsonb,
  $json${
    "windows": [
      {
        "id": "spring",
        "label": "Spring crop",
        "start_month": 3,
        "end_month": 5,
        "regions": ["Yen Bai", "Lao Cai", "Lang Son"],
        "peak": true,
        "note": "Cassia bark is stripped from March to May, which is the main harvest of the year. Star anise flowers in spring and is picked much later."
      },
      {
        "id": "autumn",
        "label": "Autumn crop",
        "start_month": 8,
        "end_month": 11,
        "regions": ["Yen Bai", "Lang Son", "Cao Bang"],
        "peak": false,
        "note": "Second cassia bark season from August to October, and star anise from August to November. The autumn anise carries the stronger aroma."
      }
    ],
    "note_i18n": {
      "en": "Dried bark and anise keep, so orders run all year. Picking peaks twice, which is when the freshest material reaches the mills and when the price at the mill moves. Seasons follow the provincial agriculture departments in Yen Bai and Lang Son."
    },
    "reviewed_on": "2026-10-23"
  }$json$::jsonb,
  'mt', true, 'published', false, 30, false, 'migration-20261027'
)
on conflict (slug) do update set
  name_i18n = excluded.name_i18n,
  h1_i18n = excluded.h1_i18n,
  intro_i18n = excluded.intro_i18n,
  body_i18n = excluded.body_i18n,
  faq_i18n = excluded.faq_i18n,
  seo_title_i18n = excluded.seo_title_i18n,
  seo_desc_i18n = excluded.seo_desc_i18n,
  hero_image = coalesce(public.categories.hero_image, excluded.hero_image),
  hero_alt_i18n = coalesce(public.categories.hero_alt_i18n, excluded.hero_alt_i18n),
  spec_columns = excluded.spec_columns,
  spec_rows = excluded.spec_rows,
  buying_facts = excluded.buying_facts,
  product_fields = excluded.product_fields,
  filters = excluded.filters,
  harvest = excluded.harvest,
  price_unit = excluded.price_unit,
  is_published = true,
  status = 'published',
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 5. Ẩn danh mục thủy sản gộp
--
--    Không xoá: sản phẩm và RFQ cũ trỏ tới slug này, xoá là dữ liệu mồ côi.
--    Ẩn đi thì trang biến khỏi trang chủ, sitemap và danh sách danh mục, và bật
--    lại được trong CRM khi có ngành thủy sản thật.
-- ---------------------------------------------------------------------------
update public.categories
set
  is_published = false,
  status = 'draft',
  active_on_homepage = false,
  seo_indexable = false,
  updated_at = now()
where slug = 'seafood-processed-fisheries-products';

commit;

-- ============================================================================
--  Kiểm tra sau khi chạy
--
--    select slug, price_unit, status,
--           jsonb_array_length(coalesce(harvest->'windows', '[]'::jsonb)) as windows,
--           harvest->>'reviewed_on' as reviewed
--    from public.categories
--    order by sort_order, slug;
--
--  Kỳ vọng
--    cashew-kernels          kg  published  1 cửa sổ   2026-10-23
--    pepper                  mt  published  1 cửa sổ   2026-10-23
--    cinnamon-star-anise     mt  published  2 cửa sổ   2026-10-23
--    dried-fruits            mt  (không đổi)
--    seafood-processed-...   kg  draft      0 cửa sổ
--
--  Kiểm tra chuyển hướng:
--    select slug, previous_slugs from public.categories where slug = 'pepper';
--  Kỳ vọng previous_slugs chứa 'spices', và /products/spices trả 301.
-- ============================================================================
