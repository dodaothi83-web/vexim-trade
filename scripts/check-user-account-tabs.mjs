// node scripts/check-user-account-tabs.mjs — CRM account management separates internal staff and supplier accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../components/user-manager.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/crm/settings/users/page.tsx', import.meta.url), 'utf8');

assert.match(source, /user\.role !== "supplier"/, 'Internal tab must exclude supplier accounts');
assert.match(source, /user\.role === "supplier"/, 'Supplier tab must contain only supplier accounts');
assert.match(source, /label: "Nhân sự Vexim"/);
assert.match(source, /label: "Tài khoản NCC"/);
assert.match(source, /accountTab === "internal" \? internalUsers : supplierUsers/, 'The active tab must select its own list');
assert.match(source, /\{accountTab === "internal" && \(/, 'Account creation must stay in the internal tab');
assert.match(source, /\{visibleUsers\.map/, 'User rows must render only the active group');
assert.ok(!source.includes('{users.map((u)'), 'The combined account list must not return');
assert.match(source, /ROLES\.filter\(\(r\) => r\.value !== "supplier"\)/, 'Internal creation must still exclude the supplier role');
assert.match(source, /disabled=\{busy \|\| user\.role === "supplier"\}/, 'Supplier role must remain locked');
assert.match(source, /role="tablist"/);
assert.match(source, /aria-selected=/);
assert.match(page, /nhân sự Vexim và tài khoản NCC/);

console.log('✅ User management: internal and supplier accounts have separate accessible tabs; existing role guards remain.');
