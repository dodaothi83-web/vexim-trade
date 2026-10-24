# Cơ chế tái kiểm định minh bạch 24 tháng

> Trạng thái: business specification đã thống nhất, chưa triển khai.
>
> Ngày ghi nhận: 24/10/2026. Tài liệu này dành cho đợt build sau, không mô tả hành vi hiện tại của hệ thống. Chưa có migration, backfill hoặc thay đổi dữ liệu production cho cơ chế này.

## 1. Mục tiêu

Vexim Trade xác minh nhà cung cấp theo bằng chứng có phạm vi và có thời điểm review, thay vì trao huy hiệu tồn tại vĩnh viễn. Cơ chế này gồm:

- Một nền tảng pháp lý không có chu kỳ hết hạn cố định.
- Một chu kỳ 24 tháng cho các kiểm tra hoạt động thực tế.
- Hai luồng bằng chứng phù hợp với nhà máy và đơn vị thương mại.
- Một ngày hết hạn chung cho chu kỳ hoạt động, dễ hiểu và dễ hiển thị.
- Tự động ngừng claim xác minh đã hết hạn và tạm dừng điều kiện tham gia marketing cho tới khi tái kiểm định được duyệt.

Tên gọi nên nhấn mạnh **Transparent 24-Month Re-verification**. Không diễn giải đây là giám sát trực tiếp hoặc liên tục 24/7.

## 2. Nguyên tắc bắt buộc

1. Xác minh áp dụng cho **từng pháp nhân**. Nhà máy và trading company trong cùng chuỗi cung ứng không kế thừa kết quả của nhau.
2. Supplier tự khai, upload hoặc submit hồ sơ không tạo ngày xác minh. Chỉ quyết định approved của reviewer Vexim sau khi nhận và đối chiếu bằng chứng mới tạo kết quả.
3. Các check vẫn độc lập về bằng chứng và quyết định duyệt. Không suy ra L1 hoặc L2 từ L3, và không suy ra một check khác từ số level hiển thị.
4. Dùng chung ngày hết hạn không làm thay đổi phạm vi từng check.
5. Đây là supplier verification theo scope, không phải product certification, không xác minh mọi cơ sở hoặc mọi shipment và không bảo đảm giao dịch tương lai.
6. Buyer chỉ thấy kết quả, trạng thái, scope và thời hạn được phép công khai. Giấy tờ, hợp đồng, chứng từ và thông tin thương mại nhạy cảm vẫn nằm trong phạm vi nội bộ.
7. AI hoặc dữ liệu do supplier tự khai không tự duyệt, tự gia hạn hoặc tự công khai.

## 3. Mô hình xác minh

### 3.1. L1: Nền tảng pháp lý

L1 xác minh giấy đăng ký doanh nghiệp và các thông tin pháp lý nền tảng của pháp nhân.

- Giấy đăng ký doanh nghiệp không có ngày hết hạn cố định, nên L1 không thuộc countdown 24 tháng.
- Không có hạn cố định không có nghĩa là dữ liệu không bao giờ phải kiểm tra lại. L1 phải được review khi có thay đổi pháp nhân, tên, địa chỉ, người đại diện, tình trạng hoạt động hoặc dấu hiệu hồ sơ không còn đúng.
- Nếu nền tảng pháp lý bị thu hồi hoặc không còn hợp lệ, không được giữ L1 current chỉ nhờ quyết định approved trước đó.
- Quy tắc không hết hạn này chỉ áp dụng cho nền tảng đăng ký doanh nghiệp. Chứng chỉ, giấy phép chuyên ngành hoặc tài liệu có hạn riêng vẫn phải tuân theo hạn của chính tài liệu đó.

Tax và bank details chỉ được mô tả đúng theo phạm vi Vexim thực sự đối chiếu. Không gọi là đã xác minh độc lập nếu chưa có quy trình xác minh tương ứng.

### 3.2. Hai luồng cho L2 và L3

