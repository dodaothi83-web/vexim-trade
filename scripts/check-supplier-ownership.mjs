// node --experimental-strip-types --no-warnings scripts/check-supplier-ownership.mjs
// Người phụ trách nhà cung cấp: chia đều cho kinh doanh, phạm vi xem/duyệt theo người phụ trách,
// và lớp kiểm tra trong CSDL (PGlite, không chạm production).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, mocks = {}) {
  const js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, console, Map, Set, Date, Object, Array, String, Number,
    require(key) { assert.ok(key in mocks, `Unexpected import ${key} in ${path}`); return mocks[key]; } });
  return mod.exports;
}

const tax = await import('../lib/crm/supplier-tax-id.ts');
const rules = load('lib/crm/supplier-owner-rules.ts', { '@/lib/crm/supplier-tax-id': tax });
const scope = load('lib/auth/supplier-scope.ts');

// 1. Chỉ kinh doanh đang hoạt động nhận phụ trách.
const users = [
  { id: 'sale-a', name: 'An', email: 'an@vexim.test', role: 'sale', is_active: true },
  { id: 'sale-b', name: 'Bình', email: 'binh@vexim.test', role: 'sale', is_active: true },
  { id: 'sale-off', name: 'Cường', email: 'cuong@vexim.test', role: 'sale', is_active: false },
  { id: 'admin', name: 'Admin', email: 'admin@vexim.test', role: 'admin', is_active: true },
  { id: 'lead', name: 'Lead', email: 'lead@vexim.test', role: 'reviewer', is_active: true },
];
assert.deepEqual([...rules.ownerCandidates(users)].map((u) => u.id), ['sale-a', 'sale-b']);
assert.equal(rules.pickBalancedOwner(users.filter((u) => u.role !== 'sale'), []), null, 'Không có kinh doanh thì để Chưa giao');

// 2. Chia đều: ai ít nhà cung cấp hơn nhận trước; bằng nhau thì ai lâu chưa được giao.
const rows = [
  { id: 's1', name: 'A', owner_user_id: 'sale-a', owner_assigned_at: '2026-11-01' },
  { id: 's2', name: 'B', owner_user_id: 'sale-a', owner_assigned_at: '2026-11-02' },
  { id: 's3', name: 'C', owner_user_id: 'sale-b', owner_assigned_at: '2026-11-03' },
];
assert.equal(rules.pickBalancedOwner(users, rows), 'sale-b', 'Người ít việc hơn nhận');
assert.equal(rules.pickBalancedOwner(users, [rows[0], rows[2]]), 'sale-a', 'Bằng nhau thì người lâu chưa nhận');
// Cùng MST với hồ sơ đã có người phụ trách thì giữ một đầu mối.
assert.equal(rules.pickBalancedOwner(users, [...rows, { id: 's4', tax_id: '0110001327', owner_user_id: 'sale-a' }],
  { taxId: '0110001327', excludeId: 'new' }), 'sale-a');

// 3. Kế hoạch chia đều 30 nhà cung cấp chưa giao cho 2 người: 15/15, bỏ nhà cung cấp mẫu,
//    và nhà cung cấp của người đã nghỉ được chia lại.
const pending = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `NCC ${String(i).padStart(2, '0')}`, tax_id: `01${String(i).padStart(8, '0')}` }));
const plan = rules.planDistribution(users, [...pending, { id: 'demo', name: 'Demo', is_demo: true },
  { id: 'orphan', name: 'Orphan', owner_user_id: 'sale-off' }], '2026-11-23T00:00:00Z');
assert.equal(plan.length, 31);
const counts = plan.reduce((acc, [, owner]) => ({ ...acc, [owner]: (acc[owner] ?? 0) + 1 }), {});
assert.ok(Math.abs(counts['sale-a'] - counts['sale-b']) <= 1, `Chia lệch: ${JSON.stringify(counts)}`);
assert.ok(!plan.some(([id]) => id === 'demo'), 'Nhà cung cấp mẫu không được chia');
assert.ok(plan.some(([id]) => id === 'orphan'), 'Người phụ trách đã nghỉ thì chia lại');

// 4. Trùng MST: so đủ dãy số; chi nhánh (-001) là hồ sơ khác.
assert.equal(rules.sameTaxIdSupplier([{ id: 'x', tax_id: '0110 001 327' }], '0110001327')?.id, 'x');
assert.equal(rules.sameTaxIdSupplier([{ id: 'x', tax_id: '0110001327' }], '0110001327-001'), null);
assert.equal(rules.sameTaxIdSupplier([{ id: 'x', tax_id: '0110001327' }], '0110001327', 'x'), null, 'Sửa chính hồ sơ đó không tính trùng');

