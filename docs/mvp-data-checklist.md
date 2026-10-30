# Checklist nạp dữ liệu cho MVP

Tài liệu này dùng để đội ngũ nạp dữ liệu thật vào hệ thống theo đúng thứ tự phụ thuộc: danh mục trước, nhà cung cấp sau, sản phẩm cuối cùng. Cứ tick từng ô khi làm xong. Không cần sửa code ở bất kỳ bước nào trong tài liệu này.

## Nguyên tắc bắt buộc

- Chỉ nạp dữ liệu thật. Không tạo nhà cung cấp, sản phẩm hay chứng nhận giả để trang trông đầy.
- Phần xác minh phải do nhân viên kiểm thật trên giấy tờ thật. Không tự đánh dấu Đạt cho bất kỳ mục nào chưa kiểm.
- Ảnh sản phẩm phải là ảnh thật của đúng sản phẩm đó. Không dùng ảnh lấy trên mạng.
- Giá chỉ công khai khi nhà cung cấp đã đồng ý và còn trong thời hạn xác nhận 180 ngày.
- Làm xong lớp nào kiểm tra ngay lớp đó trên trang công khai trước khi sang lớp tiếp theo.

## Phần 0. Việc kỹ thuật đi kèm

- [ ] Deploy bản code mới nhất lên production.
- [ ] Kiểm tra `https://www.veximtrade.com/robots.txt`: phải có dòng cho phép crawl trang công khai và dòng khai báo Sitemap.
- [ ] Gửi lại sitemap trong Google Search Console và xin index lại trang chủ.
- [ ] Mở trang chủ bản production, chắc chắn mục thống kê số hồ sơ nhà cung cấp không còn hiện con số nhỏ lẻ.

## Phần 1. Danh mục trọng điểm

Chọn 2 đến 3 ngành mà đội ngũ trả lời được yêu cầu báo giá trong 1 ngày làm việc. Gợi ý bắt đầu với Cashew và 1 đến 2 ngành mạnh nhất hiện có. Mỗi danh mục phải làm đủ các mục sau trong CRM:

- [ ] Trạng thái đã đăng (published).
- [ ] Bật cho phép index SEO (`seo_indexable`).
- [ ] Bật hiện trên trang chủ (`active_on_homepage`) và đặt thứ tự hiển thị.
- [ ] Ảnh đại diện danh mục kèm chữ thay thế (alt) mô tả đúng ảnh.
- [ ] Tên và dòng giới thiệu ngắn bằng tiếng Anh.
- [ ] Tiêu đề SEO và mô tả SEO bằng tiếng Anh. Nếu để trống hệ thống tự sinh, nên tự viết cho sát ngành hàng.
- [ ] Bảng thông số kỹ thuật của ngành (các cột và các dòng grade phổ biến).
- [ ] Kiến thức mua hàng cơ bản: MOQ thường gặp, đóng gói, cảng xuất, thời gian giao hàng, điều kiện thanh toán.
- [ ] Câu hỏi thường gặp của buyer về ngành hàng này, tối thiểu 3 câu.
- [ ] Bài giới thiệu ngành hàng bằng tiếng Anh, tối thiểu vài đoạn ngắn.
- [ ] Cấu hình các trường thuộc tính sản phẩm của ngành (ví dụ grade) để buyer lọc được.

Điều kiện đạt của một danh mục: mở trang `/products/<slug>` thấy đủ ảnh đại diện, bảng thông số, kiến thức mua hàng, FAQ và bài giới thiệu. Từ khi trang danh mục được sửa, các nội dung này hiển thị ngay cả khi chưa có sản phẩm nào.

Theo dõi tiến độ danh mục:

| Danh mục | Đã đăng | Nội dung CMS đủ | Bật index và trang chủ | Ghi chú |
| --- | --- | --- | --- | --- |
| Cashew | [ ] | [ ] | [ ] | |
| | [ ] | [ ] | [ ] | |
| | [ ] | [ ] | [ ] | |

## Phần 2. Nhà cung cấp

Mỗi danh mục trọng điểm cần 3 đến 5 nhà cung cấp công khai. Sao chép khối kiểm tra dưới đây cho từng nhà cung cấp:

```
Nhà cung cấp:
Danh mục đăng ký:

Hồ sơ doanh nghiệp
- [ ] Tên pháp lý, loại hình, tỉnh thành, người liên hệ, điện thoại, mặt hàng chính
- [ ] Đã chọn đúng danh mục kinh doanh trong phạm vi Vexim đã mở
- [ ] Mã số thuế dạng số (số tài khoản ngân hàng không bắt buộc)

Kiểm giấy tờ (nhân viên làm thật)
- [ ] Có ảnh hoặc PDF của ít nhất một trong ba giấy xác minh (đăng ký doanh nghiệp, ATTP, HACCP/ISO/FSSC/Halal) trong đợt kiểm
- [ ] Đã đối chiếu tên pháp nhân và mã số thuế trên giấy tờ
- [ ] Người duyệt khác người kiểm đã bấm duyệt

Hiển thị công khai
- [ ] Tên hiển thị cho buyer
- [ ] Tóm tắt tiếng Anh giới thiệu doanh nghiệp (bắt buộc có để được index)
- [ ] Ảnh đại diện và ảnh bìa thật của doanh nghiệp
- [ ] Đã chuyển trạng thái sang công khai (published)
```

Điều kiện đạt của một nhà cung cấp:

