// node --experimental-strip-types --no-warnings scripts/check-buyer-sign-in.mjs
//
// Đăng nhập của người mua là cửa duy nhất dẫn vào dữ liệu của khách, nên được kiểm bằng
// hàm thật (không chỉ đọc mã nguồn): phát token, nhập sai mã, chạm trần, dùng lại link.
import assert from "node:assert/strict";
import nodeCrypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
/** Bỏ comment trước khi kiểm "không chạm bảng nhân viên": lời giải thích được phép nhắc tên bảng. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((line) => !/^\s*(?:\/\/|\*)/.test(line)).join("\n");

/** Store giả: đúng năm hàm mà luồng token dùng, hành xử như bản local. */
function createStore() {
  const tokens = [];
  let seq = 0;
  return {
    tokens,
    async createBuyerSignInToken(input) {
      for (let i = tokens.length - 1; i >= 0; i -= 1) {
        if (tokens[i].email === input.email && !tokens[i].consumed_at) tokens.splice(i, 1);
      }
      const row = { id: `t${++seq}`, attempts: 0, consumed_at: null, created_at: new Date().toISOString(), ...input };
      tokens.push(row);
      return row;
    },
    async findBuyerSignInToken(email) {
      const live = tokens.filter((t) => t.email === email && !t.consumed_at && new Date(t.expires_at) > new Date());
      return live.length ? live[live.length - 1] : null;
    },
    async getBuyerSignInTokenByLinkHash(hash) {
      return tokens.find((t) => t.link_hash === hash) ?? null;
    },
    async consumeBuyerSignInToken(id) {
      const row = tokens.find((t) => t.id === id);
      if (!row || row.consumed_at) return false;
      row.consumed_at = new Date().toISOString();
      return true;
    },
    async bumpBuyerSignInAttempts(id) {
      const row = tokens.find((t) => t.id === id);
      row.attempts += 1;
      return row.attempts;
    },
    async deleteBuyerSignInTokens(email) {
      for (let i = tokens.length - 1; i >= 0; i -= 1) if (tokens[i].email === email) tokens.splice(i, 1);
    },
  };
}

const store = createStore();
const mod = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(read("lib/buyer/sign-in-token.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  {
    module: mod,
    exports: mod.exports,
    console,
    process,
    Buffer,
    setTimeout,
    require: (id) => {
      if (id === "server-only") return {};
      if (id === "node:crypto") return { __esModule: true, default: nodeCrypto, ...nodeCrypto };
      if (id === "@/lib/db") return { getStore: () => store };
      if (id === "@/lib/auth/secret") return { getAuthSecret: () => "test-secret" };
      throw new Error(`unexpected import ${id}`);
    },
  },
  { filename: "sign-in-token.ts" },
);

const tokens = mod.exports;
const EMAIL = "Buyer@Example.com";

/** Kết quả trả về từ ngữ cảnh vm có prototype khác, nên so bằng JSON. */
const shape = (value) => JSON.stringify(value);
const expect = (actual, expected, message) => assert.equal(shape(actual), shape(expected), message);

/* 1. Hạn dùng và trần số lần thử đúng như đã chốt. */
assert.equal(tokens.SIGN_IN_TTL_MS, 15 * 60_000, "Link và mã sống 15 phút");
assert.equal(tokens.MAX_CODE_ATTEMPTS, 5, "Năm lần nhập sai là hết");

/* 2. Phát thư: link và mã không được lưu dạng rõ. */
const issued = await tokens.issueSignInToken(EMAIL);
assert.match(issued.code, /^\d{6}$/, "Mã là 6 chữ số");
assert.equal(store.tokens.length, 1, "Một thư một dòng token");
const stored = store.tokens[0];
assert.equal(stored.email, "buyer@example.com", "Email lưu chữ thường");
assert.ok(!JSON.stringify(stored).includes(issued.code), "Không lưu mã dạng rõ");
assert.ok(!JSON.stringify(stored).includes(issued.linkToken), "Không lưu link dạng rõ");

