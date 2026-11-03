-- Ngành NCC tự khai: biến "ghi chú suông" thành một YÊU CẦU có trạng thái để nhân viên
-- quyết định và NCC nhận được câu trả lời qua email.
--
-- Vì sao cần: danh mục là thứ Vexim kiểm soát, nhưng khi ngành của NCC chưa được mở (ví dụ
-- dừa lúc chưa publish) thì form hồ sơ không có gì để chọn và hồ sơ treo lại. Trước migration
-- này `suppliers.requested_category_other` chỉ là chữ tự do, không ai đọc, không ai trả lời.
--
-- Nguyên tắc KHÔNG đổi:
--   * `requested_category_slugs` vẫn là phạm vi bán hàng duy nhất (1-5 danh mục đã publish);
--   * yêu cầu ngành KHÔNG cấp phạm vi, KHÔNG tạo supplier_categories, KHÔNG mở sản phẩm;
--   * yêu cầu KHÔNG hiện với buyer, chỉ đọc trong CRM.
--
-- Một dòng = một ngành được yêu cầu, để CRM gom nhóm và đếm số NCC.
create table if not exists public.supplier_category_requests (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  -- Chữ NCC gõ, đã chuẩn hoá khoảng trắng (tối đa 120 ký tự).
  label text not null,
  -- Khoá so khớp: bỏ dấu, viết thường, gộp khoảng trắng. Dùng để gom "Dừa"/"dua"/"cơm dừa".
  normalized text not null,
  status text not null default 'pending',
  -- Danh mục nhân viên chọn khi mở ngành, để NCC biết sản phẩm sẽ nằm ở đâu.
  category_slug text,
  -- Lý do khi từ chối; bắt buộc khi status = 'rejected'.
  note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_category_requests_status_check
    check (status in ('pending', 'opened', 'rejected')),
  constraint supplier_category_requests_label_len check (char_length(label) between 1 and 120),
  -- Mỗi NCC một yêu cầu còn mở cho một ngành: không sinh hàng trùng trong CRM khi họ nộp lại.
  constraint supplier_category_requests_one_pending unique (supplier_id, normalized, status)
);

create index if not exists supplier_category_requests_pending_idx
  on public.supplier_category_requests (normalized) where status = 'pending';
create index if not exists supplier_category_requests_supplier_idx
  on public.supplier_category_requests (supplier_id, created_at desc);

-- Máy chủ ghi/đọc bằng service role; bảng không bao giờ lộ ra API công khai.
alter table public.supplier_category_requests enable row level security;

-- Yêu cầu do NCC tự khai (trước migration) trở thành yêu cầu đang chờ, để không mất dữ liệu
-- của những hồ sơ đã lỡ treo. Chữ thô được viết thường, bỏ dấu bằng `translate` (không cần
-- extension unaccent), rồi chỉ giữ chữ và số — cùng thuật toán với `fold()` phía ứng dụng.
insert into public.supplier_category_requests (supplier_id, label, normalized, status)
select s.id,
       trim(part.label),
       regexp_replace(lower(translate(trim(part.label),
         'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
         'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')),
         '[^a-z0-9]+', ' ', 'g'),
       'pending'
from public.suppliers s
cross join lateral unnest(string_to_array(coalesce(s.requested_category_other, ''), ',')) as part(label)
where s.requested_category_other is not null
  and trim(part.label) <> ''
  and char_length(trim(part.label)) <= 120
on conflict (supplier_id, normalized, status) do nothing;

notify pgrst, 'reload schema';
