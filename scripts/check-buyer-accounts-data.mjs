// node --experimental-strip-types --no-warnings scripts/check-buyer-accounts-data.mjs
//
// Tài khoản người mua phải sống ở ba nơi tách biệt: `buyer_users` (đăng nhập),
// `buyers` (hồ sơ CRM nhân viên đọc) và `app_users` (nhân viên nội bộ). Script này
// khoá ranh giới đó, vì trộn lại sẽ mở đường cho người mua lọt vào hệ phân quyền.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

/* 1. Kiểu dữ liệu có thật và đúng hình dạng. */
const types = read("../lib/types.ts");
assert.match(types, /export interface BuyerUser \{[\s\S]*?email: string;/, "Có kiểu BuyerUser với email");
assert.match(types, /saved: BuyerSavedList;/, "Danh sách đã lưu nằm trên tài khoản, không phải bảng riêng");
assert.match(types, /export interface BuyerSignInToken \{[\s\S]*?code_hash: string;/, "Token lưu mã đã băm");
assert.match(types, /link_hash: string;/, "Token lưu link đã băm");

/* 2. Store có đủ hàm cho luồng đăng nhập và cho /my. */
const storeTypes = read("../lib/db/types.ts");
for (const fn of [
  "getBuyerByEmail",
  "getBuyerUserByEmail",
  "createBuyerUser",
  "updateBuyerUser",
  "deleteBuyerUser",
  "createBuyerSignInToken",
  "findBuyerSignInToken",
  "getBuyerSignInTokenByLinkHash",
  "consumeBuyerSignInToken",
  "bumpBuyerSignInAttempts",
  "deleteBuyerSignInTokens",
]) assert.match(storeTypes, new RegExp(`\\b${fn}\\(`), `DataStore có ${fn}`);
assert.match(storeTypes, /buyerId\?: string/, "listRfqs lọc được theo người mua");

/* 3. Hai cài đặt store cùng có các hàm đó. */
for (const path of ["../lib/db/local.ts", "../lib/db/supabase.ts"]) {
  const src = read(path);
  for (const fn of ["getBuyerUserByEmail", "consumeBuyerSignInToken", "getBuyerSignInTokenByLinkHash"])
    assert.match(src, new RegExp(`async ${fn}\\(`), `${path} cài đặt ${fn}`);
}

/* 4. Token chỉ tiêu được một lần, kể cả khi hai lời gọi chạy song song. */
const supabase = read("../lib/db/supabase.ts");
assert.match(supabase, /\.is\("consumed_at", null\)/, "Tiêu token là thao tác nguyên tử");

/* 5. Bảng mới không đụng app_users, và khoá liên kết với yêu cầu là email. */
const schema = read("../supabase/schema.sql");
assert.match(schema, /create table if not exists public\.buyer_users/, "schema có buyer_users");
assert.match(schema, /create unique index if not exists buyer_users_email_key/, "email là duy nhất");
const buyerUsersBlock = schema.slice(schema.indexOf("create table if not exists public.buyer_users"));
assert.doesNotMatch(buyerUsersBlock.split("create table if not exists public.buyer_sign_in_tokens")[0],
  /references public\.app_users/, "buyer_users không tham chiếu app_users");

const migration = read("../supabase/migrations/20261105_buyer_accounts.sql");
assert.match(migration, /revoke all on table public\.buyer_users from public, anon, authenticated/,
  "Bảng người mua không lộ ra ngoài");
assert.match(migration, /buyers_email_lower_idx/, "Tra yêu cầu theo email có index");

/* 6. Không có hàm nào của người mua gọi tới bảng nhân viên. */
const local = read("../lib/db/local.ts");
const buyerSection = local.slice(local.indexOf("async getBuyerUser("), local.indexOf("async listProspects("));
assert.doesNotMatch(buyerSection, /db\.users/, "Luồng tài khoản người mua không ghi vào bảng nhân viên");

console.log("✅ Tài khoản người mua: bảng riêng, token băm một lần, liên kết qua email, không đụng app_users.");
