-- Gói nhà cung cấp: Basic (5 sản phẩm), Premium (20), Pro (50).
--
-- Nhân viên bật gói và ngày hết hạn trong CRM; thanh toán nằm ngoài hệ thống. Gói hết hạn
-- được tính là Basic. Giới hạn chặn TẠO sản phẩm mới, không ẩn hay xoá sản phẩm đã có:
-- nhà cung cấp hạ gói vẫn giữ sản phẩm cũ nhưng không thêm được cho đến khi xuống dưới mức.
--
-- Giới hạn chặn ngay trong CSDL (trigger) để mọi đường tạo sản phẩm, kể cả hai lần bấm
-- cùng lúc, đều bị chặn như nhau. Ứng dụng kiểm tra trước để báo lỗi dễ hiểu.
-- Mọi sản phẩm của nhà cung cấp đều tính (cả bản nháp); xoá bản nháp là trả lại chỗ.
-- Chạy lại an toàn.
begin;

alter table public.suppliers
  add column if not exists plan text not null default 'basic',
  add column if not exists plan_expires_at timestamptz,
  add column if not exists plan_updated_at timestamptz,
  add column if not exists plan_updated_by uuid;

alter table public.suppliers drop constraint if exists suppliers_plan_check;
alter table public.suppliers add constraint suppliers_plan_check check (plan in ('basic', 'premium', 'pro'));

comment on column public.suppliers.plan is 'Gói nhà cung cấp: basic (5 sản phẩm), premium (20), pro (50). Hết hạn thì tính là basic.';
comment on column public.suppliers.plan_expires_at is 'Ngày hết hạn gói trả phí; null là không hết hạn. Không dùng với basic.';

-- Số sản phẩm tối đa theo gói đang có hiệu lực. Giữ khớp với lib/supplier-plans.ts.
create or replace function public.supplier_product_limit(p_plan text, p_expires_at timestamptz)
returns integer
language sql
stable
as $$
  select case
    when p_plan in ('premium', 'pro') and p_expires_at is not null and p_expires_at <= now() then 5
    when p_plan = 'pro' then 50
    when p_plan = 'premium' then 20
    else 5
  end;
$$;

create or replace function public.enforce_supplier_product_limit()
returns trigger
language plpgsql
as $$
declare
  v_plan text;
  v_expires timestamptz;
  v_limit integer;
  v_count integer;
begin
  if new.supplier_id is null then
    return new;
  end if;
  -- Khoá dòng nhà cung cấp để hai lần tạo cùng lúc không cùng vượt giới hạn.
  select plan, plan_expires_at into v_plan, v_expires
  from public.suppliers where id = new.supplier_id for update;
  if not found then
    return new;
  end if;
  v_limit := public.supplier_product_limit(v_plan, v_expires);
  select count(*) into v_count from public.supplier_products where supplier_id = new.supplier_id;
  if v_count >= v_limit then
    raise exception 'supplier_product_limit_reached: % of %', v_count, v_limit
      using errcode = 'P0001', hint = 'Upgrade the supplier plan or remove a product.';
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_products_plan_limit on public.supplier_products;
create trigger supplier_products_plan_limit
  before insert on public.supplier_products
  for each row execute function public.enforce_supplier_product_limit();

commit;
notify pgrst, 'reload schema';
