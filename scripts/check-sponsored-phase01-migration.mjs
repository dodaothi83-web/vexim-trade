// node scripts/check-sponsored-phase01-migration.mjs
// Isolated PGlite database; no production data, RLS client or concurrent connections.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sql = async (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
const supplier = id(1), admin = id(2), reviewer = id(3), salesperson = id(4), inactive = id(5);
const one = async (query, params = []) => (await db.query(query, params)).rows[0];
const insertProduct = (n) => db.query('insert into public.supplier_products(id,supplier_id) values($1,$2)', [id(n), supplier]);
const insertPush = (pushId, productId, surface, category, status = 'draft', approver = null, when = "now()") => db.query(`
  insert into public.sponsored_pushes(id,surface,category_slug,supplier_id,product_id,status,starts_at,ends_at,approved_by,approved_at)
  values($1,$2,$3,$4,$5,$6,${when},${when} + interval '168 hours',$7,case when $6 = 'approved' then now() end)
`, [pushId, surface, category, supplier, productId, status, approver]);
const approve = (pushId, approver = admin) => db.query("update public.sponsored_pushes set status='approved', approved_by=$2, approved_at=now() where id=$1 and status='draft' returning *", [pushId, approver]);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.suppliers(id uuid primary key);
    create table public.supplier_products(id uuid primary key, supplier_id uuid not null references public.suppliers(id));
    create table public.app_users(id uuid primary key, role text not null, is_active boolean not null);
  `);
  await db.query('insert into public.suppliers values($1)', [supplier]);
  await db.query('insert into public.app_users values($1,\'admin\',true),($2,\'reviewer\',true),($3,\'sales\',true),($4,\'admin\',false)', [admin, reviewer, salesperson, inactive]);
  await db.exec(await sql('20261028_sponsored_product_push.sql'));
  await db.exec(await sql('20261029_sponsored_approver_role.sql'));

  // Historical rows exist before migration; applying the migration must not edit them.
  for (let n = 10; n <= 15; n++) await insertProduct(n);
  await insertPush(id(110), id(10), 'home', 'cashew', 'approved', admin, "now() - interval '1 hour'");
  await insertPush(id(111), id(11), 'home', 'cashew', 'draft', null, "now() - interval '200 hours'");
  await insertPush(id(112), id(12), 'category', 'cashew', 'approved', reviewer, "now() - interval '1 hour'");
  const before = JSON.stringify((await db.query('select * from public.sponsored_pushes order by id')).rows);
  const migration = await sql('20261042_sponsored_placement_guards.sql');
  await db.exec(migration);
  await db.exec(migration); // safe to reapply
  assert.equal(JSON.stringify((await db.query('select * from public.sponsored_pushes order by id')).rows), before,
    'Applying the migration does not alter existing paid or draft rows');

  await assert.rejects(insertPush(id(113), id(13), 'home', 'cashew'), /home placement is not supported/i);
  await assert.rejects(approve(id(111)), /home placement is not supported/i, 'Old homepage drafts cannot be approved');
  await db.query("update public.sponsored_pushes set status='paused' where id=$1", [id(110)]);
  await assert.rejects(db.query("update public.sponsored_pushes set status='approved' where id=$1", [id(110)]), /home placement is not supported/i,
    'An existing homepage package may be paused but not resumed');

  await insertPush(id(114), id(14), 'category', 'pepper', 'draft', null, "now() - interval '200 hours'");
  const immediatelyBefore = Date.now();
  const approved = (await approve(id(114), reviewer)).rows[0];
  const immediatelyAfter = Date.now();
  assert.ok(Date.parse(approved.starts_at) >= immediatelyBefore - 5000 && Date.parse(approved.starts_at) <= immediatelyAfter + 5000,
    'A stale draft starts when approved, using the database clock');
  assert.equal(Date.parse(approved.ends_at) - Date.parse(approved.starts_at), 168 * 3600000);
  assert.equal(Date.parse(approved.approved_at), Date.parse(approved.starts_at));
  assert.equal((await approve(id(114))).rows.length, 0, 'A second conditional approval cannot reset the sold term');
  const unchanged = await one('select starts_at,ends_at,approved_by,approved_at from public.sponsored_pushes where id=$1', [id(114)]);
  assert.equal(JSON.stringify(unchanged), JSON.stringify({ starts_at: approved.starts_at, ends_at: approved.ends_at, approved_by: approved.approved_by, approved_at: approved.approved_at }));
  await db.query("update public.sponsored_pushes set status='paused' where id=$1", [id(114)]);
  await db.query("update public.sponsored_pushes set status='approved' where id=$1", [id(114)]);
  const resumed = await one('select starts_at,ends_at,approved_by,approved_at from public.sponsored_pushes where id=$1', [id(114)]);
  assert.equal(JSON.stringify(resumed), JSON.stringify(unchanged), 'Resuming never extends or rewrites the sold term');

  // An authorized direct insert cannot bypass the database approval clock either.
  const beforeDirect = Date.now();
  await insertPush(id(115), id(15), 'category', 'direct-approval', 'approved', admin, "now() - interval '200 hours'");
  const direct = await one('select starts_at,ends_at,approved_at from public.sponsored_pushes where id=$1', [id(115)]);
  assert.ok(Date.parse(direct.starts_at) >= beforeDirect - 5000);
  assert.equal(Date.parse(direct.ends_at) - Date.parse(direct.starts_at), 168 * 3600000);
  assert.equal(Date.parse(direct.approved_at), Date.parse(direct.starts_at));

  // The existing trigger still enforces approver roles and product ownership.
  for (const [offset, approver] of [[0, salesperson], [1, inactive]]) {
    await insertProduct(20 + offset);
    await insertPush(id(120 + offset), id(20 + offset), 'category', 'role-check');
    await assert.rejects(approve(id(120 + offset), approver), /active Vexim admin or review lead/i);
  }
  await insertProduct(25);
  await insertPush(id(125), id(25), 'category', 'duplicate-one');
  await insertPush(id(126), id(25), 'category', 'duplicate-two');
  await approve(id(125));
  await db.query("update public.sponsored_pushes set status='paused' where id=$1", [id(125)]);
  await assert.rejects(approve(id(126)), /already has a sponsored push/i, 'Paused package reserves the product across categories');

  // 12 sold packages, including one paused, occupy the pool throughout their overlap.
  for (let i = 0; i < 13; i++) {
    await insertProduct(200 + i);
    await insertPush(id(300 + i), id(200 + i), 'category', 'full-pool');
    if (i < 12) await approve(id(300 + i));
  }
  await db.query("update public.sponsored_pushes set status='paused' where id=$1", [id(300)]);
  await assert.rejects(approve(id(312)), /Sponsored pool is full/i, 'A paused sale is not resold');
  assert.equal((await one('select status from public.sponsored_pushes where id=$1', [id(312)])).status, 'draft');

  const grants = await one(`select
    has_table_privilege('anon','public.sponsored_pushes','select') as anon_read,
    has_table_privilege('authenticated','public.sponsored_pushes','update') as auth_write,
    has_table_privilege('service_role','public.sponsored_pushes','update') as service_write,
    has_function_privilege('anon','public.guard_sponsored_placement()','execute') as anon_guard`);
  assert.deepEqual(grants, { anon_read: false, auth_write: false, service_write: true, anon_guard: false });
  console.log('✅ Sponsored migration: old rows unchanged; unsupported home blocked; 168h at approval; resumed term preserved; role, duplicate and paused-pool guards (PGlite, no live concurrency).');
} finally {
  await db.close();
}
