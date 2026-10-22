# Đặc tả trang Market Overview theo danh mục

Bản phác thảo để chốt trước khi code. Viết ngày 22/10/2026, áp dụng cho `/products/[slug]/market`, làm mẫu với **hạt điều**, sau đó nhân ra các danh mục khác.

## 1. Mục tiêu

Trang này trả lời ba câu buyer quốc tế luôn hỏi trước khi gửi RFQ: **giá đang ở mức nào, mùa nào có hàng, cần giấy tờ gì**. Hiện ba câu đó nằm rải rác trong phần "Buying from Vietnam", FAQ và blog, buyer phải tự ghép.

Ba kết quả phải đạt:

1. **SEO**: giữ được cụm truy vấn dạng "cashew price Vietnam", "cashew harvest season", "raw cashew nut HS code". Đây là loại truy vấn có lưu lượng ổn định và ít trang Việt Nam làm tử tế.
2. **Chuyển đổi**: mỗi trang có đường dẫn rõ ràng tới danh sách nhà cung cấp và form RFQ, kèm ngữ cảnh để buyer thấy tự tin gửi yêu cầu.
3. **Tạo lý do để nhà cung cấp cập nhật giá**: chỉ nhà cung cấp có giá còn tươi mới được hiện trong khoảng giá. Đây là đòn bẩy dữ liệu, không phải tính năng kỹ thuật.

Trang này **không** phải nơi chào giá và không phải nơi dự báo. Nó là bối cảnh để buyer ra quyết định.

## 2. Năm nguyên tắc

1. **Số nào cũng phải trả lời được "từ đâu ra"**. Không có nguồn, không hiện.
2. **Không đủ mẫu thì không hiện số**, thay bằng câu giải thích. Không bao giờ hiện một con số duy nhất như thể đó là giá thị trường.
3. **Tách tuyệt đối ba loại số**: giá nhà cung cấp chào (của Vexim), giá thị trường tham chiếu (nguồn ngoài), và bối cảnh mùa vụ (lịch). Trộn ba loại này là nguồn gốc của mọi tranh chấp.
4. **Mọi con số đều có hạn sử dụng** và tự ẩn khi hết hạn.
5. **Trang phải có ích ngay cả khi chưa có số nào**, bằng phần mùa vụ, quy cách và giấy tờ. Không để trang rỗng chờ dữ liệu.

## 3. Danh mục làm trước

**Hạt điều**, vì hội đủ bốn điều kiện: Việt Nam là nước chế biến và xuất khẩu nhân điều lớn nhất thế giới nên có lưu lượng tìm kiếm thật; dữ liệu trong hệ thống đã có `ref_price` của nhiều nhà cung cấp; quy cách đã chuẩn hoá trong ngành (W180 đến SP) nên `product_fields` dùng được ngay; và đây là ngành mạnh nhất của Vexim.

Danh mục làm tiếp theo: thủy sản (tôm, cá tra), rồi gạo, rồi hồ tiêu.

## 4. Đường dẫn và vị trí

- Trang riêng: `/products/[slug]/market`. Đặt riêng chứ không nhét vào trang danh mục, để trang danh mục giữ vai trò chọn nhà cung cấp và không bị loãng.
- Trang danh mục **có biểu đồ mùa vụ**, đặt sau lưới sản phẩm và trước khối quy cách, kèm hai đến ba câu diễn giải và một liên kết sang trang market. Lý do đặt sau lưới: trang danh mục có một việc chính là đưa buyer tới danh sách nhà cung cấp, chèn biểu đồ ngay dưới intro sẽ đẩy lưới sản phẩm xuống dưới màn hình đầu.
- Liên kết từ trang danh mục dùng anchor có nghĩa (`Giá, quy cách và giấy tờ nhập khẩu cho hạt điều`), không dùng "Tìm hiểu thêm".
- **Chống trùng lặp nội dung**: trang danh mục chỉ có biểu đồ cộng phần diễn giải ngắn, không lặp nguyên đoạn văn của trang market. Bảng quy cách, giấy tờ và FAQ chi tiết thuộc trang market; trang danh mục giữ bản ngắn phục vụ việc chọn nhà cung cấp.
- Trang market chỉ nên index khi **khối khoảng giá đã lên sóng**. Trước đó trang tồn tại nhưng để `noindex`, vì nếu chưa có giá thì trang market gần như trùng với trang danh mục và hai trang sẽ tranh nhau cùng một truy vấn.
- Trang này chỉ mở khi danh mục đã publish. Nếu danh mục có ít hơn 3 nhà cung cấp thì vẫn mở nhưng ẩn khối giá, giữ phần mùa vụ và giấy tờ.
- Sitemap: thêm khi trang có nội dung biên tập đã duyệt; `robots` cho index khi `seo_indexable` của danh mục bật.

