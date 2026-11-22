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

## Hỏi lại tin mới nhẹ hơn (2026-11)

- **Chỉ tải tin mới:** khung chat hỏi lại với `GET /api/chat/{id}?after=<mốc>` (mốc = tin cuối lùi 10 giây, trùng thì bỏ theo id). Máy chủ chỉ đọc tin mới hơn mốc và trả bản gọn của cuộc (đã xem, online), không tra lại tên nhà cung cấp / công ty người mua, không tra lại thẻ sản phẩm khi không có tin mới.
- **Giãn nhịp khi im lặng:** 6 giây/lần khi vừa có trao đổi (mở cuộc, tin mới, đang gõ, vừa gửi) trong 2 phút; quá thì 15 giây/lần. Quay lại tab là hỏi ngay.
- **Huy hiệu chỉ đếm:** thanh công cụ người mua và menu cổng nhà cung cấp gọi `GET /api/chat?side=…&peek=1`, chỉ nhận `{ unread }`. Khung chat đang mở phát sự kiện `vexim:chat-unread` để huy hiệu cập nhật ngay khi đọc xong một cuộc.
- **Không nhân đôi tin đang gửi** (cả Chat với Vexim) khi lượt hỏi lại về trước lời đáp gửi tin.
- **Không giật cuộn:** người đọc đang kéo lên xem tin cũ thì tin mới không kéo khung xuống, chỉ hiện nút "Tin nhắn mới".
- Kiểm tra: `scripts/check-chat-polling.mjs` (trong `check:rfq`).

## Hộp "Chat với người mua" trong CRM hỏi lại nhẹ (2026-11)

Hộp chat của nhân viên (`components/crm/support-inbox.tsx`) làm giống chat người mua ↔ NCC ở trên:

- **Chỉ tải tin mới.** Mở cuộc mới tải đủ (tối đa 500 tin). Các lượt hỏi lại gửi `GET /api/crm/support/{id}?after=<mốc>`: mốc là tin cuối đã lưu lùi 10 giây để không sót tin ghi cùng lúc. Máy chủ (`listSupportMessages(id, 500, after)`) chỉ đọc tin mới hơn mốc và trả `partial: true` kèm bản gọn của cuộc (`supportConversationStatus`): phụ trách, đã xem, online. Bản gọn không tra lại người mua; tên công ty và link hồ sơ CRM giữ nguyên từ lần tải đủ. `?after=` sai định dạng thì bị bỏ qua (tải đủ).
- **Nhịp hỏi tự điều chỉnh.** 6 giây khi đang trao đổi (2 phút sau lúc mở cuộc, có tin mới, gõ hoặc gửi), 15 giây khi để yên, dừng khi ẩn tab và hỏi ngay khi quay lại. Nhận xử lý, trả về, và gửi tin đều chỉ hỏi phần mới, không tải lại cả cuộc.
- **Không trùng, không giật cuộn.** Tin ghép theo id. Tin đang gửi được thay bằng bản đã lưu (cùng nội dung, của mình, trong 60 giây), dù lượt hỏi lại về trước hay sau lời đáp gửi tin. Đang kéo lên đọc tin cũ thì tin mới không kéo xuống, mà hiện nút "Tin nhắn mới" (`data-testid="crm-support-new-messages"`).
- **Nhớ nhãn người mua / nhân viên.** `lib/chat/support.ts` nhớ tên công ty, link hồ sơ CRM và tên nhân viên phụ trách trong bộ nhớ máy chủ: 5 phút nếu tìm thấy, 1 phút nếu chưa có, tối đa 2000 mục. Danh sách cuộc (`/api/crm/support`, 15 giây/lần) vì vậy không tra lại mỗi lượt. Trạng thái online vẫn đọc mỗi lượt. Đổi tên công ty hay tên nhân viên thì sau tối đa 5 phút mới hiện (mỗi máy chủ nhớ riêng).
- Không cần migration: bảng `support_messages` đã có chỉ mục theo `(conversation_id, created_at)`.
- Kiểm tra: `scripts/check-crm-support-polling.mjs` (nằm trong `npm run check:rfq`).
