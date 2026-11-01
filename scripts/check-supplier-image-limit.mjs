// node scripts/check-supplier-image-limit.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.supplier_products (id uuid primary key, supplier_id uuid, supplier_review_status text, supplier_originated boolean, ready_for_buyer boolean);
    create table public.media_assets (id uuid primary key default gen_random_uuid(), owner_type text, product_id uuid, supplier_id uuid, verification_id uuid, checklist_key text, kind text, audience text, status text, expires_on date, caption text, storage_path text, thumb_path text, external_url text, mime text, bytes bigint, width integer, height integer, sort_order integer default 0, created_by text);
    insert into public.supplier_products values ('22222222-2222-2222-2222-222222222222','55555555-5555-5555-5555-555555555555','draft',true,false);`);
  // 20261061 đặt 8 ảnh; 20261102 hạ xuống 6 cho khớp 6 ô ảnh và ảnh người mua thấy.
  await db.exec(readFileSync(new URL('../supabase/migrations/20261061_supplier_image_limit.sql', import.meta.url), 'utf8'));
  const migration = readFileSync(new URL('../supabase/migrations/20261102_product_image_six_limit.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const product = '22222222-2222-2222-2222-222222222222', supplier = '55555555-5555-5555-5555-555555555555';
  const create = async (kind, supplierId = supplier) => (await db.query('select public.create_supplier_product_media_guarded($1::uuid,$2::uuid,$3::text,$4::jsonb) as result',
    [product, supplierId, 'owner', JSON.stringify({ kind, storage_path: `products/${product}/image.webp`, mime: 'image/webp', bytes: 1 })])).rows[0].result;
  assert.equal((await create('image', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).status, 'state_changed');
  for (let i = 0; i < 6; i++) {
    const result = await create('image'); assert.equal(result.status, 'created'); assert.equal(result.asset.sort_order, i); assert.equal(result.asset.audience, 'internal');
  }
  assert.equal((await create('image')).status, 'image_limit');
  assert.equal((await create('catalogue')).status, 'created', 'Image limit does not remove catalogue uploads');
  assert.equal((await db.query("select count(*)::int as n from public.media_assets where kind='image'")).rows[0].n, 6);
  await db.exec("update public.supplier_products set supplier_review_status = 'pending'");
  assert.equal((await create('catalogue')).status, 'state_changed');
  const grants = (await db.query(`select has_function_privilege('anon','public.create_supplier_product_media_guarded(uuid,uuid,text,jsonb)','execute') as anon,
    has_function_privilege('authenticated','public.create_supplier_product_media_guarded(uuid,uuid,text,jsonb)','execute') as auth,
    has_function_privilege('service_role','public.create_supplier_product_media_guarded(uuid,uuid,text,jsonb)','execute') as service`)).rows[0];
  assert.deepEqual(grants, { anon: false, auth: false, service: true });
  console.log('Supplier image limit: guarded RPC, six images, state, catalogues and service-only access passed');
} finally { await db.close(); }