| Level | Manufacturer | Trading company / Exporter |
| --- | --- | --- |
| L2 | Cơ sở sản xuất cụ thể và hoạt động sản xuất cho nhóm sản phẩm đã khai báo | Nguồn hàng, vai trò giao dịch và năng lực thực hiện đơn của trader |
| L3 | Shipment hoặc giao dịch hoàn tất gần nhất, liên kết được với nhà máy và scope đã review | Shipment hoặc giao dịch hoàn tất gần nhất, liên kết được với trader và chuỗi mua bán đã review |

Hai luồng có cùng chu kỳ và cách hiển thị level, nhưng không dùng bằng chứng giống nhau. Trading company không bị loại chỉ vì không sở hữu nhà máy.

### 3.3. Bằng chứng L2 cho nhà máy

Phần review cần xác lập:

- Tên và địa chỉ cơ sở được review.
- Quan hệ giữa pháp nhân supplier với cơ sở, ví dụ sở hữu, thuê hoặc được ủy quyền vận hành.
- Dây chuyền, thiết bị và hoạt động sản xuất liên quan đến nhóm sản phẩm đã khai báo.
- Ngày review và phạm vi cơ sở, nhóm sản phẩm được ghi nhận.

Chỉ dùng nhãn `Factory visited` khi có kiểm tra thực địa. Nếu review bằng giấy tờ, hình ảnh hoặc trực tuyến thì phải dùng nhãn đúng như `Facility reviewed`, không ngụ ý đã đến nhà máy.

### 3.4. Bằng chứng L2 cho trading company

Một shipment gần nhất chưa đủ để chứng minh toàn bộ năng lực thương mại. L2 của trader cần review thêm nguồn hàng và vai trò thực tế trong giao dịch.

Bằng chứng có thể gồm:

- Hợp đồng hoặc hóa đơn mua hàng từ nhà sản xuất hoặc cơ sở cung ứng.
- Hợp đồng phân phối hoặc thư ủy quyền nếu trader có claim tương ứng.
- Chứng từ mua bán cho thấy trader là một bên thực tế trong chuỗi giao dịch.
- Quy trình nhận đơn, sourcing, bán hàng và điều phối giao hàng.
- Vai trò của trader trong xuất khẩu hoặc làm việc với forwarder.
- Văn phòng hoặc kho nếu có, nhưng không bắt buộc phải sở hữu.

Không bắt buộc mọi trader phải có hợp đồng độc quyền hoặc authorization letter. Trader mua theo lô hoặc giao dịch trên thị trường tự do vẫn có thể được xác minh bằng chuỗi chứng từ phù hợp.

Nếu review một partner factory, phải tạo scope riêng ghi rõ `partner facility`. Không hiển thị đó là factory thuộc sở hữu của trader và không chuyển kết quả xác minh của partner thành kết quả của trader.

### 3.5. Bằng chứng L3 cho cả hai luồng

Review tập trung vào một shipment hoặc giao dịch hoàn tất gần nhất, với các dữ kiện phù hợp:

- Ngày giao dịch hoặc giao nhận.
- Các bên tham gia và vai trò của supplier được xác minh.
- Sản phẩm hoặc phạm vi lô hàng được review.
- Invoice, packing list, vận đơn, chứng từ hải quan hoặc bằng chứng giao nhận khi phù hợp.
- Với trader, mối liên hệ giữa đơn mua, đơn bán và shipment tương ứng.

Nếu chỉ review một shipment, nội dung public nên dùng `Recent delivery reviewed` hoặc mô tả đúng số lượng scope. Không suy rộng thành toàn bộ lịch sử giao hàng hoặc xuất khẩu.

Supplier có thể che các dữ liệu thương mại không cần thiết cho review, nhưng tài liệu vẫn phải giữ đủ dữ kiện để Vexim đối chiếu. Không công khai buyer, giá, mã lô, địa chỉ chi tiết hoặc tệp chứng từ nếu chưa có quyền công bố.

## 4. Một chu kỳ 24 tháng và một ngày hết hạn

Chu kỳ 24 tháng áp dụng cho phần xác minh hoạt động gồm L2 và L3, không áp dụng cho L1.

