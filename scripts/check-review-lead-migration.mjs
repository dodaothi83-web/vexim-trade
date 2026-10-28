// Real PostgreSQL semantics in PGlite; no production database is contacted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create table public.app_users (id uuid primary key, email text not null, role text not null, is_active boolean not null);
create table public.audit_log (id bigserial primary key, actor_id uuid references public.app_users(id), actor_email text,
 entity text not null, entity_id text not null, action text not null, before jsonb, after jsonb);
create table public.verifications (id uuid primary key, supplier_id uuid not null, target_level integer not null,
 status text not null, inspector_id uuid, approved_by uuid, approved_at timestamptz,
 self_approved boolean default false not null, legacy_self_approved boolean default false not null);
create function public.check_verification_self_approval() returns trigger language plpgsql as $$begin return new; end$$;
create trigger verifications_self_approval_guard before insert or update of status, inspector_id, approved_by, self_approved, legacy_self_approved
 on public.verifications for each row execute function public.check_verification_self_approval();
insert into public.app_users values
 ('00000000-0000-4000-8000-000000000001','admin@example.com','admin',true),
 ('00000000-0000-4000-8000-000000000002','lead@example.com','reviewer',true),
 ('00000000-0000-4000-8000-000000000003','sourcing@example.com','sourcing',true),
 ('00000000-0000-4000-8000-000000000004','sale@example.com','sale',true);
insert into public.verifications (id,supplier_id,target_level,status,inspector_id)
 values ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000200',1,'submitted','00000000-0000-4000-8000-000000000002');
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261049_review_lead_and_sourcing_hold.sql', import.meta.url), 'utf8'));
const one = async (sql) => (await db.query(sql)).rows[0];
assert.equal((await one("select is_active from app_users where role='sourcing'")).is_active, false);
assert.equal(Number((await one("select count(*) n from audit_log where action='user.sourcing_role_suspended'")).n), 1);
await assert.rejects(db.exec("update app_users set is_active=true where role='sourcing'"), /temporarily disabled/);
await assert.rejects(db.exec("update app_users set role='sourcing' where role='sale'"), /temporarily disabled/);
await assert.rejects(db.exec("insert into app_users values ('00000000-0000-4000-8000-000000000005','x','sourcing',false)"), /temporarily disabled/);
const review = '00000000-0000-4000-8000-000000000100';
const lead = '00000000-0000-4000-8000-000000000002';
const sale = '00000000-0000-4000-8000-000000000004';
const now = '2026-10-28 08:00:00+00';
await assert.rejects(db.exec(`insert into verifications (id,supplier_id,target_level,status) values ('00000000-0000-4000-8000-000000000999','00000000-0000-4000-8000-000000000200',1,'approved')`), /must be submitted/);
await assert.rejects(db.exec(`update verifications set status='approved', approved_by='${lead}', approved_at='${now}', self_approved=true where id='${review}'`), /confirmation is required/);
assert.equal((await one(`select status from verifications where id='${review}'`)).status, 'submitted');
await assert.rejects(db.exec(`update verifications set status='approved', approved_by='${sale}', approved_at='${now}', evidence_confirmed_by='${sale}', evidence_confirmed_at='${now}', self_approved=false where id='${review}'`), /active admin or review lead/);
await db.exec(`update verifications set status='approved', approved_by='${lead}', approved_at='${now}', evidence_confirmed_by='${lead}', evidence_confirmed_at='${now}', self_approved=true where id='${review}'`);
const log = await one("select actor_id, action, after from audit_log where action like 'verification.evidence_confirmation%'");
assert.equal(log.actor_id, lead); assert.equal(log.action, 'verification.evidence_confirmation.l1');
assert.equal(log.after.confirmed_by, lead); assert.equal(log.after.self_approved, true);
await assert.rejects(db.exec(`update verifications set status='approved', approved_at=now() where id='${review}'`), /already been approved/);
// Failed logging rolls back the approval itself.
await db.exec(`alter table audit_log add constraint block_approval_logs check (action not like 'verification.evidence_confirmation%') not valid;
 insert into verifications (id,supplier_id,target_level,status,inspector_id) values
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000200',1,'submitted','${lead}');`);
await assert.rejects(db.exec(`update verifications set status='approved', approved_by='${lead}', approved_at='${now}', evidence_confirmed_by='${lead}', evidence_confirmed_at='${now}', self_approved=true where id='00000000-0000-4000-8000-000000000101'`), /block_approval_logs/);
assert.equal((await one("select status from verifications where id='00000000-0000-4000-8000-000000000101'")).status, 'submitted');
await db.close();
console.log('✅ Review-lead migration: sourcing lock, confirmation, role gate, single-person approval, atomic audit and rollback.');