// 5. Phạm vi: kinh doanh chỉ thấy nhà cung cấp mình phụ trách; vai trò khác thấy tất cả.
const sale = { uid: 'sale-a', role: 'sale' };
const lead = { uid: 'lead', role: 'reviewer' };
const list = [{ id: 'm', owner_user_id: 'sale-a' }, { id: 'n', owner_user_id: 'sale-b' }, { id: 'o', owner_user_id: null }];
assert.deepEqual(scope.filterOwnedSuppliers(sale, list).map((s) => s.id), ['m']);
assert.equal(scope.filterOwnedSuppliers(lead, list).length, 3);
assert.equal(scope.ownsSupplier(sale, list[1]), false);
assert.equal(scope.ownsSupplier(sale, list[2]), false, 'Chưa giao thì kinh doanh không tự mở');
assert.equal(scope.supplierOwnerScope({ uid: '', role: 'sale' }), '__no_owner__', 'Thiếu id thì không thấy gì');
assert.deepEqual(scope.filterBySupplierIds(new Set(['m']), [{ supplier_id: 'm' }, { supplier_id: 'n' }, { supplier_id: null }]), [{ supplier_id: 'm' }]);
assert.equal(scope.canDecideSupplierRole('sale'), true);
assert.equal(scope.canDecideSupplierRole('viewer'), false);

// 6. Mã nguồn: các cổng máy chủ và trang dùng đúng kiểm tra phạm vi.
const access = read('lib/auth/supplier-access.ts');
for (const name of ['supplierGate', 'productGate', 'certificateGate', 'verificationGate', 'submissionGate', 'requireSupplierInScope'])
  assert.match(access, new RegExp(`export async function ${name}`), `Thiếu ${name}`);
