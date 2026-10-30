// node scripts/check-product-form-atomic-approval.mjs
// Isolated synthetic database only. Storage bytes and the server validator are tested separately.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const ids = { supplier: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', actor: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  request: 'cccccccc-cccc-cccc-cccc-cccccccccccc', staged: 'dddddddd-dddd-dddd-dddd-dddddddddddd', copy: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;`);
  await db.exec(readFileSync(new URL('../supabase/staging/bootstrap.sql', import.meta.url), 'utf8').replace('create extension if not exists "pgcrypto";', ''));
  await db.query("insert into public.suppliers(id,name,status) values($1,'Synthetic Supplier','published')", [ids.supplier]);
  await db.query("insert into public.app_users(id,email,role,is_active) values($1,'reviewer@example.invalid','reviewer',true)", [ids.actor]);
  const category = (await db.query("select slug from public.categories where status='published' and is_published limit 1")).rows[0].slug;
  const payload = { name: 'Nhân điều', category, grade: 'W320', pricePubliclyVisible: true, priceConsent: true };
  const quantity = { grade: 'W320', incoterm: 'FOB', tiers: [{ version: 2, unit: 'kg', customGrade: false, quantityGrams: 1000000, unitWeightGrams: 1000, priceCentsPerUnit: 640 }] };
  const created = (await db.query('select public.create_product_form_draft($1,$2,$3::jsonb) x', [ids.supplier,ids.request,JSON.stringify(payload)])).rows[0].x;
  const product = created.product_id;
  await db.query('select public.stage_product_form_image($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [ids.supplier,product,'synthetic-user',1,ids.staged,'Photo',1000,800,600,'a'.repeat(64),200,'b'.repeat(64)]);
  const refs = [{ source: 'staged', id: ids.staged }];
  const submitted = (await db.query('select public.submit_product_form_draft_selected_images($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) x',
    [ids.supplier,product,'synthetic-user',false,2,JSON.stringify(payload),JSON.stringify(quantity),'[]',JSON.stringify(refs)])).rows[0].x;
  assert.equal(submitted.status,'submitted');
  const context = async () => (await db.query('select public.product_form_review_context($1,$2) x',[product,submitted.submission_id])).rows[0].x;
  const current = await context(); assert.equal(current.status,'ok');
  const row = current.submission.image_snapshot[0].row;
  const images = [{ stagedId: ids.staged, mediaId: ids.copy, storagePath: `product-form-images/${product}/${ids.copy}.webp`,
    thumbPath: `product-form-images/${product}/${ids.copy}-thumb.webp`, caption: row.caption, bytes: row.bytes, thumbBytes: row.thumb_bytes,
    width: row.width, height: row.height, sha256: row.sha256, thumbSha256: row.thumb_sha256 }];
  const patch = { name:'Nhân điều', name_i18n:{en:'Cashew kernels'}, category, reviewed_category_slug:category, description:'Synthetic description',
    description_detail:null, spec:'Spec', specs:{grade:'W320',lead_time:{value:null,unit:'on_request'}}, raw_material_region:null, input_material_origin:null,
    unit:'kg', moq:'1,000 kg', moq_qty:1000, moq_unit:'kg', ref_price:6.4, ref_price_max:null, currency:'USD', price_publicly_visible:true,
    incoterm:'FOB', incoterm_place:'Cat Lai', payment_terms:null, oem:false, odm:false, samples:false, packaging:null, export_port:null,
    lead_time_days:null, monthly_capacity:null };
  const approve = async (ctx=current, p=patch, photos=images, actor=ids.actor) => (await db.query(
    'select public.approve_product_form_submission($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) x',
    [product,submitted.submission_id,actor,JSON.stringify(ctx),JSON.stringify(p),JSON.stringify(photos),'[]'])).rows[0].x;
  assert.equal((await approve({ ...current, bounds: [{ changed: true }] })).status,'context_changed');
  assert.equal((await approve(current,patch,images,ids.supplier)).status,'not_authorized');
  await db.query('update public.app_users set is_active=false where id=$1',[ids.actor]);
  assert.equal((await approve()).status,'not_authorized');
  await db.query('update public.app_users set is_active=true where id=$1',[ids.actor]);
  await db.query("update public.suppliers set status='draft' where id=$1",[ids.supplier]);
  assert.equal((await approve()).status,'supplier_unavailable');
  await db.query("update public.suppliers set status='published' where id=$1",[ids.supplier]);
  await db.exec('alter function public.product_form_review_context(uuid,uuid) set search_path = public');
  assert.equal((await approve()).status,'review_unavailable');
  await db.exec('alter function public.product_form_review_context(uuid,uuid) set search_path = public, pg_temp');
  await db.query("insert into public.product_quantity_price_revisions(product_id,status,grade,incoterm,tiers) values($1,'pending','W320','FOB',$2::jsonb)",
    [product,JSON.stringify(quantity.tiers)]);
  assert.equal((await approve()).status,'context_changed', 'A new independent revision changes the locked context');
  const concurrent = await context(); assert.equal((await approve(concurrent)).status,'other_revision_pending');
  await db.query("delete from public.product_quantity_price_revisions where product_id=$1 and status='pending'",[product]);
  assert.equal((await approve(current,{...patch,price_publicly_visible:false})).status,'invalid');
  assert.equal((await approve(current,{...patch,certifications:'overwritten'})).status,'invalid', 'Staff-only fields cannot be supplied');
  assert.equal((await approve(current,patch,[{...images[0],sha256:'0'.repeat(64)}])).status,'images_changed');
  assert.equal((await db.query('select count(*)::int n from public.product_form_publication_history')).rows[0].n,0);
  await db.exec(`create function public.synthetic_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$;
    create trigger synthetic_fail before insert on public.audit_log for each row execute function public.synthetic_fail_audit();`);
  await assert.rejects(() => approve(), /synthetic failure/, 'Failure at the last write rolls the entire approval back');
  assert.equal((await db.query('select status from public.product_form_submissions where id=$1',[submitted.submission_id])).rows[0].status,'pending');
  for (const table of ['product_form_publication_history','media_assets','product_quantity_price_revisions','product_english_name_revisions','product_form_published_images'])
    assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n,0, `No partial ${table}`);
  await db.exec('drop trigger synthetic_fail on public.audit_log; drop function public.synthetic_fail_audit()');
  const result = await approve(); assert.equal(result.status,'approved');
  const state = (await db.query(`select p.name,p.ready_for_buyer,p.featured_media_id,p.certifications,s.status,s.approved_price_revision_id,
    s.approved_product_updated_at=p.updated_at as baseline, r.status as price_status, n.english_name,
    (select count(*)::int from public.product_form_published_images i where i.product_id=p.id) as images,
    (select count(*)::int from public.product_form_publication_history h where h.product_id=p.id) as history
    from public.supplier_products p join public.product_form_submissions s on s.product_id=p.id
    join public.product_quantity_price_revisions r on r.id=s.approved_price_revision_id
    join public.product_english_name_revisions n on n.product_id=p.id and n.status='approved' where p.id=$1`,[product])).rows[0];
  assert.equal(state.name,'Nhân điều'); assert.equal(state.ready_for_buyer,true); assert.equal(state.featured_media_id,ids.copy);
  assert.equal(state.status,'approved'); assert.equal(state.price_status,'approved'); assert.equal(state.baseline,true);
  assert.equal(state.english_name,'Cashew kernels'); assert.equal(state.images,1); assert.equal(state.history,1);
  const rebased = (await db.query(`select d.revision, d.payload->>'priceConsent' consent, d.base_product_updated_at=p.updated_at as baseline
    from public.product_form_drafts d join public.supplier_products p on p.id=d.product_id where d.product_id=$1`,[product])).rows[0];
  assert.deepEqual(rebased,{revision:3,consent:'false',baseline:true}, 'Exact submitted draft is rebased with fresh consent and CAS');
  assert.equal((await approve()).status,'context_changed', 'An already decided submission is not replayed');
  const payload2 = { ...payload, name:'Nhân điều mới' }, quantity2 = { ...quantity, tiers:[{ ...quantity.tiers[0],priceCentsPerUnit:590 }] };
  const saved2 = (await db.query('select public.save_product_form_draft_checked($1,$2,$3,$4::jsonb) x',
    [ids.supplier,product,3,JSON.stringify(payload2)])).rows[0].x;
  assert.equal(saved2.revision,4);
  const submitted2 = (await db.query('select public.submit_product_form_draft_selected_images($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) x',
    [ids.supplier,product,'synthetic-user',false,4,JSON.stringify(payload2),JSON.stringify(quantity2),'[]',JSON.stringify(refs)])).rows[0].x;
  assert.equal(submitted2.status,'submitted');
  const pendingProduct = (await db.query('select name,name_i18n,ref_price,featured_media_id from public.supplier_products where id=$1',[product])).rows[0];
  assert.equal(pendingProduct.name,'Nhân điều'); assert.equal(pendingProduct.name_i18n.en,'Cashew kernels');
  assert.equal(Number(pendingProduct.ref_price),6.4); assert.equal(pendingProduct.featured_media_id,ids.copy);
  const ctx2 = (await db.query('select public.product_form_review_context($1,$2) x',[product,submitted2.submission_id])).rows[0].x;
  assert.equal(ctx2.status,'ok');
  const newer = { ...payload2, name:'Thay đổi sau khi gửi' };
  assert.equal((await db.query('select public.save_product_form_draft_checked($1,$2,$3,$4::jsonb) x',
    [ids.supplier,product,4,JSON.stringify(newer)])).rows[0].x.revision,5);
  const copy2='ffffffff-ffff-ffff-ffff-ffffffffffff';
  const images2=[{ ...images[0], mediaId:copy2,storagePath:`product-form-images/${product}/${copy2}.webp`,
    thumbPath:`product-form-images/${product}/${copy2}-thumb.webp` }];
  const patch2={ ...patch,name:'Nhân điều mới',name_i18n:{en:'Updated cashews'},ref_price:5.9 };
  const approved2=(await db.query('select public.approve_product_form_submission($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) x',
    [product,submitted2.submission_id,ids.actor,JSON.stringify(ctx2),JSON.stringify(patch2),JSON.stringify(images2),'[]'])).rows[0].x;
  assert.equal(approved2.status,'approved');
  const changed = (await db.query(`select p.name,p.name_i18n,p.ref_price,p.featured_media_id,d.payload,d.revision,
    d.base_product_updated_at=p.updated_at as draft_current from public.supplier_products p join public.product_form_drafts d on d.product_id=p.id where p.id=$1`,[product])).rows[0];
  assert.equal(changed.name,'Nhân điều mới'); assert.equal(changed.name_i18n.en,'Updated cashews'); assert.equal(Number(changed.ref_price),5.9);
  assert.equal(changed.featured_media_id,copy2); assert.equal(changed.payload.name,newer.name); assert.equal(changed.revision,5);
  assert.equal(changed.draft_current,false,'A newer draft is preserved, not silently rebased');
  assert.equal((await db.query('select count(*)::int n from public.media_assets where product_id=$1',[product])).rows[0].n,2, 'Old public media rows remain intact');
  assert.equal((await db.query("select count(*)::int n from public.product_quantity_price_revisions where product_id=$1 and status='superseded'",[product])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from public.product_form_publication_history where product_id=$1',[product])).rows[0].n,2);
  const security = (await db.query(`select has_function_privilege('anon','public.approve_product_form_submission(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','execute') a,
    has_function_privilege('authenticated','public.approve_product_form_submission(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','execute') b,
    has_function_privilege('service_role','public.approve_product_form_submission(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)','execute') c,
    has_table_privilege('service_role','public.product_form_publication_history','update') u`)).rows[0];
  assert.deepEqual(security,{a:false,b:false,c:true,u:false});
  console.log('Atomic form approval: context, authorization, snapshot, revisions, manifest, history and ACL passed');
} finally { await db.close(); }
