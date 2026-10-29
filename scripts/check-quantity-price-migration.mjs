import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.categories (id uuid primary key);
    create table public.supplier_products (id uuid primary key, supplier_id uuid not null, updated_at timestamptz not null default now(), name text not null default 'Tên mới');
    insert into public.categories values ('11111111-1111-1111-1111-111111111111');
    insert into public.supplier_products (id,supplier_id) values ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555');
  `);
  const migration = readFileSync(new URL('../supabase/migrations/20261053_quantity_price_foundation.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // safe to retry without resetting settings
  const { rows: settings } = await db.query('select * from public.quantity_price_settings');
  assert.equal(settings.length, 1);
  assert.equal(settings[0].max_tiers, 4);
  assert.equal(Number(settings[0].max_price_ratio), 1.5);
  assert.equal(settings[0].stale_days, 90);
  await db.exec(`insert into public.category_grade_price_bounds (category_id, grade, min_usd_per_kg, max_usd_per_kg)
    values ('11111111-1111-1111-1111-111111111111', 'W320', 5, 8)`);
  await assert.rejects(db.exec(`insert into public.category_grade_price_bounds (category_id, grade, min_usd_per_kg, max_usd_per_kg)
    values ('11111111-1111-1111-1111-111111111111', 'W240', 8, 5)`));
  const values = "('22222222-2222-2222-2222-222222222222', 'approved', 'W320', 'FOB', '[{\"minKg\":1000,\"priceUsdPerKg\":6}]', now())";
  await db.exec(`insert into public.product_quantity_price_revisions (product_id,status,grade,incoterm,tiers,confirmed_at) values ${values}`);
  await assert.rejects(db.exec(`insert into public.product_quantity_price_revisions (product_id,status,grade,incoterm,tiers,confirmed_at) values ${values}`));
  await db.exec(`insert into public.product_quantity_price_revisions (product_id,status,grade,incoterm,tiers)
    values ('22222222-2222-2222-2222-222222222222','pending','W320','FOB','[{"minKg":1000,"priceUsdPerKg":7}]')`);
  await assert.rejects(db.exec(`insert into public.product_quantity_price_revisions (product_id,status,grade,incoterm,tiers)
    values ('22222222-2222-2222-2222-222222222222','approved','W320','FOB','[{"minKg":1000,"priceUsdPerKg":7}]')`));
  await db.exec(`insert into public.product_english_name_revisions (product_id,status,source_name,english_name,origin)
    values ('22222222-2222-2222-2222-222222222222','approved','Nhân điều','Cashew kernels','ai'),
           ('22222222-2222-2222-2222-222222222222','pending','Nhân điều mới','New cashew kernels','supplier')`);
  const { rows } = await db.query(`select relname, relrowsecurity from pg_class where relname in
    ('quantity_price_settings','category_grade_price_bounds','product_quantity_price_revisions','product_english_name_revisions')`);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.relrowsecurity));
  const { rows: grants } = await db.query(`select has_table_privilege('anon','public.product_quantity_price_revisions','select') as anon_select,
    has_table_privilege('authenticated','public.product_english_name_revisions','select') as auth_select,
    has_table_privilege('service_role','public.product_quantity_price_revisions','select') as service_select`);
  assert.deepEqual(grants[0], { anon_select: false, auth_select: false, service_select: true });
  const reviewMigration = readFileSync(new URL('../supabase/migrations/20261054_quantity_price_review_transactions.sql', import.meta.url), 'utf8');
  await db.exec(reviewMigration);
  await db.exec(reviewMigration);
  const pid = '22222222-2222-2222-2222-222222222222';
  const actor = '33333333-3333-3333-3333-333333333333';
  const prices = (await db.query(`select id, status, created_at from public.product_quantity_price_revisions order by status`)).rows;
  const pendingPrice = prices.find((row) => row.status === 'pending');
  const approvedPrice = prices.find((row) => row.status === 'approved');
  const names = (await db.query(`select id, status from public.product_english_name_revisions order by status`)).rows;
  const pendingName = names.find((row) => row.status === 'pending');
  const decision = async (functionName, productId, revisionId, approve) =>
    (await db.query(`select public.${functionName}($1::uuid, $2::uuid, $3::uuid, $4::boolean) as result`, [productId, revisionId, actor, approve])).rows[0].result;
  assert.equal(await decision('decide_quantity_price_revision', pid, approvedPrice.id, true), 'changed', 'Stale requests never demote the live price');
  assert.equal(await decision('decide_quantity_price_revision', '44444444-4444-4444-4444-444444444444', pendingPrice.id, true), 'missing_product');
  assert.equal(await decision('decide_product_english_name_revision', pid, pendingName.id, false), 'rejected');
  assert.equal((await db.query(`select count(*)::int as count from public.product_english_name_revisions where status = 'approved'`)).rows[0].count, 1, 'Rejecting a new name retains the old one');
  assert.equal(await decision('decide_quantity_price_revision', pid, pendingPrice.id, true), 'approved');
  const updated = (await db.query('select id,status,confirmed_at,created_at,reviewed_by from public.product_quantity_price_revisions order by status')).rows;
  assert.equal(updated.find((row) => row.id === approvedPrice.id).status, 'superseded');
  const newPrice = updated.find((row) => row.id === pendingPrice.id);
  assert.equal(newPrice.status, 'approved');
  assert.equal(newPrice.confirmed_at.getTime(), newPrice.created_at.getTime(), 'Review does not fabricate a later supplier confirmation');
  assert.equal(newPrice.reviewed_by, actor);
  assert.equal(await decision('decide_quantity_price_revision', pid, pendingPrice.id, true), 'changed');
  const functionGrants = (await db.query(`select has_function_privilege('anon','public.decide_quantity_price_revision(uuid,uuid,uuid,boolean)','execute') as anonymous,
    has_function_privilege('service_role','public.decide_quantity_price_revision(uuid,uuid,uuid,boolean)','execute') as service`)).rows[0];
  assert.deepEqual(functionGrants, { anonymous: false, service: true });
  const submitMigration = readFileSync(new URL('../supabase/migrations/20261055_quantity_price_revision_submit.sql', import.meta.url), 'utf8');
  await db.exec(submitMigration);
  await db.exec(submitMigration);
  const supplier = '55555555-5555-5555-5555-555555555555';
  const stamp = (await db.query('select updated_at from public.supplier_products where id=$1', [pid])).rows[0].updated_at.toISOString();
  const priceSubmit = async (supplierId, expected, expectedStamp = stamp) => (await db.query(`select public.submit_quantity_price_revision($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,'W320','FOB',$5::jsonb,$6::jsonb) as result`,
    [pid, supplierId, expected, expectedStamp, JSON.stringify([{ minKg: 1000, priceUsdPerKg: 5.5 }]), JSON.stringify([])])).rows[0].result;
  assert.equal((await priceSubmit('44444444-4444-4444-4444-444444444444', null)).status, 'not_owned');
  assert.equal((await priceSubmit(supplier, null, '2000-01-01T00:00:00Z')).status, 'product_changed');
  const firstPending = await priceSubmit(supplier, null);
  assert.equal(firstPending.status, 'pending');
  assert.equal((await priceSubmit(supplier, null)).status, 'changed', 'A stale tab cannot replace a new pending revision');
  assert.equal((await db.query(`select id from public.product_quantity_price_revisions where status='approved'`)).rows[0].id, pendingPrice.id, 'Submitting a new price never hides or overwrites the approved snapshot');
  const secondPending = await priceSubmit(supplier, firstPending.revision_id);
  assert.equal(secondPending.status, 'pending');
  assert.notEqual(secondPending.revision_id, firstPending.revision_id);
  assert.equal(await decision('decide_quantity_price_revision', pid, firstPending.revision_id, true), 'changed', 'Staff cannot approve the superseded pending version');
  const nameSubmit = async (supplierId, expected, origin = 'supplier') => (await db.query(`select public.submit_product_english_name_revision($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,'Tên mới','New name',$5) as result`, [pid, supplierId, expected, stamp, origin])).rows[0].result;
  assert.equal((await nameSubmit('44444444-4444-4444-4444-444444444444', null)).status, 'not_owned');
  assert.equal((await nameSubmit(supplier, null, null)).status, 'invalid');
  const nameRevision = await nameSubmit(supplier, null);
  assert.equal(nameRevision.status, 'pending');
  assert.equal((await nameSubmit(supplier, null)).status, 'changed');
  assert.equal((await db.query(`select count(*)::int as count from public.product_english_name_revisions where status='approved'`)).rows[0].count, 1, 'New name stays separate from approved name');
  const submitGrants = (await db.query(`select has_function_privilege('authenticated','public.submit_quantity_price_revision(uuid,uuid,uuid,timestamptz,text,text,jsonb,jsonb)','execute') as authenticated,
    has_function_privilege('service_role','public.submit_quantity_price_revision(uuid,uuid,uuid,timestamptz,text,text,jsonb,jsonb)','execute') as service`)).rows[0];
  assert.deepEqual(submitGrants, { authenticated: false, service: true });
  const consistencyMigration = readFileSync(new URL('../supabase/migrations/20261056_quantity_price_review_consistency.sql', import.meta.url), 'utf8');
  await db.exec(consistencyMigration);
  await db.exec(consistencyMigration);
  const guardedDecision = async (functionName, revisionId, approve, expectedStamp) => (await db.query(
    `select public.${functionName}($1::uuid,$2::uuid,$3::uuid,$4::boolean,$5::timestamptz) as result`,
    [pid, revisionId, actor, approve, expectedStamp])).rows[0].result;
  assert.equal(await guardedDecision('decide_quantity_price_revision', secondPending.revision_id, true, stamp), 'product_changed', 'Old unversioned pending rows fail closed');
  const guardedPending = await priceSubmit(supplier, secondPending.revision_id);
  assert.equal(guardedPending.status, 'pending');
  await db.exec(`update public.supplier_products set updated_at = updated_at + interval '1 day' where id='${pid}'`);
  const newerStamp = (await db.query('select updated_at from public.supplier_products where id=$1', [pid])).rows[0].updated_at.toISOString();
  assert.equal(await guardedDecision('decide_quantity_price_revision', guardedPending.revision_id, true, newerStamp), 'product_changed', 'Changes after submission invalidate approval');
  assert.equal((await db.query(`select id from public.product_quantity_price_revisions where status='approved'`)).rows[0].id, pendingPrice.id, 'The live price remains unchanged');
  assert.equal(await guardedDecision('decide_quantity_price_revision', guardedPending.revision_id, false, newerStamp), 'rejected', 'Stale submissions can be rejected');
  const fresh = await priceSubmit(supplier, null, newerStamp);
  assert.equal(await guardedDecision('decide_quantity_price_revision', fresh.revision_id, true, stamp), 'product_changed', 'Changes between CRM read and approval are caught');
  assert.equal(await guardedDecision('decide_quantity_price_revision', fresh.revision_id, true, newerStamp), 'approved');
  const nameFresh = (await db.query(`select public.submit_product_english_name_revision($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,'Tên mới','New name','supplier') as result`, [pid, supplier, nameRevision.revision_id, newerStamp])).rows[0].result;
  assert.equal(nameFresh.status, 'pending');
  assert.equal(await guardedDecision('decide_product_english_name_revision', nameFresh.revision_id, true, newerStamp), 'approved');
  console.log('Quantity pricing migrations: private revisions, ownership, optimistic submits and guarded atomic reviews passed');
} finally {
  await db.close();
}
