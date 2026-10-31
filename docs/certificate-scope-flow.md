# Giấy tờ & chứng nhận — một luồng vào, đường ra theo loại giấy

Nhà cung cấp **chỉ tải tệp lên một kho giấy** ở hồ sơ của họ (mục Giấy tờ & chứng nhận). Họ không chọn ngăn, không tự khai chứng nhận cho sản phẩm. Nhân viên Vexim phân loại trên CRM; loại giấy quyết định giấy đi đâu.

## Ba đường ra

| Nhóm | Ví dụ | Đường ra |
| --- | --- | --- |
| Pháp lý (`legal`) | GPKD, ATTP cơ sở, giấy phép xuất khẩu | Tính vào L1. **Không** gắn sản phẩm, **không** lên chip. |
| Chất lượng (`quality`) | HACCP, ISO 22000, FSSC 22000, BRC, IFS, ISO 9001, GMP, GlobalG.A.P., Halal, Kosher, USDA/EU/hữu cơ khác, Rainforest | Gán phạm vi → badge trên trang sản phẩm + chip lọc. FDA là **đăng ký**, hiện nhãn "FDA registered" nhưng không thành chip. |
| Theo lô (`shipment`) | C/O, kiểm dịch thực vật, phiếu kiểm nghiệm | Để dành cho đơn hàng/RFQ. Không gắn sản phẩm, không lên chip. |
| Chưa xếp (`other`) | NULL, "Khác", giá trị cũ `organic` | Vào hàng đợi "Giấy chưa phân loại" của CRM; chỉ hiện trên hồ sơ. |

Danh sách mã nằm ở `lib/certificate-scheme.ts`; migration `20261076_certificate_scope_flow.sql` giữ đúng danh sách đó và **không** tự chốt loại cho giấy cũ.

## Phạm vi (`certificate_scopes`)

Mỗi dòng là **hoặc** một `category_id` **hoặc** một `product_id`, kèm `verified_by`/`verified_at`. Chỉ dòng đã có người xác nhận mới có hiệu lực với người mua.

- HACCP/ISO/BRC thường duyệt theo **danh mục**: sản phẩm thuộc danh mục (kể cả nhóm con của danh mục cha) **tự thừa hưởng**, không ai phải thao tác thêm khi đăng sản phẩm mới.
- Halal/Hữu cơ thường duyệt theo **sản phẩm** sau khi AI khớp danh sách sản phẩm trên giấy; nhà cung cấp xin, nhân viên xác nhận.
- Phạm vi cũ trong `approved_product_ids` được migration chuyển thành từng dòng sản phẩm; nếu một giấy chưa có dòng phạm vi nào thì trang công khai vẫn đọc danh sách cũ đó (dữ liệu trước migration).

Nhà cung cấp bỏ tick một giấy thừa hưởng cho một sản phẩm → ghi `product_certificate_optouts`. Opt-out **không** ghi đè dòng phạm vi gắn thẳng sản phẩm (đó là quyết định của Vexim).

## Ngoài phạm vi

Trong khối "Chứng nhận áp dụng" ở trang sản phẩm của cổng nhà cung cấp, giấy chất lượng chưa phủ danh mục hiện mờ, ghi "Chưa áp dụng cho danh mục này", kèm nút **Yêu cầu mở rộng phạm vi**. Yêu cầu ghi vào `requested_product_ids`, hiện ở dòng chứng nhận trong CRM; nhân viên duyệt thì tạo dòng phạm vi cho sản phẩm, từ chối thì rút yêu cầu.

## Gia hạn

Nhà cung cấp chọn "Gia hạn" một giấy đã có khi tải tệp mới. Hệ thống tạo **bản ghi mới** (`supersedes_certificate_id` = giấy cũ) ở trạng thái chờ duyệt; bản cũ **vẫn hiệu lực, vẫn giữ phạm vi** nên sản phẩm không rơi khỏi chip. Khi nhân viên duyệt bản mới, phạm vi của bản cũ được sao sang bản mới và bản cũ nhận `superseded_by_certificate_id` (ngừng hiện). Nhắc hạn vẫn theo mốc 60/30/7/1 ngày.

## Trang Giấy tờ & chứng nhận L1

- Lưới thẻ chỉ còn **giấy tờ doanh nghiệp** (`COMPANY_DOCUMENT_KEYS`: đăng ký doanh nghiệp, ATTP, giấy phép xuất khẩu). Hai mục `haccp_or_brc` và `product_certs` bỏ khỏi lưới (`QUALITY_CERTIFICATE_DOC_KEYS`) để chứng nhận chất lượng chỉ có **một đường vào**: ô tải ở khối "Chứng nhận trên hồ sơ".
- Chứng nhận nộp ở bước đăng ký doanh nghiệp cũng vào kho: `saveInitialEvidence` gọi `ingestCertificateScan` cho các key chứng nhận, nên hồ sơ không còn cảnh có tệp HACCP mà "0 chứng nhận".
- Tệp chứng nhận tải theo luồng cũ, chưa có bản ghi, vẫn xem lại được ở khối "Tệp chứng nhận đã tải trước đây" kèm lời mời tải lại; thẻ giấy tờ nào đã vào kho thì ghi "Đã vào kho chứng nhận · hạn …" để không bị hiểu là hai giấy khác nhau.
- Bảng "Giấy tờ L1 tính từ giấy đã duyệt" chỉ liệt kê 5 mục có chứng nhận tương ứng; mã số thuế và số tài khoản ngân hàng khai trong Hồ sơ doanh nghiệp. Dòng chưa có chứng nhận nhưng đã có tệp thì ghi rõ "Đã có tệp tải lên, chưa có chứng nhận được duyệt".
- Thẻ chưa có tệp không bao giờ ghi "Đã đối chiếu xong" chỉ vì đợt L1 đã duyệt; tiến độ tính trên 3 giấy tờ doanh nghiệp, chứng nhận đếm riêng.

