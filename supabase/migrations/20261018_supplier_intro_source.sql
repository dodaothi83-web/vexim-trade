-- Phần giới thiệu do nhà cung cấp tự viết (câu chuyện, điểm khác biệt của công ty/sản phẩm),
-- lưu nguyên văn ngôn ngữ gốc tại intro_source. Bản tiếng Anh hiển thị cho buyer nằm ở
-- summary_i18n.en, do AI dịch từ intro_source; profile_translation_meta.summary_source_hash
-- cho biết khi nào cần dịch lại. Dữ liệu cũ: lấy phần giới thiệu tiếng Anh đã có làm bản gốc
-- để không mất nội dung nhà cung cấp đã viết trước đây.
alter table public.suppliers add column if not exists intro_source text;

update public.suppliers
set intro_source = summary_i18n ->> 'en'
where intro_source is null
  and coalesce(summary_i18n ->> 'en', '') <> '';

notify pgrst, 'reload schema';
