// node scripts/check-product-form-approved-baseline-migration.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(`create table public.product_form_submissions (
    id uuid primary key default gen_random_uuid(), status text not null, approved_price_revision_id uuid);
    insert into public.product_form_submissions (status) values ('pending'),('approved');`);
  const sql = readFileSync(new URL('../supabase/migrations/20261069_product_form_approved_baseline.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  assert.equal((await db.query('select count(*)::int n from public.product_form_submissions')).rows[0].n, 2);
  assert.equal((await db.query('select count(*)::int n from public.product_form_submissions where approved_product_updated_at is not null')).rows[0].n, 0);
  await assert.rejects(() => db.exec("update public.product_form_submissions set approved_product_updated_at=now() where status='approved'"), /product_form_approved_baseline_link_check/);
  await db.exec("update public.product_form_submissions set approved_price_revision_id=gen_random_uuid(), approved_product_updated_at=now() where status='approved'");
  await db.exec("update public.product_form_submissions set status='superseded' where status='approved'");
  await assert.rejects(() => db.exec("update public.product_form_submissions set status='pending' where status='superseded'"), /product_form_approved_baseline_link_check/);
  console.log('Approved baseline migration: additive, repeatable, prior rows retained and exact price link required');
} finally { await db.close(); }
