// node scripts/check-product-form-checked-save.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const supplier = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const product = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.suppliers (id uuid primary key);
    create table public.supplier_products (id uuid primary key, supplier_id uuid not null, name text not null,
      category text, supplier_review_status text, supplier_review_note text, supplier_originated boolean, ready_for_buyer boolean,
      ref_price numeric, updated_at timestamptz not null default now());
    create table public.quantity_product_creation_requests (request_id uuid primary key, supplier_id uuid not null, product_id uuid, payload_hash text);
    insert into public.suppliers values ('${supplier}'),('${other}');
    insert into public.supplier_products(id,supplier_id,name,supplier_review_status,updated_at)
      values ('${product}','${supplier}','Synthetic','approved','2000-01-01T00:00:00Z');`);
  for (const file of ['20261062_private_product_form_drafts.sql', '20261070_product_form_checked_save.sql'])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  const save = async (owner, revision, payload) => (await db.query('select public.save_product_form_draft_checked($1,$2,$3,$4::jsonb) result',
    [owner, product, revision, JSON.stringify(payload)])).rows[0].result;
  assert.equal((await save(other, 0, { name: 'x' })).status, 'not_owned');
  assert.equal((await save(supplier, 0, { name: 'original' })).status, 'saved');
  await db.query("update public.supplier_products set updated_at='2001-01-01T00:00:00Z' where id=$1", [product]);
  assert.equal((await save(supplier, 1, { name: 'edited' })).status, 'product_changed');
  assert.equal((await db.query('select payload from public.product_form_drafts where product_id=$1', [product])).rows[0].payload.name, 'original');
  await db.query("update public.supplier_products set updated_at='2000-01-01T00:00:00Z' where id=$1", [product]);
  assert.equal((await save(supplier, 1, { name: 'edited' })).revision, 2);
  assert.equal((await save(supplier, 1, { name: 'stale' })).status, 'changed');
  const signature = 'public.save_product_form_draft(uuid,uuid,integer,jsonb)';
  await db.exec(`alter function ${signature} set search_path = public`);
  assert.equal((await save(supplier, 2, { name: 'denied' })).status, 'save_unavailable');
  const privileges = (await db.query(`select has_function_privilege('anon','public.save_product_form_draft_checked(uuid,uuid,integer,jsonb)','execute') a,
    has_function_privilege('authenticated','public.save_product_form_draft_checked(uuid,uuid,integer,jsonb)','execute') b,
    has_function_privilege('service_role','public.save_product_form_draft_checked(uuid,uuid,integer,jsonb)','execute') c`)).rows[0];
  assert.deepEqual(privileges, { a: false, b: false, c: true });
  console.log('Checked draft save: owner, exact base timestamp, revision, old function integrity and privileges passed');
} finally { await db.close(); }
