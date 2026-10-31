// Disposable PostgreSQL-compatible regression for 20261074_l2_partner_factory_name.sql.
// Never touches Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const partner = readFileSync(new URL('../supabase/migrations/20261040_l2_partner_contract.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261074_l2_partner_factory_name.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = (n) => `'${id(n)}'`;
const exec = (sql) => db.exec(sql);
const expect = (sql, error) => assert.rejects(exec(sql), error);
const FACTORY = 'Nhà máy Chế biến Nông sản Tây Nguyên';

try {
  await exec(`
    create table public.suppliers (id uuid primary key, supplier_type text);
    create table public.verifications (id uuid primary key, supplier_id uuid not null references public.suppliers(id) on delete cascade,
      target_level smallint not null, status text not null, checklist jsonb not null default '{}');
    create table public.supplier_submissions (id uuid primary key, supplier_id uuid not null references public.suppliers(id) on delete cascade,
      target_level smallint not null, status text not null);
    create table public.media_assets (id uuid primary key, owner_type text not null, supplier_id uuid references public.suppliers(id) on delete cascade,
      verification_id uuid references public.verifications(id) on delete cascade,
      submission_id uuid references public.supplier_submissions(id) on delete cascade,
      audience text not null, checklist_key text, kind text not null, status text not null, storage_path text);
    create table public.supplier_submission_items (id uuid primary key,
      submission_id uuid not null references public.supplier_submissions(id) on delete cascade,
      supplier_id uuid not null references public.suppliers(id) on delete cascade,
      checklist_key text not null, media_id uuid references public.media_assets(id) on delete set null, storage_path text);
    insert into public.suppliers values (${q(1)},'trading'),(${q(2)},'manufacturer');
    insert into public.supplier_submissions(id,supplier_id,target_level,status) values
      (${q(21)},${q(1)},2,'draft'), (${q(22)},${q(2)},2,'draft');
    insert into public.verifications(id,supplier_id,target_level,status) values (${q(12)},${q(1)},2,'approved');
  `);
  await exec(partner);
  await exec(migration);
  await exec(migration); // Idempotent; hồ sơ cũ không bị suy đoán tên.

  // Không backfill: hồ sơ L2 đã duyệt trước migration giữ nguyên, tên để trống.
  assert.deepEqual(
    (await db.query(`select status, l2_scope, partner_factory_name from public.verifications where id=${q(12)}`)).rows[0],
    { status: 'approved', l2_scope: null, partner_factory_name: null },
  );
  assert.equal((await db.query(`select partner_factory_name from public.supplier_submissions where id=${q(21)}`)).rows[0].partner_factory_name, null);

  // Đợt kiểm đã duyệt là mốc đối chiếu: không ghi/đổi tên trên đó.
  await expect(`update public.verifications set partner_factory_name='${FACTORY}' where id=${q(12)}`, /L2_PARTNER_NAME_LOCKED/);

  // Tên chỉ thuộc L2 partner_contract, và phải là chuỗi thật.
  await exec(`insert into public.verifications(id,supplier_id,target_level,status) values (${q(13)},${q(2)},2,'in_progress')`);
  await expect(`update public.verifications set partner_factory_name='${FACTORY}' where id=${q(13)}`, /partner_name_ck/);
  await exec(`insert into public.supplier_submissions(id,supplier_id,target_level,status,l2_scope) values (${q(23)},${q(1)},2,'draft','partner_contract')`);
  await expect(`update public.supplier_submissions set partner_factory_name='   ' where id=${q(23)}`, /partner_name_ck/);
  await expect(`update public.supplier_submissions set partner_factory_name='X' where id=${q(23)}`, /partner_name_ck/);
  await exec(`update public.supplier_submissions set partner_factory_name='${FACTORY}' where id=${q(23)}`);

  // Nhà cung cấp sửa tên khi hồ sơ còn mở; nộp rồi thì giữ nguyên để đối chiếu.
  await exec(`update public.supplier_submissions set partner_factory_name='Nhà máy Chế biến Nông sản Tây Nguyên (Gia Lai)' where id=${q(23)}`);
  await exec(`insert into public.media_assets values (${q(41)},'submission',${q(1)},null,${q(23)},'internal','partner_factory_contract','document','unverified','contract.pdf')`);
  await exec(`insert into public.supplier_submission_items values (${q(51)},${q(23)},${q(1)},'partner_factory_contract',${q(41)},'contract.pdf')`);
  await exec(`update public.supplier_submissions set status='pending_review' where id=${q(23)}`);
  await expect(`update public.supplier_submissions set partner_factory_name='Doanh nghiệp khác' where id=${q(23)}`, /L2_PARTNER_NAME_LOCKED/);

  // Duyệt L2 đối tác: thiếu tên nhà máy thì không duyệt được.
  await exec(`insert into public.verifications(id,supplier_id,target_level,status,l2_scope) values (${q(62)},${q(1)},2,'in_progress','partner_contract')`);
  await exec(`insert into public.media_assets values (${q(72)},'verification',${q(1)},${q(62)},null,'internal','partner_factory_contract','document','checked','review.pdf')`);
  await exec(`update public.verifications set status='submitted',
    checklist='{"partner_identity_confirmed":true,"partner_scope_confirmed":true}' where id=${q(62)}`);
  await expect(`update public.verifications set status='approved' where id=${q(62)}`, /L2_PARTNER_NAME_REQUIRED/);
  await exec(`update public.verifications set partner_factory_name='${FACTORY}', status='approved' where id=${q(62)}`);
  assert.equal((await db.query(`select partner_factory_name from public.verifications where id=${q(62)}`)).rows[0].partner_factory_name, FACTORY);

  // Đã duyệt là mốc đối chiếu của giấy chứng nhận: không đổi tên sau đó.
  await expect(`update public.verifications set partner_factory_name='Doanh nghiệp khác' where id=${q(62)}`, /L2_PARTNER_NAME_LOCKED/);

  // Xoá nhà cung cấp vẫn cascade bình thường.
  await exec(`delete from public.suppliers where id=${q(1)}`);
  assert.equal((await db.query(`select count(*)::int as n from public.verifications where supplier_id=${q(1)}`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.supplier_submissions where supplier_id=${q(1)}`)).rows[0].n, 0);

  // File schema gộp phải chứa đúng luật mới để DB dựng mới cũng chặn.
  assert.match(schema, /partner_factory_name text/);
  assert.match(schema, /L2_PARTNER_NAME_REQUIRED/);
  assert.match(schema, /L2_PARTNER_NAME_LOCKED/);
  assert.match(migration, /not valid/, 'Không quét lại dữ liệu cũ');

  console.log('✅ L2 đối tác: tên nhà máy bắt buộc khi duyệt, chỉ dùng cho partner_contract, khoá sau khi nộp/duyệt; không backfill dữ liệu cũ.');
} finally {
  await db.close();
}
