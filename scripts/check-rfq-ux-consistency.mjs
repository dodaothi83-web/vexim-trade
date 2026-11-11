// Public, buyer and CRM entry points must describe the same direct-vs-Vexim RFQ flow.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, mocks = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module, exports: module.exports, Intl, Date, console: { error() {} },
    require(id) { if (id === 'react/jsx-runtime') return jsx; assert.ok(id in mocks, `${path}: unexpected ${id}`); return mocks[id]; } });
  return module.exports;
}
const link = { default: ({ children, prefetch: _prefetch, ...props }) => React.createElement('a', props, children) };
const icons = new Proxy({}, { get: () => () => null });
const channel = load('lib/rfq/channel.ts');
const copy = load('lib/rfq/portal-copy.ts');
const detail = load('components/buyer-enquiry-detail.tsx', {
  'next/link': link, 'lucide-react': icons, '@/components/ui': { Breadcrumbs: () => null },
  '@/lib/rfq/portal-copy': copy, '@/lib/rfq/channel': channel,
});
const buyer = { email: 'buyer@example.com', company: 'Buyer Co' };
const quote = { id: 'match-1', supplier: 'Chosen Supplier', price: '$6.25/kg' };
const base = { id: 'rfq-1', code: 'RFQ-1', status: 'quoted', product_text: 'Cashew W320',
  source_page: '/rfq', preferred_supplier_ids: ['supplier-1'], source_product_id: null, specs: {} };
const view = (rfq, locale, quotes = []) => renderToStaticMarkup(React.createElement(detail.BuyerEnquiryDetail, { rfq, buyer, locale, quotes }));
for (const locale of ['en', 'vi']) {
  const vi = locale === 'vi';
  const direct = view(base, locale, [quote]);
  assert.match(direct, vi ? /Có báo giá từ nhà cung cấp/ : /Supplier quote available/);
  assert.match(direct, vi ? /RFQ trực tiếp/ : /Direct RFQ/);
  assert.match(direct, /\/buyer\/account\?tab=requests/);
  assert.match(direct, /\/buyer\/account\/requests\/rfq-1\/offers\/match-1/);
  assert.match(direct, vi ? /Tạo RFQ tìm nguồn MỚI/ : /Create a NEW sourcing RFQ/);
  assert.doesNotMatch(direct, /Sourcing quotes|Báo giá tìm nguồn|Đã chia sẻ liên hệ/);
  const mediated = view({ ...base, status: 'won', preferred_supplier_ids: [],
    specs: { buyer_contact_policy_version: 'rfq_mediated_v1', sourcing_request_id: 'original-1' } }, locale, [quote]);
  assert.match(mediated, vi ? /Đã chọn nhà cung cấp/ : /Supplier selected/);
  assert.match(mediated, vi ? /Báo giá tìm nguồn/ : /Sourcing quotes/);
  assert.match(mediated, /href="\/buyer\/account\/sourcing\/original-1"/, 'Converted RFQ links back to private source/files');
  assert.match(mediated, /href="\/buyer\/account\?tab=vexim"/);
  assert.match(mediated, vi ? /Vexim không tự chuyển liên hệ/ : /does not automatically share your contact details/);
  const awaiting = view({ ...base, status: 'quoted', preferred_supplier_ids: [], specs: {} }, locale);
  assert.match(awaiting, vi ? /Đang điều phối/ : /Coordinating quotes/);
  assert.match(awaiting, vi ? /Chưa có báo giá được công bố/ : /No quotes have been published yet/);
  assert.doesNotMatch(awaiting, />Published<|>Đã công bố</, 'A saved unpublished quote is not presented as published');
  const question = view({ ...base, status: 'matching', specs: { inquiry_kind: 'supplier_question', notes: 'Older question' } }, locale);
  assert.match(question, vi ? /Câu hỏi cũ đã gửi/ : /Previous question sent/);
  assert.match(question, vi ? /Câu hỏi này chỉ để xem lại/ : /This question is read-only/);
  assert.doesNotMatch(question, /quotes-title|Sourcing quotes|Báo giá tìm nguồn/);
  assert.match(question, vi ? /Sản phẩm[\s\S]*Câu hỏi/ : /Product[\s\S]*Question/);
}

