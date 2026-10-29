// node scripts/check-staging-bootstrap.mjs
// Test on isolated PGlite only. This script never connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const sql = readFileSync(new URL('../supabase/staging/bootstrap.sql', import.meta.url), 'utf8');
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;`);
  // PGlite includes gen_random_uuid but not the hosted pgcrypto extension.
  const executable = sql.replace('create extension if not exists "pgcrypto";', '');
  await db.exec('create policy synthetic_unsafe on storage.objects for select to anon using (true)');
  await assert.rejects(() => db.exec(executable), /RLS enabled and no object policies/, 'Unexpected Storage policy blocks setup');
  assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n, 0);
  await db.exec('drop policy synthetic_unsafe on storage.objects');
  await db.exec(executable);
  assert.equal((await db.query('select public.product_form_image_namespace_ready() as ready')).rows[0].ready, true);
  const tables = (await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n;
  assert.ok(tables >= 46);
  assert.equal((await db.query('select count(*)::int n from public.supplier_products')).rows[0].n, 0);
  const security = (await db.query(`select has_function_privilege('anon','public.product_form_review_context(uuid,uuid)','execute') a,
    has_function_privilege('authenticated','public.product_form_review_context(uuid,uuid)','execute') b,
    has_function_privilege('service_role','public.product_form_review_context(uuid,uuid)','execute') c`)).rows[0];
  assert.deepEqual(security, { a: false, b: false, c: true });
  await assert.rejects(() => db.exec(executable), /empty public schema/, 'Never replay on an existing database');
  assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n, tables);
  console.log('Synthetic staging bootstrap: complete source chain, namespace, privileges and empty-schema guard passed');
} finally { await db.close(); }