## 5. Cấu trúc trang, từ trên xuống

Chín khối. Khối nào cũng có điều kiện hiện rõ ràng, không khối nào là bắt buộc tuyệt đối.

### Khối 1. Tiêu đề và tóm tắt

- H1: `[Tên hàng] market overview: prices, season and export requirements from Vietnam`.
- Dưới H1: một đoạn 40 đến 60 từ, viết tay, nêu đúng thứ buyer cần biết và ngày cập nhật gần nhất.
- Chip nhỏ: HS code, tên khoa học nếu có, vùng trồng chính.

Dữ liệu: `Category` (name, hero), thêm hai trường mới `hs_code` và `main_regions` trong CMS.

### Khối 2. Khoảng giá tham khảo

Đây là khối quan trọng nhất và cũng là khối dễ sai nhất.

- Dạng hiển thị chuẩn: `7,60 đến 8,40 USD/kg FOB Cát Lái · 4 niêm yết · cập nhật 21/10/2026`.
- Kèm một dòng bắt buộc: giá nhà cung cấp tự công bố, không phải giá chào bán ràng buộc, chốt trong báo giá.
- Kèm một dòng thứ hai: đây là giá **nhân điều**, không phải hạt thô. Với hạt điều phải nói rõ đang nói về sản phẩm nào, vì HS 080131 là hạt thô còn nhân điều là 080132, hai mức giá khác nhau nhiều lần.
- Nếu có ít hơn 3 niêm yết: ẩn số, thay bằng `Chưa đủ niêm yết để nêu khoảng giá. Gửi yêu cầu để nhận báo giá thực tế.`
- Nếu niêm yết mới nhất cũ hơn 45 ngày: vẫn hiện nhưng ghi rõ tuổi dữ liệu; cũ hơn 90 ngày thì ẩn số.

Nguồn: tính từ `supplier_products.ref_price`, `ref_price_max`, `currency`, `incoterm`, `price_valid_until`, chỉ lấy sản phẩm `ready_for_buyer` và `price_publicly_visible` của nhà cung cấp đang published. **Không cần bảng mới cho giai đoạn này.**

### Khối 3. Diễn biến 30 và 90 ngày

- Chỉ hiện khi đã có từ 3 mốc thời gian trở lên, tức là tối thiểu 3 tháng thu thập.
- Dạng đơn giản nhất: mũi tên và phần trăm thay đổi của **trung vị**, kèm số mẫu mỗi mốc.
- Không vẽ biểu đồ ở giai đoạn đầu. Biểu đồ nghĩa là phải có lịch sử sạch, và một biểu đồ sai gây hại hơn một con số đúng.

Nguồn: bảng `market_price_observations` (mục 8). Trước khi có bảng này, khối tự ẩn.

### Khối 4. Mùa vụ

- Dạng thanh 12 tháng, tô ba mức: cao điểm thu hoạch, bình thường, thấp. Không dùng màu đỏ xanh gây cảm giác tốt xấu.
- Kèm hai câu: một về vụ chính, một về vì sao vẫn có hàng ngoài vụ (với hạt điều là do nhập hạt thô từ châu Phi và Campuchia, nhà máy chạy quanh năm).
- Bắt buộc ghi vùng: Bình Phước, Đồng Nai, Tây Nguyên cho hạt điều.

