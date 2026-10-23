#!/usr/bin/env node
// node scripts/check-sponsored-schema.mjs
//
// Đối chiếu migration đẩy sản phẩm với mã đang đọc ghi nó. Migration đã áp lên
// Supabase rồi thì không sửa lại được, nên thứ duy nhất còn kiểm được là mã và
// bảng có khớp nhau hay không: cột nào mã đọc mà bảng không có, hàm nào mã gọi mà
// migration không tạo, và các ràng buộc có đúng như đặc tả.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261028_sponsored_product_push.sql");
const types = read("lib/types.ts");
const supabase = read("lib/db/supabase.ts");
const events = read("lib/sponsored/events.ts");

/** Cắt phần thân của một câu `create table` và lấy tên cột ở đầu dòng. */
function tableColumns(name) {
  const start = sql.indexOf(`create table if not exists public.${name} (`);
  assert.ok(start >= 0, `Migration thiếu bảng ${name}`);
  const body = sql.slice(start, sql.indexOf("\n);", start));
  const columns = new Set();
  for (const line of body.split("\n").slice(1)) {
    const match = /^\s{2}([a-z_]+)\s+(uuid|text|timestamptz|numeric|date|bigint|boolean)\b/.exec(line);
    if (match) columns.add(match[1]);
  }
  return columns;
}

/* ---------------- Cột: kiểu dữ liệu trong mã phải có cột thật ---------------- */

const pushColumns = tableColumns("sponsored_pushes");
const dailyColumns = tableColumns("sponsored_push_daily");

const typeStart = types.indexOf("export interface SponsoredPush {");
assert.ok(typeStart >= 0, "Thiếu kiểu SponsoredPush trong lib/types.ts");
const typeBody = types.slice(typeStart, types.indexOf("\n}", typeStart));
const typeFields = new Set([...typeBody.matchAll(/^\s{2}([a-z_]+)\??:/gm)].map((m) => m[1]));

for (const field of typeFields) {
  assert.ok(pushColumns.has(field), `Kiểu SponsoredPush có trường ${field} nhưng bảng không có cột đó`);
}
for (const required of ["id", "surface", "category_slug", "supplier_id", "product_id", "status", "starts_at", "ends_at", "created_at"]) {
  assert.ok(pushColumns.has(required), `Bảng thiếu cột bắt buộc ${required}`);
  assert.ok(typeFields.has(required), `Kiểu SponsoredPush thiếu trường ${required}`);
}

/* ---------------- Giá trị: union trong mã phải bằng ràng buộc check ---------------- */

const sqlValues = (constraint) => {
  const match = new RegExp(`check \\(${constraint} in \\(([^)]+)\\)\\)`).exec(sql);
  assert.ok(match, `Migration thiếu ràng buộc check cho ${constraint}`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
};

const surfaceType = /export type SponsoredPushSurface = ([^;]+);/.exec(types);
assert.ok(surfaceType, "Thiếu kiểu SponsoredPushSurface");
const surfacesInCode = [...surfaceType[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
assert.deepEqual(surfacesInCode, sqlValues("surface"), "Bề mặt trong mã và trong bảng phải trùng nhau");

const statusInCode = [...(/status: ([^;]+);/.exec(typeBody)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
assert.deepEqual(statusInCode, sqlValues("status"), "Trạng thái trong mã và trong bảng phải trùng nhau");

/* ---------------- Thời hạn và bể gói ---------------- */

assert.match(sql, /interval '168 hours'/, "Ràng buộc thời hạn phải là 168 giờ");
assert.ok(!/interval '7 days'/.test(sql), "Không được quay lại cộng theo ngày lịch");
assert.match(sql, /pool_cap := case new\.surface when 'category' then 12 else 8 end/,
  "Bể phải là 12 gói mỗi danh mục và 8 gói trang chủ");

/* ---------------- Khoá và quyền ---------------- */

for (const table of ["sponsored_pushes", "sponsored_push_daily"]) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`),
    `${table} phải bật RLS`);
  assert.match(sql, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`),
    `${table} không được để anon đọc`);
}
assert.match(sql, /grant select, insert, update, delete on public\.sponsored_pushes to service_role/);
assert.match(sql, /primary key \(push_id, day, event_type\)/,
  "Bảng đếm phải khoá theo gói, ngày và loại sự kiện để phép cộng dồn không tạo dòng trùng");

/* ---------------- Hàm ghi nhận sự kiện: tên và tham số phải khớp ---------------- */

assert.match(sql, /function public\.record_sponsored_push_event\(p_push_id uuid, p_event_type text\)/);
const rpc = /db\.rpc\("record_sponsored_push_event", \{ ([^}]+) \}\)/.exec(events);
assert.ok(rpc, "events.ts phải gọi record_sponsored_push_event");
assert.deepEqual([...rpc[1].matchAll(/(p_[a-z_]+):/g)].map((m) => m[1]).sort(), ["p_event_type", "p_push_id"],
  "Tham số truyền vào hàm phải đúng tên migration đặt");

/* ---------------- Truy vấn đọc gói phải lọc trên cột có thật ---------------- */

const queryStart = supabase.indexOf("async listSponsoredPushes");
assert.ok(queryStart >= 0, "Thiếu listSponsoredPushes trong kho Supabase");
const query = supabase.slice(queryStart, supabase.indexOf("\n  },", queryStart));
for (const [, column] of query.matchAll(/\.(?:eq|gt|lte)\("([a-z_]+)"/g)) {
  assert.ok(pushColumns.has(column), `Truy vấn lọc theo cột ${column} nhưng bảng không có cột đó`);
}
assert.match(query, /\.eq\("status", "approved"\)/, "Chỉ gói đã duyệt mới được trả ra");
assert.match(query, /\.eq\("surface", surface\)/, "Phải lọc theo bề mặt");

/* ---------------- Đường lùi khi bảng chưa có ---------------- */

assert.match(query, /42P01|PGRST205/, "Thiếu đường lùi cho môi trường chưa áp migration");

console.log(`✅ check-sponsored-schema: ${pushColumns.size} cột gói, ${dailyColumns.size} cột đếm, hàm ghi nhận và ràng buộc khớp với mã`);
