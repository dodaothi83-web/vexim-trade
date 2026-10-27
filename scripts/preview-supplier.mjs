#!/usr/bin/env node
// node scripts/preview-supplier.mjs
//
// Thêm (hoặc đặt lại mật khẩu) một tài khoản NHÀ CUNG CẤP xem thử CHỈ trong kho
// local data/local-db.json, để mở được cổng NCC /supplier/portal trên máy chưa
// nối Supabase — cùng cách thức với scripts/preview-admin.mjs phía CRM.
//
// Tài khoản gắn với NCC "published" đầu tiên trong kho (mặc định là NCC seed
// dong-nai-cashew có sẵn sản phẩm đã duyệt). Muốn chỉ định NCC khác:
//   PREVIEW_SUPPLIER_ID=<id> node scripts/preview-supplier.mjs
//
// Không đụng tới Supabase, không ghi vào seed trong mã nguồn: xoá
// data/local-db.json là tài khoản này biến mất theo. Chạy lại script là có lại.
// Nhớ khởi động lại `npm run dev` sau khi chạy, vì server giữ DB trong bộ nhớ.
//
// Không dùng cho production.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DB = path.join(process.cwd(), "data", "local-db.json");
const EMAIL = (process.env.PREVIEW_SUPPLIER_EMAIL ?? "ncc@vex.im").trim().toLowerCase();
const PASSWORD = process.env.PREVIEW_SUPPLIER_PASSWORD ?? "vexim-ncc-2026";
const UID = "user-preview-supplier";
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
if (!Array.isArray(db.suppliers)) db.suppliers = [];

const wanted = process.env.PREVIEW_SUPPLIER_ID;
const supplier =
  (wanted && db.suppliers.find((s) => s.id === wanted || s.slug === wanted)) ||
  db.suppliers.find((s) => s.status === "published" && s.onboarding_status === "approved") ||
  db.suppliers.find((s) => s.status === "published");

if (!supplier) {
  console.error("Không tìm thấy NCC published nào trong kho local để gắn tài khoản.");
  process.exit(2);
}

const now = new Date().toISOString();
const row = {
  id: UID,
  email: EMAIL,
  name: `${supplier.display_name || supplier.trade_name || supplier.name} (NCC xem thử)`,
  role: "supplier",
  supplier_id: supplier.id,
  auth_provider: "local",
  password_hash: hashPassword(PASSWORD),
  signature_html: null,
  sender_email: null,
  phone: null,
  is_active: true,
  email_verified: true,
  locked: false,
  last_login_at: null,
  created_at: now,
  updated_at: now,
};

const at = db.users.findIndex((u) => u.id === UID || u.email === EMAIL);
if (at >= 0) db.users[at] = { ...db.users[at], ...row };
else db.users.push(row);

fs.writeFileSync(DB, JSON.stringify(db, null, 2));

console.log(`Đã ghi tài khoản NCC xem thử vào ${path.relative(process.cwd(), DB)}`);
console.log(`  email:    ${EMAIL}`);
console.log(`  mật khẩu: ${PASSWORD}`);
console.log(`  NCC:      ${supplier.id} (${supplier.display_name || supplier.name})`);
console.log("Khởi động lại máy chủ (npm run dev) nếu đang chạy, rồi mở /supplier/portal.");
console.log("Xoá data/local-db.json là tài khoản này mất theo. Không dùng cho production.");