Dữ liệu: trường mới `harvest` trong CMS, là **danh sách các cửa sổ mùa vụ**, không phải mảng 12 tháng. Mỗi cửa sổ gồm `label` (tên vụ), `start_month`, `end_month`, `regions[]`, `peak` (cao điểm hay không) và `note`. Thanh 12 tháng chỉ là cách vẽ ra từ danh sách đó.

Lý do không dùng mảng 12 tháng: gạo có ba vụ Đông Xuân, Hè Thu, Thu Đông với khoảng trống giữa các vụ và mỗi vụ một vùng; thủy sản gần như quanh năm nhưng cao điểm theo loài. Mảng 12 giá trị không biểu diễn được những trường hợp đó và sẽ phải sửa schema ngay khi làm danh mục thứ hai.

Đây là dữ liệu biên tập, không cần AI sinh, nhưng phải đối chiếu nguồn trước khi publish. Con số mùa vụ hiện có trong `category-seed.ts` vẫn là chỗ giữ chỗ trong ngoặc vuông, phải thay bằng dữ liệu đã xác nhận.

Cùng một trường này được cả trang danh mục và trang market đọc, chỉ khác cách trình bày. Không tạo trường thứ hai, nếu không sáu tháng sau hai trang sẽ nói hai chuyện khác nhau. Mỗi chỗ hiển thị đều ghi ngày rà soát gần nhất và có việc nhắc rà soát mỗi năm.

Biểu đồ phải là HTML và CSS, không phải ảnh, để công cụ tìm kiếm và trình đọc màn hình đọc được. Phải đọc được ở màn 375px với nhãn tháng ba chữ cái, không bắt người dùng cuộn ngang.

### Khối 5. Quy cách và cách đọc giá

- Bảng ngắn giải thích các đơn vị ngành: với hạt điều là W180 đến W450, SW, WS, LP, SP; với tôm là cỡ con trên pound; với cà phê là sàng và tỷ lệ đen vỡ.
- Nêu rõ 1 đến 2 chỉ số quyết định giá: với hạt điều là tỷ lệ nhân thu hồi (KOR, tính bằng lbs nhân trên bao 80 kg) và số hạt trên kg. Giá trị cụ thể để trống, chờ xác nhận với VINACAS trước khi điền.
- Đây là khối dùng lại `spec_columns` và `spec_rows` đã có, chỉ cần bổ sung phần diễn giải.

### Khối 6. Giấy tờ và điều kiện nhập khẩu

- Danh sách giấy tờ thường gặp: chứng nhận kiểm dịch thực vật, giấy phép kiểm dịch, hoá đơn, vận đơn, phiếu đóng gói, C/O nếu cần ưu đãi thuế.
- Ghi rõ đây là thông tin tham khảo, buyer phải kiểm với cơ quan nước nhập khẩu.
- Không khẳng định một loại giấy tờ là bắt buộc cho mọi thị trường, vì mỗi nước khác nhau.

Dữ liệu: trường mới `import_requirements` (văn bản có cấu trúc đơn giản), biên tập nhập tay.

### Khối 7. Giá thị trường tham chiếu

**Chỉ bật khi có giấy phép hiển thị dữ liệu.** Trước đó, khối này chỉ là một liên kết: `Xem giá tham chiếu trên [nguồn]`. Không tự lưu rồi phát lại số của sàn.

Khi bật được, hiển thị: tên chỉ số, kỳ hạn, trị giá, đơn vị, ngày chốt theo giờ địa phương của sàn, và nguồn có link.

Với hạt điều, không có hợp đồng phái sinh thanh khoản, nên nguồn thay thế là bảng giá hàng hoá của World Bank, báo cáo VINACAS, giá hạt thô nhập khẩu. Ghi rõ đây là tham chiếu, không phải giá Việt Nam.

### Khối 8. Câu hỏi thường gặp

Dùng đúng `faq_i18n` đã có, thêm 3 đến 4 câu riêng cho trang này, ví dụ:

