// node scripts/check-supplier-product-migration.mjs
// PostgreSQL-compatible integration test of the migration on an isolated in-memory database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20261038_supplier_product_self_management.sql', import.meta.url), 'utf8');
const product = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const otherProduct = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const supplier = '11111111-1111-1111-1111-111111111111';
const foreignSupplier = '22222222-2222-2222-2222-222222222222';
const mediaA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const mediaB = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const pathA = `products/${product}/a.webp`;
const pathThumb = `products/${product}/a-thumb.webp`;
const pathB = `products/${product}/b.webp`;
const row = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const status = async (sql, params) => (await row(sql, params)).result.status;
const deleteDraft = (sid = supplier) => status('select public.delete_supplier_draft_product($1, $2) as result', [product, sid]);
const deleteMedia = (mid = mediaA, uid = 'owner') => status(
  'select public.delete_supplier_product_media($1, $2, $3, $4) as result', [product, supplier, uid, mid]);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.supplier_products (
      id uuid primary key, supplier_id uuid not null,
      supplier_review_status text not null default 'approved', ready_for_buyer boolean not null default false,
      supplier_originated boolean not null default false, reviewed_category_slug text, featured_media_id uuid, images uuid[] default '{}',
      constraint supplier_products_supplier_review_status_check check (supplier_review_status in ('draft','pending','approved','changes_requested'))
    );
    create table public.media_assets (
      id uuid primary key, owner_type text not null, product_id uuid references public.supplier_products(id) on delete cascade,
      supplier_id uuid, kind text not null, audience text not null, status text not null,
      expires_on date, storage_path text, thumb_path text, created_by text
    );
    alter table public.supplier_products add constraint supplier_products_featured_media_fk
      foreign key (featured_media_id) references public.media_assets(id) on delete set null;
    create table public.rfqs (source_product_id uuid references public.supplier_products(id) on delete set null);
    create table public.sponsored_pushes (product_id uuid references public.supplier_products(id) on delete cascade);
    create table public.sponsored_pilot_campaigns (product_id uuid references public.supplier_products(id) on delete cascade);
    create table public.audit_log (entity text, entity_id text, action text);
    create table public.certificates (requested_product_ids uuid[], approved_product_ids uuid[], file_media_id uuid references public.media_assets(id) on delete set null);
    create table public.supplier_submission_items (media_id uuid references public.media_assets(id) on delete set null, storage_path text, thumb_path text);
    grant all on all tables in schema public to service_role;
  `);
  // Idempotence and the actual constraint/function/grant syntax are exercised by PostgreSQL.
  await db.exec(migration);
  await db.exec(migration);
  const perms = await row(`select
    has_function_privilege('anon', 'public.delete_supplier_draft_product(uuid,uuid)', 'execute') as draft_anon,
    has_function_privilege('authenticated', 'public.delete_supplier_product_media(uuid,uuid,text,uuid)', 'execute') as media_auth,
    has_function_privilege('service_role', 'public.delete_supplier_draft_product(uuid,uuid)', 'execute') as draft_service,
    has_function_privilege('service_role', 'public.delete_supplier_product_media(uuid,uuid,text,uuid)', 'execute') as media_service`);
  assert.deepEqual(perms, { draft_anon: false, media_auth: false, draft_service: true, media_service: true });

  let optionalTables = true;
  async function reset(review = 'draft', ready = false, originated = true) {
    const optional = optionalTables ? 'public.supplier_submission_items, public.certificates, ' : '';
    await db.exec(`truncate ${optional}public.audit_log, public.sponsored_pilot_campaigns, public.sponsored_pushes, public.rfqs, public.media_assets, public.supplier_products cascade`);
    await db.query('insert into public.supplier_products(id,supplier_id,supplier_review_status,ready_for_buyer,supplier_originated) values($1,$2,$3,$4,$5)',
      [product, supplier, review, ready, originated]);
    await db.query(`insert into public.media_assets(id,owner_type,product_id,supplier_id,kind,audience,status,storage_path,thumb_path,created_by)
      values($1,'product',$2,$3,'image',$4,'checked',$5,$6,'owner')`,
      [mediaA, product, supplier, review === 'draft' || review === 'changes_requested' ? 'internal' : 'buyer', pathA, pathThumb]);
    await db.query('update public.supplier_products set featured_media_id = $1 where id = $2', [mediaA, product]);
  }
  async function addSecondFile({ expired = false, status: fileStatus = 'checked', sid = supplier } = {}) {
    await db.query(`insert into public.media_assets(id,owner_type,product_id,supplier_id,kind,audience,status,storage_path,created_by,expires_on)
      values($1,'product',$2,$3,'image','buyer',$4,$5,'owner',$6)`,
      [mediaB, product, sid, fileStatus, pathB, expired ? '2020-01-01' : null]);
  }

  await reset();
  assert.equal(await deleteDraft(foreignSupplier), 'not_deletable', 'Different supplier cannot delete a draft');
  for (const review of ['pending', 'approved', 'changes_requested', 'paused']) {
    await reset(review);
    assert.equal(await deleteDraft(), 'not_deletable', `${review} cannot be hard-deleted`);
  }
  await reset('draft', false, false); assert.equal(await deleteDraft(), 'not_deletable');
  await reset('draft', true, true); assert.equal(await deleteDraft(), 'not_deletable');
  await reset(); await db.query("update public.supplier_products set reviewed_category_slug='cashew' where id=$1", [product]);
  assert.equal(await deleteDraft(), 'not_deletable');

  const links = [
    ['RFQ', () => db.query('insert into public.rfqs values ($1)', [product])],
    ['sponsored push', () => db.query('insert into public.sponsored_pushes values ($1)', [product])],
    ['pilot campaign', () => db.query('insert into public.sponsored_pilot_campaigns values ($1)', [product])],
    ['prior approval audit', () => db.query("insert into public.audit_log values ('product',$1,'supplier.product_approved')", [product])],
    ['requested certificate product', () => db.query('insert into public.certificates(requested_product_ids) values (array[$1::uuid])', [product])],
    ['approved certificate product', () => db.query('insert into public.certificates(approved_product_ids) values (array[$1::uuid])', [product])],
    ['certificate media', () => db.query('insert into public.certificates(file_media_id) values ($1)', [mediaA])],
    ['submission media', () => db.query('insert into public.supplier_submission_items(media_id) values ($1)', [mediaA])],
    ['submission path', () => db.query('insert into public.supplier_submission_items(thumb_path) values ($1)', [pathThumb])],
    ['other product cover', async () => {
      await db.query("insert into public.supplier_products(id,supplier_id,supplier_review_status,ready_for_buyer,supplier_originated,featured_media_id) values($1,$2,'draft',false,true,$3)", [otherProduct, supplier, mediaA]);
    }],
    ['other product image list', async () => {
      await db.query("insert into public.supplier_products(id,supplier_id,supplier_review_status,ready_for_buyer,supplier_originated,images) values($1,$2,'draft',false,true,array[$3::uuid])", [otherProduct, supplier, mediaA]);
    }],
    ['foreign-owned media', () => db.query('update public.media_assets set supplier_id=$1 where id=$2', [foreignSupplier, mediaA])],
  ];
  for (const [label, link] of links) {
    await reset(); await link();
    assert.equal(await deleteDraft(), 'has_links', `${label} prevents draft deletion`);
    assert.equal((await row('select count(*)::int as n from public.supplier_products where id=$1', [product])).n, 1);
    assert.equal((await row('select count(*)::int as n from public.media_assets where id=$1', [mediaA])).n, 1);
  }
  // One certificate array may exist without the other on a partially migrated project.
  await reset(); await db.exec('alter table public.certificates drop column approved_product_ids');
  await db.query('insert into public.certificates(requested_product_ids) values (array[$1::uuid])', [product]);
  assert.equal(await deleteDraft(), 'has_links');
  await db.exec('alter table public.certificates add column approved_product_ids uuid[]');
  await reset(); await db.exec('alter table public.certificates drop column requested_product_ids');
  await db.query('insert into public.certificates(approved_product_ids) values (array[$1::uuid])', [product]);
  assert.equal(await deleteDraft(), 'has_links');
  await db.exec('alter table public.certificates add column requested_product_ids uuid[]');

  await reset();
  await db.exec('set role anon');
  await assert.rejects(deleteDraft(), /permission denied for function/, 'Public clients cannot call the destructive RPC');
  await db.exec('reset role');
  await db.exec('set role service_role');
  assert.equal(await deleteDraft(), 'deleted', 'The service role can invoke the RPC with table access');
  await db.exec('reset role');

  await reset();
  const removed = (await row('select public.delete_supplier_draft_product($1,$2) as result', [product, supplier])).result;
  assert.equal(removed.status, 'deleted');
  assert.deepEqual(removed.paths.sort(), [pathA, pathThumb].sort());
  assert.equal((await row('select count(*)::int as n from public.supplier_products')).n, 0);
  assert.equal((await row('select count(*)::int as n from public.media_assets')).n, 0);

  await reset('pending'); assert.equal(await deleteMedia(), 'state_changed');
  await reset('approved', true, false); assert.equal(await deleteMedia(), 'state_changed');
  await reset(); assert.equal(await deleteMedia(mediaA, 'different-user'), 'forbidden');
  await reset(); assert.equal(await deleteMedia(), 'deleted');
  assert.equal((await row('select featured_media_id from public.supplier_products where id=$1', [product])).featured_media_id, null,
    'Deleting the sole draft cover clears the FK');
  await reset('approved', true);
  assert.equal(await deleteMedia(), 'last_file');
  await addSecondFile({ expired: true }); assert.equal(await deleteMedia(), 'last_file', 'Expired replacement does not count');
  await db.query('delete from public.media_assets where id=$1', [mediaB]);
  await addSecondFile({ status: 'expired' }); assert.equal(await deleteMedia(), 'last_file', 'Expired status does not count');
  await db.query('delete from public.media_assets where id=$1', [mediaB]);
  await addSecondFile({ sid: foreignSupplier }); assert.equal(await deleteMedia(), 'last_file', 'Foreign-supplier file does not count');
  await db.query('delete from public.media_assets where id=$1', [mediaB]);
  await addSecondFile();
  assert.equal(await deleteMedia(), 'deleted');
  assert.equal(await deleteMedia(mediaB), 'last_file', 'The remaining buyer file is protected after the first deletion');
  await reset('paused'); assert.equal(await deleteMedia(), 'deleted', 'A hidden product may remove its own final buyer file');
  await reset('changes_requested'); await db.query("update public.media_assets set audience='buyer' where id=$1", [mediaA]);
  assert.equal(await deleteMedia(), 'deleted', 'Returned listing may remove an owner-uploaded former buyer file');
  await reset(); await db.query('insert into public.certificates(file_media_id) values ($1)', [mediaA]);
  assert.equal(await deleteMedia(), 'has_links', 'Certificate evidence cannot be removed');
  await reset(); await db.query('insert into public.supplier_submission_items(storage_path) values ($1)', [pathA]);
  assert.equal(await deleteMedia(), 'has_links', 'Submission evidence cannot be removed');
  await reset();
  await db.query("insert into public.supplier_products(id,supplier_id,supplier_review_status,ready_for_buyer,supplier_originated,images) values($1,$2,'draft',false,true,array[$3::uuid])", [otherProduct, supplier, mediaA]);
  assert.equal(await deleteMedia(), 'has_links', 'An image used by another product cannot be removed');

  // Optional feature tables may be absent; the RPCs still work safely.
  await reset(); await db.exec('drop table public.certificates; drop table public.supplier_submission_items;');
  optionalTables = false;
  assert.equal(await deleteDraft(), 'deleted');
  await reset(); assert.equal(await deleteMedia(), 'deleted');
  console.log('✅ PostgreSQL migration: grants, draft links, media guards and paused status.');
} finally {
  await db.close();
}
