# Sửa lỗi lưu bản dịch hồ sơ nhà cung cấp

## Lỗi `export_markets_i18n ... schema cache`

Lỗi này xảy ra ở Supabase/PostgREST, không phải ở nội dung NCC hay phản hồi OpenAI. Ứng dụng không thể ghi bản dịch khi project chưa có cột lưu dịch hoặc schema cache chưa nạp lại.

### 1. Áp dụng migration trên đúng project

Mở **Supabase SQL Editor của project mà môi trường đang lỗi sử dụng** và chạy toàn bộ:

`supabase/migrations/20261036_supplier_translation_schema_repair.sql`

File này chạy lại được, chỉ bổ sung các cột còn thiếu, backfill `intro_source` từ `summary_i18n.en` khi `intro_source` đang trống, rồi gửi `NOTIFY pgrst, 'reload schema'`. Không chạy lại toàn bộ `supabase/schema.sql` trên production.

### 2. Kiểm tra đủ cột

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'suppliers'
  and column_name in (
    'intro_source',
    'moq_text_i18n',
    'export_markets_i18n',
    'profile_translation_meta'
  )
order by column_name;
```

Kết quả phải có **4 dòng**. Nếu thiếu dòng, migration chưa được áp dụng đúng project hoặc câu lệnh trước đó chưa chạy thành công.

### 3. Nếu đã có 4 cột nhưng vẫn báo schema cache

Chạy trên cùng project:

```sql
notify pgrst, 'reload schema';
```

Đợi vài giây rồi lưu lại hồ sơ trong CRM. Nếu vẫn lỗi, đối chiếu project ref trong URL Supabase với `SUPABASE_URL` hoặc `NEXT_PUBLIC_SUPABASE_URL` của deployment. `SUPABASE_URL` được ưu tiên khi cả hai tồn tại. Không gửi service-role key qua chat.

### 4. Kiểm tra sau khi schema đã đúng

1. Mở `/crm/suppliers/<id>/edit` và bấm **Lưu thay đổi**. Hồ sơ đã có cache dịch cũ sẽ được dịch lại bằng parser hiện tại.
2. Kiểm tra thông báo **Đã cập nhật bản dịch tiếng Anh**.
3. Mở trang buyer của NCC và kiểm tra giới thiệu, MOQ, địa chỉ, mặt hàng, thị trường, công suất, điều khoản, cảng và Incoterms.
4. Nếu thông báo chuyển sang lỗi OpenAI hoặc `OPENAI_API_KEY`, đó là bước cấu hình AI tiếp theo, không phải lỗi cột database.

Không có migration nào tự gọi OpenAI hoặc tự thay đổi bản dịch hiện có. Việc dịch lại chỉ diễn ra qua luồng lưu hồ sơ đã có.
