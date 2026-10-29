// node scripts/check-product-form-private-images-migration.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const supplier = '55555555-5555-5555-5555-555555555555';
const other = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const product = '33333333-3333-3333-3333-333333333333';
const image = '22222222-2222-2222-2222-222222222222';
const existing = '44444444-4444-4444-4444-444444444444';
const another = '99999999-9999-9999-9999-999999999999';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.suppliers (id uuid primary key);
    create table public.supplier_products (id uuid primary key, supplier_id uuid, supplier_review_status text,
      ready_for_buyer boolean, name text, supplier_review_note text, updated_at timestamptz not null default now());
    create table public.product_form_drafts (product_id uuid primary key, supplier_id uuid, revision integer not null,
      base_product_updated_at timestamptz not null, updated_at timestamptz default now(), payload jsonb);
    create table public.product_form_submissions (id uuid primary key default gen_random_uuid(), product_id uuid, supplier_id uuid,
      draft_revision integer, base_product_updated_at timestamptz, submitted_product_updated_at timestamptz,
      payload jsonb, quantity jsonb, warnings jsonb, image_ids uuid[], status text default 'pending');
    create unique index form_one_pending on public.product_form_submissions(product_id) where status = 'pending';
    create function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
    revoke all on function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) from public, anon, authenticated;
    grant execute on function public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) to service_role;
    create table public.media_assets (id uuid primary key, owner_type text, product_id uuid, supplier_id uuid,
      kind text, storage_path text, thumb_path text, status text, expires_on date, audience text, created_by text);
    insert into public.suppliers values ('${supplier}'), ('${other}');
    insert into public.supplier_products (id,supplier_id,supplier_review_status,ready_for_buyer,name) values
      ('${product}','${supplier}','approved',true,'Public old name');
    insert into public.product_form_drafts(product_id,supplier_id,revision,base_product_updated_at,payload)
      select id,supplier_id,1,updated_at,'{"name":"Private new name"}'::jsonb from public.supplier_products where id='${product}';
    insert into public.media_assets values ('${existing}','product','${product}','${supplier}','image','existing.jpg',null,
      'unverified',null,'buyer','someone-else');`);
  const sql = readFileSync(new URL('../supabase/migrations/20261064_product_form_private_images.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  const stage = async (owner, rev, id = image, actor = 'user', bytes = 1234) =>
    (await db.query('select public.stage_product_form_image($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
      [owner, product, actor, rev, id, 'Ảnh mới', bytes, 800, 600])).rows[0].result;
  const select = async (owner, rev, selection, actor = 'user', staff = false) =>
    (await db.query('select public.set_product_form_images($1,$2,$3,$4,$5,$6::jsonb) result',
      [owner, product, actor, staff, rev, JSON.stringify(selection)])).rows[0].result;
  const ref = (source, id) => ({ source, id });
  assert.equal((await stage(other, 1)).status, 'not_owned');
  assert.equal((await stage(supplier, 0)).status, 'invalid');
  assert.equal((await stage(supplier, 1, image, 'user', 0)).status, 'invalid');
  assert.equal((await select(other, 1, [])).status, 'not_owned');
  assert.equal((await select(supplier, 1, [ref('media', existing)])).revision, 2);
  assert.equal((await select(supplier, 1, [])).status, 'changed');
  assert.equal((await select(supplier, 2, [ref('media', existing), ref('media', existing)])).status, 'invalid');
  assert.equal((await select(supplier, 2, [ref('staged', another)])).status, 'image_unavailable');
  assert.equal((await select(supplier, 2, [{ source: 'media', id: existing, extra: 1 }])).status, 'invalid');
  for (const malformed of [null, 1, 'bad', []]) assert.equal((await select(supplier, 2, [malformed])).status, 'invalid');
  assert.equal((await stage(supplier, 2)).revision, 3);
  const row = (await db.query('select * from public.product_form_staged_images where id=$1', [image])).rows[0];
  assert.equal(row.storage_path, `products/${product}/${image}.webp`);
  assert.equal(row.thumb_path, `products/${product}/${image}-thumb.webp`);
  assert.equal((await db.query('select count(*)::int n from public.media_assets')).rows[0].n, 1,
    'A staged image is absent from the public media table');
  assert.equal((await stage(supplier, 2)).status, 'exists', 'A lost result can be reconciled without duplicating the image');
  assert.equal((await stage(supplier, 2, image, 'user', 1235)).status, 'conflict');
  assert.equal((await select(supplier, 3, [ref('staged', image), ref('media', existing)], 'other-user')).status, 'image_unavailable');
  assert.equal((await select(supplier, 3, [ref('staged', image), ref('media', existing)], 'user')).revision, 4);
  assert.equal((await select(supplier, 4, [ref('staged', image)], 'staff-user', true)).revision, 5);
  assert.equal((await select(supplier, 5, [ref('staged', image)], 'staff-user', true)).revision, 5, 'No-op does not change revision');
  const publicProduct = (await db.query('select name,ready_for_buyer,updated_at from public.supplier_products where id=$1', [product])).rows[0];
  assert.equal(publicProduct.name, 'Public old name'); assert.equal(publicProduct.ready_for_buyer, true);
  assert.equal((await db.query('select count(*)::int n from public.media_assets where audience=$1', ['buyer'])).rows[0].n, 1);
  assert.equal((await select(supplier, 5, Array(9).fill(ref('staged', image)))).status, 'image_limit');
  const submit = async (owner, rev, selection, actor = 'user', staff = false) =>
    (await db.query('select public.submit_product_form_draft_selected_images($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) result',
      [owner, product, actor, staff, rev, JSON.stringify({ name: 'Private new name' }), JSON.stringify({ grade: 'W320' }), '[]', JSON.stringify(selection)])).rows[0].result;
  assert.equal((await submit(other, 5, [ref('staged', image)])).status, 'not_owned');
  assert.equal((await submit(supplier, 4, [ref('staged', image)])).status, 'changed');
  assert.equal((await submit(supplier, 5, [ref('media', existing)])).status, 'changed', 'Selection must match the validated revision');
  assert.equal((await submit(supplier, 5, [ref('staged', image)], 'other-user')).status, 'images_changed');
  const submitted = await submit(supplier, 5, [ref('staged', image)]);
  assert.equal(submitted.status, 'submitted');
  assert.equal((await submit(supplier, 5, [ref('staged', image)])).submission_id, submitted.submission_id);
  const captured = (await db.query('select * from public.product_form_submissions where id=$1', [submitted.submission_id])).rows[0];
  assert.equal(captured.image_selection[0].source, 'staged');
  assert.equal(captured.image_snapshot[0].row.storage_path, row.storage_path);
  assert.equal((await db.query('select name from public.supplier_products where id=$1', [product])).rows[0].name, 'Public old name');
  assert.equal((await db.query('select count(*)::int n from public.media_assets where audience=$1', ['buyer'])).rows[0].n, 1);
  await db.query("update public.media_assets set status='expired' where id=$1", [existing]);
  assert.equal((await select(supplier, 5, [ref('media', existing)])).status, 'image_unavailable');
  await db.query("update public.supplier_products set updated_at=updated_at + interval '1 second' where id=$1", [product]);
  assert.equal((await stage(supplier, 5, another)).status, 'product_changed');
  assert.equal((await select(supplier, 5, [])).status, 'product_changed');
  const grants = (await db.query(`select has_table_privilege('anon','public.product_form_staged_images','select') anon,
    has_table_privilege('authenticated','public.product_form_staged_images','select') auth,
    has_function_privilege('authenticated','public.stage_product_form_image(uuid,uuid,text,integer,uuid,text,bigint,integer,integer)','execute') fn_auth,
    has_function_privilege('service_role','public.set_product_form_images(uuid,uuid,text,boolean,integer,jsonb)','execute') service,
    has_function_privilege('service_role','public.submit_product_form_draft(uuid,uuid,integer,jsonb,jsonb,jsonb)','execute') old_submit`)).rows[0];
  assert.deepEqual(grants, { anon: false, auth: false, fn_auth: false, service: true, old_submit: false });
  console.log('Private form images: staged isolation, selection CAS, ownership, retries and public listing preservation passed');
} finally { await db.close(); }
