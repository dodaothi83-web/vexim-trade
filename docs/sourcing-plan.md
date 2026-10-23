# Kế hoạch tìm nguồn: danh mục và sản phẩm cần tuyển

Tài liệu cho đội thu mua và đội kiểm duyệt. Mục đích là biết tuần này đi tìm hàng gì, của ai, ở đâu, và khi nào thì đủ điều kiện mở một danh mục ra công khai.

Cập nhật theo cây danh mục thật trong `data/local-db.json` ngày 23/10/2026.

## 1. Vì sao không phải ba danh mục

Ba danh mục đang chạy không phải giới hạn của việc tuyển. Chúng chỉ là phần đã xong.

Mỗi danh mục là một mặt sàn riêng: một trang công khai, một lưới sản phẩm, một bể tài trợ 12 suất, một cụm từ khoá người mua tìm. Thêm một danh mục không làm danh mục cũ loãng đi, vì hai danh mục không dùng chung suất.

Cái có giới hạn là **số nhà cung cấp trong một danh mục**: trần 3 thẻ mỗi nhà ở lưới, 2 thẻ mỗi nhà ở trang chủ. Vì thế tuyển nhà thứ bảy cho quế không làm quế tốt hơn. Nhưng mở danh mục thứ tư thì cả đội có thêm việc thật.

## 2. Khi nào một danh mục được coi là mở được

Ba mốc, lấy đúng từ mã nguồn:

| Mốc | Điều kiện | Ý nghĩa |
| --- | --- | --- |
| Hiện được trên trang chủ | 8 sản phẩm, 3 nhà cung cấp | Lưới sản phẩm đứng trên lưới danh mục, không phải dải thẻ thưa |
| Mở trang danh mục | 8 sản phẩm, 3 nhà cung cấp | Trang có hàng thật để người mua ở lại |
| Bán hết bể tài trợ | 12 sản phẩm, 6 nhà cung cấp | Đủ 12 gói, và còn dư khi một nhà hết hạn xác minh |

Mục tiêu cho mỗi danh mục đã mở: **12 sản phẩm từ 6 nhà cung cấp**.

## 3. Bốn đợt triển khai

Không mở song song quá ba danh mục mới cùng lúc. Mỗi danh mục mới cần một lượt kiểm hồ sơ, một lượt duyệt ảnh, một lượt soát giá và mùa vụ. Mở mười danh mục cùng lúc thì đội kiểm duyệt thành nút cổ chai, và trang nào cũng mỏng.

### Đợt 1: lấp đầy ba danh mục đang chạy

| Danh mục | Đang có | Cần thêm |
| --- | --- | --- |
| Pepper | 8 sản phẩm, 5 nhà | 4 sản phẩm, 1 nhà |
| Cashew kernels | 8 sản phẩm, 4 nhà | 4 sản phẩm, 2 nhà |
| Cinnamon and star anise | 11 sản phẩm, 6 nhà | 1 sản phẩm, 0 nhà |

Tổng: 9 sản phẩm, 3 nhà cung cấp.

**Pepper.** Đã có 500, 550, 570 g/l, tiêu trắng 600 g/l.

| Sản phẩm cần tìm | Ghi chú |
| --- | --- |
| Đen 580 g/l, ASTA | Hạng cao nhất, chưa có |
| Đen 550 g/l, hữu cơ | Chưa có chứng nhận hữu cơ |
| Trắng 630 g/l | Đang chỉ có trắng 600 |
| Đen 550 g/l, hạt nhẹ dưới 2% | Thông số xuất khẩu chuẩn |

Nguồn: Đắk Lắk, Gia Lai, Đắk Nông. Một nhà mới, giao từ hai sản phẩm trở lên.

**Cashew kernels.** Đã có W320, W240, W450, WS.

| Sản phẩm cần tìm | Ghi chú |
| --- | --- |
| W180 | Hạng cao nhất, chưa có |
| W210 | Hạng cao thứ hai |
| LP (large pieces) | Nhóm mảnh lớn |
| SW (small white) | Nhóm hạt nhỏ |

Nguồn: Bình Phước và Đồng Nai, hai nhà mới, mỗi nhà hai sản phẩm.

