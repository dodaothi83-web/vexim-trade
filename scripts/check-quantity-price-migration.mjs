import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.categories (id uuid primary key);
    create table public.supplier_products (id uuid primary key, supplier_id uuid not null, updated_at timestamptz not null default now(), name text not null default 'Tên mới', supplier_review_status text not null default 'draft', ready_for_buyer boolean not null default false, supplier_category_proposal text default 'cashew', reviewed_category_slug text, category text default 'cashew', packaging text, price_publicly_visible boolean not null default true, name_i18n jsonb not null default '{}', specs jsonb not null default '{}');
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
  // A 20261056 pending revision has no context and remains fail-closed after the upgrade.
  const oldRevision = await priceSubmit(supplier, null, newerStamp);
  const contextMigration = readFileSync(new URL('../supabase/migrations/20261057_quantity_review_product_context.sql', import.meta.url), 'utf8');
  await db.exec(contextMigration);
  await db.exec(contextMigration);
  await db.exec(`update public.supplier_products set updated_at = updated_at + interval '1 day', supplier_review_status = 'pending', name_i18n = '{"en":"Translated"}' where id='${pid}'`);
  let current = (await db.query('select updated_at from public.supplier_products where id=$1', [pid])).rows[0].updated_at.toISOString();
  assert.equal(await guardedDecision('decide_quantity_price_revision', oldRevision.revision_id, true, current), 'product_changed', 'Existing revision without context stays strict');
  const contextPrice = await priceSubmit(supplier, oldRevision.revision_id, current);
  assert.equal(contextPrice.status, 'pending');
  const contextName = (await db.query(`select public.submit_product_english_name_revision($1::uuid,$2::uuid,null,$3::timestamptz,'Tên mới','New name','supplier') as result`, [pid, supplier, current])).rows[0].result;
  assert.equal(contextName.status, 'pending');
  await db.exec(`update public.supplier_products set updated_at = updated_at + interval '1 day', supplier_review_status = 'approved', ready_for_buyer = true, reviewed_category_slug = 'cashew', name_i18n = '{"en":"New translation"}' where id='${pid}'`);
  const prior = current;
  current = (await db.query('select updated_at from public.supplier_products where id=$1', [pid])).rows[0].updated_at.toISOString();
  assert.equal(await guardedDecision('decide_quantity_price_revision', contextPrice.revision_id, true, prior), 'product_changed', 'Races after the reviewer reads still fail');
  assert.equal(await guardedDecision('decide_quantity_price_revision', contextPrice.revision_id, true, current), 'approved', 'Review status and translation do not invalidate price');
  assert.equal(await guardedDecision('decide_product_english_name_revision', contextName.revision_id, true, current), 'approved', 'Review status and translation do not invalidate name');
  const materialPrice = await priceSubmit(supplier, null, current);
  await db.exec(`update public.supplier_products set updated_at = updated_at + interval '1 day', packaging = 'Different package' where id='${pid}'`);
  current = (await db.query('select updated_at from public.supplier_products where id=$1', [pid])).rows[0].updated_at.toISOString();
  assert.equal(await guardedDecision('decide_quantity_price_revision', materialPrice.revision_id, true, current), 'product_changed', 'Material product changes require a new submission');
  assert.equal(await guardedDecision('decide_quantity_price_revision', materialPrice.revision_id, false, current), 'rejected');
  const categoryPrice = await priceSubmit(supplier, null, current);
  await db.exec(`update public.supplier_products set updated_at = updated_at + interval '1 day', reviewed_category_slug = 'coffee', category = 'coffee' where id='${pid}'`);
  current = (await db.query('select updated_at from public.supplier_products where id=$1', [pid])).rows[0].updated_at.toISOString();
  assert.equal(await guardedDecision('decide_quantity_price_revision', categoryPrice.revision_id, true, current), 'product_changed', 'Changed review category is not treated as a status-only change');
  const newMigration = readFileSync(new URL('../supabase/migrations/20261058_quantity_new_product_transaction.sql', import.meta.url), 'utf8');
  await db.exec(`alter table public.supplier_products alter column id set default gen_random_uuid(); alter table public.supplier_products add column supplier_originated boolean not null default true; alter table public.supplier_products add column supplier_review_note text; alter table public.supplier_products add column featured_media_id uuid;`);
  await db.exec(newMigration);
  await db.exec(newMigration);
  const payload = { supplier_id: supplier, name: 'Sản phẩm mới', supplier_review_status: 'draft', ready_for_buyer: false, supplier_originated: true, supplier_category_proposal: 'cashew', category: 'cashew' };
  const create = (data, english = 'Cashew kernels', requestId = crypto.randomUUID()) => db.query(`select public.create_supplier_product_with_quantity($1::uuid,$2::uuid,$3::jsonb,'W320','FOB',$4::jsonb,'[]'::jsonb,$5) as result`, [requestId, supplier, JSON.stringify(data), JSON.stringify([{ minKg: 1000, priceUsdPerKg: 6.4 }]), english]);
  const requestId = crypto.randomUUID();
  const created = (await create(payload, 'Cashew kernels', requestId)).rows[0].result;
  assert.equal((await create(payload, 'Cashew kernels', requestId)).rows[0].result.id, created.id, 'Retry returns the same product');
  await assert.rejects(create({ ...payload, name: 'Different' }, 'Cashew kernels', requestId));
  const savedPrice = (await db.query(`select * from public.product_quantity_price_revisions where product_id=$1`, [created.id])).rows[0];
  const savedName = (await db.query(`select * from public.product_english_name_revisions where product_id=$1`, [created.id])).rows[0];
  assert.equal(savedPrice.status, 'pending'); assert.equal(savedPrice.grade, 'W320'); assert.ok(savedPrice.product_context);
  assert.equal(savedName.english_name, 'Cashew kernels'); assert.ok(savedName.product_context);
  await assert.rejects(create({ ...payload, supplier_id: actor }));
  await assert.rejects(create({ ...payload, ready_for_buyer: true }));
  await assert.rejects(create({ ...payload, id: pid }));
  await db.exec(`create function public.test_name_failure() returns trigger language plpgsql as $$ begin if new.english_name='FAIL' then raise exception 'simulated error'; end if; return new; end $$; create trigger test_name_failure before insert on public.product_english_name_revisions for each row execute function public.test_name_failure();`);
  const before = (await db.query('select count(*)::int as n from public.supplier_products')).rows[0].n;
  await assert.rejects(create(payload, 'FAIL'));
  assert.equal((await db.query('select count(*)::int as n from public.supplier_products')).rows[0].n, before, 'Product and price roll back when the name insertion fails');
  const creationGrant = (await db.query(`select has_function_privilege('anon','public.create_supplier_product_with_quantity(uuid,uuid,jsonb,text,text,jsonb,jsonb,text)','execute') as anon, has_function_privilege('service_role','public.create_supplier_product_with_quantity(uuid,uuid,jsonb,text,text,jsonb,jsonb,text)','execute') as service`)).rows[0];
  assert.deepEqual(creationGrant, { anon: false, service: true });
  const submitGuard = readFileSync(new URL('../supabase/migrations/20261059_quantity_product_submit_guard.sql', import.meta.url), 'utf8');
  await db.exec(submitGuard); await db.exec(submitGuard);
  const sendProduct = async (id, stamp) => (await db.query(`select public.submit_supplier_product_with_quantity_guard($1::uuid,$2::uuid,$3::timestamptz,'draft',false,'cashew') as result`, [id, supplier, stamp])).rows[0].result;
  const createdStamp = new Date(created.updated_at).toISOString();
  await db.exec(`update public.supplier_products set featured_media_id='99999999-9999-9999-9999-999999999999', updated_at=updated_at+interval '1 day' where id='${created.id}'`);
  const afterCover = (await db.query(`select public.quantity_product_review_context(to_jsonb(p)) = r.product_context as same from public.supplier_products p join public.product_quantity_price_revisions r on r.product_id=p.id where p.id=$1`, [created.id])).rows[0].same;
  assert.equal(afterCover, true, 'Selecting a cover image does not invalidate price');
  await db.exec(`update public.supplier_products set packaging='Different', updated_at=updated_at+interval '1 day' where id='${created.id}'`);
  let changedStamp = (await db.query('select updated_at from public.supplier_products where id=$1', [created.id])).rows[0].updated_at.toISOString();
  assert.equal((await sendProduct(created.id, createdStamp)).status, 'changed', 'A racing product edit blocks submission');
  assert.equal((await sendProduct(created.id, changedStamp)).status, 'price_changed', 'Changed details require a fresh price before submission');
  assert.equal((await db.query('select supplier_review_status from public.supplier_products where id=$1', [created.id])).rows[0].supplier_review_status, 'draft');
  const reprice = (await db.query(`select public.submit_quantity_price_revision($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,'W320','FOB',$5::jsonb,'[]'::jsonb) as result`, [created.id, supplier, savedPrice.id, changedStamp, JSON.stringify([{ minKg: 1000, priceUsdPerKg: 6.4 }])])).rows[0].result;
  assert.equal(reprice.status, 'pending');
  assert.equal((await sendProduct(created.id, changedStamp)).status, 'submitted');
  assert.equal((await db.query('select supplier_review_status from public.supplier_products where id=$1', [created.id])).rows[0].supplier_review_status, 'pending');
  const submitGrant = (await db.query(`select has_function_privilege('authenticated','public.submit_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text)','execute') as auth, has_function_privilege('service_role','public.submit_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text)','execute') as service`)).rows[0];
  assert.deepEqual(submitGrant, { auth: false, service: true });
  const publicationGuard = readFileSync(new URL('../supabase/migrations/20261060_quantity_product_publication_guard.sql', import.meta.url), 'utf8');
  await db.exec(publicationGuard); await db.exec(publicationGuard);
  const firstPriceMigration = readFileSync(new URL('../supabase/migrations/20261078_quantity_first_price_with_product.sql', import.meta.url), 'utf8');
  await db.exec(firstPriceMigration); await db.exec(firstPriceMigration);
  const matches = async (stored, current) => (await db.query(`select public.quantity_product_review_context_matches($1::jsonb,$2::jsonb) as same`, [stored, current])).rows[0].same;
  assert.equal(await matches('{"a":1}', '{"a":1,"b":null}'), true, 'A column added after the snapshot does not invalidate the price');
  assert.equal(await matches('{"a":1}', '{"a":2}'), false);
  assert.equal(await matches('{"a":1}', '{"a":null}'), false, 'Clearing a real value still invalidates the price');
  assert.equal(await matches(null, '{"a":1}'), false, 'A revision without a context stays strict');
  const approveProduct = async (stamp, category = 'cashew', buyerFlag = null) => (await db.query(`select public.decide_supplier_product_with_quantity_guard($1::uuid,$2::uuid,$3::timestamptz,'pending',false,'approved',$4,null,$5::boolean,$6::uuid) as result`, [created.id, supplier, stamp, category, buyerFlag, actor])).rows[0].result;
  const submittedStamp = (await db.query('select updated_at from public.supplier_products where id=$1', [created.id])).rows[0].updated_at.toISOString();
  const pendingPriceRow = (await db.query(`select id from public.product_quantity_price_revisions where product_id=$1 and status='pending'`, [created.id])).rows[0];
  assert.equal((await approveProduct(submittedStamp, 'rice')).status, 'category_changed', 'A reviewer cannot silently change the category of the price');
  assert.equal((await approveProduct(changedStamp)).status, 'changed', 'Stale publication decisions cannot race product updates');
  await db.exec(`update public.product_quantity_price_revisions set status='superseded' where id='${pendingPriceRow.id}'`);
  assert.equal((await approveProduct(submittedStamp)).status, 'price_not_approved', 'Without any price there is nothing to approve together');
  await db.exec(`update public.product_quantity_price_revisions set status='pending' where id='${pendingPriceRow.id}'`);
  // The old buyer-cutover flag is ignored: publishing is not a deployment decision.
  assert.equal((await approveProduct(submittedStamp, 'cashew', false)).status, 'saved', 'First upload publishes without a separate price step');
  const firstApproved = (await db.query(`select id,status,reviewed_by,confirmed_at from public.product_quantity_price_revisions where product_id=$1 and status='approved'`, [created.id])).rows[0];
  assert.equal(firstApproved.id, pendingPriceRow.id, 'The table uploaded with the product is the one approved');
  assert.equal(firstApproved.reviewed_by, actor, 'The reviewer who published is recorded on the first price');
  assert.ok(firstApproved.confirmed_at, 'Confirming the price is not renewed at approval time');
  const publicationGrant = (await db.query(`select has_function_privilege('anon','public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean,uuid)','execute') as anon, has_function_privilege('service_role','public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean,uuid)','execute') as service`)).rows[0];
  assert.deepEqual(publicationGrant, { anon: false, service: true });
  assert.equal((await db.query(`select has_function_privilege('authenticated','public.decide_supplier_product_with_quantity_guard(uuid,uuid,timestamptz,text,boolean,text,text,text,boolean,uuid)','execute') as auth`)).rows[0].auth, false);
  // V2 uses the existing private JSONB revision transaction, without rewriting v1.
  const v2tiers = [{ version: 2, unit: 'mt', customGrade: true, quantityGrams: 1234567, unitWeightGrams: 1000000, priceCentsPerUnit: 640100 }];
  const currentStamp = (await db.query('select updated_at from public.supplier_products where id=$1', [created.id])).rows[0].updated_at.toISOString();
  const oldApproved = (await db.query("select id,tiers from public.product_quantity_price_revisions where product_id=$1 and status='approved'", [created.id])).rows[0];
  const sendV2 = async () => (await db.query(`select public.submit_quantity_price_revision($1::uuid,$2::uuid,null,$3::timestamptz,'Special','FOB',$4::jsonb,'[]'::jsonb) as result`, [created.id, supplier, currentStamp, JSON.stringify(v2tiers)])).rows[0].result;
  const pendingV2 = await sendV2(); assert.equal(pendingV2.status, 'pending');
  const stillOld = (await db.query("select id,tiers from public.product_quantity_price_revisions where product_id=$1 and status='approved'", [created.id])).rows[0];
  assert.equal(stillOld.id, oldApproved.id); assert.deepEqual(stillOld.tiers, oldApproved.tiers);
  assert.equal((await sendV2()).status, 'changed');
  const decideV2 = async (id, approve) => (await db.query(`select public.decide_quantity_price_revision($1::uuid,$2::uuid,$3::uuid,$4::boolean,$5::timestamptz) as result`, [created.id, id, actor, approve, currentStamp])).rows[0].result;
  assert.equal(await decideV2(pendingV2.revision_id, false), 'rejected');
  assert.equal((await db.query("select id from public.product_quantity_price_revisions where product_id=$1 and status='approved'", [created.id])).rows[0].id, oldApproved.id);
  const nextV2 = await sendV2(); assert.equal(await decideV2(nextV2.revision_id, true), 'approved');
  const approvedV2 = (await db.query("select tiers from public.product_quantity_price_revisions where id=$1 and status='approved'", [nextV2.revision_id])).rows[0];
  assert.deepEqual(approvedV2.tiers, v2tiers, 'JSONB stores exact original unit, grams and cents');
  assert.equal((await db.query('select status from public.product_quantity_price_revisions where id=$1', [oldApproved.id])).rows[0].status, 'superseded');
  // A published product that uploads a new price still needs that price reviewed:
  // republishing keeps the approved table and leaves the pending one pending.
  const liveStamp = (await db.query('select updated_at from public.supplier_products where id=$1', [created.id])).rows[0].updated_at.toISOString();
  const laterPrice = (await db.query(`select public.submit_quantity_price_revision($1::uuid,$2::uuid,null,$3::timestamptz,'W320','FOB',$4::jsonb,'[]'::jsonb) as result`,
    [created.id, supplier, liveStamp, JSON.stringify([{ minKg: 2000, priceUsdPerKg: 6.1 }])])).rows[0].result;
  assert.equal(laterPrice.status, 'pending');
  await db.exec(`update public.supplier_products set supplier_review_status='approved', ready_for_buyer=false where id='${created.id}'`);
  const retryStamp = (await db.query('select updated_at from public.supplier_products where id=$1', [created.id])).rows[0].updated_at.toISOString();
  const republish = (await db.query(`select public.decide_supplier_product_with_quantity_guard($1::uuid,$2::uuid,$3::timestamptz,'approved',false,'approved','cashew',null,null,$4::uuid) as result`,
    [created.id, supplier, retryStamp, actor])).rows[0].result;
  assert.equal(republish.status, 'saved', 'Republishing keeps the approved price');
  assert.equal((await db.query('select status from public.product_quantity_price_revisions where id=$1', [laterPrice.revision_id])).rows[0].status, 'pending', 'A later price update keeps its own review step');
  assert.equal((await db.query(`select id from public.product_quantity_price_revisions where product_id=$1 and status='approved'`, [created.id])).rows[0].id, nextV2.revision_id, 'The republished product keeps showing the approved table');
  console.log('Quantity pricing migrations: private revisions, ownership, context, reviews, atomic creation and guarded publication passed');
} finally {
  await db.close();
}