- Vì sao giá hạt điều nhân Việt Nam khác giá hạt thô nhập khẩu.
- Mùa nào đặt hàng tốt nhất nếu tôi muốn giao trước Tết.
- Tôi cần mẫu trước khi đặt container, mất bao lâu.
- Giá trên trang này cập nhật khi nào.

Schema `FAQPage` đã có sẵn, tái dùng.

### Khối 9. Đường dẫn hành động

- Nút chính: `Xem nhà cung cấp [tên hàng]` dẫn về trang danh mục.
- Nút phụ: `Gửi yêu cầu báo giá` dẫn `/rfq?category=[slug]`.
- Một dòng nhỏ: nếu không tìm được quy cách cần, gửi yêu cầu, Vexim tìm cả nhà máy chưa lên trang. Khớp với nội dung buyer-first đã sửa ở trang danh mục.

## 6. Bảng nguồn dữ liệu

| Khối | Nguồn | Ai cập nhật | Tần suất | Điều kiện hiện |
|---|---|---|---|---|
| Khoảng giá | `supplier_products` hiện có | Nhà cung cấp qua cổng, nhân viên duyệt | Theo lần NCC cập nhật | Có từ 3 niêm yết, mới nhất trong 90 ngày |
| Diễn biến | `market_price_observations` | Cron tính, người duyệt | Hằng ngày | Có từ 3 mốc thời gian |
| Mùa vụ | `harvest` (CMS, danh sách cửa sổ) | Biên tập | Mỗi năm một lần | Đã duyệt |
| Quy cách | `spec_columns`, `spec_rows` | Biên tập | Khi đổi chuẩn ngành | Có cấu hình |
| Giấy tờ | `import_requirements` (CMS) | Biên tập | 6 tháng | Đã duyệt |
| Thị trường | Nguồn ngoài có giấy phép | Nhân viên | Theo nguồn | Có giấy phép |
| FAQ | `faq_i18n` | Biên tập, có thể soạn nháp bằng AI rồi duyệt | Khi cần | Có nội dung |

## 7. Quy tắc số, chốt thành văn bản để không tranh cãi sau

1. **Đơn vị theo quy ước thị trường, không theo ý người viết.** Mỗi danh mục có một đơn vị hiển thị lưu trong cấu hình (`categories.price_unit`); mọi phép tính quy về kg rồi mới đổi ra đơn vị hiển thị. Cấm nhập số mà không xác định được đơn vị: đơn vị lạ thì loại khỏi phép tính, không đoán.

   Quy ước đã đối chiếu ngày 24/10/2026:

   | Ngành | Đơn vị niêm yết | Ghi chú |
   |---|---|---|
   | Nhân điều | USD/kg FOB | Nhà chế biến Việt Nam báo USD/kg (SVC, Pacific Production); bản tin quốc tế và VINACAS lại báo USD/lb, nên hiển thị kèm pound |
   | Hạt điều thô (RCN) | USD/tấn | Khác hoàn toàn nhân điều, không được gộp |
   | Gạo | USD/tấn | Gạo 5% tấm FOB quanh 420 đến 450 USD/tấn (VFA, World Bank) |
   | Cà phê robusta | USD/tấn | ICE London và giá FOB Việt Nam; arabica mới tính cent/lb |
   | Hồ tiêu đen | USD/tấn | Theo cỡ 500 g/l và 550 g/l (IPC) |
   | Quế, hồi, dừa, hoa quả khô | USD/tấn | Giao dịch công nghiệp |
   | Tôm, cá | USD/kg | Theo cỡ con trên pound hoặc trên kg |

   Hệ quả kỹ thuật: giá là "tiền trên một đơn vị", không phải khối lượng. 7.900 USD/tấn là 7,90 USD/kg, tức chia 1.000 chứ không phải nhân. Nhầm chiều ở đây làm con số sai một nghìn lần, nên phép quy đổi phải có kiểm thử riêng.
