-- Loại chứng nhận (scheme) để lọc cho người mua, tách khỏi ô checklist L1.
-- Chạy trong Supabase SQL Editor sau 20261074_l2_partner_factory_name.sql.
--
-- Vì sao: ô L1 gộp nhiều chuẩn vào một mục ("HACCP / ISO 22000 / FSSC / BRC / Halal")
-- và "Chứng chỉ sản phẩm đã công bố" gộp Halal/FDA/Organic, nên lọc theo checklist sẽ
-- trả sai loại giấy. Cột mới lưu loại thật đọc từ chính tên/tổ chức cấp trên giấy:
--   · hệ thống điền khi quét giấy (chỉ khi văn bản trên giấy ghi rõ chuẩn),
--   · nhân viên xác nhận hoặc sửa lại ở CRM.
-- Không backfill: giấy cũ để trống, vẫn hiển thị bình thường, chỉ không vào bộ lọc theo
-- chuẩn cho tới khi nhân viên chọn loại. NULL = chưa phân loại (không phải "Khác").
begin;

alter table public.certificates add column if not exists certificate_scheme text;

alter table public.certificates drop constraint if exists certificates_scheme_ck;
alter table public.certificates add constraint certificates_scheme_ck check (
  certificate_scheme is null or certificate_scheme in (
    'haccp', 'iso_22000', 'fssc_22000', 'brc', 'ifs', 'iso_9001', 'gmp',
    'halal', 'kosher', 'organic', 'fda', 'globalgap', 'rainforest',
    'food_safety', 'export_license', 'origin', 'phytosanitary', 'other'
  )
) not valid;

create index if not exists certificates_scheme_idx
  on public.certificates (certificate_scheme)
  where certificate_scheme is not null;

commit;
notify pgrst, 'reload schema';