/* 3. Sai mã thì tăng bộ đếm, đúng mã thì vào được và token chết. */
const wrong = issued.code === "000000" ? "000001" : "000000";
expect(await tokens.verifySignInCode(EMAIL, wrong), { ok: false, reason: "wrong_code" });
assert.equal(store.tokens[0].attempts, 1, "Sai một lần thì đếm một lần");

const good = await tokens.verifySignInCode("  BUYER@example.com ", issued.code);
expect(good, { ok: true, email: "buyer@example.com" }, "Nhập đúng mã (kèm khoảng trắng, chữ hoa) vẫn vào được");
assert.ok(store.tokens[0].consumed_at, "Token bị tiêu sau khi dùng");
expect(await tokens.verifySignInCode(EMAIL, issued.code), { ok: false, reason: "no_token" }, "Dùng lại mã thì hỏng");

/* 4. Chạm trần: mã chết hẳn, phải xin thư mới. */
const second = await tokens.issueSignInToken(EMAIL);
let last;
for (let i = 0; i < 5; i += 1) {
  const attempt = second.code === "111111" ? "111112" : "111111";
  last = await tokens.verifySignInCode(EMAIL, attempt);
}
expect(last, { ok: false, reason: "too_many_attempts" }, "Lần sai thứ năm chặn hẳn");
assert.equal(store.tokens.length, 0, "Chạm trần thì xoá token của email");

/* 5. Link: dùng một lần, dùng lại phải nói rõ là đã dùng. */
const third = await tokens.issueSignInToken(EMAIL);
expect(await tokens.verifySignInLink(third.linkToken), { ok: true, email: "buyer@example.com" });
expect(await tokens.verifySignInLink(third.linkToken), { ok: false, reason: "used" }, "Máy quét link mở trước thì người dùng nhận đúng câu đã dùng");
expect(await tokens.verifySignInLink("not-a-real-token"), { ok: false, reason: "no_token" });

/* 6. Link hết hạn. */
const fourth = await tokens.issueSignInToken(EMAIL);
store.tokens[store.tokens.length - 1].expires_at = new Date(Date.now() - 1000).toISOString();
expect(await tokens.verifySignInLink(fourth.linkToken), { ok: false, reason: "expired" });

/* 7. Phiên người mua là cookie RIÊNG, không có role, không đụng app_users. */
const buyerSession = code("lib/auth/buyer-session.ts");
assert.match(buyerSession, /BUYER_SESSION_COOKIE = "vxt_buyer"/, "Cookie riêng, không dùng chung với phiên nhân viên");
assert.match(buyerSession, /interface BuyerSession \{[\s\S]*?uid: string;[\s\S]*?email: string;[\s\S]*?exp: number;/, "Payload người mua không có role");
assert.doesNotMatch(buyerSession, /getUserByEmail|app_users|hasPermission/, "Luồng người mua không chạm bảng nhân viên hay bảng quyền");
assert.match(buyerSession, /BUYER_SESSION_DAYS = 30/, "Phiên nhớ 30 ngày");

/* 8. Mặt tiền: trang đăng nhập tồn tại, noindex, và có cả hai đường (mã + link). */
const page = read("app/(public)/buyer/sign-in/page.tsx");
assert.match(page, /index: false/, "Trang đăng nhập không được index");
assert.match(page, /BuyerSignInForm/, "Trang dùng form thật");
assert.ok(read("app/(public)/buyer/sign-in/verify/route.ts").includes("consumeBuyerLinkAction"), "Có route xử lý link trong thư");
const actions = read("app/(public)/buyer/sign-in/actions.ts");
assert.match(actions, /verifyFormChallenge\(\{ purpose: "buyer-sign-in"/, "Trang đăng nhập có challenge chống bot");
assert.match(actions, /checkAuthRateLimit\(\{ flow: "buyer-sign-in"/, "Có giới hạn lượt xin thư");
assert.doesNotMatch(code("app/(public)/buyer/sign-in/actions.ts"), /account exists|not registered|chưa có tài khoản/i, "Không tiết lộ email đã có tài khoản hay chưa");

console.log("✅ Đăng nhập người mua: mã 6 số và link dùng một lần, trần 5 lần thử, cookie riêng 30 ngày, không chạm app_users.");