1. Khi check hoạt động đầu tiên được approved, hệ thống mở một chu kỳ và tạo `valid_until` sau 24 tháng.
2. Check hoạt động còn lại được approved sau đó gia nhập cùng chu kỳ.
3. Việc bổ sung check giữa chu kỳ **không reset hoặc kéo dài `valid_until`**.
4. Các check trong cùng chu kỳ dùng một ngày hết hạn chung cho trạng thái public.
5. Upload, submit hoặc `pending_review` không mở chu kỳ mới và không gia hạn chu kỳ hiện tại.
6. Khi tái kiểm định, reviewer review lại các check supplier muốn duy trì. Chu kỳ mới chỉ bắt đầu khi renewal được approved theo quy trình.

Ví dụ:

- L2 được approved ngày 15/01/2027, chu kỳ có `valid_until` ngày 15/01/2029.
- L3 được approved ngày 20/03/2027, L3 gia nhập chu kỳ hiện tại và vẫn có `valid_until` ngày 15/01/2029.

Đây là giới hạn bắt buộc của mô hình một ngày chung: check bổ sung giữa chu kỳ chỉ có phần thời hạn còn lại của chu kỳ. Không thể vừa giữ một ngày chung vừa bảo đảm mỗi check có đủ 24 tháng tính từ ngày approved riêng.

Ngày duyệt từng lần review vẫn phải lưu trong audit nội bộ. Buyer không cần thấy nhiều mốc của từng check.

## 5. Hết hạn, xuống L1 và khóa marketing

Nếu chu kỳ hoạt động hết hạn mà renewal chưa được approved:

- L2 và L3 của chu kỳ chuyển sang `expired` cùng lúc.
- Supplier trở về L1 nếu nền tảng pháp lý vẫn hợp lệ.
- Không được hiển thị L2/L3 như các check current.
- Lịch sử review và ngày hết hạn được giữ để kiểm tra, không xóa hoặc viết lại lịch sử.
- Không tự xóa supplier hoặc sản phẩm, không tự ẩn organic listing và không chặn RFQ chỉ vì chu kỳ hết hạn.
- Supplier không được tham gia chiến dịch marketing hoặc quảng cáo của Vexim cho tới khi chu kỳ mới được approved.

Điều kiện marketing phải được xét riêng khỏi level hiển thị. Supplier có thể đang ở L1 nhưng vẫn bị khóa marketing do renewal quá hạn.

Khóa marketing gồm:

- Không tạo hoặc tham gia chiến dịch mới.
- Không mua, kích hoạt hoặc gia hạn quảng cáo.
- Ngừng phân phối các chiến dịch và quảng cáo đang chạy cho tới khi đủ điều kiện trở lại.

Sau renewal approved, supplier chỉ **được xét lại điều kiện marketing**. Các điều kiện hiện có về hồ sơ public, sản phẩm buyer-ready, dữ liệu demo, quyền duyệt và suất hiển thị vẫn áp dụng. Trả tiền quảng cáo không mua được xác minh hoặc quyền bỏ qua các điều kiện này.

Trạng thái khóa marketing là thông tin vận hành nội bộ, không phải nhãn cần show cho buyer.

## 6. Quy tắc hiển thị

Chỉ dùng **một hạn hiệu lực public cho chu kỳ L2/L3**. Không hiển thị ba cặp ngày riêng cho L1, L2 và L3.

| Bề mặt | Cách hiển thị |
| --- | --- |
| Card sản phẩm | Giữ cụm verification hiện tại và thêm một dòng nhỏ `Valid to 24 Oct 2028` khi có chu kỳ còn hạn |
| Tooltip trên card | Giữ giải thích ngắn về các check và trạng thái thật; không thêm bảng ngày riêng cho từng level |
| PDP và supplier profile | Hiển thị cùng hạn của chu kỳ, trạng thái và scope được phép công khai |
| Supplier dashboard | Hiển thị hạn, số ngày còn lại, trạng thái renewal và hành động cần làm |
| CRM | Hiển thị chu kỳ, lịch sử từng review, trạng thái marketing và lý do bị khóa |