## Câu chữ ở cổng nhà cung cấp

Hai ô tải giấy (trang **Giấy tờ & chứng nhận L1** và khối "Chứng nhận áp dụng" ở trang sản phẩm) dùng chung một bộ câu: cùng tiêu đề "Tải lên hoặc gia hạn chứng nhận", cùng lựa chọn "Gia hạn giấy đã có (tùy chọn)" / "+ Giấy mới", cùng nhãn "Tên trên giấy (không bắt buộc)", cùng gợi ý tệp và cùng câu nhận kết quả. Không nói AI, không dùng mã bước nội bộ (L1/L2), không hứa "đã hiển thị": giấy vào hồ sơ trước, nhân viên đối chiếu rồi mới chọn phạm vi áp dụng. Ghi chú của nhân viên (`review_note`) không hiện ở cổng; thẻ chứng nhận dùng `supplierCertificateNote()` trong `lib/certificate-supplier-copy.ts`. Trang thêm sản phẩm chỉ hiện khối "Chứng nhận theo danh mục" (đọc trước khi lưu); trang sửa sản phẩm để khối "Chứng nhận áp dụng" lo việc bỏ tick, nên không lặp thông tin.

## CRM

- Hàng đợi `/crm/certificates`: số đếm giấy chưa phân loại, chờ duyệt, sắp hết hạn 60 ngày, yêu cầu mở rộng phạm vi. Mục menu "Giấy tờ & chứng nhận" có huy hiệu **N chờ** = số giấy `review_status = 'pending'` (`countCertificatesPendingReview`), cùng nguồn số với chuông CRM; giấy chưa phân loại và yêu cầu mở rộng phạm vi không cộng vào huy hiệu mà hiện thành từng mục trong trang. Duyệt/ẩn giấy, đổi phạm vi, và NCC tải giấy mới đều gọi `refreshCrmBadges()` để số tự trừ/tăng.
- Dòng chứng nhận trong hồ sơ L1: chọn loại giấy (nhóm pháp lý/chất lượng/theo lô), công khai/nội bộ, thêm–bỏ phạm vi danh mục, duyệt yêu cầu mở rộng, cảnh báo khi loại giấy lệch mục checklist L1 đã ghi.
- Bảng L1 trong cổng nhà cung cấp tính từ giấy **đã duyệt** (`lib/certificate-l1.ts`), không phải ô tự chọn.

## Bộ lọc người mua

Giữ nguyên mọi điều kiện của PR #48 (đã duyệt, công khai, không bị ẩn, còn hạn, có tệp nội bộ, đúng đơn vị đứng tên) và thay "được gắn cho sản phẩm" bằng: **phạm vi đã xác nhận chứa sản phẩm hoặc danh mục của nó, và sản phẩm không opt-out**. Số trên chip tính trên danh sách sản phẩm trước khi áp bộ lọc chứng nhận, nên bỏ chọn chip không làm số nhảy.

**Chỗ duy nhất có bộ lọc:** dải chip "Certificates" trên `/products/<slug>`, ngay trên lưới sản phẩm, dưới dải khoảng giá và "Related searches". Tham số `?cert=haccp,halal`; trang đã lọc `noindex`, canonical về danh mục gốc. Không có ở `/search` (trang đó chưa có bộ lọc nào, kết quả trải nhiều danh mục nên số đếm khó hiểu, và phải lọc trước khi chia trang), không có ở trang nhà cung cấp (một nhà cung cấp thì chip chỉ lặp lại badge), trang sản phẩm đã có badge theo loại giấy.

**Cách đọc dữ liệu (`lib/public/category-certificate-data.ts`):** trang danh mục không đọc từng nhà cung cấp nữa. Một lượt `listCertificatesForSuppliers` cho cả danh mục, một lượt `listCertificateScopes` cho đúng các giấy đó, một lượt `listCertificateOptoutsForSuppliers`, và chỉ đọc tệp cho **những nhà cung cấp thật sự có giấy**. Danh mục 50 nhà cung cấp mà 3 nhà cung cấp có giấy là 6 lượt đọc thay vì 200. Store không có hàm gộp thì tự lùi về cách đọc từng nhà cung cấp; lỗi đọc chỉ làm bộ lọc trống, không làm hỏng trang.

**Để chip thực sự hiện:** chạy `20261075_certificate_scheme.sql` + `20261076_certificate_scope_flow.sql`, rồi nhân viên (1) phân loại `certificate_scheme` cho giấy trong `/crm/certificates` — giấy cũ để `NULL` hoặc `other` thì không bao giờ lên chip và **không backfill**, (2) duyệt giấy và xác nhận phạm vi danh mục/sản phẩm. Giấy pháp lý (GPKD, ATTP, GP xuất khẩu) và giấy theo lô (C/O, kiểm dịch, kiểm nghiệm) không lên chip dù có phạm vi.

## Trước khi deploy

Chạy `supabase/migrations/20261076_certificate_scope_flow.sql` sau `20261075_certificate_scheme.sql`. Migration chỉ thêm cột/bảng/index, chuyển `approved_product_ids` cũ sang bảng phạm vi, **không** đổi loại giấy của dữ liệu cũ và không backfill loại.

Kiểm thử: `npm run check:certificates` (gồm `check-product-certificates`, `check-certificate-filter`, `check-certificate-scope`, `check-certificate-facet-data`), `npx tsc --noEmit`, `npm run build`.