2. **Tối thiểu 3 niêm yết** mới công bố khoảng giá. Dưới 3 thì ẩn.
3. **Tuổi dữ liệu**: quá 45 ngày thì ghi rõ, quá 90 ngày thì ẩn. Không bao giờ hiện giá cũ mà không nói là cũ.
4. **Làm tròn**: hai chữ số thập phân với USD/kg, làm tròn tới 1 USD với USD/tấn. Không hiện nhiều hơn để tránh cảm giác chính xác giả.
5. **Khoảng, không phải một số**: luôn hiện thấp đến cao, không hiện trung bình đơn lẻ. Nếu chỉ có một mức giá thì hiện kèm số mẫu và ghi rõ đó là một niêm yết.
6. **Không hiện giá của từng nhà cung cấp trong khối này**, kể cả khi được phép công khai. Giá từng nhà nằm ở trang sản phẩm và trang hồ sơ, nơi có ngữ cảnh quy cách, MOQ, điều kiện giao. Gom lên trang tổng hợp là mời so sánh sai.
7. **Không gộp quy cách khác nhau** vào một khoảng. Nếu cần, tách theo `product_fields`, mỗi quy cách một dòng.
8. **Không hiện số của RFQ** dưới bất kỳ hình thức nào. Giá buyer mục tiêu chỉ dùng nội bộ.

## 8. Dữ liệu cần thêm

**Giai đoạn 1, không cần bảng mới:** thêm vào `categories` các trường `hs_code`, `main_regions`, `harvest` (jsonb, danh sách cửa sổ mùa vụ như mục Khối 4), `price_unit` (đơn vị chuẩn của danh mục, để không phải hardcode theo ngành), `import_requirements` (jsonb hoặc text có cấu trúc), `market_note_i18n` (đoạn tóm tắt viết tay).

**Giai đoạn 2, khi bắt đầu lưu lịch sử:** bảng `market_price_observations` gồm: `id`, `category_slug`, `variant_key` (trỏ tới quy cách trong `product_fields`), `incoterm`, `unit`, `currency`, `price_low`, `price_high`, `median`, `sample_size`, `observed_on`, `source` (`supplier_listing` | `rfq_quote` | `external_index` | `editorial`), `is_public`, `approved_by`, `created_at`.

Một view tổng hợp theo tuần cho ra trung vị, khoảng 25 đến 75 phần trăm và thay đổi so với kỳ trước. Một cron hằng ngày ghi mốc mới, dùng lại hạ tầng cron ngoài đang có (`/api/cron/*` với `CRON_SECRET`). Idempotent theo cặp `(category_slug, variant_key, observed_on)`.

Không có bảng nào lưu dữ liệu buyer thô. Nếu sau này cần chỉ số từ RFQ, chỉ lưu số tổng hợp đã ẩn danh.

## 9. Ghi nguồn và pháp lý

- Mỗi khối có nguồn ngoài phải ghi tên nguồn, ngày, và link. Dạng chân trang của khối, chữ nhỏ.
- Không phát lại dữ liệu của sàn giao dịch hoặc nhà cung cấp dữ liệu khi chưa có quyền bằng văn bản. Khi chưa có, chỉ link ra ngoài.
- Không trích dẫn số liệu hải quan kèm tên doanh nghiệp nếu hợp đồng dữ liệu không cho phép. Số tổng hợp thì an toàn hơn.
- Thêm một câu miễn trừ cố định, đặt ở cuối trang và không được xoá: giá và số liệu để tham khảo, không phải chào bán, không phải tư vấn đầu tư; điều kiện cuối cùng theo báo giá và hợp đồng.
- Trang phương pháp `/market-methodology` giải thích cách tính khoảng giá, số mẫu, tần suất cập nhật, và những gì Vexim không làm. Trang này quan trọng hơn nó có vẻ: nó là thứ bảo vệ bạn khi buyer thắc mắc, và là thứ khiến chỉ số tự xây trở nên đáng tin.

## 10. SEO và liên kết nội bộ

