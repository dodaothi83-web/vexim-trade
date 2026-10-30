#!/usr/bin/env node
// node scripts/preview-admin.mjs
//
// Thêm (hoặc đặt lại mật khẩu) một tài khoản quản trị CHỈ trong kho local
// data/local-db.json, để mở được CRM trên máy chưa nối Supabase.
//
// Không đụng tới Supabase, không ghi vào seed trong mã nguồn: xoá data/local-db.json
// là tài khoản này biến mất theo. Chạy lại script là có lại.
//
//   node scripts/preview-admin.mjs
//   PREVIEW_ADMIN_EMAIL=an@abc.vn PREVIEW_ADMIN_PASSWORD=... node scripts/preview-admin.mjs
//
// Nếu máy đã có SUPABASE_URL + khoá Supabase thì dừng, vì lúc đó đăng nhập đi qua
// Supabase và tài khoản local không dùng tới.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DB = path.join(process.cwd(), "data", "local-db.json");
const EMAIL = (process.env.PREVIEW_ADMIN_EMAIL ?? "admin@veximtrade.local").trim().toLowerCase();
const PASSWORD = process.env.PREVIEW_ADMIN_PASSWORD ?? "vexim-preview-2026";
const UID = "user-preview-admin";
const KEYLEN = 64;

if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  console.error("Máy này đã cấu hình Supabase, đăng nhập đi qua Supabase. Không tạo tài khoản local.");
  process.exit(1);
}

if (!fs.existsSync(DB)) {
  console.error("Chưa có data/local-db.json. Chạy `npm run dev` một lần để sinh dữ liệu xem thử rồi chạy lại.");
  process.exit(1);
}

/** Cùng định dạng với lib/auth/password.ts: scrypt$<saltHex>$<hashHex> */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

const db = JSON.parse(fs.readFileSync(DB, "utf8"));
if (!Array.isArray(db.users)) db.users = [];

const now = new Date().toISOString();
const row = {
  id: UID,
  email: EMAIL,
  name: "Quản trị xem thử",
  role: "admin",
  supplier_id: null,
  auth_provider: "local",
  password_hash: hashPassword(PASSWORD),
  signature_html: null,
  sender_email: null,
  phone: null,
  is_active: true,
  last_login_at: null,
  created_at: now,
  updated_at: now,
};

const at = db.users.findIndex((u) => u.id === UID || u.email === EMAIL);
if (at >= 0) db.users[at] = { ...db.users[at], ...row };
else db.users.push(row);

fs.writeFileSync(DB, JSON.stringify(db, null, 2));

console.log(`Đã ghi tài khoản xem thử vào ${path.relative(process.cwd(), DB)}`);
console.log(`  email:    ${EMAIL}`);
console.log(`  mật khẩu: ${PASSWORD}`);
console.log("Khởi động lại máy chủ (npm run dev) nếu đang chạy, rồi mở /crm/sponsored.");
console.log("Xoá data/local-db.json là tài khoản này mất theo. Không dùng cho production.");
