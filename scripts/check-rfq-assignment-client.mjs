// node scripts/check-rfq-assignment-client.mjs — inline RFQ assignment keeps its event handler inside a Client Component.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../app/crm/rfqs/page.tsx', import.meta.url), 'utf8');
const control = fs.readFileSync(new URL('../app/crm/rfqs/assignment-select.tsx', import.meta.url), 'utf8');

assert.match(page, /RfqAssignmentSelect/, 'RFQ list must use the client assignment control');
assert.ok(!page.includes('onChange='), 'Server-rendered RFQ list must not contain an inline event handler');
assert.ok(!page.includes('assignRfqInlineAction'), 'Server action belongs to the client control boundary');
assert.ok(control.startsWith('"use client";'), 'Assignment control must be a Client Component');
assert.match(control, /assignRfqInlineAction/, 'Existing assignment action must be preserved');
assert.match(control, /requestSubmit\(\)/, 'Changing the owner must still submit automatically');
assert.match(control, /assignedTo \?\? ""/, 'Unassigned RFQs must keep an empty initial value');

console.log('✅ RFQ assignment: auto-submit stays client-side; server page passes only serializable props.');
