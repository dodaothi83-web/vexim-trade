import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create table public.suppliers (id uuid primary key, status text not null, onboarding_status text not null,
 name text, products text, phone text, tax_id text, supplier_type text, is_demo boolean default false, slug text, summary_i18n jsonb default '{}');
create table public.app_users (id uuid primary key, email text not null, role text not null, is_active boolean not null, supplier_id uuid);
create table public.audit_log (id bigserial primary key, actor_id uuid references public.app_users(id), actor_email text, entity text not null, entity_id text not null, action text not null, before jsonb, after jsonb);
create table public.verifications (id uuid primary key, supplier_id uuid not null, target_level integer not null, status text not null, inspector_id uuid, approved_by uuid, approved_at timestamptz, self_approved boolean default false not null, legacy_self_approved boolean default false not null);
create function public.check_verification_self_approval() returns trigger language plpgsql as $$begin return new; end$$;
create trigger verifications_self_approval_guard before insert or update of status, inspector_id, approved_by, self_approved, legacy_self_approved on public.verifications for each row execute function public.check_verification_self_approval();
insert into app_users values ('00000000-0000-4000-8000-000000000001', 'lead@example.com','reviewer',true,null);
`);
for (const file of ['20261049_review_lead_and_sourcing_hold.sql','20261050_l1_auto_publish_new_supplier.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=uid(1);
async function setup(n,{status='draft',onboarding='approved',eligible=true,active=true,demo=false,level=1}={}) {
  await db.exec(`insert into suppliers (id,status,onboarding_status,auto_publish_after_l1,name,products,phone,tax_id,supplier_type,is_demo,slug) values ('${uid(n)}','${status}','${onboarding}',${eligible},'Company ${n}','Pepper','123','123','manufacturer',${demo},'company-${n}');
  insert into app_users values ('${uid(n+100)}','supplier${n}@example.com','supplier',${active},'${uid(n)}');
  insert into verifications (id,supplier_id,target_level,status,inspector_id) values ('${uid(n+200)}','${uid(n)}',${level},'submitted','${actor}');`);
}
const approve=(n)=>db.exec(`update verifications set status='approved',approved_by='${actor}',approved_at=now(),evidence_confirmed_by='${actor}',evidence_confirmed_at=now(),self_approved=true where id='${uid(n+200)}'`);
const row=async(n)=>(await db.query(`select s.status,s.auto_publish_after_l1,v.status review from suppliers s join verifications v on v.supplier_id=s.id where s.id='${uid(n)}'`)).rows[0];
await setup(10);
await assert.rejects(db.exec(`update suppliers set status='published' where id='${uid(10)}'`), /Approve L1/);
await approve(10);
assert.deepEqual(await row(10),{status:'published',auto_publish_after_l1:false,review:'approved'});
assert.equal(Number((await db.query(`select count(*) n from audit_log where action='supplier.auto_published_after_l1' and entity_id='${uid(10)}'`)).rows[0].n),1);
assert.equal(Number((await db.query(`select count(*) n from audit_log where action='verification.evidence_confirmation.l1' and entity_id='${uid(10)}'`)).rows[0].n),1);
// A hidden profile remains hidden after future reviews and cannot regain its first-publication flag.
await db.exec(`update suppliers set status='suspended' where id='${uid(10)}'`);
assert.equal((await row(10)).auto_publish_after_l1,false);
await setup(11,{status:'archived',eligible:false}); await approve(11);
assert.equal((await row(11)).status,'archived');
// Legacy profiles are not guessed to be new.
await setup(12,{eligible:false}); await approve(12);
assert.equal((await row(12)).status,'draft');
await setup(13,{onboarding:'pending'}); await assert.rejects(approve(13),/L1_AUTO_PUBLICATION_PORTAL_NOT_APPROVED/);
assert.equal((await row(13)).review,'submitted');
await db.exec(`update suppliers set onboarding_status='approved' where id='${uid(13)}'`); await approve(13);
assert.equal((await row(13)).status,'published');
await setup(14,{active:false}); await assert.rejects(approve(14),/L1_AUTO_PUBLICATION_PROFILE_INCOMPLETE/);
await setup(15,{demo:true}); await assert.rejects(approve(15),/L1_AUTO_PUBLICATION_TEST_PROFILE/);
await setup(16,{level:2}); await approve(16); assert.equal((await row(16)).status,'draft');
// Failure to write publication log rolls back supplier, L1 and confirmation log.
await setup(17);
await db.exec(`alter table audit_log add constraint block_auto_log check (action <> 'supplier.auto_published_after_l1') not valid`);
await assert.rejects(approve(17),/block_auto_log/);
assert.deepEqual(await row(17),{status:'draft',auto_publish_after_l1:true,review:'submitted'});
assert.equal(Number((await db.query(`select count(*) n from audit_log where entity_id='${uid(17)}'`)).rows[0].n),0);
await db.close();
console.log('✅ L1 auto-publication: roles, new profiles, disabled/hidden/legacy, retry, audit and atomic rollback.');
