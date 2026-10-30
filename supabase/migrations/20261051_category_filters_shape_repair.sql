-- Hotfix cho lỗi "TypeError: a.filters?.find is not a function" ở trang /rfq.
--
-- `categories.filters` là jsonb, nên một dòng do người sửa tay hoặc do bản CRM cũ
-- ghi có thể là map {"grades": [...]}, một object filter đơn lẻ, hoặc chuỗi JSON đã
-- mã hoá hai lần — trong khi ứng dụng chỉ đọc được mảng
-- CategoryFilter[] = [{ "key", "label", "options": [{ "value", "label" }] }].
-- Trang /rfq gọi .find() trực tiếp trên cột nên gặp map là vỡ cả trang.
--
-- Migration này chuẩn hoá dữ liệu đang có về đúng một hình dạng và chặn hình dạng
-- khác ở tầng database. Idempotent: chỉ ghi lại dòng lệch chuẩn, không đổi nội dung
-- (giữ nguyên nhãn, thứ tự và danh sách lựa chọn).
begin;

create or replace function public.category_filters_normalized(raw jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  with parsed as (
    -- Dòng cũ có thể là chuỗi JSON (jsonb_typeof = 'string') thay vì mảng.
    select case
      when raw is null then '[]'::jsonb
      when jsonb_typeof(raw) = 'string' then
        case when btrim(raw #>> '{}') ~ '^[\[{]' then (raw #>> '{}')::jsonb else '[]'::jsonb end
      else raw
    end as value
  ),
  candidates as (
    -- Mảng filter.
    select e.value as item, null::text as map_key, null::jsonb as map_value
    from parsed, jsonb_array_elements(case when jsonb_typeof(parsed.value) = 'array' then parsed.value else '[]'::jsonb end) e
    union all
    -- Một object filter duy nhất, lưu thiếu mảng bao ngoài.
    select parsed.value, null, null
    from parsed
    where jsonb_typeof(parsed.value) = 'object' and parsed.value ? 'key'
    union all
    -- Map kiểu {"grades": [...]} hoặc {"grades": {"label": ..., "options": [...]}}.
    select null, m.key, m.value
    from parsed, jsonb_each(case when jsonb_typeof(parsed.value) = 'object' and not (parsed.value ? 'key') then parsed.value else '{}'::jsonb end) m
  ),
  shaped as (
    select
      case when item is not null then coalesce(nullif(btrim(item ->> 'key'), ''), nullif(btrim(item ->> 'name'), '')) else map_key end as raw_key,
      case when item is not null then item ->> 'label' else map_value ->> 'label' end as raw_label,
      case
        when item is not null then coalesce(item -> 'options', item -> 'values', item -> 'items')
        when jsonb_typeof(map_value) = 'array' then map_value
        when jsonb_typeof(map_value) = 'object' then coalesce(map_value -> 'options', map_value -> 'values', map_value -> 'items')
        else '[]'::jsonb
      end as raw_options
    from candidates
  ),
  filters as (
    select
      -- Bản CRM cũ đặt số nhiều; form RFQ tìm đúng "grade" và "certifications".
      case lower(btrim(raw_key))
        when 'grades' then 'grade'
        when 'certs' then 'certifications'
        when 'certificates' then 'certifications'
        else btrim(raw_key)
      end as key,
      coalesce(nullif(btrim(raw_label), ''), case lower(btrim(raw_key))
        when 'grades' then 'Grades'
        when 'grade' then 'Grade'
        when 'certs' then 'Certifications'
        when 'certificates' then 'Certifications'
        when 'certifications' then 'Certifications'
        else btrim(raw_key)
      end) as label,
      raw_options
    from shaped
    where raw_key is not null and btrim(raw_key) <> ''
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', f.key,
    'label', f.label,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('value', o.value, 'label', o.label) order by o.ord)
      from (
        select
          opt.ord,
          case when jsonb_typeof(opt.value) = 'string' then btrim(opt.value #>> '{}') else opt.value ->> 'value' end as value,
          case when jsonb_typeof(opt.value) = 'string' then btrim(opt.value #>> '{}') else coalesce(nullif(btrim(opt.value ->> 'label'), ''), opt.value ->> 'value') end as label
        from jsonb_array_elements(case when jsonb_typeof(f.raw_options) = 'array' then f.raw_options else '[]'::jsonb end) with ordinality as opt(value, ord)
      ) o
      where nullif(btrim(o.value), '') is not null
    ), '[]'::jsonb)
  ) order by f.key), '[]'::jsonb)
  from filters f;
$$;

revoke all on function public.category_filters_normalized(jsonb) from public;

-- Chỉ những dòng lệch chuẩn mới bị ghi lại.
update public.categories c
set filters = public.category_filters_normalized(c.filters)
where c.filters is distinct from public.category_filters_normalized(c.filters);

-- Chặn tái diễn: cột chỉ nhận mảng. NOT VALID để không quét lại toàn bảng mỗi lần
-- thêm dòng, nhưng mọi insert/update sau đây vẫn bị buộc đúng hình dạng.
alter table public.categories drop constraint if exists categories_filters_is_array;
alter table public.categories add constraint categories_filters_is_array
  check (jsonb_typeof(filters) = 'array') not valid;

commit;
notify pgrst, 'reload schema';
