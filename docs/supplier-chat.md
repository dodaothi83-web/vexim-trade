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
- Email báo tin (giới hạn như chat nhà cung cấp): người mua nhắn thì báo nhân viên phụ trách, chưa ai nhận thì báo hộp thư chung (`RFQ_INTERNAL_EMAIL`); nhân viên trả lời thì báo người mua, link mở thẳng khung chat (`/?support=1`).
