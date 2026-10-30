// node scripts/check-product-form-submission-migration.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const supplier = '55555555-5555-5555-5555-555555555555';
const other = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const request = '11111111-1111-1111-1111-111111111111';
const payload = { name: 'Nhân điều', category: 'cashew', grade: 'W320' };
const quantity = { unit: 'kg', grade: 'W320', tiers: [{ quantityGrams: 1000000, priceCentsPerUnit: 640, unitWeightGrams: 1000 }] };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.suppliers (id uuid primary key);
    create table public.supplier_products (id uuid primary key default gen_random_uuid(), supplier_id uuid references public.suppliers(id), name text not null,
      category text, supplier_review_status text, supplier_review_note text, supplier_originated boolean, ready_for_buyer boolean,
      ref_price numeric, updated_at timestamptz not null default now());
    create table public.quantity_product_creation_requests (request_id uuid primary key, supplier_id uuid not null,
      product_id uuid references public.supplier_products(id) on delete set null, payload_hash text not null);
    create table public.media_assets (id uuid primary key default gen_random_uuid(), owner_type text, product_id uuid,
      supplier_id uuid, kind text, storage_path text, status text not null default 'unverified', expires_on date, sort_order integer, created_at timestamptz default now());
    insert into public.suppliers values ('${supplier}'), ('${other}');`);
  for (const file of ['20261062_private_product_form_drafts.sql', '20261063_product_form_submission.sql']) {
    const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
  }
  const create = async (req, data) => (await db.query('select public.create_product_form_draft($1::uuid,$2::uuid,$3::jsonb) result', [supplier, req, JSON.stringify(data)])).rows[0].result;
  const submit = async (owner, id, revision, data = payload, q = quantity, warnings = []) =>
    (await db.query('select public.submit_product_form_draft($1::uuid,$2::uuid,$3::integer,$4::jsonb,$5::jsonb,$6::jsonb) result',
      [owner, id, revision, JSON.stringify(data), JSON.stringify(q), JSON.stringify(warnings)])).rows[0].result;
  const addImage = async (id, path = 'images/1.webp') => db.query(`insert into public.media_assets(owner_type,product_id,supplier_id,kind,storage_path,sort_order)
    values('product',$1,$2,'image',$3,0)`, [id, supplier, path]);
  const first = await create(request, payload), id = first.product_id;
  assert.equal((await submit(other, id, 1)).status, 'not_owned');
  assert.equal((await submit(supplier, id, 1)).status, 'images_changed');
  await addImage(id);
  assert.equal((await submit(supplier, id, 2)).status, 'changed');
  assert.equal((await submit(supplier, id, 1, { ...payload, name: 'changed' })).status, 'changed');
  const submitted = await submit(supplier, id, 1);
  assert.equal(submitted.status, 'submitted');
  assert.equal((await submit(supplier, id, 1)).submission_id, submitted.submission_id, 'A lost response can be retried');
  assert.equal((await submit(supplier, id, 1, payload, { ...quantity, unit: 'mt' })).status, 'changed');
  const firstRow = (await db.query('select * from public.product_form_submissions where id=$1', [submitted.submission_id])).rows[0];
  const firstProduct = (await db.query('select * from public.supplier_products where id=$1', [id])).rows[0];
  assert.equal(firstProduct.supplier_review_status, 'pending'); assert.equal(firstProduct.ready_for_buyer, false);
  assert.equal(firstRow.image_ids.length, 1); assert.equal(firstRow.status, 'pending');
  assert.equal(firstRow.submitted_product_updated_at.toISOString(), firstProduct.updated_at.toISOString());
  await db.query(`update public.product_form_submissions set status='changes_requested' where id=$1`, [submitted.submission_id]);
  assert.equal((await submit(supplier, id, 1)).status, 'already_decided');
  const existing = '33333333-3333-3333-3333-333333333333';
  await db.exec(`insert into public.supplier_products(id,supplier_id,name,supplier_review_status,supplier_originated,ready_for_buyer,ref_price)
    values ('${existing}','${supplier}','Approved name','approved',true,true,8.5)`);
  const saved = (await db.query('select public.save_product_form_draft($1::uuid,$2::uuid,0,$3::jsonb) result', [supplier, existing, JSON.stringify(payload)])).rows[0].result;
  assert.equal(saved.status, 'saved'); await addImage(existing);
  await db.query(`update public.supplier_products set updated_at=updated_at + interval '1 second' where id=$1`, [existing]);
  assert.equal((await submit(supplier, existing, 1)).status, 'product_changed');
  await db.query(`update public.supplier_products p set updated_at=d.base_product_updated_at from public.product_form_drafts d where p.id=d.product_id and p.id=$1`, [existing]);
  const approvedSubmission = await submit(supplier, existing, 1); assert.equal(approvedSubmission.status, 'submitted');
  const approvedProduct = (await db.query('select * from public.supplier_products where id=$1', [existing])).rows[0];
  assert.equal(approvedProduct.supplier_review_status, 'approved'); assert.equal(approvedProduct.ready_for_buyer, true);
  assert.equal(approvedProduct.name, 'Approved name'); assert.equal(Number(approvedProduct.ref_price), 8.5);
  assert.equal((await db.query('select public.save_product_form_draft($1::uuid,$2::uuid,1,$3::jsonb) result', [supplier, existing, JSON.stringify({ ...payload, name: 'Next draft' })])).rows[0].result.status, 'saved');
  assert.equal((await submit(supplier, existing, 2, { ...payload, name: 'Next draft' })).status, 'already_pending');
  const third = await create('44444444-4444-4444-4444-444444444444', payload);
  await addImage(third.product_id, ''); assert.equal((await submit(supplier, third.product_id, 1)).status, 'images_changed');
  await db.query('delete from public.media_assets where product_id=$1', [third.product_id]);
  await addImage(third.product_id);
  await db.query("update public.media_assets set status='expired' where product_id=$1", [third.product_id]);
  assert.equal((await submit(supplier, third.product_id, 1)).status, 'images_changed');
  await db.query('delete from public.media_assets where product_id=$1', [third.product_id]);
  for (let i = 0; i < 9; i++) await addImage(third.product_id, `images/${i}.webp`);
  assert.equal((await submit(supplier, third.product_id, 1)).status, 'images_changed');
  const grants = (await db.query(`select has_table_privilege('authenticated','public.product_form_submissions','select') auth,
    has_function_privilege('anon','public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb)','execute') anon,
    has_function_privilege('service_role','public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb)','execute') service`)).rows[0];
  assert.deepEqual(grants, { auth: false, anon: false, service: true });
  console.log('Product form submission: private snapshot, ownership, retries, CAS, photos and approved preservation passed');
} finally { await db.close(); }