- Mở trang hồ sơ công khai thấy đúng tên, đúng tỉnh thành, có ảnh và tóm tắt tiếng Anh.
- Huy hiệu kiểm giấy tờ hiện trên hồ sơ. Nếu chưa đạt kiểm nào, hồ sơ phải hiện Under audit, không được hiện huy hiệu.
- Hồ sơ chỉ vào sitemap và được Google index khi đã công khai, có tóm tắt tiếng Anh và có ít nhất 1 sản phẩm sẵn sàng cho buyer (xem Phần 3). Hồ sơ công khai nhưng chưa có sản phẩm vẫn tính vào số thống kê trên trang chủ.

Theo dõi tiến độ nhà cung cấp:

| Nhà cung cấp | Danh mục | Kiểm giấy tờ đạt | Đã công khai | Ghi chú |
| --- | --- | --- | --- | --- |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |
| | | [ ] | [ ] | |

## Phần 3. Sản phẩm

Mỗi nhà cung cấp nạp 2 đến 4 sản phẩm thật. Sao chép khối kiểm tra dưới đây cho từng sản phẩm:

```
Sản phẩm:
Nhà cung cấp:

Nội dung
- [ ] Tên sản phẩm rõ ràng, đúng mặt hàng thật
- [ ] Danh mục thuộc đúng phạm vi nhà cung cấp đã đăng ký
- [ ] Có mô tả hoặc quy cách cụ thể (grade, độ ẩm, đóng gói, tiêu chuẩn nếu có)
- [ ] MOQ và thời gian giao hàng

Ảnh và tệp
- [ ] Ít nhất 1 ảnh chụp thật của sản phẩm đã tải lên
- [ ] Catalogue hoặc tài liệu sản phẩm nếu có
- [ ] Nhân viên đã chọn tệp được chia sẻ cho buyer (tệp nội bộ không tự công khai)

Duyệt và công khai
- [ ] Nhân viên đã duyệt nội dung sản phẩm
- [ ] Đã bật sẵn sàng gửi buyer (ready_for_buyer)
- [ ] Nếu muốn hiện giá: nhà cung cấp đã tích đồng ý công khai giá cho sản phẩm này,
      xác nhận chia sẻ giá của nhà cung cấp còn hạn, giá còn hiệu lực
```

Điều kiện đạt của một sản phẩm: mở trang danh mục thấy thẻ sản phẩm với ảnh thật, tên nhà cung cấp, MOQ và huy hiệu xác minh đúng với hồ sơ. Bấm vào thẻ mở được trang chi tiết sản phẩm. Giá chỉ hiện khi đủ điều kiện ở mục cuối, thiếu điều kiện thì hiện On request, đó là đúng thiết kế chứ không phải lỗi.

Các mốc tự hiển thị sau khi nạp sản phẩm:

- Có ít nhất 1 sản phẩm đạt điều kiện trong một danh mục: trang danh mục đó chuyển sang trạng thái có sản phẩm, trang chủ hiện mục Explore products.
- Trang chủ hiện tối đa 8 sản phẩm và mỗi nhà cung cấp tối đa 2 sản phẩm ở mục này, nên cần nhiều nhà cung cấp cùng có sản phẩm để mục này nhìn đa dạng.
- Tổng số hồ sơ nhà cung cấp công khai đạt 10: thống kê trên trang chủ bắt đầu hiển thị.

## Phần 4. Kiểm tra nghiệm thu sau khi nạp

Trang công khai:

- [ ] Trang chủ hiện ít nhất 2 danh mục trọng điểm và mục Explore products có sản phẩm thật.
- [ ] Từng trang danh mục trọng điểm hiện lưới sản phẩm, lọc theo grade bấm được, không còn trạng thái trống.
- [ ] Mở 1 hồ sơ nhà cung cấp: huy hiệu khớp kết quả kiểm thật, sản phẩm của họ hiện đúng.
- [ ] Mở 1 trang chi tiết sản phẩm: ảnh rõ, quy cách đúng, nút Request a quote bấm được.
- [ ] Trang /how-we-verify hiện link tới một hồ sơ mẫu thật.

Luồng vận hành:

- [ ] Gửi thử 1 RFQ từ phía buyer, chắc chắn đội ngũ nhận được và trả lời được trong quy trình hiện tại.
- [ ] Một nhà cung cấp thật tự đăng ký tài khoản và khai hồ sơ qua cổng 3 bước, nhân viên duyệt mở cổng, nhà cung cấp thêm được sản phẩm của mình.
- [ ] Đăng xuất và kiểm tra lại: tài khoản nhà cung cấp chưa được duyệt không thấy RFQ và không quản lý được sản phẩm.

SEO sau khi deploy:

- [ ] `https://www.veximtrade.com/sitemap.xml` có các trang danh mục và hồ sơ nhà cung cấp đạt điều kiện.
- [ ] Trong Google Search Console, kiểm tra trạng thái index của trang chủ, 1 trang danh mục và 1 hồ sơ nhà cung cấp.

## Ghi chú vận hành

- Thứ tự nạp không được đảo ngược. Chưa có danh mục thì nhà cung cấp không chọn được phạm vi kinh doanh. Chưa công khai nhà cung cấp thì sản phẩm không hiện cho buyer.
- Khi một nhà cung cấp bị trả hồ sơ để bổ sung, dùng đúng luồng yêu cầu sửa trong CRM thay vì sửa tay vào dữ liệu.
- Mỗi tuần rà lại danh sách: nhà cung cấp nào chưa có sản phẩm đạt điều kiện thì hồ sơ của họ vẫn chưa được index, cần nhắc bổ sung sản phẩm hoặc ảnh.
