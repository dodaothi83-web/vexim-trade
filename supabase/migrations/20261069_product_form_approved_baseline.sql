-- KHÔNG CHẠY TRÊN PRODUCTION LÚC NÀY: cần transaction duyệt và kiểm thử staging.
-- Chỉ thêm cột snapshot; không sửa sản phẩm, nháp, ảnh hoặc bản duyệt cũ.
begin;
alter table public.product_form_submissions
  add column if not exists approved_product_updated_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.product_form_submissions'::regclass
    and conname = 'product_form_approved_baseline_link_check') then
    alter table public.product_form_submissions add constraint product_form_approved_baseline_link_check
      check (approved_product_updated_at is null or
        (approved_price_revision_id is not null and status in ('approved', 'superseded')));
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
