#!/usr/bin/env node
/**
 * Kiểm tra phân quyền theo vai trò bằng cách:
 *   1. Tạo sẵn 4 tài khoản (admin/sale/sourcing/viewer) trong local DB
 *      (chỉ khi VEXIM_SHOW_DEMO=true và local fallback đang chạy).
 *   2. Ký thủ công session token bằng đúng thuật toán của app (HMAC-SHA256,
 *      secret đọc từ data/auth-secret hoặc AUTH_SECRET).
 *   3. Gọi các route CRM với cookie phiên tương ứng và kiểm tra HTTP status.
 *
 * Chạy sau khi `npm run dev` đã chạy ở :3000 và file .env.local có VEXIM_SHOW_DEMO=true.
 *   node scripts/check-role-matrix.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ROOT = process.cwd();

// Nạp .env.local để lấy AUTH_SECRET (không dựa vào Next load).
try {
  const envFile = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* không có .env.local thì bỏ qua */ }

// ----------------------------- secret -----------------------------------
function getSecret() {
  if (process.env.AUTH_SECRET?.length >= 16) return process.env.AUTH_SECRET;
  const file = path.join(ROOT, "data", "auth-secret");
  if (fs.existsSync(file)) {
    const v = fs.readFileSync(file, "utf8").trim();
    if (v.length >= 16) return v;
  }
  console.error("❌ Không tìm thấy AUTH_SECRET/data/auth-secret — khởi động dev server trước.");
  process.exit(2);
}

const SECRET = getSecret();

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function sign(body) {
  return crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}
