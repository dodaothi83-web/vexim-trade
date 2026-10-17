# Kiểm toán nhà cung cấp

Ba bước hiển thị trong CRM là **Kiểm tra giấy tờ → Thăm nhà máy → Lịch sử giao hàng**. Đây là quy trình tăng dần mức bằng chứng, không phải gói dịch vụ hay điều kiện để *thêm* một nhà cung cấp vào CRM. Bước sau chỉ mở sau khi bước trước được **duyệt** bởi người khác người kiểm.

| Trang | Bằng chứng cần đối chiếu | Điều kiện duyệt |
| --- | --- | --- |
| Kiểm tra giấy tờ (`/audit/documents`) | 7 mục pháp lý/chứng nhận; chứng từ PDF/ảnh, video bổ sung qua link. | Ghi kết quả cả 7 mục, 5 giấy tờ chính đạt, ít nhất một tài liệu/chứng chỉ đính kèm, người khác duyệt. |
| Thăm nhà máy (`/audit/factory`) | 9 mục tại cơ sở; ngày, địa chỉ, GPS, ảnh hiện trường, video tham chiếu. | Đã duyệt giấy tờ; ghi đủ 9 mục, ngày/địa chỉ/GPS hợp lệ của cơ sở, mục ảnh đạt và ít nhất một ảnh đính kèm, người khác duyệt. |
| Lịch sử giao hàng (`/audit/deliveries`) | Một lô hàng thực tế: mã lô/đơn, ngày giao, vận đơn và xác nhận giao nhận; ảnh/video chỉ là bổ sung. | Đã duyệt thăm nhà máy; ba mục kiểm đạt, chứng từ giao hàng đính kèm và được đánh dấu “Đã kiểm tra”, người khác duyệt. **RFQ `won` không chứng minh đã giao hàng.** |

**Phạm vi tệp:** “Kho ảnh & tài liệu chung của NCC” chỉ hiển thị tệp `owner_type=supplier`. “Bằng chứng: Kiểm tra giấy tờ” (và hai bước kiểm khác) chỉ lấy tệp `owner_type=verification` với `verification_id` của chính đợt kiểm đó. Tệp chung **không tự chuyển** sang bước kiểm và AI không đọc chúng; cần đính kèm tại đúng trang kiểm. Ngược lại, tệp đã tải vào bước kiểm vẫn nằm ở đó nhưng không còn hiện lẫn trong kho chung dù cùng `supplier_id`. Không xoá hay di chuyển tệp đã lưu khi áp dụng thay đổi này.

Trang cho phép lưu bản kiểm, thêm/xoá ảnh và chứng từ, thêm/xoá **link video YouTube/Drive**. Video tệp MP4 không tải trực tiếp qua serverless upload hiện tại; chỉ lưu link và quyền xem của video phụ thuộc vào thiết lập chia sẻ của nền tảng bên ngoài. Tất cả bản ghi bằng chứng gắn với một lần kiểm và được giữ **nội bộ**; chỉ người có quyền mới xem được tệp. Khi đã nộp duyệt, chuyên viên không sửa bằng chứng; người có quyền xét duyệt có thể đối chiếu/đánh dấu đã kiểm, trả về để bổ sung. Sau khi duyệt, bằng chứng bị khoá, không thêm/xoá/sửa được.

## AI hỗ trợ kiểm giấy tờ (tùy chọn)

Trên trang **Kiểm tra giấy tờ**, người kiểm có thể bấm “AI kiểm giấy tờ”, xác nhận gửi nội dung ảnh/PDF **nội bộ của đúng đợt kiểm** tới OpenAI, rồi xem nhận định cho 7 mục kèm tệp tham chiếu. Không gửi video/link bên ngoài. Tối đa 6 tệp, 4 MiB/tệp và 12 MiB tổng mỗi lượt; tệp bị bỏ qua được báo trên UI. AI chỉ phân tích nội dung có vẻ phù hợp/không khớp/chưa đủ cơ sở, **không xác thực chứng từ thật hoặc tính hợp lệ tại cơ quan cấp**. Người kiểm phải tự xem bằng chứng; nút “Điền nháp mục chưa kiểm” chỉ điền các mục còn trống có tệp dẫn chứng, không ghi đè nhận định đã nhập. Sau đó người kiểm tự Lưu/Nộp duyệt; người khác phải duyệt. AI không tự lưu, tự cấp mức hay công khai.

Cấu hình `OPENAI_API_KEY` **chỉ ở môi trường server** để hiện nút; có thể đặt `OPENAI_DOCUMENT_REVIEW_MODEL` (mặc định `gpt-4.1-mini`, phải hỗ trợ PDF/ảnh và JSON output trong Responses API). Phản hồi gửi `store: false`; audit log chỉ lưu ID bằng chứng và verdict, không lưu nội dung tệp/nhận xét AI. Trước khi bật ở production, cần xét chính sách dữ liệu với nhà cung cấp AI và chạy thử bằng tài khoản nội bộ. Không có key thì quy trình kiểm thủ công vẫn hoạt động. Không cần migration riêng cho tính năng AI.

Test local: `node scripts/check-ai-document-review.mjs` (mock API và storage; **không** gọi OpenAI). Chưa kiểm tra tệp thật / hạn mức model trên production.

## Triển khai database

1. Nếu **chưa chạy** migration cũ `supabase/migrations/20261017_verification_workflow.sql`, hãy chạy nó trước. Migration CMS ảnh NCC không chứa các cột checklist / liên kết bằng chứng xác minh.
2. Sau đó chạy **migration mới** `supabase/migrations/20261017_delivery_history_audit.sql` trong SQL Editor của đúng Supabase project, trước khi deploy code mới. Migration idempotent, thêm `shipment_ref`, `shipped_on`, `shipment_destination` vào `public.verifications`, rồi reload schema cache PostgREST. Không chạy lại toàn bộ `schema.sql` trên production.
3. Kiểm tra:

   ```sql
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'verifications'
     and column_name in ('shipment_ref', 'shipped_on', 'shipment_destination',
                         'checklist_notes', 'visit_lat', 'visit_lng', 'visit_address', 'return_reason')
   order by column_name;
   -- Mong đợi 8 dòng.
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'media_assets'
     and column_name = 'verification_id';
   -- Mong đợi 1 dòng.
   ```

4. Deploy, tải lại hẳn trang hồ sơ NCC. Mở từng trang kiểm, tải ảnh/tài liệu, thêm và xoá thử link video; nộp duyệt, dùng tài khoản khác duyệt, kiểm tra trang sau được mở. Nếu lỗi, ghi HTTP status/response và log máy chủ, **không gửi credentials**.

Test local: `node scripts/check-verification-media-scope.mjs && node scripts/check-verification-start.mjs && node scripts/check-audit-pages.mjs && npm run typecheck && npm run build`. Chưa kiểm thử production Supabase/Storage thực tế từ sandbox này.
