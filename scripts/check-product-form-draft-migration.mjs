// node scripts/check-product-form-draft-migration.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const supplier = '55555555-5555-5555-5555-555555555555';
const other = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const request = '11111111-1111-1111-1111-111111111111';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.suppliers (id uuid primary key);
    create table public.supplier_products (id uuid primary key default gen_random_uuid(), supplier_id uuid references public.suppliers(id), name text not null,
      category text, supplier_review_status text, supplier_originated boolean, ready_for_buyer boolean, ref_price numeric, updated_at timestamptz not null default now());
    create table public.quantity_product_creation_requests (request_id uuid primary key, supplier_id uuid not null,
      product_id uuid references public.supplier_products(id) on delete set null, payload_hash text not null);
    insert into public.suppliers values ('${supplier}'), ('${other}');`);
  const sql = readFileSync(new URL('../supabase/migrations/20261062_private_product_form_drafts.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  const create = async (owner, id, payload) => (await db.query('select public.create_product_form_draft($1::uuid,$2::uuid,$3::jsonb) result', [owner, id, JSON.stringify(payload)])).rows[0].result;
  const save = async (owner, id, rev, payload) => (await db.query('select public.save_product_form_draft($1::uuid,$2::uuid,$3::integer,$4::jsonb) result', [owner, id, rev, JSON.stringify(payload)])).rows[0].result;
  const empty = { name: '', category: '', tiers: [{ quantity: '', price: '' }] };
  const first = await create(supplier, request, empty);
  assert.equal(first.status, 'saved'); assert.equal(first.revision, 1);
  assert.equal((await create(supplier, request, empty)).product_id, first.product_id, 'Retries do not duplicate product shells');
  assert.equal((await create(supplier, request, { ...empty, name: 'Changed' })).status, 'request_conflict');
  assert.equal((await create(other, request, empty)).status, 'request_conflict');
  const shell = (await db.query('select * from public.supplier_products where id=$1', [first.product_id])).rows[0];
  assert.equal(shell.name, ''); assert.equal(shell.ready_for_buyer, false); assert.equal(shell.supplier_review_status, 'draft');
  const marked = (await db.query('select product_id from public.quantity_product_creation_requests where request_id=$1', [request])).rows[0];
  assert.equal(marked.product_id, first.product_id, 'Existing quantity publication guards also cover incomplete shells');
  assert.equal((await save(other, first.product_id, 1, empty)).status, 'not_owned');
  assert.equal((await save(supplier, first.product_id, 0, empty)).status, 'changed');
  assert.equal((await save(supplier, first.product_id, 1, { ...empty, name: 'Updated' })).revision, 2);
  assert.equal((await save(supplier, first.product_id, 1, empty)).status, 'changed', 'Stale edits never overwrite newer drafts');
  assert.equal((await create(supplier, request, empty)).revision, 2, 'Lost create response returns current revision without discarding edits');
  await db.exec(`update public.supplier_products set name='Approved name', ref_price=6.4, ready_for_buyer=true, supplier_review_status='approved' where id='${first.product_id}'`);
  assert.equal((await save(supplier, first.product_id, 2, { name: 'Private pending name', tiers: [] })).revision, 3);
  const approved = (await db.query('select name,ref_price,ready_for_buyer from public.supplier_products where id=$1', [first.product_id])).rows[0];
  assert.equal(approved.name, 'Approved name'); assert.equal(Number(approved.ref_price), 6.4); assert.equal(approved.ready_for_buyer, true);
  const existing = '33333333-3333-3333-3333-333333333333';
  await db.exec(`insert into public.supplier_products (id,supplier_id,name,supplier_review_status,supplier_originated,ready_for_buyer,ref_price)
    values ('${existing}','${supplier}','Old name','approved',true,true,8.5)`);
  assert.equal((await save(supplier, existing, 0, { name: 'New name', tiers: [] })).revision, 1);
  const existingDraft = (await db.query('select base_product_updated_at from public.product_form_drafts where product_id=$1', [existing])).rows[0];
  assert.ok(existingDraft.base_product_updated_at, 'Existing-product draft captures the product snapshot for eventual submission');
  const existingProduct = (await db.query('select name, ref_price, ready_for_buyer from public.supplier_products where id=$1', [existing])).rows[0];
  assert.equal(existingProduct.name, 'Old name'); assert.equal(Number(existingProduct.ref_price), 8.5); assert.equal(existingProduct.ready_for_buyer, true);
  await db.exec(`update public.supplier_products set supplier_review_status='pending' where id='${first.product_id}'`);
  assert.equal((await save(supplier, first.product_id, 3, empty)).status, 'state_changed');
  assert.equal((await create(supplier, '22222222-2222-2222-2222-222222222222', { text: 'x'.repeat(70000) })).status, 'invalid');
  const oldRequest = '44444444-4444-4444-4444-444444444444';
  await db.query('insert into public.quantity_product_creation_requests(request_id,supplier_id,product_id,payload_hash) values ($1,$2,$3,$4)', [oldRequest, supplier, existing, 'legacy']);
  assert.equal((await create(supplier, oldRequest, empty)).status, 'request_conflict', 'A request used by the legacy flow cannot create another shell');
  const grants = (await db.query(`select has_table_privilege('anon','public.product_form_drafts','select') anon,
    has_table_privilege('authenticated','public.product_form_drafts','select') auth,
    has_function_privilege('anon','public.create_product_form_draft(uuid,uuid,jsonb)','execute') create_anon,
    has_function_privilege('authenticated','public.save_product_form_draft(uuid,uuid,integer,jsonb)','execute') save_auth,
    has_function_privilege('service_role','public.save_product_form_draft(uuid,uuid,integer,jsonb)','execute') service`)).rows[0];
  assert.deepEqual(grants, { anon: false, auth: false, create_anon: false, save_auth: false, service: true });
  console.log('Product form drafts: incomplete data, idempotent creation, ownership, CAS, approved retention, states and permissions passed');
} finally { await db.close(); }
