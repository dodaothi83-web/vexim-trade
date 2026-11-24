// Đăng nhập/đăng xuất không được xoá cache 1 giờ của trang công khai.
// revalidatePath("/", "layout") xoá mọi trang dưới "/", kể cả trang chủ, danh mục, sản phẩm
// và nhà cung cấp dựng sẵn. Phiên chỉ ảnh hưởng CRM, cổng nhà cung cấp và tài khoản người mua.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function body(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Không tìm thấy ${signature}`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`Không đọc được thân hàm ${signature}`);
}

const WHOLE_SITE = /revalidatePath\(\s*["']\/["']\s*,\s*["']layout["']\s*\)/;
const SCOPED = ['/crm', '/supplier/portal', '/buyer'];

const auth = read('app/auth-actions.ts');
const helper = body(auth, 'function revalidateSignedInAreas(');
for (const path of SCOPED) {
  assert.ok(helper.includes(`revalidatePath("${path}", "layout")`), `revalidateSignedInAreas làm mới ${path}`);
}
assert.doesNotMatch(helper, WHOLE_SITE, 'revalidateSignedInAreas không xoá cache toàn trang');

for (const fn of ['export async function loginAction(', 'export async function logoutAction(']) {
  const code = body(auth, fn);
  assert.doesNotMatch(code, WHOLE_SITE, `${fn} không xoá cache trang công khai`);
  assert.match(code, /revalidateSignedInAreas\(\)/, `${fn} làm mới khu vực cần phiên`);
}

const google = read('app/api/auth/google/callback/route.ts');
assert.doesNotMatch(google, WHOLE_SITE, 'Đăng nhập Google không xoá cache trang công khai');
for (const path of SCOPED) {
  assert.ok(google.includes(`revalidatePath("${path}", "layout")`), `Đăng nhập Google làm mới ${path}`);
}

// Sửa dữ liệu thật trong CRM vẫn làm mới trang công khai như trước.
const actions = read('app/actions.ts');
const revalidateAll = body(actions, 'function revalidateAll(');
assert.match(revalidateAll, /revalidatePublicCatalog\(\)/, 'revalidateAll vẫn làm mới cache catalog');
assert.match(revalidateAll, WHOLE_SITE, 'revalidateAll vẫn làm mới trang công khai');

console.log('check-session-revalidation: OK');
