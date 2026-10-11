-- Dọn CHỮ KÝ EMAIL đã lưu trong DB, sau hai thay đổi của hệ thống:
--   (1) chữ ký tự động KHÔNG còn logo;
--   (2) lời chào chỉ còn tiếng Anh "Best regards," (bỏ bản tiếng Việt).
-- Ai từng bấm "Lưu chữ ký" thì chữ ký của họ nằm cứng trong app_users.signature_html,
-- sửa code không tự đổi được — chạy file này một lần để gỡ đúng phần thừa đó.
--
-- An toàn:
--   • Chỉ xoá thẻ <img> trỏ email-logo.png (không đụng ảnh khác) và ô <td> trống còn lại;
--   • Chỉ bỏ cụm "Trân trọng" ở dòng chào, giữ nguyên mọi chữ khác;
--   • Không xoá bản ghi; phần chữ chỉ bị bớt đúng hai chuỗi trên, còn lại giữ nguyên;
--   • Không đặt signature_html về NULL (khối "TUỲ CHỌN" cuối file mới làm việc đó, có chủ đích)
--   • Idempotent: chạy lần 2 không thay đổi gì thêm.
--
-- Muốn nhận chữ ký tự động MỚI (in đúng địa chỉ riêng dung@veximtrade.com thay vì
-- sales@) thì nhanh nhất là để người đó bấm "Xoá chữ ký tuỳ chỉnh" trong cửa sổ soạn
-- thư; hoặc chạy khối "Tuỳ chọn" ở cuối file cho cả đội một lượt.

with src as (
  select id, signature_html as html
  from public.app_users
  where signature_html is not null
    and (signature_html ilike '%email-logo.png%' or signature_html ilike '%Trân trọng%')
),
-- 1) gỡ ảnh logo trong chữ ký
rm_logo as (
  select id, regexp_replace(html, '<img[^>]*email-logo\.png[^>]*/?>', '', 'gi') as html
  from src
),
-- 2) gỡ ô bảng bỏ trống còn lại sau khi xoá logo (nếu để lại sẽ thành khoảng thụt lề lệch)
rm_empty_cell as (
  select id, regexp_replace(html, '<td[^>]*>[[:space:]]*</td>', '', 'g') as html
  from rm_logo
),
-- 3) "Best regards / Trân trọng," -> "Best regards,"
fix_greeting as (
  select id,
         regexp_replace(html, 'Best regards([[:space:]]*[/|·•][[:space:]]*)?Trân trọng,?', 'Best regards,', 'gi') as html
  from rm_empty_cell
),
-- 4) dòng "Trân trọng," đứng riêng một mình -> bỏ cả thẻ <p>
drop_own_line as (
  select id, regexp_replace(html, '<p[^>]*>[[:space:]]*Trân trọng,?[[:space:]]*</p>', '', 'gi') as html
  from fix_greeting
),
-- 5) mọi cụm " / Trân trọng" còn sót lại ở dạng khác
drop_rest as (
  select id, regexp_replace(html, '([[:space:]]*[/|·•][[:space:]]*)?Trân trọng,?', '', 'gi') as html
  from drop_own_line
)
update public.app_users u
set signature_html = d.html
from drop_rest d
where u.id = d.id;

-- ---------------------------------------------------------------------------
-- TUỲ CHỌN (bỏ comment nếu muốn chạy): trả cả đội về chữ ký tự động mới.
-- Xoá chữ ký tuỳ chỉnh của NHỮNG NGƯỜI CHƯA sửa gì ngoài bản mặc định (nhận diện
-- bằng dấu vết của khung bảng cũ). Chữ ký tự soạn khác không bị chạm tới.
--
-- update public.app_users
-- set signature_html = null
-- where signature_html is not null
--   and signature_html ilike '%role="presentation"%'
--   and signature_html ilike '%email-logo.png%';
-- ---------------------------------------------------------------------------
