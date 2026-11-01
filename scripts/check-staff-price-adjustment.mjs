// node scripts/check-staff-price-adjustment.mjs
// Vì sao sản phẩm bị chặn đăng sau khi đã chốt giá, và cách Vexim chốt giá thay
// nhà cung cấp ngay trên trang duyệt. Chạy trên PGlite với migration thật.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const productId = '22222222-2222-2222-2222-222222222222';
const supplier = '55555555-5555-5555-5555-555555555555';
const actor = '33333333-3333-3333-3333-333333333333';

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.categories (id uuid primary key);
  create table public.supplier_products (
    id uuid primary key, supplier_id uuid not null, name text not null default 'Vỏ quế',
    slug text, category text default 'cassia', supplier_category_proposal text default 'cassia',
    reviewed_category_slug text, spec text default 'Quy cách', description text default 'Mô tả',
    unit text default 'kg', moq text, moq_qty integer, moq_unit text, currency text default 'USD',
    incoterm text default 'FOB', incoterm_place text, export_port text, payment_terms text,
    ref_price numeric, ref_price_max numeric, price_publicly_visible boolean not null default true,
    lead_time_days integer, specs jsonb not null default '{}',
    supplier_review_status text not null default 'pending', supplier_review_note text,
    ready_for_buyer boolean not null default false, supplier_originated boolean not null default true,
    name_i18n jsonb not null default '{}', translation_meta jsonb not null default '{}',
    images jsonb, featured_media_id uuid, keywords text[],
    updated_at timestamptz not null default now()
  );
  insert into public.categories values ('11111111-1111-1111-1111-111111111111');
  insert into public.supplier_products (id, supplier_id, specs) values ('${productId}', '${supplier}', '{"moisture":"13%"}');