// Legacy buyer–supplier conversations embedded in sourcing RFQs are read-only;
// an empty archive should not impersonate a live direct conversation.
const thread = load('components/rfq-thread.tsx', { react: React, 'lucide-react': icons });
for (const locale of ['en', 'vi']) {
  const copyForLocale = copy.quotePortalCopy[locale];
  const html = renderToStaticMarkup(React.createElement(thread.RfqThread, {
    rfqId: 'rfq-1', matchId: 'match-1', side: 'buyer', messages: [{ id: 'msg-1', sender: 'buyer',
      body: 'Historical message', created_at: '2026-11-08T12:00:00Z' }],
    lastVisibleAt: '2026-11-08T12:00:00Z', canPost: false, sourcingArchive: true,
    locale, copy: copyForLocale, sendAction: async () => ({}), markRead: async () => {},
  }));
  assert.match(html, locale === 'vi' ? /Lịch sử trao đổi trực tiếp cũ chỉ để xem/ : /Read-only history from the old buyer/);
  assert.match(html, locale === 'vi' ? /Nếu RFQ còn mở, hãy dùng mạch Vexim/ : /continue in the Vexim conversation/);
  assert.doesNotMatch(html, locale === 'vi' ? /Chỉ bạn và nhà cung cấp này gửi tin/ : /Only you and this supplier can reply here/);
}
assert.match(read('app/(public)/buyer/account/requests/[id]/offers/[matchId]/page.tsx'),
  /readable && \(!sourcing \|\| messages\.length > 0\)/);
assert.match(read('app/supplier/portal/rfqs/[matchId]/page.tsx'), /canPost=\{false\} sourcingArchive/);

const guide = load('app/(public)/how-it-works/page.tsx', {
  'next/link': link, 'lucide-react': icons, '@/components/ui': { Breadcrumbs: () => null },
});
for (const [lang, directText, sourcingText] of [
  ['en', 'Only selected, invited direct suppliers see consented contact details', 'For sourcing, Vexim keeps your contact private'],
  ['vi', 'RFQ đích danh: nhà cung cấp được chọn', 'Tìm nguồn: Vexim giữ liên hệ'],
]) {
  const html = renderToStaticMarkup(await guide.default({ searchParams: Promise.resolve({ lang }) }));
  assert.match(html, new RegExp(directText));
  assert.match(html, new RegExp(sourcingText));
  assert.match(html, /NEW sourcing RFQ|yêu cầu tìm nguồn MỚI/);
  assert.doesNotMatch(html, /ask your permission before suggesting anyone else|hỏi ý kiến trước khi gợi ý/);
}
const supplierGuide = read('app/(public)/for-suppliers/page.tsx');
assert.match(supplierGuide, /You and the buyer handle direct RFQs yourselves/);
assert.match(supplierGuide, /Vexim presents your quote to the buyer/);
const product = read('app/(public)/products/[slug]/[productId]/page.tsx');
assert.match(product, /Ask this supplier directly through an RFQ/);
assert.doesNotMatch(product, /Quotes are coordinated through Vexim/);
assert.doesNotMatch(read('app/(public)/products/[slug]/page.tsx'), /no account needed/);
assert.doesNotMatch(read('app/(public)/compare/page.tsx'), /confirmed quotes within 1 business day/);

// The free-form original request can only expose a converted RFQ that belongs to
// the verified owner; an unauthorized visit must be rejected before the RFQ lookup.
let locale = 'en', owner = true, verified = true, listCalls = 0, owned = true;
const requestId = '22222222-2222-4222-8222-222222222222';
const rfqId = '11111111-1111-4111-8111-111111111111';
const original = { id: requestId, buyer_email: 'buyer@example.com', status: 'in_progress',
  content: 'Original private requirements', attachments: [{ id: 'file-1', name: 'private.pdf', size: 1024 }],
  buyer_reply: null, created_at: '2026-11-08T10:00:00Z' };