**Cinnamon and star anise.** Đã có quế thanh, quế chẻ 2.5 đến 5 mm, hồi vụ xuân và vụ thu.

| Sản phẩm cần tìm | Ghi chú |
| --- | --- |
| Bột quế, hoặc quế vỡ | Toàn bộ 11 sản phẩm hiện tại là dạng thanh và chẻ |

Lấy từ nhà đang có. Không tuyển thêm nhà quế.

### Đợt 2: mở Coffee, Rice, Coconut

Ba danh mục này đã có sẵn trong CRM ở trạng thái chờ, chỉ thiếu hàng và cấu hình.

**Coffee.** Việt Nam xuất khẩu khoảng 8,9 tỷ USD cà phê năm 2025, nhóm lớn nhất trong nông sản. Người mua tìm nhiều nhất trong toàn bộ danh mục.

| Sản phẩm cần tìm |
| --- |
| Robusta G1 sàng 18 |
| Robusta G2 sàng 16 |
| Robusta washed G1 |
| Robusta honey process |
| Arabica Cầu Đất washed |
| Arabica Sơn La natural |
| Robusta rang mộc, đóng bao 60 kg |
| Arabica rang mộc, đóng bao 60 kg |

Nguồn: Đắk Lắk, Lâm Đồng, Gia Lai, Sơn La, Đắk Nông. Cần 6 nhà.

**Rice.** Danh mục khó nhất trong ba vì biên lợi nhuận mỏng, cạnh tranh thuần giá, và giá lên xuống theo từng vụ. Vẫn nên mở vì nhu cầu tìm kiếm lớn.

| Sản phẩm cần tìm |
| --- |
| Gạo trắng 5% tấm |
| Gạo trắng 15% tấm |
| Gạo trắng 25% tấm |
| Gạo thơm Jasmine |
| Gạo ST25 |
| Gạo nếp hạt dài |
| Gạo lứt |
| Gạo Nhật, nhóm Japonica |

Nguồn: An Giang, Kiên Giang, Đồng Tháp, Sóc Trăng, Long An. Cần 6 nhà, ưu tiên nhà có nhà máy xay xát riêng.

**Coconut.** Đơn giản hơn rice vì sản phẩm chế biến giữ được giá và ít phụ thuộc mùa.

| Sản phẩm cần tìm |
| --- |
| Cơm dừa sấy khô, độ béo cao |
| Cơm dừa sấy khô, độ béo thấp |
| Dầu dừa nguyên chất |
| Nước cốt dừa đóng hộp |
| Nước dừa đóng lon |
| Mứt dừa sấy |
| Than hoạt tính từ vỏ dừa |
| Chỉ xơ dừa, dạng nén |

Nguồn: Bến Tre, Trà Vinh, Vĩnh Long, Tiền Giang. Cần 6 nhà.

### Đợt 3: mở Tea, Honey, Noodles and vermicelli

**Tea.**

| Sản phẩm cần tìm |
| --- |
| Trà đen CTC |
| Trà đen mảnh, xuất khẩu |
| Trà xanh Thái Nguyên |
| Trà ô long |
| Trà ướp hương nhài |
| Trà sen |
| Trà túi lọc |
| Trà Matcha, nếu tìm được nhà đạt |

Nguồn: Thái Nguyên, Lâm Đồng, Yên Bái, Hà Giang, Nghệ An. Cần 6 nhà.

**Honey.**

| Sản phẩm cần tìm |
| --- |
| Mật ong hoa nhãn |
| Mật ong hoa cà phê |
| Mật ong hoa cao su |
| Mật ong rừng |
| Mật ong keo |
| Mật ong kết tinh tự nhiên |
| Mật ong đóng chai bán lẻ |
| Sáp ong, nếu nhà có |

Nguồn: Đồng Tháp, Tiền Giang, Đắk Lắk, Lâm Đồng, Bình Phước. Cần 6 nhà.

**Noodles and vermicelli.**

| Sản phẩm cần tìm |
| --- |
| Bún khô |
| Phở khô |
| Miến dong |
| Mì gạo |
| Bánh tráng |
| Bánh phở tươi, đóng gói hút chân không |
| Nui gạo |
| Bún tươi, nếu tìm được nhà đủ điều kiện xuất khẩu |

