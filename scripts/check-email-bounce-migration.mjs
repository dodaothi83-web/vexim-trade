// node --experimental-strip-types --no-warnings scripts/check-email-bounce-migration.mjs
// Chạy thật file migration trên PostgreSQL tạm (PGlite, không đụng Supabase):
// ghi bounce, tắt tài khoản nhà cung cấp, để lại dấu vết kiểm toán, và gỡ chặn.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20261104_email_bounce_suppression.sql', import.meta.url), 'utf8');
const db = new PGlite();

// Vai trò của Supabase không có sẵn trong PGlite, tạo lại để câu revoke/grant chạy được.
for (const role of ['anon', 'authenticated', 'service_role']) {
  await db.exec(`do $$ begin create role ${role}; exception when duplicate_object then null; end $$;`);
}

// Hai bảng mà migration có nhắc tới, cắt còn đúng các cột liên quan.
await db.exec(`
  create table public.app_users (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    name text,
    role text not null default 'supplier',
    is_active boolean not null default true,
    updated_at timestamptz not null default now()
  );
  create table public.audit_log (
    id bigserial primary key,
    actor_id uuid references public.app_users(id) on delete set null,
    actor_email text,
    entity text not null,
    entity_id text not null,
    action text not null,
    before jsonb,
    after jsonb,
    created_at timestamptz not null default now()
  );
  insert into public.app_users (id, email, name, role) values
    ('11111111-1111-1111-1111-111111111111', 'NCC@Example.com', 'Nhà cung cấp A', 'supplier'),
    ('22222222-2222-2222-2222-222222222222', 'ncc@example.com', 'Trùng địa chỉ nhưng là quản trị', 'admin'),
    ('33333333-3333-3333-3333-333333333333', 'other@example.com', 'Nhà cung cấp B', 'supplier');
`);

await db.exec(migration);

const record = async (email, reason, type = null) => {
  const { rows } = await db.query(
    'select public.record_email_suppression($1, $2, $3, $4::jsonb) as result',
    [email, reason, type, JSON.stringify(type ? { type } : {})],
  );
  return rows[0].result;
};
const isActive = async (id) => (await db.query('select is_active from public.app_users where id = $1', [id])).rows[0].is_active;
const suppressions = async () => (await db.query('select email, reason from public.email_suppressions order by email')).rows;

// 1. Bounce cứng tắt tài khoản nhà cung cấp dùng địa chỉ đó (không phân biệt hoa thường).
const first = await record('  NCC@Example.COM ', 'hard_bounce', 'Permanent');
assert.equal(first.status, 'saved');
assert.equal(first.email, 'ncc@example.com', 'Địa chỉ được chuẩn hoá trước khi ghi');
assert.equal(first.created, true);
assert.equal(first.deactivated_accounts, 1, 'Chỉ tài khoản nhà cung cấp bị tắt');
assert.equal(await isActive('11111111-1111-1111-1111-111111111111'), false);
assert.equal(await isActive('22222222-2222-2222-2222-222222222222'), true, 'Một cú bounce không được khoá tài khoản quản trị');
assert.equal(await isActive('33333333-3333-3333-3333-333333333333'), true, 'Tài khoản khác không bị đụng');

// 2. Cùng một địa chỉ báo lại: không tạo dòng mới, không tắt thêm.
const again = await record('ncc@example.com', 'hard_bounce', 'Permanent');
assert.equal(again.status, 'saved');
assert.equal(again.created, false);
assert.equal(again.deactivated_accounts, 0, 'Tài khoản đã tắt thì không tính lại');
assert.deepEqual(await suppressions(), [{ email: 'ncc@example.com', reason: 'hard_bounce' }]);

// 3. Dấu vết kiểm toán có đúng người và đúng lý do.
const audit = (await db.query("select action, entity_id, after from public.audit_log where action = 'user.deactivated_email_bounce'")).rows;
assert.equal(audit.length, 1);
assert.equal(audit[0].entity_id, 'ncc@example.com');
assert.equal(audit[0].after.reason, 'hard_bounce');
assert.equal(audit[0].after.accounts, 1);

// 4. Báo cáo thư rác mạnh hơn bounce tạm nên lý do được nâng lên, không bị hạ xuống.
assert.equal((await record('complainer@example.com', 'complaint', 'email.complained')).status, 'saved');
assert.equal((await record('complainer@example.com', 'hard_bounce', 'Permanent')).status, 'saved');
assert.deepEqual(
  (await suppressions()).find((row) => row.email === 'complainer@example.com'),
  { email: 'complainer@example.com', reason: 'complaint' },
  'Một lần bounce sau đó không xoá dấu complaint',
);
assert.equal((await record('complainer@example.com', 'provider_suppressed', 'email.suppressed')).status, 'saved');

// 5. Địa chỉ hỏng thì từ chối, không ghi rác vào bảng.
for (const bad of ['', '   ', 'not-an-email', 'a@', '@b.co', null]) {
  assert.equal((await record(bad, 'hard_bounce', 'Permanent')).status, 'invalid', `Phải từ chối: ${String(bad)}`);
}
assert.equal((await record('ok@example.com', 'unknown_reason', 'x')).status, 'invalid', 'Lý do ngoài danh sách phải bị từ chối');
assert.equal((await suppressions()).length, 2);

// 6. Khoá chính và ràng buộc viết thường chặn ghi thẳng vào bảng.
await assert.rejects(() => db.exec("insert into public.email_suppressions (email, reason) values ('MiXeD@Example.com', 'manual')"));
await assert.rejects(() => db.exec("insert into public.email_suppressions (email, reason) values ('ncc@example.com', 'manual')"));

// 7. Gỡ chặn: xoá dòng, báo đúng trạng thái, nhưng không tự bật lại tài khoản.
const cleared = await db.query('select public.clear_email_suppression($1) as result', [' NCC@example.com ']);
assert.equal(cleared.rows[0].result.status, 'cleared');
assert.equal((await db.query('select public.clear_email_suppression($1) as result', ['ncc@example.com'])).rows[0].result.status, 'missing');
assert.equal(await isActive('11111111-1111-1111-1111-111111111111'), false, 'Việc cho gửi lại không tự mở tài khoản');

// 8. Chạy lại migration lần hai phải không lỗi (deploy lặp).
await db.exec(migration);
assert.equal((await db.query("select count(*)::int as n from public.email_suppressions where email = 'ncc@example.com'")).rows[0].n, 0);

console.log('check-email-bounce-migration: ok');
