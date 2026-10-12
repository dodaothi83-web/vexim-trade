// Kiểm tra quy tắc "ai thấy thư nào" trong Hộp thư — chạy: npm run check:mail
// (script tự chứa, không cần framework test: import trực tiếp module TS bằng type-stripping của Node)
import assert from "node:assert/strict";
import { isMyMail, isMailVisibleTo, visibleMailMessages } from "../lib/mail/visibility.ts";

const msg = (over) => ({
  id: "m1",
  buyer_id: null,
  prospect_id: null,
  created_by: null,
  kind: "manual",
  to_emails: [],
  cc_emails: [],
  thread_id: "buyer:new@us.com",
  ...over,
});
const owned = (buyerIds = [], prospectIds = []) => ({
  buyerIds: new Set(buyerIds),
  prospectIds: new Set(prospectIds),
});

const dung = {
  name: "Nguyễn Văn Dung",
  email: "dung.nguyen@veximtrade.com",
  senderAddress: "dung@veximtrade.com",
  scope: "Nguyễn Văn Dung",
};
const mai = { name: "Trần Mai", email: "mai@veximtrade.com", senderAddress: "mai2@veximtrade.com", scope: "Trần Mai" };
const admin = { name: "Admin", email: "admin@veximtrade.com", senderAddress: null, scope: null };

// 1) Thư nhân viên tự soạn cho buyer CHƯA có trong hệ thống: chính họ phải thấy
const outbound = msg({ id: "out", created_by: "Nguyễn Văn Dung", to_emails: ["new@us.com"] });
assert.equal(isMyMail(outbound, dung), true, "thư mình soạn phải thấy");
assert.equal(isMyMail(outbound, mai), false, "thư người khác soạn phải ẩn");

// 2) Buyer lạ trả lời (inbound, không buyer_id): thấy nhờ cùng mạch thư với thư ở câu 1
const reply = msg({ id: "in", kind: "inbound", created_by: "new@us.com", to_emails: ["dung@veximtrade.com"] });
assert.deepEqual(
  visibleMailMessages([reply, outbound], dung, owned())
    .map((m) => m.id)
    .sort(),
  ["in", "out"],
  "cả mạch thư phải hiện",
);
assert.equal(visibleMailMessages([reply, outbound], mai, owned()).length, 0, "đội khác không thấy");

// 3) Buyer viết trước về địa chỉ riêng của nhân viên (chưa từng có thư đi trong hệ thống)
const cold = msg({
  id: "cold",
  kind: "inbound",
  thread_id: "buyer:cold@us.com",
  created_by: "cold@us.com",
  to_emails: ["Dung Nguyen <dung@veximtrade.com>"],
});
assert.equal(isMyMail(cold, dung), true, "nhận ra địa chỉ dù To kèm tên hiển thị");
assert.equal(isMailVisibleTo(cold, mai, owned()), false, "không phải thư gửi cho mình thì ẩn");

// 4) Buyer có chủ: người phụ trách thấy, người khác không
const mine = msg({ id: "b1", buyer_id: "buyer-1", thread_id: "buyer:a@x.com", kind: "inbound", created_by: "a@x.com" });
const theirs = msg({
  id: "b2",
  buyer_id: "buyer-2",
  thread_id: "buyer:b@x.com",
  kind: "inbound",
  created_by: "b@x.com",
});
assert.deepEqual(
  visibleMailMessages([mine, theirs], dung, owned(["buyer-1"])).map((m) => m.id),
  ["b1"],
  "chỉ thư của buyer mình phụ trách",
);

// 5) Admin (scope = null): không lọc gì cả
assert.equal(visibleMailMessages([mine, theirs, reply, outbound], admin, owned()).length, 4, "admin thấy hết");

// 6) created_by chấp nhận cả tên lẫn email, không phân biệt hoa thường/khoảng trắng thừa
assert.equal(isMyMail(msg({ created_by: " nguyễn  văn  dung " }), dung), true, "khoảng trắng thừa vẫn khớp");
assert.equal(isMyMail(msg({ created_by: "NGUYỄN VĂN DUNG" }), dung), true, "không phân biệt hoa thường");
assert.equal(isMyMail(msg({ created_by: "dung.nguyen@veximtrade.com" }), dung), true, "created_by là email vẫn nhận ra");
assert.equal(isMyMail(msg({ created_by: "Nguyen Van Dung" }), dung), false, "khác người thì không khớp");

// 7) Bản nháp của mình cũng thuộc phạm vi của mình
assert.equal(isMailVisibleTo(msg({ id: "draft", created_by: "Nguyễn Văn Dung" }), dung, owned()), true, "nháp phải thấy");

console.log("check:mail — OK, 7 nhóm quy tắc Hộp thư đều đúng");
