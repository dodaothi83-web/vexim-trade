# Hotfix production: CMS category + ảnh nhà cung cấp

## Nguyên nhân và cách triển khai

1. **Trước khi deploy code**, chạy toàn bộ `supabase/migrations/20261017_cms_supplier_images.sql` ở **đúng Supabase project production** qua SQL Editor. File idempotent, bổ sung toàn bộ trường CMS được form `/crm/categories` ghi (không chỉ `active_on_homepage`) và `suppliers.profile_image` / `cover_image`. Không tạo `public_page_ready`: trường này được tính khi đọc, không lưu DB. Migration tự gửi `NOTIFY pgrst, 'reload schema'` sau commit để PostgREST làm mới schema cache. `supabase/schema.sql` đã được đồng bộ cho project mới.
2. Kiểm tra trong SQL Editor:

   ```sql
   select table_name, column_name
   from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'categories' and column_name in
       ('active_on_homepage','hero_image','h1_i18n','body_i18n','spec_columns',
        'spec_rows','buying_facts','filters','status','seo_indexable','previous_slugs'))
       or (table_name = 'suppliers' and column_name in ('profile_image','cover_image')))
   order by table_name, column_name;
   -- Mong đợi: 11 cột categories + 2 cột suppliers.
   ```

**Nếu vẫn thấy `updateCategory: Could not find the 'active_on_homepage' column ... in the schema cache`:** Lưu chưa thành công; deploy code/refresh trình duyệt không tự tạo cột. Trong **SQL Editor của đúng project**, chạy:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'categories'
  and column_name = 'active_on_homepage';
```

- **0 dòng:** migration chưa áp dụng thành công **ở project này** (hoặc đã chạy ở project khác). Chạy **toàn bộ** `20261017_cms_supplier_images.sql` ở mục 1, xác nhận SQL Editor báo `Success`, rồi kiểm tra lại query 11 cột ở mục 2. Không chỉ thêm riêng `active_on_homepage`, vì lần lưu tiếp theo sẽ gặp lỗi với những cột CMS còn thiếu.
- **1 dòng:** cột đã có; trong SQL Editor chạy `NOTIFY pgrst, 'reload schema';`, đợi ít giây rồi thử lưu. Nếu vẫn lỗi, đối chiếu project ref trong URL Supabase của dashboard SQL Editor với hostname của `SUPABASE_URL` (nếu đặt) hoặc `NEXT_PUBLIC_SUPABASE_URL` **trong môi trường deploy đang lỗi**; `SUPABASE_URL` có ưu tiên. Không gửi khóa API/service-role lên chat.
- Nếu toàn bộ migration báo lỗi, **không chạy `supabase/schema.sql` trên production**; giữ nguyên thông báo lỗi SQL và dòng số để xác định câu lệnh bị lỗi, tránh lặp migration sai project.

3. Xác nhận có bucket Storage **`vexim-media`** và `SUPABASE_MEDIA_BUCKET` (nếu có) trỏ vào bucket tồn tại; server có `SUPABASE_SERVICE_ROLE_KEY`. Sau deploy, vào `/crm/categories` lưu thử một bản nháp và `/crm/suppliers/<id>/edit` tải ảnh đại diện/bìa rồi tải lại trang kiểm tra ảnh còn hiển thị. Ở DevTools → Network, request `POST /api/suppliers/<id>/profile-image` phải trả JSON `{ok:true,path:...}` và ảnh `/public-media/suppliers/<id>/profile-...` trả `200`.
4. Nếu upload thất bại: UI mới hiển thị HTTP 413 (quá lớn), 403 (quyền), 500 (chi tiết lỗi DB/Storage) hoặc lỗi response không phải JSON. Xem **Network response/status** và Vercel Function logs cho request đó. Không tải ảnh > 3 MB sau nén. Ảnh bị lỗi ghi DB sẽ không còn để lại tệp mồ côi trong Storage. Preview/staging/production không ghi ảnh tạm xuống đĩa khi Supabase lỗi mạng.

> Chưa thể áp dụng migration hoặc kiểm tra thực tế trên project production từ sandbox này (kết nối Supabase bị giới hạn). Chỉ deploy code mới **sau khi** migration đã chạy thành công. Không gửi service-role key qua chat.

## Kiểm thử cục bộ

```bash
node --experimental-strip-types --no-warnings scripts/check-cms-upload.mjs
npm run typecheck
npm run build
```
