-- Sản phẩm đọc được từ website của đầu mối — căn cứ duy nhất để thư tiếp cận
-- dám viết "I understand that <company> supplies <products>". Trước đó hệ thống chỉ
-- lưu bản TÓM TẮT CÔNG TY (ai_company_summary) nên khi soạn thư, model phải tự đoán
-- ngành hàng của khách từ target_product (giả định gán theo tên file import) -> ra thư bịa.
-- Cột mới giữ nguyên cấu trúc {products, group, note, sources, scanned_at} do
-- lib/ai/company-products.ts trả về; NULL = chưa quét.
alter table public.prospects
  add column if not exists ai_products jsonb;
