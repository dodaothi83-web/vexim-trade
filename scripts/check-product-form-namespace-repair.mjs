// node scripts/check-product-form-namespace-repair.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const supplier = '55555555-5555-5555-5555-555555555555', request = '11111111-1111-1111-1111-111111111111';
const image = '22222222-2222-2222-2222-222222222222', payload = { name: 'Mẫu' };
const migration = (file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
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
  for (const file of ['20261062_private_product_form_drafts.sql', '20261063_product_form_submission.sql', '20261064_product_form_private_images.sql']) await db.exec(migration(file));
  const shell = (await db.query('select public.create_product_form_draft($1,$2,$3::jsonb) result', [supplier, request, JSON.stringify(payload)])).rows[0].result;
  const stage = (id, rev) => db.query('select public.stage_product_form_image($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result',
    [supplier, shell.product_id, 'user', rev, id, 'Photo', 1000, 800, 600, 'a'.repeat(64), 200, 'b'.repeat(64)]);
  assert.equal((await stage(image, 1)).rows[0].result.status, 'created');
  const oldRow = (await db.query('select * from public.product_form_staged_images where id=$1', [image])).rows[0];
  // Reproduce observed production metadata: new stage function, old constraints.
  const full66 = migration('20261066_product_form_private_image_namespace.sql');
  await db.exec(full66.slice(full66.indexOf('create or replace function public.stage_product_form_image('), full66.indexOf("notify pgrst, 'reload schema';")));
  await db.exec(migration('20261067_product_form_image_namespace_capability.sql'));
  const ready = async () => (await db.query('select public.product_form_image_namespace_ready() ready')).rows[0].ready;
  assert.equal(await ready(), false, 'New function alone does not prove constraints were upgraded');
  const repair = migration('20261068_product_form_namespace_constraints.sql');
  await assert.rejects(() => db.exec(repair), /đường dẫn cũ/, 'Existing old-path rows block repair');
  await db.exec('rollback');
  const unchanged = (await db.query('select * from public.product_form_staged_images where id=$1', [image])).rows[0];
  assert.equal(unchanged.storage_path, oldRow.storage_path); assert.equal(unchanged.sha256, oldRow.sha256);
  // Remove only this isolated synthetic fixture before testing a clean repair.
  await db.query('delete from public.product_form_staged_images where id=$1', [image]);
  await db.query("update public.product_form_drafts set revision=1,image_selection='[]'::jsonb where product_id=$1", [shell.product_id]);
  await db.exec(repair); await db.exec(repair); assert.equal(await ready(), true);
  assert.equal((await stage(image, 1)).rows[0].result.status, 'created');
  const newRow = (await db.query('select storage_path,thumb_path from public.product_form_staged_images where id=$1', [image])).rows[0];
  assert.equal(newRow.storage_path, `product-form-images/${shell.product_id}/${image}.webp`);
  await db.exec(repair); assert.equal(await ready(), true);
  assert.equal((await db.query('select storage_path from public.product_form_staged_images where id=$1', [image])).rows[0].storage_path, newRow.storage_path);
  const signature = 'public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer,text,bigint,text,uuid,jsonb)';
  await db.exec(`alter function ${signature} set search_path = public`);
  assert.equal(await ready(), false, 'An unsafe search path fails closed');
  await assert.rejects(() => db.exec(repair), /khác dự kiến/); await db.exec('rollback');
  await db.exec(full66.slice(full66.indexOf('create or replace function public.stage_product_form_image('), full66.indexOf("notify pgrst, 'reload schema';")));
  assert.equal(await ready(), true);
  console.log('Namespace repair: mixed deployed schema detected; old rows block, new rows persist and capability verifies');
} finally { await db.close(); }
