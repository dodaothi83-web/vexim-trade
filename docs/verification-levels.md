# Kiểm toán nhà cung cấp

Ba bước hiển thị trong CRM là **Kiểm tra giấy tờ → Thăm nhà máy → Lịch sử giao hàng**. Đây là quy trình tăng dần mức bằng chứng, không phải gói dịch vụ hay điều kiện để *thêm* một nhà cung cấp vào CRM. Bước sau chỉ mở sau khi bước trước được **duyệt**. Tạm thời, quản trị viên (`verifications.approve`) có thể tự duyệt bản kiểm đã nộp; nhân viên thu mua không được tự cấp quyền duyệt.

| Trang | Bằng chứng cần đối chiếu | Điều kiện duyệt |
| --- | --- | --- |
| Kiểm tra giấy tờ (`/audit/documents`) | 3 mục bắt buộc (đăng ký doanh nghiệp và 2 ô nhập số); 4 mục tùy chọn gồm giấy ATTP và HACCP/BRC/ISO. Ảnh/PDF theo từng mục, video bổ sung qua link. | Đăng ký doanh nghiệp phải được người kiểm đánh dấu Đạt; mã số thuế và số tài khoản chỉ cần nhập chữ số. Giấy ATTP và HACCP/BRC/ISO có thể để trống/Không áp dụng cho NCC thương mại. Ít nhất một ảnh/PDF của đúng đợt kiểm; quản trị viên bấm duyệt riêng. |
| Thăm nhà máy (`/audit/factory`) | 9 mục tại cơ sở; ngày, địa chỉ, GPS, ảnh hiện trường, video tham chiếu. | Đã duyệt giấy tờ; ghi đủ 9 mục, ngày/địa chỉ/GPS hợp lệ của cơ sở, mục ảnh đạt và ít nhất một ảnh đính kèm, quản trị viên bấm duyệt riêng. |
| Lịch sử giao hàng (`/audit/deliveries`) | Một lô hàng thực tế: mã lô/đơn, ngày giao, vận đơn và xác nhận giao nhận; ảnh/video chỉ là bổ sung. | Đã duyệt thăm nhà máy; ba mục kiểm đạt, chứng từ giao hàng đính kèm và được đánh dấu “Đã kiểm tra”, quản trị viên bấm duyệt riêng. **RFQ `won` không chứng minh đã giao hàng.** |

**7 mục trong bảng kiểm:** bắt buộc: (1) Đăng ký doanh nghiệp, (2) Mã số thuế, (3) Số tài khoản ngân hàng. Mục (2) và (3) chỉ cần nhập **chuỗi chữ số**, giữ số 0 đầu, không yêu cầu tài liệu: hệ thống ghi nhận đã nhập nhưng **không xác minh** chủ tài khoản hay cơ quan thuế. Đăng ký doanh nghiệp phải do người kiểm đánh dấu Đạt. Tùy chọn: (4) Giấy chứng nhận an toàn thực phẩm (nếu có), (5) HACCP / BRC / ISO 22000 (nếu có), (6) Chứng chỉ sản phẩm đã công bố, (7) Giấy phép xuất khẩu (nếu áp dụng); có thể ghi kết quả, đánh dấu “Không áp dụng” hoặc để trống. Không tự gán “Đạt” cho mục giấy tờ chỉ vì tải tệp hay AI đưa ra gợi ý. Đối chiếu pháp nhân và mã số thuế trên đăng ký doanh nghiệp với NCC, không coi trùng tên tệp hoặc nhận định AI là xác thực. Nếu NCC thương mại cung cấp chứng chỉ đứng tên nhà máy, ghi rõ nhà máy và mối liên hệ với hàng cung ứng; **không tuyên bố đó là chứng chỉ đứng tên NCC**. Trang NCC công khai không tự hiện huy hiệu “Food-safety / HACCP” cho mọi NCC đã duyệt, vì duyệt hồ sơ không chứng minh tất cả đều có chứng chỉ này.

**Bằng chứng ngay tại mục, không có card riêng cho bước giấy tờ:** các dòng giấy tờ (trừ hai ô số) có nút chèn ảnh/PDF, thumbnail/link mở tệp, Bỏ gắn và Xóa (có xác nhận). Tệp là bằng chứng nội bộ của **đúng đợt kiểm**, `media_assets.checklist_key` gắn với mục; không chuyển sang kho chung NCC. Mục “Tệp cũ chưa gắn mục & link video” cho phép mở/gắn/xóa tệp cũ và thêm/xóa link video. Tệp đã gắn trước đây vào hai mục số vẫn hiển thị đọc/xóa được, nhưng không cần tải thêm. Bỏ gắn không xóa tệp; Xóa xóa hẳn sau khi xác nhận và chỉ khả dụng khi quyền/trạng thái cho phép. Giữ điều kiện kỹ thuật ít nhất một ảnh/PDF thuộc đúng đợt kiểm để duyệt; **không ép tệp riêng cho 4 mục tùy chọn**. Người kiểm phải mở và đối chiếu đăng ký doanh nghiệp với NCC trước khi ghi Đạt; hệ thống không tự xác minh nội dung tệp.