- Tiêu đề thẻ: `[Tên hàng] Price & Season in Vietnam ([tháng/năm]) | Vexim Trade`. Có tháng năm để Google thấy là trang sống.
- Schema: `WebPage` cộng `FAQPage` (đã có) cộng `BreadcrumbList`. Không đánh dấu `Offer` hay `AggregateOffer` cho khoảng giá tham khảo, vì đó không phải chào bán và sẽ bị coi là đánh dấu sai.
- Liên kết nội bộ hai chiều: từ trang danh mục sang trang market, từ trang market sang danh mục, sản phẩm, và bài blog liên quan. Blog cũ về hạt điều nên được trỏ về đây.
- Thêm vào `llms.txt` một dòng mô tả trang này để các công cụ AI đọc đúng bản chất: khoảng giá tham khảo cộng lịch mùa vụ, không phải báo giá.
- Cập nhật lại `sitemap.ts`.

## 11. Đo lường

Bốn con số, đọc theo tuần:

- Lượt xem trang market, tách theo nguồn (tìm kiếm, nội bộ, trực tiếp).
- Tỷ lệ bấm sang danh mục và sang form RFQ.
- Số RFQ có `source_page` là trang market. Form đã có trường này, chỉ cần truyền đúng.
- Số nhà cung cấp cập nhật giá trong 30 ngày, sau khi khối giá lên sóng. Đây là chỉ số gián tiếp cho thấy đòn bẩy dữ liệu có hoạt động không.

Chỉ số quyết định: **RFQ trên 100 lượt xem trang**. Không phải thời gian trên trang, không phải số lần cuộn.

## 12. Nội dung mẫu cho hạt điều

Đoạn mở, viết tay, đây là giọng cần dùng:

> Việt Nam chế biến nhân điều cho thị trường thế giới từ hạt thô nhập khẩu và từ vụ trong nước. Vụ trong nước chạy khoảng tháng 2 đến tháng 5 ở Bình Phước, Đồng Nai và Tây Nguyên, nhưng nhà máy hoạt động quanh năm nhờ hạt thô nhập từ châu Phi và Campuchia. Vì vậy tháng bạn đặt hàng ảnh hưởng tới giá nhiều hơn là tới việc có hàng hay không. Trang này cập nhật ngày [ngày].

Khối giá, trạng thái đủ dữ liệu:

> **Nhân điều, giá tham khảo**
> 7,60 đến 8,40 USD/kg FOB Cát Lái · 4 niêm yết · cập nhật 21/10/2026
> Giá do nhà cung cấp tự công bố, chưa phải chào bán ràng buộc. Quy cách cụ thể, MOQ và điều kiện giao chốt trong báo giá.

Khối giá, trạng thái chưa đủ dữ liệu:

> **Nhân điều, giá tham khảo**
> Chưa đủ niêm yết để nêu khoảng giá. Gửi yêu cầu kèm quy cách và số lượng, bạn nhận báo giá thực tế trong một ngày làm việc.

Ghi chú về các chỗ còn để trống: tỷ lệ nhân thu hồi, số hạt trên kg, tên giống, các mức thuế theo thị trường. Không điền số nào trong bốn thứ này cho tới khi có nguồn xác nhận. Quy ước của repo là để trong ngoặc vuông, giữ nguyên quy ước đó.

## 13. Kế hoạch triển khai

| Giai đoạn | Nội dung | Ước lượng | Điều kiện xong |
|---|---|---|---|
| 0 | Trường `harvest` trong CMS, component biểu đồ, đặt sau lưới sản phẩm trên trang danh mục, làm cho hạt điều trước | 1 ngày | Biểu đồ hiện đúng ở cả desktop và màn 375px, đọc được bởi trình đọc màn hình |
| 1 | Trang market với 5 khối tĩnh (tiêu đề, mùa vụ, quy cách, giấy tờ, FAQ), để `noindex` | 3 đến 4 ngày | Trang mở được cho hạt điều, không có số giá, không index |
| 2 | Khối khoảng giá tính từ `ref_price`, quy tắc 3 niêm yết và 90 ngày, bật index | 2 ngày | Có kiểm thử cho các trường hợp thiếu mẫu, giá cũ, quy cách lẫn |
| 3 | Bảng `market_price_observations`, cron ghi mốc, khối diễn biến | 4 đến 5 ngày | Có 3 mốc thời gian thật thì khối mới hiện |
| 4 | Khối thị trường tham chiếu, trang phương pháp | 2 ngày | Chỉ bật khi có quyền hiển thị dữ liệu |

