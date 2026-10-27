// Offline, disposable PostgreSQL-compatible test. Does not touch Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const prior = readFileSync(new URL('../supabase/migrations/20261031_supplier_submission_media_owner.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261039_l3_other_export_evidence.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
try {
  await db.exec(`
    create table public.supplier_submissions (id uuid primary key, target_level smallint not null, status text not null);
    create table public.media_assets (
      id uuid primary key, owner_type text, product_id uuid, supplier_id uuid,
      verification_id uuid, audience text, checklist_key text, sort_order int default 0,
      created_at timestamptz default now()
    );
    create table public.supplier_submission_items (
      id uuid primary key, submission_id uuid not null references public.supplier_submissions(id) on delete cascade,
      checklist_key text not null, media_id uuid, storage_path text,
      constraint supplier_submission_items_key_ck check (checklist_key in (
        'factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
        'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe',
        'pest_control', 'bill_of_lading', 'customs_declaration', 'commercial_invoice',
        'packing_list', 'certificate_of_origin', 'phytosanitary_or_health'
      ))
    );
    insert into public.supplier_submissions values
      ('00000000-0000-0000-0000-000000000101', 3, 'draft'),
      ('00000000-0000-0000-0000-000000000102', 2, 'draft');
  `);
  await db.exec(prior);
  await db.exec(`
    insert into public.supplier_submission_items(id,submission_id,checklist_key) values
      ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','bill_of_lading'),
      ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000101','customs_declaration'),
      ('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000102','factory_gate');
    insert into public.media_assets(id,owner_type,supplier_id,submission_id,audience,checklist_key)
      values ('00000000-0000-0000-0000-000000000301','submission',
        '00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000101',
        'internal','bill_of_lading');
  `);
  const before = await db.query('select id, checklist_key from public.supplier_submission_items order by id');
  await db.exec(migration);
  await db.exec(migration); // Idempotent; preserves old rows when run again.
  assert.deepEqual((await db.query('select id, checklist_key from public.supplier_submission_items order by id')).rows, before.rows);
  await db.exec(`
    insert into public.supplier_submission_items(id,submission_id,checklist_key,media_id,storage_path) values
      ('00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-000000000101',
       'other_export_evidence','00000000-0000-0000-0000-000000000302','supplier-submissions/a.pdf');
    insert into public.media_assets(id,owner_type,supplier_id,submission_id,audience,checklist_key)
      values ('00000000-0000-0000-0000-000000000302','submission',
        '00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000101',
        'internal','other_export_evidence');
    insert into public.media_assets(id,owner_type,supplier_id,verification_id,audience,checklist_key)
      values ('00000000-0000-0000-0000-000000000303','verification',
        '00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000501',
        'internal','other_export_evidence');
  `);
  await assert.rejects(db.exec(`insert into public.supplier_submission_items(id,submission_id,checklist_key)
    values ('00000000-0000-0000-0000-000000000205','00000000-0000-0000-0000-000000000101','unrecognized')`));
  await assert.rejects(db.exec(`insert into public.media_assets(id,owner_type,supplier_id,submission_id,audience,checklist_key)
    values ('00000000-0000-0000-0000-000000000304','submission','00000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000101','buyer','other_export_evidence')`), /media_owner_ck/);
  await assert.rejects(db.exec(`insert into public.media_assets(id,owner_type,supplier_id,product_id,audience,checklist_key)
    values ('00000000-0000-0000-0000-000000000305','product','00000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000601','buyer','other_export_evidence')`), /media_checklist_key_ck/);
  assert.equal((await db.query('select count(*)::int as count from public.media_assets')).rows[0].count, 3);

  // Database guards: no empty queue entry, max three, lock after submission, and
  // allow edits after return. They lock the parent row so SQL serializes with submit.
  await db.exec(`
    insert into public.supplier_submissions values ('00000000-0000-0000-0000-000000000103',3,'draft');
    insert into public.supplier_submission_items(id,submission_id,checklist_key) values
      ('00000000-0000-0000-0000-000000000210','00000000-0000-0000-0000-000000000103','other_export_evidence');
  `);
  await assert.rejects(db.exec(`update public.supplier_submissions set status='pending_review'
    where id='00000000-0000-0000-0000-000000000103'`), /L3_EVIDENCE_REQUIRED/);
  const row = (index) => `('00000000-0000-0000-0000-00000000021${index}',
    '00000000-0000-0000-0000-000000000103','other_export_evidence',
    '00000000-0000-0000-0000-00000000031${index}','supplier-submissions/${index}.pdf')`;
  const insert = (index) => `insert into public.supplier_submission_items(id,submission_id,checklist_key,media_id,storage_path) values ${row(index)}`;
  for (const index of [1, 2, 3]) await db.exec(insert(index));
  await assert.rejects(db.exec(insert(4)), /L3_EVIDENCE_LIMIT/);
  await db.exec(`delete from public.supplier_submission_items where id='00000000-0000-0000-0000-000000000211'`);
  await db.exec(insert(4));
  await db.exec(`update public.supplier_submissions set status='pending_review'
    where id='00000000-0000-0000-0000-000000000103'`);
  await assert.rejects(db.exec(`delete from public.supplier_submission_items where id='00000000-0000-0000-0000-000000000212'`), /L3_SUBMISSION_LOCKED/);
  await assert.rejects(db.exec(insert(5)), /L3_SUBMISSION_LOCKED/);
  await db.exec(`update public.supplier_submissions set status='returned'
    where id='00000000-0000-0000-0000-000000000103'`);
  await db.exec(`delete from public.supplier_submission_items where id='00000000-0000-0000-0000-000000000212'`);
  await db.exec(`update public.supplier_submissions set status='pending_review'
    where id='00000000-0000-0000-0000-000000000103'`);
  // Parent deletion must still be able to cascade even when the old status was locked.
  await db.exec(`delete from public.supplier_submissions where id='00000000-0000-0000-0000-000000000103'`);
  assert.equal((await db.query(`select count(*)::int as n from public.supplier_submission_items where submission_id='00000000-0000-0000-0000-000000000103'`)).rows[0].n, 0);

  // L2 is not subject to the new L3 guards.
  await db.exec(`update public.supplier_submissions set status='pending_review' where id='00000000-0000-0000-0000-000000000102'`);
  await db.exec(`delete from public.supplier_submission_items where id='00000000-0000-0000-0000-000000000203'`);

  // A worker with table rights can fire the triggers even though trigger functions
  // are not publicly executable. Nothing below uses a real Supabase role/key.
  await db.exec(`create role l3_test_worker;
    grant usage on schema public to l3_test_worker;
    grant select, insert, delete, update on public.supplier_submissions, public.supplier_submission_items to l3_test_worker;
    set role l3_test_worker;`);
  await db.exec(`insert into public.supplier_submission_items(id,submission_id,checklist_key,media_id,storage_path)
    values ('00000000-0000-0000-0000-000000000220','00000000-0000-0000-0000-000000000101',
      'packing_list','00000000-0000-0000-0000-000000000320','supplier-submissions/worker.pdf')`);
  await db.exec('reset role');

  assert.ok((schema.match(/'other_export_evidence'/g) ?? []).length >= 2, 'Schema must list new key in both constraints');
  assert.ok(schema.includes('guard_l3_submission_item_mutation') && schema.includes('guard_l3_pending_evidence'));
  console.log('✅ L3 migration: existing rows preserved, private keys accepted, queue/file guards enforced; L2 unchanged.');
} finally {
  await db.close();
}
