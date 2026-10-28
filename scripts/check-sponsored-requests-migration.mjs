// Isolated PGlite only: validates SQL constraints and grants, not live Supabase concurrency.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [s1, s2, p1, p2, u1, u2, admin, sale, inactive, viewer] = Array.from({length:10}, (_,i) => id(i+1));
const q = (...args) => db.query(...args);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.suppliers(id uuid primary key);
    create table public.supplier_products(id uuid primary key, supplier_id uuid not null references public.suppliers(id));
    create table public.app_users(id uuid primary key, role text not null, is_active boolean not null, supplier_id uuid references public.suppliers(id));`);
  await q('insert into public.suppliers values($1),($2)', [s1,s2]);
  await q('insert into public.supplier_products values($1,$2),($3,$4)', [p1,s1,p2,s2]);
  await q("insert into public.app_users values($1,'supplier',true,$2),($3,'supplier',true,$4),($5,'admin',true,null),($6,'sale',true,null),($7,'sale',false,null),($8,'viewer',true,null)", [u1,s1,u2,s2,admin,sale,inactive,viewer]);
  const migration = await readFile(new URL('../supabase/migrations/20261043_sponsored_requests.sql', import.meta.url),'utf8');
  await db.exec(migration); await db.exec(migration);
  const insert = (idValue, supplier, product, user, extra='') => q(`insert into public.sponsored_requests(id,supplier_id,product_id,requested_by,supplier_name,product_name,category_slug,category_name,requester_email${extra ? ',status' : ''}) values($1,$2,$3,$4,'A','Pepper','pepper','Hồ tiêu','a@example.com'${extra ? ",'contacted'" : ''}) returning *`, [idValue,supplier,product,user]);
  await assert.rejects(insert(id(20),s1,p2,u1), /Invalid sponsored request owner/);
  await assert.rejects(insert(id(20),s1,p1,u2), /Invalid sponsored request owner/);
  await assert.rejects(insert(id(20),s1,p1,admin), /Invalid sponsored request owner/);
  await assert.rejects(insert(id(20),s1,p1,u1,'contacted'), /Invalid sponsored request owner/);
  await insert(id(20),s1,p1,u1);
  await assert.rejects(insert(id(21),s1,p1,u1), /unique|duplicate/i);
  await assert.rejects(q("update public.sponsored_requests set status='contacted',updated_by=$1 where id=$2",[viewer,id(20)]), /Invalid sponsored request transition/);
  await assert.rejects(q("update public.sponsored_requests set status='contacted',updated_by=$1 where id=$2",[inactive,id(20)]), /Invalid sponsored request transition/);
  assert.equal((await q("update public.sponsored_requests set status='contacted',updated_by=$1 where id=$2 and status='new' returning id",[sale,id(20)])).rows.length,1);
  assert.equal((await q("update public.sponsored_requests set status='contacted',updated_by=$1 where id=$2 and status='new' returning id",[admin,id(20)])).rows.length,0);
  await assert.rejects(insert(id(21),s1,p1,u1), /unique|duplicate/i, 'contacted is still open');
  await q("update public.sponsored_requests set status='closed',updated_by=$1 where id=$2",[admin,id(20)]);
  await assert.rejects(q("update public.sponsored_requests set status='new',updated_by=$1 where id=$2",[admin,id(20)]), /Invalid sponsored request transition/);
  await insert(id(21),s1,p1,u1);
  await q('delete from public.supplier_products where id=$1',[p1]);
  const retained = (await q('select product_id,product_name from public.sponsored_requests where id=$1',[id(20)])).rows[0];
  assert.deepEqual(retained, { product_id: null, product_name: 'Pepper' });
  const grants = (await q(`select has_table_privilege('anon','public.sponsored_requests','select') as anon_read,
     has_table_privilege('authenticated','public.sponsored_requests','insert') as auth_write,
     has_table_privilege('service_role','public.sponsored_requests','insert') as service_write,
     has_function_privilege('anon','public.guard_sponsored_request()','execute') as anon_guard,
     (select relrowsecurity from pg_class where oid='public.sponsored_requests'::regclass) as rls`)).rows[0];
  assert.deepEqual(grants,{anon_read:false,auth_write:false,service_write:true,anon_guard:false,rls:true});
  console.log('✅ Request migration: owner, roles, dedupe, CAS, transitions, retained history and grants (PGlite, no live concurrency/RLS client).');
} finally { await db.close(); }
