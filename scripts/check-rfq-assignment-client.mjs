// node scripts/check-rfq-assignment-client.mjs — inline RFQ assignment keeps its event handler inside a Client Component.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const page = fs.readFileSync(new URL('../app/crm/rfqs/page.tsx', import.meta.url), 'utf8');
const control = fs.readFileSync(new URL('../app/crm/rfqs/assignment-select.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(page, /RfqAssignmentSelect/, 'Read-only direct RFQs and historical questions cannot be assigned in the list');
assert.match(fs.readFileSync(new URL('../app/crm/rfqs/[id]/page.tsx', import.meta.url), 'utf8'), /<RfqAssignmentSelect/, 'Sourcing RFQ detail retains the client assignment control');
assert.ok(!page.includes('onChange='), 'Server-rendered RFQ list must not contain an inline event handler');
assert.ok(!page.includes('assignRfqInlineAction'), 'Server action belongs to the client control boundary');
assert.ok(control.startsWith('"use client";'), 'Assignment control must be a Client Component');
assert.match(control, /assignRfqInlineAction/, 'Existing assignment action must be preserved');
assert.match(control, /requestSubmit\(\)/, 'Changing the owner must still submit automatically');
assert.match(control, /assignedTo \?\? ""/, 'Unassigned RFQs must keep an empty initial value');

const load = (file, mocks) => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, require: (id) => { assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id]; } });
  return mod.exports;
};
const assignees = load('lib/rfq/assignees.ts', { '@/lib/auth/permissions': load('lib/auth/permissions.ts', {}) });
const people = [
  { id: 'a', name: 'Luong Van Hoc', email: 'hoc@example.com', role: 'admin', is_active: true },
  { id: 's', name: 'Dung', email: 'dung@example.com', role: 'sale', is_active: true },
  { id: 'blank', name: '  ', email: 'blank@example.com', role: 'sale', is_active: true },
  { id: 'sup', name: 'Supply1', email: 'supply1@example.com', role: 'supplier', is_active: true },
  { id: 'rev', name: 'Reviewer', email: 'rev@example.com', role: 'reviewer', is_active: true },
  { id: 'view', name: 'Viewer', email: 'view@example.com', role: 'viewer', is_active: true },
  { id: 'off', name: 'Locked', email: 'off@example.com', role: 'sale', is_active: false },
];
const options = assignees.rfqAssigneeOptions(people);
assert.deepEqual(options.map((o) => o.id).sort(), ['a', 'blank', 's'], 'only active internal staff with rfq.manage can own an RFQ');
assert.equal(options.find((o) => o.id === 'blank').label, 'blank@example.com', 'empty names fall back to email');
assert.ok(options.every((o) => o.label.trim()), 'no blank options');
const kept = assignees.rfqAssigneeOptions(people, 'off');
assert.equal(kept[0].id, 'off', 'a no-longer-eligible current owner stays visible instead of silently disappearing');
assert.match(kept[0].label, /không còn quyền/);
const action = fs.readFileSync(new URL('../app/crm/rfqs/actions-inline.ts', import.meta.url), 'utf8');
assert.match(action, /canOwnRfq\(target\)/, 'server rejects assigning to suppliers or locked accounts');

console.log('✅ RFQ assignment: auto-submit stays client-side; only active internal RFQ staff are assignable, with readable names.');
