# Đẩy sản phẩm: đặc tả cơ chế

Chốt ngày 23/10/2026. Tài liệu này là nguồn duy nhất cho cơ chế bán và hiển thị gói đẩy sản phẩm. Mọi thay đổi về số suất, thời hạn, cách luân phiên hoặc nhãn hiển thị phải sửa ở đây trước.

## 1. Thuật ngữ

| Phía | Từ dùng | Ghi chú |
|---|---|---|
| Nhà cung cấp | **Đẩy sản phẩm** | Tên gói và tên nút trong cổng nhà cung cấp |
| Buyer | **Tài trợ / Sponsored** | Nhãn trên thẻ sản phẩm, luôn hiện sẵn |
| Nội bộ | **Vùng đẩy** | Dải thẻ trả tiền ở đầu trang danh mục hoặc trang chủ |
| Nội bộ | **Bể gói** | Tổng số gói bán ra đồng thời, lớn hơn số thẻ hiển thị |

Không dùng "đẩy tin". Một gói luôn gắn với đúng một sản phẩm, không gắn với một tin rao hay một danh mục.

## 2. Gói bán

- Một gói là **một lượt đẩy cho một sản phẩm, dài đúng 7 ngày (168 giờ)**, tính liên tục cả ngày lẫn đêm để phủ buyer ở mọi múi giờ.
- Mốc thời gian lưu theo UTC, so sánh ở máy chủ. Không cắt theo ngày Việt Nam, vì buyer mua hàng phần lớn ở múi giờ khác.
- Hết 168 giờ, gói tự rời vùng đẩy. Sản phẩm **trở về đúng vị trí theo xác minh** trong lưới tự nhiên, không bị ẩn, không bị hạ xuống cuối.
- Một sản phẩm chỉ có một lượt đẩy trong cùng thời điểm. Một nhà cung cấp tối đa hai lượt cùng lúc.

## 3. Suất hiển thị

| Bề mặt | Số thẻ tài trợ tối đa | Bể gói bán ra | Tỷ lệ hiển thị kỳ vọng |
|---|---|---|---|
| Trang danh mục | 3 | 12 | khoảng 1/4 số lượt xem trang |
| Trang chủ | 2 | 8 | khoảng 1/4 số lượt xem trang |

Bể gói gấp bốn lần số suất để nhiều nhà cung cấp mua được trong cùng một tuần mà bố cục không đổi. Đổi lại, mỗi gói chỉ xuất hiện khoảng một phần tư số lượt xem trang. Con số này phải nói rõ trong điều kiện bán, không được hứa "luôn đứng đầu".

**Hết bể thì ngừng bán.** Không bán thêm rồi đẩy người trả tiền trước ra khỏi vùng hiển thị. Đây là điểm khác Chợ Tốt có chủ ý: bên đó nguồn tin không giới hạn nên đẩy thêm chỉ làm tin cũ trôi xuống, còn ở đây vùng đẩy có hạn nên bán quá bể là bán thứ không còn chỗ hiển thị.

## 4. Luân phiên trong vùng đẩy

Vùng đẩy chia thành các **cửa sổ luân phiên 10 phút**, tính theo giờ UTC. Thứ tự gốc của các gói cố định bằng băm id gói, mỗi cửa sổ xoay danh sách đó đi một bậc rồi lấy ba thẻ đầu. Sang cửa sổ sau thứ tự đổi. Sau 7 ngày, mỗi gói nhận đúng cùng một số lượt hiển thị.

Ba lý do chọn cửa sổ thay vì đảo ngẫu nhiên theo từng lượt tải:

1. Mọi người xem trong cùng mười phút thấy cùng một bố cục, nên không có cảm giác thẻ nhảy lung tung khi mở lại trang.
2. Bố cục tính được ở máy chủ và không đổi giữa các lần dựng, nên không lệch giữa HTML gửi đi và phần chạy trên trình duyệt.
3. Cân bằng hiển thị kiểm chứng được bằng số, không phụ thuộc may rủi của từng lượt chia.

Đảo ngẫu nhiên theo từng lượt F5 vẫn cho tỷ lệ tương đương về lâu dài nhưng không kiểm chứng được trong một tuần, và làm mỗi lần tải trang cho ra một bố cục khác nhau dù cùng một người xem. Nếu sau này cần đổi, chỉ đổi hàm chọn, không đổi dữ liệu.

Mô phỏng 1.008 cửa sổ của một tuần với bể 12 gói và 3 suất: mỗi gói nhận đúng 252 lượt hiển thị, không gói nào hơn gói nào, và có 12 bố cục khác nhau lặp lại theo vòng. Con số này nói được với nhà cung cấp bằng một câu, không phải kèm chữ "xấp xỉ", và kiểm lại được bất cứ lúc nào bằng cùng phép tính.