for (const page of ['app/crm/suppliers/[slug]/page.tsx', 'app/crm/suppliers/[slug]/edit/page.tsx', 'app/crm/suppliers/[slug]/aplus/page.tsx',
  'app/crm/suppliers/[slug]/audit/[step]/page.tsx', 'app/crm/suppliers/[slug]/products/new/page.tsx',
  'app/crm/products/[slug]/edit/page.tsx', 'app/crm/products/[slug]/aplus/page.tsx'])
  assert.match(read(page), /requireSupplierInScope\(session, /, `${page} phải chặn nhà cung cấp ngoài phạm vi`);
for (const page of ['app/crm/suppliers/page.tsx', 'app/crm/certificates/page.tsx', 'app/crm/verifications/page.tsx',
  'app/crm/tasks/page.tsx', 'app/crm/service-requests/page.tsx', 'app/crm/dashboard/page.tsx', 'app/crm/plans/page.tsx'])
  assert.match(read(page), /filterOwnedSuppliers\(session, /, `${page} phải lọc theo người phụ trách`);
assert.match(read('app/crm/layout.tsx'), /countReviewsAwaitingApproval\(badgeScope\)/, 'Huy hiệu đếm theo phạm vi');
const ownerActions = read('app/crm/suppliers/owner-actions.ts');
assert.equal((ownerActions.match(/guard\("suppliers\.assign"\)/g) ?? []).length, 2, 'Chỉ quản trị giao / chia đều');
assert.match(read('lib/crm/supplier-owner.ts'), /action: "supplier\.owner_changed"/, 'Mỗi lần giao đều ghi nhật ký');
assert.match(read('app/api/supplier-portal/profile/route.ts'), /autoAssignSupplierOwner\(store, supplier\.id\)/, 'Hồ sơ tự đăng ký được chia đều');
const create = read('app/actions.ts');
assert.match(create, /taxIdConflict\(store, input\.tax_id\)/, 'Tạo mới chặn trùng MST');
assert.match(create, /taxIdConflict\(store, input\.tax_id, id\)/, 'Sửa chặn trùng MST');
assert.match(read('app/crm/suppliers/[slug]/plan-actions.ts'), /amount_vnd: amountVnd, amount_source: amountSource/, 'Đổi gói ghi số tiền và người đổi');

// 7. CSDL: kinh doanh chỉ tự duyệt được đợt kiểm của nhà cung cấp mình phụ trách.
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table public.app_users (id uuid primary key, email text not null, role text not null, is_active boolean not null);
create table public.suppliers (id uuid primary key, name text);
create table public.supplier_products (id uuid primary key, supplier_id uuid not null);
create table public.audit_log (id bigserial primary key, actor_id uuid, actor_email text, entity text not null, entity_id text not null,
  action text not null, before jsonb, after jsonb);
create table public.verifications (id uuid primary key, supplier_id uuid not null, target_level integer not null, status text not null,
  inspector_id uuid, approved_by uuid, approved_at timestamptz, evidence_confirmed_by uuid, evidence_confirmed_at timestamptz,
  self_approved boolean default false not null, legacy_self_approved boolean default false not null);
create function public.check_verification_self_approval() returns trigger language plpgsql as $$begin return new; end$$;
create function public.log_confirmed_verification_approval() returns trigger language plpgsql as $$begin return new; end$$;
create trigger verifications_self_approval_guard before insert or update on public.verifications
  for each row execute function public.check_verification_self_approval();
create trigger verifications_confirmed_approval before update on public.verifications
  for each row execute function public.log_confirmed_verification_approval();
create function public.approve_product_form_submission(p_product_id uuid, p_submission_id uuid, p_actor_id uuid,
  p_expected_context jsonb, p_patch jsonb, p_images jsonb, p_warnings jsonb) returns jsonb language plpgsql security definer
  set search_path = public as $$
declare reviewer public.app_users%rowtype;
begin
  select * into reviewer from public.app_users where id=p_actor_id for share;
  if not found or not reviewer.is_active or reviewer.role not in ('admin','reviewer') then
    return jsonb_build_object('status','not_authorized');
  end if;
  return jsonb_build_object('status','ok');
end $$;
insert into public.app_users values
  ('00000000-0000-4000-8000-000000000001','lead@x','reviewer',true),
  ('00000000-0000-4000-8000-000000000002','an@x','sale',true),
  ('00000000-0000-4000-8000-000000000003','binh@x','sale',true),
  ('00000000-0000-4000-8000-000000000004','off@x','sale',false);
insert into public.suppliers values ('00000000-0000-4000-8000-0000000000a1','Mine'), ('00000000-0000-4000-8000-0000000000a2','Other');
insert into public.supplier_products values ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a2');
`);
const migration = read('supabase/migrations/20261226_supplier_owner.sql');
await db.exec(migration);
await db.exec(migration); // chạy lại không lỗi, không vá hàm hai lần
const an = '00000000-0000-4000-8000-000000000002';
const binh = '00000000-0000-4000-8000-000000000003';
const mine = '00000000-0000-4000-8000-0000000000a1';
const other = '00000000-0000-4000-8000-0000000000a2';
await db.exec(`update suppliers set owner_user_id='${an}' where id='${mine}'; update suppliers set owner_user_id='${binh}' where id='${other}';`);
const one = async (sql) => (await db.query(sql)).rows[0];
assert.equal((await one(`select public.supplier_owned_by('${mine}','${an}') ok`)).ok, true);
assert.equal((await one(`select public.supplier_owned_by('${other}','${an}') ok`)).ok, false);
assert.equal((await one(`select prosecdef from pg_proc where proname='supplier_owned_by'`)).prosecdef, true);

const now = '2026-11-23 08:00:00+00';
await db.exec(`insert into verifications (id,supplier_id,target_level,status,inspector_id) values
  ('00000000-0000-4000-8000-000000000101','${mine}',1,'submitted','${an}'),
  ('00000000-0000-4000-8000-000000000102','${other}',1,'submitted','${an}')`);
const approve = (id, who) => db.exec(`update verifications set status='approved', approved_by='${who}', approved_at='${now}',
  evidence_confirmed_by='${who}', evidence_confirmed_at='${now}', self_approved=true where id='${id}'`);
await approve('00000000-0000-4000-8000-000000000101', an);
assert.equal((await one(`select status from verifications where id='00000000-0000-4000-8000-000000000101'`)).status, 'approved');
assert.equal((await one(`select actor_id from audit_log where action='verification.evidence_confirmation.l1'`)).actor_id, an);
await assert.rejects(approve('00000000-0000-4000-8000-000000000102', an), /supplier owner/, 'Không duyệt nhà cung cấp của người khác');
// Người phụ trách bị khoá tài khoản thì mất quyền duyệt.
await db.exec(`update app_users set is_active=false where id='${binh}'`);
await db.exec(`insert into verifications (id,supplier_id,target_level,status,inspector_id) values ('00000000-0000-4000-8000-000000000103','${other}',1,'submitted','${binh}')`);
await assert.rejects(approve('00000000-0000-4000-8000-000000000103', binh), /supplier owner/);

const product = (id, who) => one(`select public.approve_product_form_submission('${id}', gen_random_uuid(), '${who}', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)->>'status' s`);
assert.equal((await product('00000000-0000-4000-8000-0000000000b1', an)).s, 'ok', 'Kinh doanh duyệt sản phẩm NCC mình phụ trách');
assert.equal((await product('00000000-0000-4000-8000-0000000000b2', an)).s, 'not_authorized');
assert.equal((await product('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001')).s, 'ok', 'Trưởng kiểm duyệt giữ nguyên quyền');
await db.close();

console.log('✅ Người phụ trách NCC: chia đều, chặn trùng MST, phạm vi kinh doanh, cổng máy chủ và kiểm tra trong CSDL.');