Vì sao tách giai đoạn 0 ra trước: biểu đồ mùa vụ mang lại giá trị ngay trên trang có lưu lượng sẵn, và không phụ thuộc vào việc mua dữ liệu hay chờ nhà cung cấp cập nhật giá.

Vì sao trang market để `noindex` tới giai đoạn 2: khi chưa có khối giá, trang market chỉ lặp lại những gì trang danh mục đã có, hai trang sẽ tranh nhau cùng một truy vấn và không trang nào thắng.

Giai đoạn 0 đến 2 làm được ngay, không cần mua dữ liệu, không cần giấy phép, không cần AI.

**Về việc thêm danh mục mới**: không phải code thêm. `/products/[slug]` đã là route động, mọi khối đọc từ CMS, `harvest` nằm trong dữ liệu danh mục và `price_unit` cũng là trường cấu hình. Thêm gạo hay hạt tiêu là nhập dữ liệu trong CRM. Phần code chỉ làm một lần; phần tốn thời gian về sau là dữ liệu đã kiểm chứng.

## 14. Những gì không làm

- Không dự báo giá, không đưa ra khuyến nghị mua hay bán.
- Không hiện giá phái sinh khi chưa có giấy phép, kể cả dạng biểu đồ.
- Không gộp quy cách khác nhau vào một con số.
- Không dùng giá của RFQ cho mục đích công khai.
- Không để AI tự sinh số. AI chỉ được viết lời bình quanh số do hệ thống tính, và mọi câu chứa số không có trong dữ liệu đầu vào phải bị chặn trước khi tới tay người duyệt.
- Không đánh dấu `Offer` cho khoảng giá tham khảo.

## 15. Checklist nghiệm thu

- [ ] Trang mở được khi danh mục publish, 404 khi danh mục nháp.
- [ ] Khối giá ẩn hoàn toàn khi dưới 3 niêm yết, không hiện số 0 hay dấu gạch.
- [ ] Khối giá ẩn khi niêm yết mới nhất cũ hơn 90 ngày, và ghi chú tuổi dữ liệu khi cũ hơn 45 ngày.
- [ ] Hai sản phẩm khác quy cách không bao giờ bị gộp vào cùng một khoảng giá.
- [ ] Mọi con số trên trang đều có nguồn và ngày.
- [ ] Câu miễn trừ luôn hiện, không phụ thuộc dữ liệu.
- [ ] Schema hợp lệ, không có `Offer`.
- [ ] Có kiểm thử tự động cho bốn trường hợp: đủ mẫu, thiếu mẫu, dữ liệu cũ, quy cách lẫn.
- [ ] Nút RFQ truyền đúng `source_page` để đo được chuyển đổi.
- [ ] Trang chạy được khi database trống, không lỗi 500.

## 16. Câu hỏi cần bạn chốt trước khi code

1. Có dùng luôn `/products/[slug]/market` không, hay muốn đường dẫn ngắn hơn như `/market/[slug]`?
2. Đơn vị chuẩn cho từng danh mục: hạt điều USD/kg, gạo USD/tấn, tôm USD/kg, cà phê USD/tấn. Có muốn đổi gì không?
3. Ai là người duyệt nội dung mùa vụ và giấy tờ? Cần một người chịu trách nhiệm, không phải duyệt tập thể.
4. Có sẵn sàng trả cho một nguồn dữ liệu thị trường trong 12 tháng tới không, hay giai đoạn 4 để sau?
5. Trang có hiện tiếng Việt không, hay chỉ tiếng Anh như trang buyer hiện tại?
6. Biểu đồ mùa vụ đặt sau lưới sản phẩm như đề xuất, hay ngay dưới intro? Đề xuất là sau lưới, để không đẩy danh sách nhà cung cấp xuống dưới màn hình đầu.
7. Có chấp nhận để trang market ở `noindex` tới khi khối khoảng giá hoàn thành không? Nếu có thì làm trang được ngay, không phải chờ.
