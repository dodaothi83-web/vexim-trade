# Tìm kiếm sản phẩm — giai đoạn 2

## Phạm vi

Thay đổi chỉ áp dụng cho `/search`. Trang chủ, trang danh mục, khu vực tài trợ và công thức điểm hiện tại không đổi. Sản phẩm vẫn phải qua các cổng công khai, duyệt, danh mục và ảnh như trước; không dùng hồ sơ demo hoặc thông tin liên hệ để tìm từ khóa, và không dùng gói tài trợ để xếp. Bộ so sánh hiện hành vẫn dùng các tín hiệu xác minh/chứng nhận đã tổng hợp ở máy chủ; hồ sơ gốc không gửi ra trình duyệt.

## Thứ tự sản phẩm

1. Toàn bộ từ trong truy vấn vẫn phải khớp các trường tìm kiếm công khai: tên/thuộc tính/quy cách sản phẩm, tên danh mục và danh mục cha, tên/tỉnh NCC. Không phân biệt hoa thường hoặc dấu tiếng Việt. Các kết quả khớp một phần trong từ và kết quả khớp qua tên NCC vẫn được giữ lại. Riêng `W320`/`WW320` và các mã W/WW tương tự được coi là hai cách viết tương đương khi tìm trong **sản phẩm**, theo cả hai chiều, nếu tên sản phẩm hoặc danh mục có “cashew”/“hạt điều”; không áp dụng cho ngành khác hay tự đổi tên NCC.
2. Xếp theo mức khớp: mã khớp nguyên trong sản phẩm trước (1–3 chữ, 2–5 số và có thể thêm một chữ cuối, như W320 hoặc ST25), sau đó số từ khớp trong sản phẩm/danh mục, rồi số từ khớp nguyên thay vì chỉ là một phần từ. Ví dụ, sản phẩm W320 đứng trước W3200 hoặc W240 chỉ khớp vì NCC tên “W320 Export”. Nếu quy cách **có cấu trúc** là W240 nhưng tên ghi W320, không tính đó là W320 khớp chính xác; kết quả yếu vẫn được giữ. Quy cách chỉ suy ra từ tên không được coi là chắc chắn mâu thuẫn vì tên có thể liệt kê nhiều loại.
3. Trong từng nhóm cùng mức khớp, xếp theo vòng: mỗi NCC một sản phẩm mỗi vòng khi còn hàng; trong vòng, tầng xác minh cao hơn trước, rồi đến điểm và tên theo bộ so sánh hiện hành. Nếu bằng nhau hoàn toàn, dùng ID sản phẩm để ổn định. Không có trần số sản phẩm/NCC; khi một NCC không còn sản phẩm, các NCC còn lại tiếp tục. Hết một nhóm mức khớp mới sang nhóm thấp hơn, nên các thẻ của một NCC có thể đứng liền nếu không còn NCC khác trong nhóm đó.
4. Xếp **xuyên tất cả danh mục trong phạm vi tìm kiếm, trước khi chia trang**; vòng không bắt đầu lại tại ranh giới trang. Mỗi thẻ giữ link tới danh mục, sản phẩm, NCC và báo giá. So sánh chỉ được mở khi có sản phẩm thực của NCC khác trong cùng danh mục, kể cả khi sản phẩm đối chiếu nằm ở trang khác.

Khối sản phẩm đứng trước khi có kết quả sản phẩm/danh mục phù hợp. Truy vấn khớp nguyên tên NCC từ nhiều từ thì khối NCC đứng trước; các truy vấn chỉ khớp yếu sản phẩm và khớp trực tiếp NCC cũng ưu tiên khối NCC. Khi có kết quả, bộ đếm tương ứng có link nhảy đến khối đó. Danh sách NCC vẫn có phân trang riêng.

## Giới hạn và kiểm thử

- Không suy nghĩa, sửa lỗi chính tả hoặc đồng nghĩa tổng quát; ngoài W/WW, vẫn là tìm từ trên dữ liệu công khai. Nên đối chiếu các cách ghi quy cách thực tế ở staging trước khi mở rộng thêm quy tắc.
- Mỗi lần chuyển trang là một yêu cầu đọc và xếp lại; nếu dữ liệu thay đổi giữa hai lần, thứ tự/trang có thể thay đổi. Các lần đọc PostgREST trong một yêu cầu cũng không phải snapshot giao dịch. Catalogue và thứ tự vẫn được xử lý trong bộ nhớ máy chủ; cần đo tải, độ trễ, bộ nhớ và kiểm RLS bằng dữ liệu staging thực, không ngoại suy từ test giả lập.
- `npm run check:search`: kiểm W320/W240/W3200 và xung đột quy cách, W/WW, tiếng Việt, từ khoá tên NCC, vòng theo tầng, nhiều danh mục, đối chiếu qua trang khác, 1.025 sản phẩm/43 trang và 1.009 NCC/85 trang trong bộ nhớ. `scripts/check-home-feed-order.mjs` kiểm riêng trang chủ không đổi.
- Các trọng số 30/30/15/15/10 và cách tính tầng hiện hành chưa thay đổi. Phương án thay công thức chỉ được mô phỏng, chưa duyệt để bật.
