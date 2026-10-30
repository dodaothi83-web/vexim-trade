// Disposable PostgreSQL-compatible checks; never touches Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = readFileSync(new URL('../supabase/migrations/20261041_l2_factory_submission_guards.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (n) => `'${id(n)}'`;
const keys = ['factory_gate', 'raw_material_warehouse', 'production_line_running', 'packing_area',
  'finished_goods_warehouse', 'open_carton_lot_label', 'hygiene_station', 'worker_ppe', 'pest_control'];
const exec = (sql) => db.exec(sql);
const fail = (sql, expected) => assert.rejects(exec(sql), expected);
try {
  await exec(`
    create table public.supplier_submissions (
      id uuid primary key, supplier_id uuid not null, target_level smallint not null, l2_scope text,
      status text not null, verification_code text, code_issued_at timestamptz
    );
    create table public.supplier_submission_items (
      id uuid primary key, submission_id uuid not null references public.supplier_submissions(id) on delete cascade,
      supplier_id uuid not null, checklist_key text not null, media_id uuid, storage_path text,
      thumb_path text, mime text, flags jsonb not null default '[]', ai_verdict text
    );
    insert into public.supplier_submissions values
      (${q(1)},${q(11)},2,null,'returned',null,null),
      (${q(2)},${q(12)},2,'partner_contract','draft',null,null),
      (${q(3)},${q(13)},3,null,'draft',null,null);
  `);
  await exec(migration);
  await exec(migration);
  assert.equal((await db.query(`select status from public.supplier_submissions where id=${q(1)}`)).rows[0].status, 'returned', 'Existing rows are not moved');
  assert.ok(schema.includes(migration.trim()), 'Consolidated schema contains the migration');
  assert.match(migration, /where id = parent_id for update/i, 'File edits use the parent lock');

  const submit = `update public.supplier_submissions set status='pending_review' where id=${q(1)}`;
  await fail(submit, /L2_FACTORY_CODE_REQUIRED/);
  await exec(`update public.supplier_submissions set verification_code='VX-L2-ABCD-EFGH',code_issued_at=now()-interval '73 hours' where id=${q(1)}`);
  await fail(submit, /L2_FACTORY_CODE_REQUIRED/);
  await exec(`update public.supplier_submissions set code_issued_at=now() where id=${q(1)}`);
  await fail(submit, /L2_FACTORY_PHOTOS_REQUIRED/);
  await fail(`insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key) values (${q(50)},${q(1)},${q(12)},'factory_gate')`, /L2_FACTORY_ITEM_INVALID/);
  for (let i = 0; i < keys.length; i++) {
    await exec(`insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key,media_id,storage_path)
      values (${q(100 + i)},${q(1)},${q(11)},'${keys[i]}',${q(200 + i)},'photos/${i}.jpg')`);
  }
  await exec(`update public.supplier_submission_items set storage_path=null where id=${q(108)}`);
  await fail(submit, /L2_FACTORY_PHOTOS_REQUIRED/);
  await exec(`update public.supplier_submission_items set storage_path='photos/8.jpg' where id=${q(108)}`);
  await exec(`update public.supplier_submission_items set flags='[{"flag":"code_missing","severity":"hard","source":"system"}]' where id=${q(100)}`);
  await fail(submit, /L2_FACTORY_CODE_REQUIRED/);
  // Old AI flags and technical flags must not be mistaken for system code gates.
  await exec(`update public.supplier_submission_items set flags='[{"flag":"code_missing","severity":"hard","source":"ai"}]' where id=${q(100)};
    update public.supplier_submission_items set flags='[{"flag":"no_gps","severity":"hard","source":"gps"}]' where id=${q(101)};`);
  await exec(submit);
  await fail(`delete from public.supplier_submission_items where id=${q(100)}`, /L2_FACTORY_LOCKED/);
  await fail(`insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key) values (${q(51)},${q(1)},${q(11)},'factory_gate')`, /L2_FACTORY_LOCKED/);
  await fail(`update public.supplier_submission_items set storage_path='replaced.jpg' where id=${q(100)}`, /L2_FACTORY_LOCKED/);
  await exec(`update public.supplier_submission_items set ai_verdict='fail',flags='[{"flag":"content_mismatch","source":"ai","severity":"warning"}]' where id=${q(100)}`);
  await exec(`update public.supplier_submissions set status='returned' where id=${q(1)}; delete from public.supplier_submission_items where id=${q(108)}`);
  await fail(submit, /L2_FACTORY_PHOTOS_REQUIRED/);
  await exec(`insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key,media_id,storage_path)
    values (${q(109)},${q(1)},${q(11)},'pest_control',${q(209)},'photos/new.jpg')`);
  await exec(submit);
  await exec(`delete from public.supplier_submissions where id=${q(1)}`);
  assert.equal((await db.query(`select count(*)::int as n from public.supplier_submission_items where submission_id=${q(1)}`)).rows[0].n, 0, 'Parent cascades remain possible');

  // These factory-only guards do not impose the nine-photo rule on L2 partner or L3.
  await exec(`insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key) values
      (${q(60)},${q(2)},${q(12)},'partner_factory_contract'),(${q(61)},${q(3)},${q(13)},'other_export_evidence');
    update public.supplier_submissions set status='pending_review' where id in (${q(2)},${q(3)});`);
  await exec(`delete from public.supplier_submission_items where id in (${q(60)},${q(61)})`);
  console.log('✅ L2 factory migration: structural queue gates, advisory AI flags, locked evidence and legacy/manual scopes.');
} finally {
  await db.close();
}
