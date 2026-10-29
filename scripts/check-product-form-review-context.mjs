// node scripts/check-product-form-review-context.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const supplier = '55555555-5555-5555-5555-555555555555', request = '11111111-1111-1111-1111-111111111111';
const image = '22222222-2222-2222-2222-222222222222', category = '33333333-3333-3333-3333-333333333333';
const payload = { name: 'Nhân điều', category: 'cashew', grade: 'W320' };
const quantity = { grade: 'W320', incoterm: 'FOB', tiers: [{ version: 2, unit: 'kg', customGrade: false, quantityGrams: 1000000, unitWeightGrams: 1000, priceCentsPerUnit: 640 }] };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.suppliers (id uuid primary key);
    create table public.supplier_products (id uuid primary key default gen_random_uuid(), supplier_id uuid references public.suppliers(id), name text not null,
      category text, supplier_review_status text, supplier_review_note text, supplier_originated boolean, ready_for_buyer boolean,
      ref_price numeric, specs jsonb, updated_at timestamptz not null default now());
    create table public.quantity_product_creation_requests (request_id uuid primary key, supplier_id uuid not null, product_id uuid, payload_hash text not null);
    create table public.media_assets (id uuid primary key default gen_random_uuid(), owner_type text, product_id uuid, supplier_id uuid, kind text,
      storage_path text, thumb_path text, status text not null default 'unverified', expires_on date, audience text, created_by text, sort_order integer, created_at timestamptz default now());
    create table public.categories (id uuid primary key, slug text unique, status text, is_published boolean);
    create table public.quantity_price_settings (singleton boolean primary key, max_tiers integer);
    create table public.category_grade_price_bounds (category_id uuid, grade text, min_usd_per_kg numeric, max_usd_per_kg numeric, primary key(category_id,grade));
    create table public.product_quantity_price_revisions (id uuid primary key, product_id uuid, status text, grade text);
    create table public.product_english_name_revisions (id uuid primary key, product_id uuid, status text, english_name text);
    insert into public.suppliers values ('${supplier}');
    insert into public.categories values ('${category}', 'cashew','published',true);
    insert into public.quantity_price_settings values (true,4);`);
  for (let n = 0; n < 2; n++) for (const file of ['20261062_private_product_form_drafts.sql', '20261063_product_form_submission.sql',
    '20261064_product_form_private_images.sql', '20261065_product_form_review_context.sql'])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  const first = (await db.query('select public.create_product_form_draft($1,$2,$3::jsonb) result', [supplier, request, JSON.stringify(payload)])).rows[0].result;
  const id = first.product_id;
  await db.query('select public.stage_product_form_image($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [supplier, id, 'supplier-user', 1, image, 'Photo', 1000, 800, 600, 'a'.repeat(64), 200, 'b'.repeat(64)]);
  const refs = [{ source: 'staged', id: image }];
  const sent = (await db.query('select public.submit_product_form_draft_selected_images($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) result',
    [supplier, id, 'supplier-user', false, 2, JSON.stringify(payload), JSON.stringify(quantity), '[]', JSON.stringify(refs)])).rows[0].result;
  const context = async () => (await db.query('select public.product_form_review_context($1,$2) result', [id, sent.submission_id])).rows[0].result;
  const original = await context(); assert.equal(original.status, 'ok'); assert.equal(original.submission.status, 'pending');
  assert.deepEqual(original.published_images, []);
  assert.equal((await db.query('select count(*)::int n from public.media_assets')).rows[0].n, 0, 'Context never publishes images');
  const legacyMedia = '77777777-7777-7777-7777-777777777777';
  await db.query('insert into public.media_assets (id,product_id,storage_path) values($1,$2,$3)', [legacyMedia,id,`products/${id}/old.webp`]);
  await db.query('insert into public.product_form_published_images(product_id,submission_id,media_id,position) values($1,$2,$3,0)', [id,sent.submission_id,legacyMedia]);
  assert.equal((await context()).published_images[0].media_id, legacyMedia, 'Approval context includes locked gallery manifest');
  await assert.rejects(() => db.query('insert into public.product_form_published_images(product_id,submission_id,media_id,position) values($1,$2,$3,8)', [id,sent.submission_id,legacyMedia]));
  await assert.rejects(() => db.query('delete from public.media_assets where id=$1', [legacyMedia]), 'A manifest cannot silently lose its media row');
  await db.query('delete from public.product_form_published_images where product_id=$1', [id]);
  await db.query('delete from public.media_assets where id=$1', [legacyMedia]);
  for (const specs of [{ grade_rows: [{ grade: '500 g/L' }, { grade: '550 g/L' }] }, { grade_rows: 'unknown' }, ['bad'],
    { grade: ['W320', 'W240'] }, { grade: { value: 'W320' } }, { grade_rows: [null] }, { grade_rows: [{}] },
    { grade_rows: [{ grade: [] }] }, { grade: 'W320', grade_rows: [{ grade: 'W240' }] }]) {
    await db.query('update public.supplier_products set specs=$2::jsonb where id=$1', [id, JSON.stringify(specs)]);
    assert.equal((await context()).status, 'legacy_grade_unmapped', 'Existing ambiguous grades cannot enter one-grade approval');
  }
  for (const specs of [{ grade_rows: null }, { grade_rows: [] }, { grade_rows: [{ grade: 'W320' }] },
    { grade: ' W320 ', grade_rows: [{ grade: 'w320' }] }]) {
    await db.query('update public.supplier_products set specs=$2::jsonb where id=$1', [id, JSON.stringify(specs)]);
    assert.equal((await context()).status, 'ok');
  }
  await db.query('update public.supplier_products set specs=null where id=$1', [id]);
  await db.query('insert into public.category_grade_price_bounds values($1,$2,$3,$4)', [category, 'W320', 6, 7]);
  assert.notDeepEqual((await context()).bounds, original.bounds, 'New policy rows are visible to final compare');
  const rev = '99999999-9999-9999-9999-999999999999';
  await db.query('insert into public.product_english_name_revisions values($1,$2,$3,$4)', [rev,id,'approved','Cashew']);
  assert.equal((await context()).names[0].english_name, 'Cashew');
  await db.query('update public.product_form_staged_images set caption=$2 where id=$1', [image, 'Modified']);
  assert.equal((await context()).status, 'images_changed');
  await db.query('update public.product_form_staged_images set caption=$2 where id=$1', [image, 'Photo']);
  await db.query('insert into public.media_assets (id,storage_path) values($1,$2)', ['88888888-8888-8888-8888-888888888888', `product-form-images/${id}/${image}.webp`]);
  assert.equal((await context()).status, 'images_changed', 'Ambiguous public path cannot pass');
  await db.query('delete from public.media_assets');
  await db.query('update public.product_form_submissions set image_selection=$2::jsonb where id=$1', [sent.submission_id, JSON.stringify([{ ...refs[0], extra: 1 }])]);
  assert.equal((await context()).status, 'images_changed', 'Malformed selection fails closed');
  await db.query('update public.product_form_submissions set image_selection=$2::jsonb where id=$1', [sent.submission_id, JSON.stringify(refs)]);
  await db.query("update public.product_form_submissions set image_snapshot='{}'::jsonb where id=$1", [sent.submission_id]);
  assert.equal((await context()).status, 'images_changed', 'Malformed snapshot fails closed without throwing');
  await db.query('update public.product_form_submissions set image_snapshot=$2::jsonb where id=$1', [sent.submission_id, JSON.stringify(original.submission.image_snapshot)]);
  await db.query("update public.categories set is_published=false where id=$1", [category]);
  assert.equal((await context()).status, 'category_changed');
  await db.query("update public.categories set is_published=true where id=$1", [category]);
  await db.query("update public.supplier_products set updated_at=updated_at + interval '1 second' where id=$1", [id]);
  assert.equal((await context()).status, 'product_changed');
  const grants = (await db.query(`select has_function_privilege('anon','public.product_form_review_context(uuid,uuid)','execute') anon,
    has_function_privilege('authenticated','public.product_form_review_context(uuid,uuid)','execute') auth,
    has_function_privilege('service_role','public.product_form_review_context(uuid,uuid)','execute') service,
    has_table_privilege('anon','public.product_form_published_images','select') manifest_anon,
    has_table_privilege('authenticated','public.product_form_published_images','select') manifest_auth`)).rows[0];
  assert.deepEqual(grants, { anon: false, auth: false, service: true, manifest_anon: false, manifest_auth: false });
  console.log('Review context: exact snapshots, policy changes, image collisions, revisions and service-only access passed');
} finally { await db.close(); }
