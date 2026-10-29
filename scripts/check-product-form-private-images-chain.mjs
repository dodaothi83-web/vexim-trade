// node scripts/check-product-form-private-images-chain.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const supplier = '55555555-5555-5555-5555-555555555555';
const request = '11111111-1111-1111-1111-111111111111';
const image = '22222222-2222-2222-2222-222222222222';
const payload = { name: 'Nhân điều', category: 'cashew', grade: 'W320' };
const quantity = { grade: 'W320', incoterm: 'FOB', tiers: [{ version: 2, unit: 'kg', customGrade: false, quantityGrams: 1000000, unitWeightGrams: 1000, priceCentsPerUnit: 640 }] };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.suppliers (id uuid primary key);
    create table public.supplier_products (id uuid primary key default gen_random_uuid(), supplier_id uuid references public.suppliers(id), name text not null,
      category text, supplier_review_status text, supplier_review_note text, supplier_originated boolean, ready_for_buyer boolean,
      ref_price numeric, updated_at timestamptz not null default now());
    create table public.quantity_product_creation_requests (request_id uuid primary key, supplier_id uuid not null,
      product_id uuid references public.supplier_products(id) on delete set null, payload_hash text not null);
    create table public.media_assets (id uuid primary key default gen_random_uuid(), owner_type text, product_id uuid,
      supplier_id uuid, kind text, storage_path text, thumb_path text, status text not null default 'unverified', expires_on date,
      audience text, created_by text, sort_order integer, created_at timestamptz default now());
    insert into public.suppliers values ('${supplier}');`);
  for (let n = 0; n < 2; n++) for (const file of ['20261062_private_product_form_drafts.sql', '20261063_product_form_submission.sql', '20261064_product_form_private_images.sql'])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  const first = (await db.query('select public.create_product_form_draft($1,$2,$3::jsonb) result', [supplier, request, JSON.stringify(payload)])).rows[0].result;
  const id = first.product_id;
  const staged = (await db.query('select public.stage_product_form_image($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result',
    [supplier, id, 'supplier-user', 1, image, 'Photo', 1000, 800, 600, 'a'.repeat(64), 200, 'b'.repeat(64)])).rows[0].result;
  assert.equal(staged.status, 'created'); assert.equal(staged.revision, 2);
  const refs = [{ source: 'staged', id: image }];
  const submit = async (selection) => (await db.query('select public.submit_product_form_draft_selected_images($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) result',
    [supplier, id, 'supplier-user', false, 2, JSON.stringify(payload), JSON.stringify(quantity), '[]', JSON.stringify(selection)])).rows[0].result;
  const sent = await submit(refs); assert.equal(sent.status, 'submitted');
  assert.equal((await submit(refs)).submission_id, sent.submission_id);
  const row = (await db.query('select * from public.product_form_submissions where id=$1', [sent.submission_id])).rows[0];
  assert.equal(row.image_ids[0], image); assert.equal(row.image_selection[0].source, 'staged');
  assert.equal(row.image_snapshot[0].row.storage_path, `products/${id}/${image}.webp`);
  assert.equal((await db.query('select count(*)::int n from public.media_assets')).rows[0].n, 0);
  const shell = (await db.query('select * from public.supplier_products where id=$1', [id])).rows[0];
  assert.equal(shell.supplier_review_status, 'pending'); assert.equal(shell.ready_for_buyer, false);
  const shellTime = (await db.query('select updated_at::text t from public.supplier_products where id=$1', [id])).rows[0].t;
  const actor = '77777777-7777-7777-7777-777777777777';
  const reject = async (time, note = 'Cần thêm thông tin') => (await db.query('select public.request_product_form_changes($1,$2,$3,$4::timestamptz,$5) result',
    [id, sent.submission_id, actor, time, note])).rows[0].result;
  assert.equal((await reject(shellTime, ' ')).status, 'invalid');
  assert.equal((await reject('2000-01-01 00:00:00+00')).status, 'product_changed');
  assert.equal((await reject(shellTime)).status, 'changes_requested');
  assert.equal((await reject(shellTime)).already_decided, true, 'A lost decision response is idempotent');
  const returned = (await db.query('select * from public.supplier_products where id=$1', [id])).rows[0];
  const returnedDraft = (await db.query('select * from public.product_form_drafts where product_id=$1', [id])).rows[0];
  assert.equal(returned.supplier_review_status, 'changes_requested'); assert.equal(returned.ready_for_buyer, false);
  assert.equal(returned.supplier_review_note, 'Cần thêm thông tin'); assert.equal(returnedDraft.revision, 3);
  assert.equal(returnedDraft.base_product_updated_at.toISOString(), returned.updated_at.toISOString());
  assert.equal((await db.query('select count(*)::int n from public.media_assets')).rows[0].n, 0);
  const resent = (await db.query('select public.submit_product_form_draft_selected_images($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) result',
    [supplier, id, 'supplier-user', false, 3, JSON.stringify(payload), JSON.stringify(quantity), '[]', JSON.stringify(refs)])).rows[0].result;
  assert.equal(resent.status, 'submitted'); assert.notEqual(resent.submission_id, sent.submission_id);
  const grants = (await db.query(`select has_function_privilege('service_role','public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb)','execute') old,
    has_function_privilege('service_role','public.submit_product_form_draft_selected_images(uuid,uuid,text,boolean,integer,jsonb,jsonb,jsonb,jsonb)','execute') new,
    has_table_privilege('authenticated','public.product_form_staged_images','select') auth`)).rows[0];
  assert.deepEqual(grants, { old: false, new: true, auth: false });
  console.log('Product form migration chain: repeatable setup, private upload selection, snapshot and submission passed');
} finally { await db.close(); }