`);
await db.exec(migration('20261053_quantity_price_foundation.sql'));
// Hai cột này do các migration sau thêm; phép thử chỉ cần phần định nghĩa cột.
await db.exec(`alter table public.product_quantity_price_revisions
  add column if not exists product_updated_at timestamptz,
  add column if not exists product_context jsonb`);
// Chỉ lấy hàm dựng bản chụp thông tin sản phẩm; phần còn lại của migration đó
// phụ thuộc bảng khác không cần cho phép thử này.
await db.exec(migration('20261057_quantity_review_product_context.sql')
  .match(/create or replace function public\.quantity_product_review_context[\s\S]*?\$\$;/)[0]);
await db.exec(migration('20261078_quantity_first_price_with_product.sql')
  .match(/create or replace function public\.quantity_product_review_context_matches[\s\S]*?\$\$;/)[0]);
await db.exec(migration('20261103_staff_price_adjustment.sql'));

const context = async () => (await db.query(
  `select public.quantity_product_review_context(to_jsonb(p)) as ctx from public.supplier_products p where id = $1`, [productId])).rows[0].ctx;
const matches = async () => (await db.query(`select public.quantity_product_review_context_matches(
  (select product_context from public.product_quantity_price_revisions where product_id = $1 and status = 'approved' order by created_at desc limit 1),
  (select public.quantity_product_review_context(to_jsonb(p)) from public.supplier_products p where id = $1)) as ok`, [productId])).rows[0].ok;
const diff = async () => (await db.query(`select public.quantity_product_price_context_diff($1) as result`, [productId])).rows[0].result;

// Bảng giá gửi kèm sản phẩm: khớp ngay, không có gì lệch.
await db.query(`insert into public.product_quantity_price_revisions
  (product_id,status,grade,incoterm,tiers,warnings,confirmed_at,product_updated_at,product_context)
  values ($1,'pending','A','FOB','[{"minKg":1000,"priceUsdPerKg":5.5}]','[]',now(),now(),$2)`,
  [productId, JSON.stringify(await context())]);
let result = await diff();
assert.equal(result.status, 'diff');
assert.deepEqual(result.changed, [], 'Bảng giá vừa gửi kèm sản phẩm thì không lệch trường nào');
assert.equal(result.revision_status, 'pending');

// Sửa tên sản phẩm sau khi gửi giá: đây chính là lý do bị chặn đăng.
await db.query(`update public.supplier_products set name = 'Vỏ quế loại 1', updated_at = now() where id = $1`, [productId]);
result = await diff();
assert.deepEqual(result.changed, ['name'], 'Nêu đúng tên trường đã đổi');
// Thuộc tính sản phẩm đổi thì báo tên thuộc tính, không báo cả cụm specs.
await db.query(`update public.supplier_products set specs = '{"moisture":"12%","color":"nâu"}' where id = $1`, [productId]);
result = await diff();
assert.deepEqual(result.changed.sort(), ['name', 'specs.color', 'specs.moisture'].sort());
// Dịch AI và trạng thái duyệt không được tính là thay đổi thông tin.
await db.query(`update public.supplier_products set name_i18n = '{"en":"Cassia whole"}',
  translation_meta = '{"origin":"ai"}', supplier_review_status = 'pending' where id = $1`, [productId]);
assert.deepEqual((await diff()).changed.sort(), ['name', 'specs.color', 'specs.moisture'].sort(), 'Bản dịch không tạo thêm lệch');

// Vexim chốt giá thay nhà cung cấp: bảng cũ bị thay thế, bảng mới khớp sản phẩm hiện tại.
await db.query(`update public.supplier_products set specs = specs || '{"price_review_summary":"Nhà cung cấp đã đổi giá"}' where id = $1`, [productId]);
const saved = (await db.query(`select public.staff_set_quantity_price($1,$2,'A','CIF',
  '[{"minKg":2000,"priceUsdPerKg":6.25}]','[]') as result`, [productId, actor])).rows[0].result;
assert.equal(saved.status, 'saved');
const revisions = (await db.query(`select id,status,incoterm,tiers,reviewed_by,confirmed_at,product_context
  from public.product_quantity_price_revisions where product_id = $1 order by created_at`, [productId])).rows;
const approved = revisions.filter((row) => row.status === 'approved');
assert.equal(revisions.filter((row) => row.status === 'pending').length, 0, 'Không để bảng giá cũ nằm chờ duyệt');
assert.equal(approved.length, 1, 'Chỉ một bảng giá đang áp dụng');
assert.equal(approved[0].id, saved.revision_id);
assert.equal(approved[0].reviewed_by, actor, 'Người chốt giá được ghi vào bảng giá');
assert.ok(approved[0].confirmed_at instanceof Date);
assert.equal(approved[0].incoterm, 'CIF');
assert.deepEqual(approved[0].tiers, [{ minKg: 2000, priceUsdPerKg: 6.25 }]);
assert.equal(await matches(), true, 'Bảng giá mới gắn với thông tin sản phẩm hiện tại');
assert.deepEqual((await diff()).changed, [], 'Hết lệch sau khi chốt lại giá');
const afterProduct = (await db.query(`select specs, updated_at from public.supplier_products where id = $1`, [productId])).rows[0];
assert.equal('price_review_summary' in afterProduct.specs, false, 'Ghi chú yêu cầu gửi lại giá được gỡ khi giá đã khớp');
assert.equal(afterProduct.specs.moisture, '12%', 'Không mất thuộc tính sản phẩm');

// Dữ liệu rác bị từ chối trước khi ghi.
const reject = async (sql) => Object.values((await db.query(sql)).rows[0])[0].status;
const tiers = `'[{"minKg":1,"priceUsdPerKg":1}]'`;
assert.equal(await reject(`select public.staff_set_quantity_price('${productId}','${actor}','','FOB',${tiers},'[]')`), 'invalid');
assert.equal(await reject(`select public.staff_set_quantity_price('${productId}','${actor}','A','XYZ',${tiers},'[]')`), 'invalid');
assert.equal(await reject(`select public.staff_set_quantity_price('${productId}','${actor}','A','FOB','[]','[]')`), 'invalid');
assert.equal(await reject(`select public.staff_set_quantity_price(null,'${actor}','A','FOB',${tiers},'[]')`), 'invalid');
assert.equal(await reject(`select public.staff_set_quantity_price('44444444-4444-4444-4444-444444444444','${actor}','A','FOB',${tiers},'[]')`), 'missing_product');

const grants = (await db.query(`select
  has_function_privilege('anon','public.staff_set_quantity_price(uuid,uuid,text,text,jsonb,jsonb)','execute') as anon_staff,
  has_function_privilege('authenticated','public.staff_set_quantity_price(uuid,uuid,text,text,jsonb,jsonb)','execute') as user_staff,
  has_function_privilege('service_role','public.staff_set_quantity_price(uuid,uuid,text,text,jsonb,jsonb)','execute') as service_staff,
  has_function_privilege('anon','public.quantity_product_price_context_diff(uuid)','execute') as anon_diff`)).rows[0];
assert.deepEqual(grants, { anon_staff: false, user_staff: false, service_staff: true, anon_diff: false });
console.log('Staff price adjustment: names the changed fields and lets Vexim approve a price for the supplier');
await db.close();
