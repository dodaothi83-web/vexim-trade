// RFQ detail: staff may review sourcing quotes and use Vexim-only desks, not compose
// transactional emails or enter prices for a supplier. Save errors retain typed text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const page = read('app/crm/rfqs/[id]/page.tsx');
assert.match(page, /canManageRfq = hasManagePermission && channel === "sourcing"/);
assert.match(page, /<RfqMediatedThread rfqId=\{rfq\.id\} side="staff"/);
assert.match(page, /<RfqMediatedThread rfqId=\{rfq\.id\} matchId=\{m\.id\} side="staff"/);
assert.doesNotMatch(page, /<ComposeEmailDialog|<form action=\{composeMatchEmailAction\}|<ActionForm action=\{updateMatchQuoteAction\}/,
  'Staff must not compose RFQ email or type/edit supplier quotes');
for (const action of ['addMatchAction', 'addRfqNoteAction', 'uploadRfqAttachmentAction', 'updateRfqStatusFormAction']) {
  assert.match(page, new RegExp(`<ActionForm action=\\{${action}\\}`), `${action} reports pending/saved/error states`);
}
const form = read('components/action-form.tsx');
assert.doesNotMatch(form, /<form[^>]*\saction=\{/, 'Keep inputs on validation/save errors');
assert.match(form, /onSubmit=/);
assert.match(form, /event\.preventDefault\(\)/);
assert.match(form, /Đang lưu…/);
assert.match(form, /NEXT_REDIRECT;/);
assert.match(form, /router\.replace\(target\)/);
const thread = read('components/rfq-mediated-thread.tsx');
assert.match(thread, /useActionState\(sendAction, INITIAL\)/);
assert.match(thread, /defaultValue=\{state\.body\}/, 'Keep a failed message draft');
assert.match(thread, /disabled=\{pending\}/);
assert.match(thread, /role="alert"/);
assert.match(thread, /role="status"/);
assert.match(thread, /<RfqReadTracker at=\{lastVisibleAt\} markRead=\{markRead\}/, 'Mediated desks must track the end of the last message');
assert.match(read('components/rfq-thread.tsx'), /IntersectionObserver[\s\S]*observer\.observe\(element\)/, 'Viewport-only read marker lives on the latest content');
const compose = read('app/crm/rfqs/[id]/compose-action.ts');
assert.match(compose, /composeMatchEmailAction[\s\S]*Email không còn là kênh giao dịch RFQ/);
assert.match(compose, /sendFollowUpAction[\s\S]*không gửi RFQ qua email/);
assert.match(read('app/crm/rfqs/[id]/actions.ts'), /updateMatchQuoteAction[\s\S]*Nhà cung cấp tự nộp giá trên cổng/);
console.log('✅ RFQ feedback: Vexim-only desks, visible read markers, safe saved/error states and no staff price/email bypass.');
