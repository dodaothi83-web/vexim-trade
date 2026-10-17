# Xác minh nhà cung cấp: L1, L2, L3

Đây là mức **bằng chứng Vexim đã kiểm tra**, không phải mức thành viên/giá dịch vụ và không phải trạng thái công việc. `Bắt đầu` chỉ tạo **đợt kiểm** trên chính trang nhà cung cấp; nhà cung cấp vẫn **chưa xác minh** cho đến khi người khác duyệt.

| Mức | Công việc | Khi nào được hiện trên hồ sơ |
| --- | --- | --- |
| Chưa xác minh | Chưa có kết quả kiểm đã duyệt. | Mặc định. |
| L1 – Giấy tờ | Người kiểm đối chiếu 7 mục (đăng ký doanh nghiệp, thuế, ngân hàng, ATTP, hệ thống an toàn thực phẩm, chứng chỉ mặt hàng, giấy phép xuất khẩu nếu cần); tải bằng chứng vào **đợt kiểm**, nộp duyệt. | Admin khác người kiểm duyệt hồ sơ L1. |
| L2 – Nhà máy | Sau L1, đến cơ sở kiểm 9 mục, ghi ngày/địa chỉ/GPS và ảnh; nộp duyệt. | Admin khác người kiểm duyệt hồ sơ L2. |
| L3 – Giao dịch thực tế | Mức dự kiến cần bằng chứng đơn xuất khẩu hoàn tất. | **Chưa có quy trình cấp L3 trong CRM**; nút L1/L2 không tự tạo L3. Không tự nâng cấp chỉ vì RFQ chuyển `won`. |

## Vì sao nút cũ có thể hiện 404?

Nút `Bắt đầu L1` cũ POST qua Next Server Action của trang chi tiết; nếu deployment/action ID của tab cũ đã thay đổi, request có thể thất bại mà trình duyệt rời khỏi trang. Đồng thời schema `supabase/schema.sql` cũ thiếu `verifications.checklist_notes` và các cột L2; lỗi DB khi tạo đợt cũng không được báo rõ trong UI. Không thể khẳng định lỗi 404 trên production thuộc nhánh nào nếu chưa có status/URL trong Network log. Nút mới dùng `POST /api/suppliers/:id/verifications`, trả JSON và hiển thị lỗi/success **ngay trong card**, không điều hướng; click lại không tạo trùng đợt đang mở.

## Triển khai production

1. **Chạy thêm** `supabase/migrations/20261017_verification_workflow.sql` trong SQL Editor của đúng Supabase project, sau migration CMS trước đó. Script idempotent: bổ sung 5 trường của `verifications`, `media_assets.verification_id`, mở quyền owner `verification` **chỉ cho media nội bộ**, cập nhật schema cache PostgREST. Đừng chạy lại toàn bộ `schema.sql` trên production.
2. Kiểm tra:

   ```sql
   select table_name, column_name from information_schema.columns
   where table_schema = 'public' and
     ((table_name = 'verifications' and column_name in
       ('checklist_notes','visit_lat','visit_lng','visit_address','return_reason'))
      or (table_name = 'media_assets' and column_name = 'verification_id'))
   order by table_name, column_name;
   -- Mong đợi 6 dòng.
   ```

3. Deploy code mới, **tải lại hẳn trang** `/crm/suppliers/<id>` (đóng tab cũ nếu cần). Dùng tài khoản admin hoặc sourcing nhấn `Bắt đầu kiểm giấy tờ`: Network phải có `POST /api/suppliers/<id>/verifications` trả `200` JSON; bảng 7 mục xuất hiện bên dưới và cấp hiện tại vẫn là `Chưa xác minh`. Tệp đính kèm nằm trong chính đợt kiểm, chỉ nội bộ xem. Sourcing nộp duyệt; admin **khác người kiểm** duyệt L1, rồi mới có thể lên lịch L2.
4. Nếu còn lỗi, xem HTTP status + response của POST trong DevTools Network và log Vercel Function cho endpoint trên. Không gửi khoá Supabase hoặc cookie phiên đăng nhập qua chat.

Sandbox hiện tại không kết nối được Supabase production; bước chạy SQL/kiểm tra thực tế phải thực hiện ở project của bạn.