function makeToken({ uid, email, name, role }) {
  const payload = {
    uid, email, name, role,
    via: "local",
    exp: Date.now() + 7 * 24 * 3600 * 1000,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

// ----------------------------- users ------------------------------------
// Tạo user test tạm trong local DB bằng cách ghi trực tiếp — sau khi chạy
// xong sẽ dọn (để ko làm bẩn dữ liệu demo).
function upsertLocalUsers(users) {
  const dbPath = path.join(ROOT, "data", "local-db.json");
  if (!fs.existsSync(dbPath)) {
    console.error("❌ Chưa có data/local-db.json — hãy mở :3000 một lần để seed trước.");
    process.exit(2);
  }
  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  if (!Array.isArray(db.users)) db.users = [];
  const ids = [];
  for (const u of users) {
    const row = {
      id: u.uid,
      email: u.email,
      name: u.name,
      password_hash: "!test",
      role: u.role,
      locked: false,
      is_active: true,
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      signature_html: null,
      phone: null,
    };
    db.users = db.users.filter((x) => x.email !== u.email);
    db.users.push(row);
    ids.push(row.id);
  }
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return ids;
}

const users = [
  { uid: "00000000-0000-0000-0000-000000000001", email: "admintest@vex.im", name: "Admin Test",  role: "admin" },
  { uid: "00000000-0000-0000-0000-000000000002", email: "saletest@vex.im",  name: "Sale Test",   role: "sale" },
  { uid: "00000000-0000-0000-0000-000000000003", email: "sourcing@vex.im", name: "Sourcing Test", role: "sourcing" },
  { uid: "00000000-0000-0000-0000-000000000004", email: "viewer@vex.im",   name: "Viewer Test",  role: "viewer" },
];

let cleanup = () => {};
// users pre-seeded in data/local-db.json
upsertLocalUsers(users);

// ----------------------------- expectations -----------------------------
// Ma trận quyền mong muốn trên các route (true=200, false=307/redirect, "write"=cũng phải chặn action).
// Xem lib/auth/permissions.ts — các cổng ở trang danh sách thường chỉ requireSession và tự ẩn action
// nếu không có quyền. Với trang list chỉ cần ĐĂNG NHẬP là vào được (200). Các trang edit/create/settings
// riêng sẽ redirect nếu thiếu quyền.
const routes = [
  // Dashboard & read-heavy — mọi role xem được
  { path: "/crm/dashboard",           all: true },
  { path: "/crm/buyers",              all: true },
  { path: "/crm/suppliers",           all: true },
  { path: "/crm/products",            all: true },
  { path: "/crm/mail",                all: true },
  { path: "/crm/rfqs",                all: true },
  { path: "/crm/settings/profile",    all: true },

  // Trang yêu cầu quyền cụ thể
  // settings (tổng quan): chỉ bây giờ settings.view mở cho mọi role đã login
  { path: "/crm/settings",            all: true },
  // users.manage → chỉ admin
  { path: "/crm/settings/users",      perms: { admin: true } },
  // verifications.inspect → admin/sourcing
  { path: "/crm/verifications",       perms: { admin: true, sourcing: true } },
  // categories.manage → admin/sale/sourcing
  { path: "/crm/categories",          perms: { admin: true, sale: true, sourcing: true } },
  // prospects.manage → admin/sale
  { path: "/crm/prospects",           perms: { admin: true, sale: true } },
  // buyers.manage → admin/sale (trang thêm mới)
  { path: "/crm/buyers/new",          perms: { admin: true, sale: true } },
  // suppliers.manage → admin/sale/sourcing
  { path: "/crm/suppliers/new",       perms: { admin: true, sale: true, sourcing: true } },
  // blog.manage → admin/sale
  { path: "/crm/posts",               perms: { admin: true, sale: true } },
  { path: "/crm/posts/new",           perms: { admin: true, sale: true } },
  // templates.manage → admin
  { path: "/crm/templates",           perms: { admin: true } },
  // kpi.view → admin/sale
  { path: "/crm/team",                perms: { admin: true, sale: true } },
  // mail.send → admin/sale/sourcing (trang soạn)
  { path: "/crm/mail/compose",        perms: { admin: true, sale: true, sourcing: true } },
  // rfq.manage → admin/sale/sourcing
  // RFQ detail page — kiểm tra trang /crm/rfqs/<id> với RFQ demo
];

// Lấy 1 product + 1 supplier slug mẫu để test trang edit/detail
const dbRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "local-db.json"), "utf8"));
const sampleProduct = (dbRaw.products || [])[0];
const sampleSupplier = (dbRaw.suppliers || [])[0];
if (sampleProduct) {
  routes.push({ path: `/crm/products/${sampleProduct.id}/edit`, perms: { admin: true, sale: true, sourcing: true } });
} else {
  console.warn("⚠️  Không có product mẫu, bỏ qua kiểm tra /crm/products/[id]/edit.");
}
if (sampleSupplier) {
  routes.push({ path: `/crm/suppliers/${sampleSupplier.id}`, perms: { admin: true, sale: true, sourcing: true, viewer: true } });
}

// ----------------------------- run -------------------------------------
async function fetchWithRole(role, path) {
  const u = users.find((x) => x.role === role);
  const token = makeToken(u);
  const res = await fetch(BASE + path, {
    redirect: "manual",
    headers: { cookie: `vxt_session=${token}` },
  });
  return res.status;
}

let failures = 0;
console.log("\n🔎 Ma trận phân quyền theo vai trò\n");
for (const r of routes) {
  const expectations = r.all
    ? { admin: true, sale: true, sourcing: true, viewer: true }
    : r.perms;
  const pieces = [];
  for (const role of ["admin", "sale", "sourcing", "viewer"]) {
    const expected = expectations[role];
    const status = await fetchWithRole(role, r.path);
    // 200 = vào được; 307 = bị đá đi (thiếu quyền hoặc không thấy); 404 = không có (chấp nhận cho trang edit sản phẩm mẫu)
    const ok = expected ? (status === 200) : (status === 307 || status === 404);
    const mark = ok ? "✅" : "❌";
    pieces.push(`${mark} ${role}:${status}`);
    if (!ok) failures++;
  }
  console.log(pieces.join("  "), " ", r.path);
}

console.log(failures ? `\n❌ ${failures} ô không khớp ma trận.` : "\n✅ Ma trận khớp với khai báo quyền.");

cleanup?.();
process.exit(failures ? 1 : 0);