const sourcePage = load('app/(public)/buyer/account/sourcing/[id]/page.tsx', {
  'next/link': link, 'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); } },
  '@/lib/auth/buyer-session': { requireBuyerSession: async () => ({ email: 'buyer@example.com' }) },
  '@/lib/sourcing/store': { sourcingStore: () => ({ getBuyerUserByEmail: async () => ({ verified_at: verified ? 'today' : null }),
    getSourcingRequest: async () => ({ ...original, buyer_email: owner ? 'buyer@example.com' : 'foreign@example.com' }) }) },
  '@/lib/sourcing/files': { sourcingUuid: () => true },
  '@/lib/sourcing/status': { sourcingStatusLabel: () => 'In progress' },
  '@/lib/i18n/server': { getLocale: async () => locale },
  '@/lib/db': { getStore: () => ({ listBuyerRfqsByEmail: async (email) => { listCalls += 1;
    assert.equal(email, 'buyer@example.com');
    return owned ? [{ id: rfqId, code: 'RFQ-LINKED', specs: { sourcing_request_id: requestId } }] : []; } }) },
  '@/lib/sourcing/to-rfq': { findLinkedRfq: (rfqs, id) => rfqs.find((r) => r.specs?.sourcing_request_id === id) ?? null },
});
for (locale of ['en', 'vi']) {
  const html = renderToStaticMarkup(await sourcePage.default({ params: Promise.resolve({ id: requestId }) }));
  assert.match(html, new RegExp(`lang="${locale}"`));
  assert.match(html, /\/buyer\/account\?tab=vexim/);
  assert.match(html, /\/buyer\/account\/requests\/11111111-1111-4111-8111-111111111111/);
  assert.match(html, locale === 'vi' ? /Xem RFQ RFQ-LINKED và trao đổi/ : /View RFQ RFQ-LINKED and messages/);
  assert.match(html, /private\.pdf/);
}
owned = false;
assert.doesNotMatch(renderToStaticMarkup(await sourcePage.default({ params: Promise.resolve({ id: requestId }) })), /\/buyer\/account\/requests\/11111111/);
listCalls = 0;
owner = false;
await assert.rejects(sourcePage.default({ params: Promise.resolve({ id: requestId }) }), /NOT_FOUND/);
assert.equal(listCalls, 0, 'Foreign original request cannot trigger an RFQ lookup');
owner = true; verified = false;
await assert.rejects(sourcePage.default({ params: Promise.resolve({ id: requestId }) }), /NOT_FOUND/);
assert.equal(listCalls, 0, 'Unverified buyers cannot look up linked RFQs');

const crm = read('app/crm/sourcing/page.tsx');
assert.match(crm, /manage && !linked \? <form action=\{updateSourcingAction\}/);
assert.match(crm, /Đã lưu phản hồi trong tài khoản và gửi email thông báo/);
assert.match(crm, /Lịch sử email và thông báo \(chỉ đọc\)/);
assert.doesNotMatch(crm, /Đã lưu và gửi email phản hồi cho người mua/);
const crmList = read('app/crm/rfqs/page.tsx');
assert.match(crmList, /matching: \{ label: "Đã chuyển tới nhà cung cấp"/);
assert.doesNotMatch(crmList, /matching: \{ label: "Đang ghép nhà cung cấp"/);
const crmDetail = read('app/crm/rfqs/[id]/page.tsx');
assert.match(crmDetail, /\{isSourcing && rfq\.status !== "spam" && \(/,
  'The Vexim matching/review/sample progress bar must never appear on direct or historical RFQs');
assert.match(crmDetail, /!isSourcing \? "Lưu ý:"/);
assert.doesNotMatch(read('app/crm/layout.tsx'), /pendingRfqs|count: pendingRfqs/);

// A stale CRM form may still be submitted after another worker converted the
// sourcing request. The action must reject that old path before saving or mailing.
let writes = 0, emails = 0, converted = true;
const actions = load('app/crm/sourcing/actions.ts', {
  'next/cache': { revalidatePath() {} },
  'next/navigation': { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
  '@/lib/auth/session': { requirePagePermission: async () => ({ email: 'staff@example.com' }) },
  '@/lib/auth/permissions': { hasPermission: () => true },
  '@/lib/sourcing/store': { sourcingStore: () => ({ getSourcingRequest: async () => ({ id: requestId, version: 1, buyer_reply: null }),
    updateSourcingRequest: async () => { writes += 1; return { version: 2 }; } }) },
  '@/lib/sourcing/status': { sourcingStatuses: ['new', 'in_progress'] },
  '@/lib/sourcing/files': { sourcingUuid: () => true },
  '@/lib/db': { getStore: () => ({ listRfqs: async () => converted ? [{ id: rfqId, specs: { sourcing_request_id: requestId } }] : [] }) },
  '@/lib/sourcing/to-rfq': { findLinkedRfq: (rfqs, id) => rfqs.find((r) => r.specs?.sourcing_request_id === id) ?? null },
  '@/lib/sourcing/mail': { sendSourcingReply: async () => { emails += 1; return { ok: true }; } },
});
const fd = new FormData();
for (const [key, value] of Object.entries({ id: requestId, version: '1', status: 'in_progress', buyer_reply: 'Saved in account' })) fd.set(key, value);
await assert.rejects(actions.updateSourcingAction(fd), /REDIRECT:\/crm\/rfqs\/11111111-1111-4111-8111-111111111111/);
assert.equal(writes, 0);
assert.equal(emails, 0);
converted = false;
await assert.rejects(actions.updateSourcingAction(fd), /REDIRECT:\/crm\/sourcing\?saved=/);
assert.equal(writes, 1, 'Unconverted requests can still be updated');
assert.equal(emails, 1, 'Only the unconverted request sends a link-only update notice');
console.log('✅ RFQ UX EN/VI: direct vs Vexim copy, historical questions, publication, owned source ↔ RFQ links and CRM read-only boundaries.');