**Giấy tờ & lỗi thiếu bằng chứng:** ảnh chụp giấy tờ đã tải trước đó qua tab “Ảnh” **trong đúng đợt kiểm** cũng được tính là bằng chứng, không cần tải lại. Phải có tệp thực tế (`storage_path`), video link không thay thế giấy tờ. Nếu không có tệp hợp lệ, nút Duyệt trả thông báo ngay trong form thay vì lỗi Server Components; sau khi đã Nộp duyệt, chỉ người có quyền duyệt mới thêm tệp, hoặc trả về để người kiểm bổ sung. Hệ thống không tự kết luận tài liệu là thật chỉ dựa trên nhãn loại tệp; người duyệt phải xem và đối chiếu.

**Phạm vi tệp:** “Kho ảnh & tài liệu chung của NCC” chỉ hiển thị tệp `owner_type=supplier`. Bằng chứng chèn ngay trên trang Kiểm tra giấy tờ (và card bằng chứng của hai bước kiểm khác) chỉ lấy tệp `owner_type=verification` với `verification_id` của chính đợt kiểm đó. Tệp chung **không tự chuyển** sang bước kiểm và AI không đọc chúng; cần đính kèm tại đúng trang kiểm. Ngược lại, tệp đã tải vào bước kiểm vẫn nằm ở đó nhưng không còn hiện lẫn trong kho chung dù cùng `supplier_id`. Không xoá hay di chuyển tệp đã lưu khi áp dụng thay đổi này.

Trang cho phép lưu bản kiểm, thêm/xoá ảnh và chứng từ, thêm/xoá **link video YouTube/Drive**. Video tệp MP4 không tải trực tiếp qua serverless upload hiện tại; chỉ lưu link và quyền xem của video phụ thuộc vào thiết lập chia sẻ của nền tảng bên ngoài. Tất cả bản ghi bằng chứng gắn với một lần kiểm và được giữ **nội bộ**; chỉ người có quyền mới xem được tệp. Khi đã nộp duyệt, chuyên viên không sửa bằng chứng; người có quyền xét duyệt có thể đối chiếu/đánh dấu đã kiểm, trả về để bổ sung. Sau khi duyệt, bằng chứng bị khoá, không thêm/xoá/sửa được.

## AI hỗ trợ kiểm giấy tờ (tùy chọn)

Trên trang **Kiểm tra giấy tờ**, sau khi chèn ảnh/PDF vào một mục giấy tờ, người kiểm được hỏi có đồng ý gửi **tệp mới tải** để AI quét ngay không. Từ chối vẫn giữ tệp và không gửi cho AI; đồng ý được nhớ trong phiên trang này. Cũng có nút “AI kiểm giấy tờ” để quét lại ảnh/PDF **nội bộ của đúng đợt kiểm** sau khi xác nhận. AI chỉ gợi ý cho đăng ký doanh nghiệp và bốn mục giấy tờ tùy chọn; hai mục số luôn trả “Chưa đủ cơ sở” và phải nhập tay, không suy đoán/kiểm định từ OCR. Không gửi video/link bên ngoài. Tối đa 6 tệp, 4 MiB/tệp và 12 MiB tổng mỗi lượt; tệp bị bỏ qua được báo trên UI. AI chỉ phân tích nội dung có vẻ phù hợp/không khớp/chưa đủ cơ sở, **không xác thực chứng từ thật hoặc tính hợp lệ tại cơ quan cấp**. Người kiểm phải tự xem bằng chứng; nút “Điền nháp mục chưa kiểm” chỉ điền các mục còn trống có tệp dẫn chứng, không ghi đè nhận định đã nhập. Sau đó người kiểm tự Lưu/Nộp duyệt; quản trị viên phải bấm duyệt riêng (tạm cho phép cùng người nếu có quyền). AI không tự lưu, tự cấp mức hay công khai.

Cấu hình `OPENAI_API_KEY` **chỉ ở môi trường server** để hiện nút; có thể đặt `OPENAI_DOCUMENT_REVIEW_MODEL` (mặc định `gpt-4.1-mini`, phải hỗ trợ PDF/ảnh và JSON output trong Responses API). Phản hồi gửi `store: false`; audit log chỉ lưu ID bằng chứng và verdict, không lưu nội dung tệp/nhận xét AI. Trước khi bật ở production, cần xét chính sách dữ liệu với nhà cung cấp AI và chạy thử bằng tài khoản nội bộ. Không có key thì quy trình kiểm thủ công vẫn hoạt động. Không cần migration riêng cho tính năng AI.

Test local: `node scripts/check-ai-document-review.mjs` (mock API và storage; **không** gọi OpenAI). Chưa kiểm tra tệp thật / hạn mức model trên production.