Quy tắc bổ sung:

- Supplier chỉ có L1 thì không có `valid_until` 24 tháng để hiển thị. Không tạo ngày giả cho L1.
- Không dùng countdown theo giây hoặc thêm badge ngày tháng mới trên card.
- Khi chu kỳ đã hết hạn, không được tiếp tục show `Valid to` như một hạn còn hiệu lực. Nếu show ngày cũ thì phải gắn rõ `Expired`.
- Ngày lưu và so sánh theo UTC. Định dạng public ưu tiên `24 Oct 2028`, tránh nhầm thứ tự ngày và tháng với buyer quốc tế.
- Không trộn tiếng Anh và tiếng Việt trong cùng nội dung buyer-facing.

## 7. Yêu cầu khi triển khai

Bản build tương lai cần bảo đảm:

- Mỗi check L2/L3 được liên kết với đúng chu kỳ và pháp nhân, đồng thời giữ ngày review riêng cho audit.
- Mọi selector public chỉ tính check approved thuộc chu kỳ còn hạn, không chỉ dựa vào một cron đã chạy hay chưa.
- Điều kiện marketing được kiểm tra ở server khi tạo, duyệt, kích hoạt, gia hạn và chọn chiến dịch để phân phối.
- Job định kỳ chỉ đồng bộ trạng thái, thông báo và tác vụ vận hành. Job không được là lớp bảo vệ duy nhất chống dữ liệu quá hạn.
- Không có gia hạn tự động từ upload, submit, thanh toán quảng cáo hoặc thay đổi nội dung hồ sơ.
- Không backfill hoặc tự cấp hạn mới cho dữ liệu xác minh cũ nếu chưa có policy chuyển đổi được duyệt.
- Không xóa bằng chứng hoặc lịch sử khi hết hạn.

## 8. Kịch bản nghiệm thu cho bản build sau

1. Supplier chỉ upload hoặc submit hồ sơ thì chưa có chu kỳ và chưa có ngày xác minh public.
2. Manufacturer được duyệt đúng cơ sở và shipment theo scope; không tạo claim cho mọi cơ sở hoặc sản phẩm.
3. Trader không có factory vẫn được duyệt qua nguồn hàng, vai trò giao dịch và shipment phù hợp; không xuất hiện claim `Factory visited`.
4. L2 được duyệt trước, L3 được duyệt sau thì cả hai dùng cùng `valid_until`; ngày này không đổi khi thêm L3.
5. Renewal đang ở `pending_review` khi tới hạn không giữ L2/L3 current và không giữ điều kiện marketing.
6. Qua hạn chưa renewal, supplier về L1 nếu pháp lý còn hợp lệ, campaign và quảng cáo ngừng phân phối, còn organic listing và RFQ vẫn hoạt động theo các điều kiện khác.
7. Renewal approved tạo chu kỳ mới; hệ thống xét lại điều kiện marketing nhưng không tự bỏ qua các cổng duyệt khác.
8. Nếu nền tảng pháp lý không còn hợp lệ, hệ thống không giữ L1 current chỉ dựa vào hồ sơ cũ.
9. Card chỉ có một dòng hạn hiệu lực, không có ba mốc ngày và không thay đổi hierarchy giá, MOQ, lead time hoặc quote CTA.
10. Dữ liệu expired vẫn truy vết được trong CRM nhưng không tạo badge, filter hoặc claim current ngoài public.

## 9. Điểm cần chốt trước khi build

- Ngưỡng thời gian cụ thể cho khái niệm shipment hoặc giao dịch “gần nhất”, có áp dụng khác cho ngành mùa vụ hay không.
- Policy chuyển đổi các verification đã approved trước khi có chu kỳ. Không tự coi dữ liệu cũ là đã nằm trong chu kỳ mới.
- Danh mục đầy đủ các loại campaign, featured placement và quảng cáo phải nằm trong cùng điều kiện chặn.
- Mốc nhắc renewal và kênh thông báo cho supplier, không làm thay đổi quy tắc hết hạn nếu thông báo không gửi được.