Bản đầu chọn thẻ bằng băm của `(mốc cửa sổ, id gói)`. Đo lại thì gói cao nhất nhận 476 lượt, gói thấp nhất 128 trong cùng một tuần. Đó không phải lỗi băm: với 12 gói, 3 suất và 1.008 cửa sổ, mọi cách xếp ngẫu nhiên đều dao động khoảng 18 đến 24 phần trăm, và năm biến thể băm khác nhau cho ra đúng khoảng đó. Xoay vòng bỏ hẳn dao động ấy nên được chọn, đổi lại bố cục lặp lại theo chu kỳ 12 cửa sổ, tức hai tiếng, thay vì ngẫu nhiên vô hạn.

Thứ tự trong vùng đẩy **không phụ thuộc số tiền, ngày mua hay giờ sửa giá**. Mọi gói trong cùng một cửa sổ có cùng cơ hội.

## 5. Lưới tự nhiên

Lưới tự nhiên bên dưới **không luân phiên ngẫu nhiên và không bán vị trí**. Thứ hạng giữ nguyên: mức xác minh trước, sau đó luân phiên nhà cung cấp, không xếp theo giờ cập nhật.

Lý do: đây là thứ buyer B2B dùng để đọc mức độ tin cậy. Xếp theo độ mới sẽ khiến nhà cung cấp nào sửa giá thường xuyên là lên đầu, và khi đó họ không cần mua gói nào cả.

## 6. Luật cố định

- Sản phẩm muốn đẩy vẫn phải qua đủ bốn cổng công khai: hồ sơ được duyệt, sẵn sàng cho buyer kèm ảnh hoặc catalogue, thuộc danh mục đã publish, nhà cung cấp đã publish và không phải hồ sơ demo. Trả tiền không mua được quyền vượt cổng.
- Sản phẩm trong vùng đẩy **không lặp lại** ở lưới tự nhiên bên dưới.
- Buyer đang lọc thì **ẩn cả vùng đẩy**, không nhồi một sản phẩm không liên quan vào chỗ trống. Sản phẩm trả phí khi đó trở lại lưới tự nhiên và chịu đúng bộ lọc như mọi sản phẩm khác, vì nó vẫn là hàng thật của nhà cung cấp.
- Vùng đẩy **không đụng vào dải giá tham khảo**: dải giá tính trên toàn bộ sản phẩm của danh mục, kể cả sản phẩm đang trả phí. Trả tiền mua chỗ hiển thị, không mua việc bị loại khỏi số liệu thị trường.
- Nhãn **Tài trợ / Sponsored** hiện sẵn trên thẻ, không cần rê chuột, ở cả hai ngôn ngữ, kèm câu nói rõ đây là vị trí trả tiền và không phải kết quả xác minh.
- Gói không làm thay đổi huy hiệu xác minh, không mở thêm giấy tờ, không đổi hạng trong lưới tự nhiên.
- Danh mục chưa publish, sản phẩm chưa sẵn sàng, hoặc nhà cung cấp bị tạm dừng thì gói không hiển thị, kể cả khi còn hạn.

## 7. Đo lường

- Ghi nhận lượt hiển thị khi ít nhất một nửa thẻ nằm trong khung nhìn đủ 800ms, và ghi nhận lượt bấm khi buyer mở trang chi tiết sản phẩm.
- Mỗi tab chỉ ghi một sự kiện cùng loại cho mỗi gói trong 30 phút. Số liệu lưu ở bảng riêng, không trộn vào bộ đếm tự nhiên hay báo cáo RFQ.
- Số liệu dùng để đối soát và để chứng minh hiệu quả, **không dùng để tính tiền theo lượt bấm**. Chu kỳ mua nông sản kéo dài nhiều tháng, tính theo lượt bấm là tự phạt mình.

## 8. Vận hành

- Giai đoạn đầu: CRM tạo gói, admin Vexim duyệt bằng tay. Chưa mở tự phục vụ.
- Chưa có thanh toán, hoá đơn, hoàn tiền tự động. Thu tiền ngoài hệ thống, ghi nhận bằng trạng thái đã duyệt.
- Muốn tạm dừng một gói: đổi trạng thái sang `paused`, vùng đẩy tự bỏ gói đó ở lượt dựng kế tiếp.
- Mở tự phục vụ khi đã chạy đủ số gói để biết tỷ lệ hiển thị thật, và khi có thanh toán cùng hàng chờ duyệt.

## 9. Chưa nằm trong phạm vi

