-- Sửa chữ MOQ bị cắt mất số 0 do migration 20261052.
--
-- Migration chuẩn hoá MOQ ghi lại chữ bằng trim(trailing '0' ...), cắt cả số 0 của số
-- nguyên: "100kg" thành "1 kg", "5000kg" thành "5 kg", "50 tấn" thành "5 MT". Cột số
-- moq_qty vẫn đúng và trang công khai dựng MOQ từ cột số, nên người mua không thấy sai;
-- nhưng chữ sai hiện trong form CRM/cổng nhà cung cấp (có thể bị lưu đè ngược lại) và làm
-- bản dịch tiếng Anh của sản phẩm bị coi là đã cũ.
--
-- Chỉ sửa dòng đơn vị kg hoặc MT mà con số đầu chuỗi khác moq_qty; đơn vị khác (bao,
-- thùng, container) giữ nguyên. Mỗi dòng sửa đều ghi audit_log kèm chữ trước và sau.
-- Chạy lại an toàn: lần sau không còn dòng nào lệch.
begin;

with broken as (
  select id, moq as before_moq,
    trim_scale(moq_qty)::text || case moq_unit when 'kg' then ' kg' else ' MT' end as after_moq
  from public.supplier_products
  where moq_unit in ('kg', 'mt')
    and moq_qty is not null and moq_qty > 0
    and coalesce((regexp_match(btrim(coalesce(moq, '')), '^(\d+(?:\.\d+)?)'))[1]::numeric, -1) <> moq_qty
),
fixed as (
  update public.supplier_products sp
  set moq = b.after_moq
  from broken b
  where sp.id = b.id
  returning sp.id, b.before_moq, b.after_moq
)
insert into public.audit_log (actor_email, entity, entity_id, action, before, after)
select 'system:migration-20261122', 'product', id::text, 'product.moq_text_repaired',
  jsonb_build_object('moq', before_moq), jsonb_build_object('moq', after_moq)
from fixed;

commit;
