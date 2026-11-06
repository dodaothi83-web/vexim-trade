# Chat người mua ↔ nhà cung cấp ("Ask supplier")

Nút **Chat with supplier** (trước đây là Ask supplier) trên trang sản phẩm mở một cuộc trò chuyện trên Vexim, thay cho luồng cũ gửi email
trực tiếp kèm email người mua. Mỗi cặp người mua + nhà cung cấp có **một** cuộc trò chuyện; hỏi lại về sản
phẩm khác của cùng nhà cung cấp thì nối tiếp cuộc cũ, tin có nhãn "Về: <sản phẩm>".

## Ai thấy gì
- **Người mua** (tài khoản đã xác minh email): `/buyer/account/messages`.
- **Nhà cung cấp** (cổng đã duyệt): `/supplier/portal/messages`, có số chưa đọc trên menu.
- **Nhân viên**: `/crm/messages`, chỉ đọc; tab "Chờ nhà cung cấp quá 24 giờ".
- Nhà cung cấp **không thấy email người mua**, chỉ thấy tên công ty người mua đã khai.

## Email
Email chỉ là lời báo có tin mới, đi qua bộ gửi chung (`transport`). Một loạt tin liên tiếp chỉ ra một email:
gửi lại khi bên nhận đã đọc hết, hoặc sau 6 giờ. Trả lời phải làm trên Vexim.

## Chống spam
Người mua mở tối đa 20 cuộc mới mỗi 24 giờ; mỗi bên tối đa 20 tin mỗi 10 phút trong một cuộc;
tin dài tối đa 4.000 ký tự. Chỉ hỏi được sản phẩm đang công khai.

## Triển khai
1. Chạy `supabase/migrations/20261110_supplier_chat.sql` trên CSDL **trước** khi deploy.
2. Khối "Câu hỏi từ người mua" kiểu email cũ đã được gỡ khỏi cổng nhà cung cấp (trước đó chỉ có dữ liệu thử).

Mã nguồn: `lib/chat/core.ts` (quy tắc), `lib/chat/service.ts`, `lib/chat/viewer.ts`, `app/api/chat/*`,
`components/chat/chat-workspace.tsx`. Kiểm tra: `scripts/check-chat.mjs`.


## Chat với Vexim (người mua ↔ đội Vexim)

- Nút **Chat with Vexim** trên thanh công cụ cạnh phải mở khung chat nhỏ ở góc màn hình; người mua vẫn xem trang phía sau. Thay hẳn nút WhatsApp cũ.
- Bảng `support_conversations` (mỗi người mua một cuộc) và `support_messages` — migration `20261111_vexim_support_chat.sql`, **cần chạy trên Supabase**.
- Quyền: `support.manage` (Quản trị, Kinh doanh) đọc, trả lời, nhận xử lý; `support.view` (Chỉ xem) chỉ đọc. CRM: **Chat với người mua** (`/crm/support`), huy hiệu đếm cuộc nhân viên chưa đọc, có trong chuông thông báo.
- Trả lời một cuộc chưa ai nhận là tự nhận cuộc đó; có nút Nhận xử lý / Trả về chưa ai nhận.
- Người mua thấy tên gọi nhân viên (ví dụ "Dung · Vexim Trade"), không thấy email nội bộ. Nhân viên thấy trang người mua đang xem khi nhắn.
- Email báo tin (xem mục Email báo tin nhắn bên dưới): người mua nhắn thì báo nhân viên phụ trách, chưa ai nhận thì báo hộp thư chung (`RFQ_INTERNAL_EMAIL`); nhân viên trả lời thì báo người mua, link mở thẳng khung chat (`/?support=1`).

## Trạng thái online, đã gửi, đã xem (cả hai luồng chat)

- **Online/offline:** mỗi lần một bên gọi API chat (thanh công cụ của người mua 30 giây/lần, menu cổng nhà cung cấp 60 giây/lần, khung chat 6 giây/lần, hộp chat CRM) là ghi "lần cuối thấy" vào bảng `chat_presence` — migration `20261112_chat_presence.sql`, **cần chạy trên Supabase**. Thấy trong 2 phút là "Đang online", quá thì "Hoạt động 5 phút trước". Ghi tối đa 30 giây một lần mỗi bên.
- Đội Vexim là một bên: online khi có nhân viên có quyền trả lời đang mở hộp Chat với người mua trong CRM.
- **Đã gửi / đã xem:** đồng hồ khi đang gửi, một tích khi đã lưu, hai tích xanh khi bên kia đã mở cuộc trò chuyện tới tin đó (dựa trên mốc đã đọc sẵn có). Tin cuối của mình hiện thêm chữ "Đã gửi" / "Đã xem". Tin chưa đọc vẫn in đậm, chấm đỏ như trước.
- Chưa chạy migration thì chat vẫn chạy bình thường, chỉ không hiện trạng thái online.


## Email báo tin nhắn (gửi chậm, gộp, nhắc một lần)

Áp dụng cho cả chat nhà cung cấp và Chat với Vexim (`lib/chat/notify.ts`). Không còn gửi email ngay khi có tin.

1. **Chờ 10 phút, bỏ qua khi online:** chỉ báo tin còn chưa đọc sau 10 phút, và người nhận không đang mở Vexim (theo trạng thái online).
2. **Gộp:** mỗi người nhận một thư cho mọi cuộc đang chờ. Người mua nhận chung tin của các nhà cung cấp và của đội Vexim; nhà cung cấp nhận chung tin của nhiều người mua.
3. **Nhắc một lần:** chưa đọc sau 24 giờ kể từ thư đầu thì nhắc đúng một lần, rồi dừng tới khi người nhận đọc (cột `*_reminded_at`, migration `20261113_chat_notify_reminders.sql`, **cần chạy**; thiếu cột thì bỏ qua lần nhắc, thư đầu vẫn gửi).
- Chạy bằng `/api/cron/chat-notify` (cron-job.org, **5 phút một lần**, header `Authorization: Bearer <CRON_SECRET>`). Chưa cài lịch thì các lần người dùng tự hỏi tin mới cũng kích hoạt bộ quét, tối đa 3 phút một lần.
- Mỗi cuộc được "nhận việc" bằng cập nhật có điều kiện trước khi gửi, nên quét trùng không gửi trùng; gửi lỗi thì trả mốc lại để lần sau gửi.