Thanh toán trực tuyến, hoá đơn, hoàn tiền, chống gian lận nâng cao, báo cáo tách riêng trả phí và tự nhiên cho nhà cung cấp, cùng việc mở cổng tự đăng ký gói. Những phần này phải làm trước khi bán đại trà, nhưng không chặn việc chạy thử vài gói bằng tay.

## 10. Hạ tầng

Bảng và ràng buộc nằm ở `supabase/migrations/20261028_sponsored_product_push.sql`. Migration này chỉ tạo chỗ chứa và chặn sai sót, không tạo gói nào và không bật hiển thị. Bảng thử nghiệm cũ `sponsored_pilot_campaigns` giữ nguyên, chỉ dùng ở staging, và sẽ bỏ sau khi cơ chế mới chạy ổn định.

## 11. Phần đã dựng

- `lib/sponsored/rotation.ts`: cửa sổ, thứ tự gốc, xoay vòng, chọn suất. Hàm thuần, không dùng số ngẫu nhiên, không đọc đồng hồ bên trong.
- `lib/public/sponsored-band.ts`: ghép gói với sản phẩm công khai và bỏ sản phẩm trả phí khỏi lưới tự nhiên khi vùng đẩy đang hiện.
- `components/sponsored-product-band.tsx`: vùng đẩy có nhãn hai thứ tiếng, dùng lại thẻ sản phẩm của lưới tự nhiên.
- `app/api/public/sponsored-push/route.ts` và `lib/sponsored/events.ts`: nhận lượt hiển thị và lượt bấm, gọi `record_sponsored_push_event`.
- `DataStore.listSponsoredPushes`: đọc gói theo bề mặt và danh mục; bản local đọc từ dữ liệu xem thử, bản Supabase lọc `status`, `starts_at`, `ends_at` ngay trong truy vấn.
- `scripts/check-sponsored-rotation.mjs` và `scripts/check-sponsored-band.mjs`: kiểm bằng số, không cần trình duyệt.

Trang chủ chưa gắn vùng đẩy. Bề mặt đó dùng lại đúng ba tệp trên, chỉ khác số suất và vị trí chèn, nên để làm cùng lúc với việc bán gói trang chủ đầu tiên.

Migration chưa chạy trên Supabase nào và chưa có gói thật. Ở môi trường chưa áp migration, truy vấn gói trả về rỗng thay vì làm hỏng trang danh mục. Giao diện chỉ hiện vùng đẩy khi bảng có gói đã duyệt và còn hạn, nên hôm nay trang danh mục vẫn sạch.

## 12. Kiểm sau khi áp migration

Chạy bốn câu này trong SQL editor của đúng project. Cả bốn chỉ đọc, không tạo gói nào.

```sql
-- 1. Bảng và cột đã có đủ
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sponsored_pushes'
order by ordinal_position;

-- 2. Trigger chặn sai sót đã gắn
select tgname from pg_trigger
where tgrelid = 'public.sponsored_pushes'::regclass and not tgisinternal;

-- 3. Hàm đếm và hàm kiểm đã tạo, đúng tham số
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname in ('record_sponsored_push_event', 'check_sponsored_push_rules');

-- 4. Chưa có gói nào, và chưa có số liệu
select count(*) as packages from public.sponsored_pushes;
select count(*) as daily_rows from public.sponsored_push_daily;
```

Kỳ vọng: 14 cột, một trigger `sponsored_push_rules_ck`, hai hàm, và hai số đếm bằng 0.

Muốn thử đường ghi nhận lượt hiển thị mà không tạo gói giả: gọi hàm với một mã gói ngẫu nhiên. Hàm tự kiểm lại gói có đang hiệu lực hay không, nên nó trả về mà không ghi gì, và đó là kết quả đúng.

```sql
select public.record_sponsored_push_event(gen_random_uuid(), 'impression');
select count(*) as daily_rows from public.sponsored_push_daily;  -- vẫn 0
```

Muốn thấy vùng đẩy thật thì phải có một gói đã duyệt. Gói cần một admin đang hoạt động trong `app_users`, một sản phẩm đã publish thuộc đúng nhà cung cấp, và hai mốc thời gian cách nhau đúng 168 giờ. Nên thử trên project staging trước, vì gói đã tạo sẽ hiện với buyer ngay khi còn hạn.

```sql
insert into public.sponsored_pushes
  (surface, category_slug, supplier_id, product_id, status, starts_at, ends_at, approved_by, approved_at, price_amount, price_currency)
values
  ('category', 'pepper', '<supplier_id>', '<product_id>', 'approved',
   now(), now() + interval '168 hours', '<admin_user_id>', now(), 2500000, 'VND');
```

Trigger sẽ từ chối nếu thiếu một trong các điều kiện trên, và câu lỗi nói rõ thiếu cái gì. Đó là mục đích của nó, không phải trục trặc.