Nguồn: Bình Dương, Đồng Tháp, Cần Thơ, Bắc Giang. Cần 6 nhà.

### Đợt 4: mở Dried fruit, Dragon fruit, Macadamia, Processed foods

Nhóm này mở sau khi bốn đợt trên đã ổn định, vì mỗi danh mục cần cấu hình thông số riêng khá nặng.

**Dried fruit.**

| Sản phẩm cần tìm |
| --- |
| Xoài sấy dẻo |
| Xoài sấy giòn |
| Mít sấy |
| Chuối sấy |
| Chanh dây cô đặc |
| Nhãn sấy |
| Vải sấy |

**Dragon fruit.** Ruột trắng, ruột đỏ, thanh long sấy, thanh long sấy bột. Đây là danh mục hàng tươi, khó xuất khẩu với lô nhỏ, nên chỉ mở khi có nhà đã có kinh nghiệm container lạnh.

**Macadamia.** Nhân N20, nhân N30, macadamia sấy, macadamia rang muối. Nguồn: Lâm Đồng, Đắk Lắk, Sơn La.

**Processed foods.** Nước mắm, tương ớt, mì ăn liền, đồ hộp, gia vị pha sẵn. Nhóm này cần giấy chứng nhận an toàn thực phẩm chặt hơn các nhóm khác, nên để cuối.

## 4. Tổng khối lượng

| Đợt | Danh mục mới | Sản phẩm | Nhà cung cấp |
| --- | --- | --- | --- |
| 1 | 0 | 9 | 3 |
| 2 | 3 | 36 | 18 |
| 3 | 3 | 36 | 18 |
| 4 | 4 | 30 | 22 |
| **Cộng** | **10** | **111** | **61** |

Nếu chỉ làm đợt 1 và đợt 2, Vexim có 6 danh mục đang chạy, 6 bể tài trợ, và khoảng 45 sản phẩm đã kiểm.

## 5. Việc phải sửa trước khi thêm hàng

Cây danh mục đang có hai bản song song, và bản đang chạy không phải bản nằm trong cây:

| Danh mục đang chạy, có sản phẩm | Bản rỗng nằm trong cây |
| --- | --- |
| `cashew-kernels`, đứng riêng ở cấp gốc, 8 sản phẩm | `nuts-kernels` chứa `cashew`, 0 sản phẩm |
| `cinnamon-star-anise`, đứng riêng ở cấp gốc, 11 sản phẩm | `pepper-spices` chứa `cinnamon` và `star-anise`, 0 sản phẩm |

Riêng `pepper` đã nằm đúng dưới `pepper-spices` nên không phải sửa.

Nếu cứ thêm hàng cho cả hai bản, cùng một mặt hàng sẽ có hai địa chỉ, sản phẩm bị chia đôi, và Google nhận hai trang gần giống nhau. Việc này phải chốt trước khi đội đi tuyển, không phải sau.

Hướng xử lý: đặt danh mục đang chạy làm nhóm con dưới nhóm cha, chuyển sản phẩm sang, rồi bỏ bản rỗng. Danh mục đang chạy giữ nguyên slug nên không mất địa chỉ đã có.

Việc thứ hai: danh mục pepper chưa có trường quy cách, nên trang pepper không lọc được theo g/l. Đây là nhập liệu trong CRM, làm trước khi tuyển thêm tiêu.

Việc thứ ba: trang chủ chỉ lấy tối đa 4 danh mục gốc. Muốn có 10 danh mục mà không phá bố cục trang chủ thì phải dùng đúng hai cấp: khoảng 6 nhóm cha làm thẻ, các nhóm con nằm bên trong thẻ cha. Cây hiện tại đã chia đúng hướng này, chỉ cần chuyển các danh mục đang chạy vào.

## 6. Điều không nên làm

Không mở đồng thời cả 10 danh mục. Trang danh mục có 3 sản phẩm trông giống sàn rỗng, và người mua vào lần đầu sẽ không quay lại. Quy tắc giữ `noindex` cho tới khi khối giá chạy ổn định cũng vì lý do này.

Không tuyển thêm nhà cho quế khi đã có 6 nhà.

Không mở seafood. Quyết định này đã chốt vì yêu cầu kiểm chứng và chứng từ khác hẳn nhóm nông sản khô.