## Ngoại lệ tạm thời: một người kiểm và duyệt

Mặc định giai đoạn này quản trị viên được duyệt bản kiểm do chính mình thực hiện, **sau khi nộp**, kiểm lại checklist và chứng từ rồi xác nhận trong hộp thoại. Chỉ bỏ điều kiện *khác người*; quyền `verifications.approve` (admin), các điều kiện bằng chứng từng bước, trạng thái hồ sơ và khóa tệp sau duyệt đều giữ nguyên. Không tự động duyệt khi nhấn Lưu/Nộp, không tự đăng hồ sơ NCC. `inspector_id`, `approved_by`, `approved_at` và audit log (`self_approved`) lưu lại ai đã làm cả hai vai trò.

Để yêu cầu hai người trở lại: cấu hình **server** `VERIFICATION_REQUIRE_TWO_PERSON_REVIEW=true` rồi deploy lại. Migration dưới đây bỏ CHECK ở DB để cho phép các bản kiểm tự duyệt; khi quay về quy trình hai người, cần thêm lại CHECK tại DB (dùng `NOT VALID` nếu còn bản ghi tự duyệt cũ, để kiểm tra các ghi mới mà không loại bỏ lịch sử). Ví dụ sau khi đã bật lại cờ:

```sql
alter table public.verifications add constraint verifications_four_eyes
  check (approved_by is null or inspector_id is null or approved_by <> inspector_id) not valid;
```

Không đổi quyền RBAC của nhân viên thu mua. Nếu app mới chạy trước DB migration, duyệt chính mình sẽ bị DB từ chối.

## Triển khai database

1. Nếu **chưa chạy** migration cũ `supabase/migrations/20261017_verification_workflow.sql`, hãy chạy nó trước. Migration CMS ảnh NCC không chứa các cột checklist / liên kết bằng chứng xác minh.
2. Sau đó chạy **migration mới** `supabase/migrations/20261017_delivery_history_audit.sql` trong SQL Editor của đúng Supabase project, trước khi deploy code mới. Migration idempotent, thêm `shipment_ref`, `shipped_on`, `shipment_destination` vào `public.verifications`, rồi reload schema cache PostgREST. Không chạy lại toàn bộ `schema.sql` trên production.
3. Chạy `supabase/migrations/20261017_temporary_self_verification_approval.sql` trên đúng Supabase project **trước khi deploy** để bỏ CHECK `verifications_four_eyes`. Migration không sửa bản kiểm hiện có.
4. Chạy `supabase/migrations/20261017_audit_checklist_evidence.sql` **trước khi deploy** để thêm cột nullable `media_assets.checklist_key`. Tệp cũ vẫn chưa gắn mục; không cần backfill dữ liệu, không chạy lại toàn bộ `schema.sql`.
5. Chạy `supabase/migrations/20261017_document_numeric_identifiers.sql` **trước khi deploy** để thêm hai cột text nullable `tax_number`, `bank_account_number` vào `verifications` (giữ số 0 đầu). Không tự sao chép số từ chứng từ cũ; hồ sơ đã nộp theo quy trình cũ phải được trả về bổ sung hai số trước khi duyệt.
6. Kiểm tra:

   ```sql
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'verifications'
     and column_name in ('shipment_ref', 'shipped_on', 'shipment_destination',
                         'checklist_notes', 'visit_lat', 'visit_lng', 'visit_address', 'return_reason',
                         'tax_number', 'bank_account_number')
   order by column_name;
   -- Mong đợi 10 dòng.
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'media_assets'
     and column_name in ('verification_id', 'checklist_key');
   -- Mong đợi 2 dòng.
   ```

7. Deploy, tải lại hẳn trang hồ sơ NCC. Mở trang giấy tờ, chèn ảnh/PDF vào một dòng và chấp thuận/từ chối quét ngay, kiểm tra phản hồi AI chỉ là gợi ý. Gắn thử tệp cũ, bỏ gắn để kiểm tra tệp vẫn còn, thử xóa và link video. Nhập mã số thuế và số tài khoản có số 0 đầu, đối chiếu tên pháp nhân rồi đánh dấu Đạt đăng ký doanh nghiệp, để trống hoặc chọn Không áp dụng ở bốn mục tùy chọn (thử cả ATTP và HACCP với NCC thương mại); nộp duyệt rồi dùng tài khoản admin đã kiểm để duyệt, kiểm tra `inspector_id = approved_by` và trang sau được mở. Cũng thử với tài khoản sourcing để chắc chắn không có quyền duyệt. Nếu lỗi, ghi HTTP status/response và log máy chủ, **không gửi credentials**.

Test local: `node scripts/check-inline-audit-evidence.mjs && node scripts/check-verification-media-scope.mjs && node scripts/check-verification-start.mjs && node scripts/check-audit-pages.mjs && npm run typecheck && npm run build`. Chưa kiểm thử production Supabase/Storage thực tế từ sandbox này.
