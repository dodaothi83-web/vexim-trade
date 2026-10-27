// Disposable PostgreSQL-compatible migration/guard regression. Never touches Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = readFileSync(new URL('../supabase/migrations/20261040_l2_partner_contract.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (n) => `'${id(n)}'`;
const exec = (sql) => db.exec(sql);
const expect = (sql, error) => assert.rejects(exec(sql), error);

try {
  // Foreign keys and pre-migration unique index mirror the production relationships.
  await exec(`
    create table public.suppliers (id uuid primary key, supplier_type text);
    create table public.verifications (id uuid primary key, supplier_id uuid not null references public.suppliers(id) on delete cascade,
      target_level smallint not null, status text not null, checklist jsonb not null default '{}');
    create table public.supplier_submissions (id uuid primary key, supplier_id uuid not null references public.suppliers(id) on delete cascade,
      target_level smallint not null, status text not null);
    create unique index supplier_submissions_one_open_per_level on public.supplier_submissions(supplier_id,target_level) where status <> 'accepted';
    create table public.media_assets (id uuid primary key, owner_type text not null, supplier_id uuid references public.suppliers(id) on delete cascade,
      verification_id uuid references public.verifications(id) on delete cascade,
      submission_id uuid references public.supplier_submissions(id) on delete cascade,
      audience text not null, checklist_key text, kind text not null, status text not null, storage_path text);
    create table public.supplier_submission_items (id uuid primary key,
      submission_id uuid not null references public.supplier_submissions(id) on delete cascade,
      supplier_id uuid not null references public.suppliers(id) on delete cascade,
      checklist_key text not null, media_id uuid references public.media_assets(id) on delete set null, storage_path text);
    insert into public.suppliers values (${q(1)},'manufacturer'),(${q(2)},'trading'),(${q(3)},'cooperative'),(${q(4)},null);
    insert into public.supplier_submissions values (${q(21)},${q(1)},2,'draft'),(${q(22)},${q(2)},2,'draft');
    insert into public.verifications(id,supplier_id,target_level,status) values (${q(12)},${q(2)},2,'approved');
    insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key) values (${q(31)},${q(21)},${q(1)},'factory_gate');
  `);
  await exec(migration);
  await exec(migration); // Idempotent, with no backfill of old records.
  const legacy = (await db.query(`select status,l2_scope from public.verifications where id=${q(12)}`)).rows[0];
  assert.deepEqual(legacy, { status: 'approved', l2_scope: null });
  assert.equal((await db.query(`select l2_scope from public.supplier_submissions where id=${q(22)}`)).rows[0].l2_scope, null);
  assert.ok(schema.includes(migration.trim()), 'Consolidated schema contains the exact migration');

  // Existing NULL = factory; the old factory flow must not accidentally be locked by SQL NULL logic.
  await exec(`update public.supplier_submissions set status='pending_review' where id=${q(21)};`);
  await exec(`delete from public.supplier_submission_items where id=${q(31)};`);
  await expect(`insert into public.supplier_submissions(id,supplier_id,target_level,status,l2_scope) values (${q(25)},${q(1)},2,'draft','partner_contract')`, /L2_SCOPE_TYPE_MISMATCH/);
  await expect(`insert into public.supplier_submissions(id,supplier_id,target_level,status,l2_scope) values (${q(26)},${q(4)},2,'draft','factory')`, /L2_SCOPE_TYPE_MISMATCH/);
  await expect(`insert into public.supplier_submissions(id,supplier_id,target_level,status,l2_scope) values (${q(27)},${q(2)},2,'draft','factory')`, /L2_SCOPE_TYPE_MISMATCH/);
  await exec(`insert into public.supplier_submissions(id,supplier_id,target_level,status,l2_scope) values (${q(23)},${q(2)},2,'draft','partner_contract'),(${q(24)},${q(3)},2,'draft','factory');`);
  await expect(`insert into public.supplier_submissions(id,supplier_id,target_level,status,l2_scope) values (${q(28)},${q(2)},2,'draft','partner_contract')`, /unique/i);
  await expect(`update public.supplier_submissions set l2_scope='factory' where id=${q(23)}`, /VERIFICATION_SCOPE_IMMUTABLE/);
  await expect(`update public.supplier_submissions set supplier_id=${q(1)} where id=${q(23)}`, /VERIFICATION_SCOPE_IMMUTABLE/);
  await expect(`update public.supplier_submissions set status='pending_review' where id=${q(23)}`, /L2_PARTNER_CONTRACT_REQUIRED/);
  await expect(`insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key) values (${q(32)},${q(23)},${q(2)},'factory_gate')`, /L2_PARTNER_KEY_MISMATCH/);
  await expect(`insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key) values (${q(33)},${q(23)},${q(1)},'partner_factory_contract')`, /L2_PARTNER_KEY_MISMATCH/);
  await expect(`insert into public.media_assets values (${q(41)},'submission',${q(2)},null,${q(23)},'buyer','partner_factory_contract','document','unverified','contract.pdf')`, /L2_PARTNER_PRIVATE_EVIDENCE/);
  await expect(`insert into public.media_assets values (${q(42)},'submission',${q(2)},null,${q(23)},'internal','partner_factory_photos','document','unverified','photo.pdf')`, /L2_PARTNER_PRIVATE_EVIDENCE/);

  // A forged item referencing another supplier's file does not establish readiness.
  await exec(`insert into public.media_assets values (${q(43)},'supplier',${q(1)},null,null,'internal',null,'document','unverified','elsewhere.pdf');
    insert into public.supplier_submission_items values (${q(34)},${q(23)},${q(2)},'partner_factory_contract',${q(43)},'elsewhere.pdf');`);
  await expect(`update public.supplier_submissions set status='pending_review' where id=${q(23)}`, /L2_PARTNER_CONTRACT_REQUIRED/);
  await exec(`delete from public.supplier_submission_items where id=${q(34)}`);

  for (const n of [44, 45, 46, 47]) {
    await exec(`insert into public.media_assets values (${q(n)},'submission',${q(2)},null,${q(23)},'internal','partner_factory_contract','document','unverified','c${n}.pdf')`);
  }
  for (const n of [44, 45, 46]) {
    await exec(`insert into public.supplier_submission_items values (${q(n + 10)},${q(23)},${q(2)},'partner_factory_contract',${q(n)},'c${n}.pdf')`);
  }
  await expect(`insert into public.supplier_submission_items values (${q(57)},${q(23)},${q(2)},'partner_factory_contract',${q(47)},'c47.pdf')`, /L3_EVIDENCE_LIMIT/);
  await exec(`insert into public.supplier_submission_items values (${q(58)},${q(23)},${q(2)},'partner_factory_contract',null,null)`);
  await expect(`update public.supplier_submission_items set media_id=${q(47)},storage_path='c47.pdf' where id=${q(58)}`, /L3_EVIDENCE_LIMIT/);
  await exec(`update public.supplier_submissions set status='pending_review' where id=${q(23)}`);
  await expect(`delete from public.supplier_submission_items where id=${q(54)}`, /L3_SUBMISSION_LOCKED/);
  await expect(`update public.supplier_submission_items set storage_path='replaced.pdf' where id=${q(54)}`, /L3_SUBMISSION_LOCKED/);
  await expect(`update public.media_assets set storage_path='replaced.pdf' where id=${q(44)}`, /L3_SUBMISSION_LOCKED/);
  await expect(`delete from public.media_assets where id=${q(44)}`, /L3_SUBMISSION_LOCKED/);
  // An upload that lost a race with submission and has no item may be cleaned up.
  await exec(`delete from public.media_assets where id=${q(47)}`);
  await exec(`update public.supplier_submissions set status='returned' where id=${q(23)}; delete from public.supplier_submission_items where id=${q(56)};`);
  await exec(`update public.supplier_submissions set status='pending_review' where id=${q(23)}`);

  // A partner result is a separate human decision, even with a historical factory approval.
  await expect(`insert into public.verifications(id,supplier_id,target_level,status,l2_scope) values (${q(61)},${q(2)},2,'approved','partner_contract')`, /L2_PARTNER_APPROVAL_REQUIRES_REVIEW/);
  await exec(`insert into public.verifications(id,supplier_id,target_level,status,l2_scope) values (${q(62)},${q(2)},2,'in_progress','partner_contract')`);
  await expect(`update public.verifications set l2_scope='factory' where id=${q(62)}`, /VERIFICATION_SCOPE_IMMUTABLE/);
  await expect(`update public.verifications set status='approved' where id=${q(62)}`, /L2_PARTNER_CONTRACT_CHECK_REQUIRED/);
  await expect(`insert into public.media_assets values (${q(71)},'verification',${q(2)},${q(62)},null,'buyer','partner_factory_contract','document','checked','review.pdf')`, /L2_PARTNER_PRIVATE_EVIDENCE/);
  await exec(`insert into public.media_assets values (${q(72)},'verification',${q(2)},${q(62)},null,'internal','partner_factory_contract','document','unverified','review.pdf')`);
  await expect(`update public.verifications set status='approved' where id=${q(62)}`, /L2_PARTNER_CONTRACT_CHECK_REQUIRED/);
  await exec(`update public.media_assets set status='checked' where id=${q(72)}; update public.verifications set status='submitted' where id=${q(62)}`);
  await expect(`update public.media_assets set status='unverified' where id=${q(72)}`, /L2_PARTNER_REVIEW_LOCKED/);
  await expect(`update public.verifications set status='approved' where id=${q(62)}`, /L2_PARTNER_SCOPE_CONFIRM_REQUIRED/);
  await expect(`update public.verifications set status='approved',checklist='{"partner_identity_confirmed":true}' where id=${q(62)}`, /L2_PARTNER_SCOPE_CONFIRM_REQUIRED/);
  await exec(`update public.verifications set status='approved',checklist='{"partner_identity_confirmed":true,"partner_scope_confirmed":true}' where id=${q(62)}`);
  await expect(`delete from public.media_assets where id=${q(72)}`, /L2_PARTNER_REVIEW_LOCKED/);
  await expect(`update public.media_assets set audience='buyer' where id=${q(72)}`, /L2_PARTNER_REVIEW_LOCKED/);
  assert.equal((await db.query(`select count(*)::int as n from public.verifications where supplier_id=${q(2)} and status='approved'`)).rows[0].n, 2);

  // Change type: old conclusions stay as they were; a wrong-scope queue/approval cannot proceed.
  await exec(`update public.supplier_submissions set status='returned' where id=${q(23)}; update public.suppliers set supplier_type='manufacturer' where id=${q(2)}`);
  await expect(`update public.supplier_submissions set status='pending_review' where id=${q(23)}`, /L2_SCOPE_TYPE_MISMATCH/);
  await expect(`insert into public.verifications(id,supplier_id,target_level,status,l2_scope) values (${q(63)},${q(2)},2,'in_progress','partner_contract')`, /L2_SCOPE_TYPE_MISMATCH/);
  assert.equal((await db.query(`select l2_scope from public.verifications where id=${q(62)}`)).rows[0].l2_scope, 'partner_contract');

  // Parent deletion/cascades must not become impossible because evidence is locked.
  await exec(`delete from public.suppliers where id=${q(2)}`);
  assert.equal((await db.query(`select count(*)::int as n from public.verifications where supplier_id=${q(2)}`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.media_assets where supplier_id=${q(2)}`)).rows[0].n, 0);
  // Run the new factory guards after the partner migration and exercise their
  // interaction with its existing triggers and foreign-key cascades.
  await exec(`alter table public.supplier_submissions add column verification_code text, add column code_issued_at timestamptz;
    alter table public.supplier_submission_items add column flags jsonb not null default '[]', add column thumb_path text, add column mime text, add column ai_verdict text;`);
  const factoryGuard = readFileSync(new URL('../supabase/migrations/20261041_l2_factory_submission_guards.sql', import.meta.url), 'utf8');
  await exec(factoryGuard);
  assert.equal((await db.query(`select status from public.supplier_submissions where id=${q(21)}`)).rows[0].status, 'pending_review', 'Existing factory status is preserved');
  await exec(`insert into public.suppliers values (${q(5)},'manufacturer');
    insert into public.supplier_submissions(id,supplier_id,target_level,status,l2_scope,verification_code,code_issued_at)
      values (${q(80)},${q(5)},2,'draft','factory','VX-L2-ABCD-EFGH',now());`);
  const factoryKeys = ['factory_gate','raw_material_warehouse','production_line_running','packing_area','finished_goods_warehouse','open_carton_lot_label','hygiene_station','worker_ppe','pest_control'];
  for (const [index, key] of factoryKeys.entries()) {
    await exec(`insert into public.media_assets values (${q(100 + index)},'submission',${q(5)},null,${q(80)},'internal','${key}','image','unverified','factory-${index}.jpg');
      insert into public.supplier_submission_items(id,submission_id,supplier_id,checklist_key,media_id,storage_path)
        values (${q(120 + index)},${q(80)},${q(5)},'${key}',${q(100 + index)},'factory-${index}.jpg');`);
  }
  await exec(`update public.supplier_submission_items set flags='[{"flag":"code_missing","source":"ai","severity":"hard"}]' where id=${q(120)};
    update public.supplier_submissions set status='pending_review' where id=${q(80)};
    update public.supplier_submission_items set ai_verdict='fail' where id=${q(120)};`);
  await expect(`delete from public.supplier_submission_items where id=${q(120)}`, /L2_FACTORY_LOCKED/);
  await expect(`delete from public.media_assets where id=${q(100)}`, /L2_FACTORY_LOCKED/);
  await exec(`delete from public.suppliers where id=${q(5)}`);
  assert.equal((await db.query(`select count(*)::int as n from public.supplier_submission_items where submission_id=${q(80)}`)).rows[0].n, 0, 'Factory cascade still works with both migrations');
  console.log('✅ L2 migration: legacy scope preserved, partner contract/private files and human approval guarded; scope changes, combined factory guards and cascades tested.');
} finally {
  await db.close();
}
