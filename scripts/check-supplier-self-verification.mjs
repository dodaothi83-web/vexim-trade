// Kiểm tra cổng NCC TỰ GỬI bằng chứng L2 (9 ảnh nhà máy) / L3 (lịch sử xuất khẩu).
// Không cần Supabase/OpenAI: route được chạy với store và fetch giả lập trong RAM.
// Run: node scripts/check-supplier-self-verification.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = new URL('..', import.meta.url).pathname;

/* ------------------------------ loader TS tối giản ------------------------------ */

function resolveFile(file) {
  for (const candidate of [file, `${file}.ts`, `${file}.tsx`, path.join(file, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Không tìm thấy module: ${file}`);
}

function transpile(file) {
  return ts.transpileModule(fs.readFileSync(resolveFile(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}

/** Nạp module .ts "thuần" (không đụng Next/cookies); `stubs` thay thế module ngoài. */
function makeLoader(stubs = {}) {
  const cache = new Map();
  const builtins = {
    'node:crypto': require$('node:crypto'),
    crypto: require$('node:crypto'),
  };
  function require$(id) {
    // eslint-disable-next-line no-undef
    return globalThis.__cjsRequire(id);
  }
  function load(rel) {
    const file = resolveFile(path.join(ROOT, rel));
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const require = (id) => {
      if (id in stubs) return stubs[id];
      if (id in builtins) return builtins[id];
      if (id === 'server-only') return {};
      if (id.startsWith('@/')) return load(path.relative(ROOT, path.join(ROOT, id.slice(2))));
      if (id.startsWith('.')) return load(path.relative(ROOT, path.join(path.dirname(file), id)));
      return globalThis.__cjsRequire(id);
    };
    // Bọc theo đúng khuôn CommonJS: (exports, require, module, __filename, __dirname).
    const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${transpile(file)}\n});`;
    const fn = new vm.Script(wrapper, { filename: file }).runInThisContext();
    fn(module.exports, require, module, file, path.dirname(file));
    return module.exports;
  }
  return load;
}

// Để loader dùng được require thật của Node (cho `typescript`, `node:crypto`…).
globalThis.__cjsRequire = (await import('node:module')).createRequire(import.meta.url);

/* ------------------------------ dựng ảnh JPEG có EXIF ------------------------------ */

/** Tạo JPEG giả có khối EXIF thật (Make/Model/Software, DateTimeOriginal, GPS). */
function jpegWithExif({ lat = 21.0285, lng = 105.8542, dateTime = '2026:10:18 09:12:33', offset = '+07:00', software = 'vexim-test', make = 'Apple', model = 'iPhone 15' } = {}) {
  const dms = (value) => {
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = Math.floor((abs - deg) * 60);
    const sec = Math.round((((abs - deg) * 60) - min) * 60 * 100);
    return [[deg, 1], [min, 1], [sec, 100]];
  };
  const rationals = (pairs) => {
    const buf = Buffer.alloc(8 * pairs.length);
    pairs.forEach(([num, den], index) => { buf.writeUInt32LE(num, index * 8); buf.writeUInt32LE(den, index * 8 + 4); });
    return buf;
  };
  const asciiBuf = (text) => Buffer.from(`${text}\0`, 'latin1');

  // Vùng dữ liệu (sau các IFD) — offset trong EXIF tính từ đầu khối TIFF.
  const areas = [];
  const put = (buf) => { areas.push(buf); return null; };
  const asciiRef = (text) => { const index = areas.length; put(asciiBuf(text)); return { index, count: asciiBuf(text).length }; };
  const rationalRef = (pairs) => { const index = areas.length; put(rationals(pairs)); return { index, count: pairs.length }; };

  const makeRef = asciiRef(make);
  const modelRef = asciiRef(model);
  const softwareRef = asciiRef(software);
  const dateTimeRef = asciiRef(dateTime);
  const offsetRef = asciiRef(offset);
  const latRef = asciiRef(lat >= 0 ? 'N' : 'S');
  const latValue = rationalRef(dms(lat));
  const lngRef = asciiRef(lng >= 0 ? 'E' : 'W');
  const lngValue = rationalRef(dms(lng));

  const IFD0_COUNT = 5;
  const EXIF_COUNT = 2;
  const GPS_COUNT = 4;
  const HEADER = 8;
  const ifd0Offset = HEADER;
  const exifIfdOffset = ifd0Offset + 2 + IFD0_COUNT * 12 + 4;
  const gpsIfdOffset = exifIfdOffset + 2 + EXIF_COUNT * 12 + 4;
  const dataStart = gpsIfdOffset + 2 + GPS_COUNT * 12 + 4;

  // Offset thật của từng vùng = dataStart + tổng độ dài các vùng trước nó (có chèn byte lẻ).
  const areaOffsets = [];
  let cursor = dataStart;
  for (const buf of areas) { areaOffsets.push(cursor); cursor += buf.length + (buf.length % 2); }
  const at = (ref) => areaOffsets[ref.index];
  const pad = (buf) => (buf.length % 2 ? Buffer.concat([buf, Buffer.alloc(1)]) : buf);

  const entry = (tag, type, count, value) => ({ tag, type, count, value });
  const ifd0Entries = [
    entry(0x010f, 2, makeRef.count, at(makeRef)),
    entry(0x0110, 2, modelRef.count, at(modelRef)),
    entry(0x0131, 2, softwareRef.count, at(softwareRef)),
    entry(0x8769, 4, 1, exifIfdOffset),
    entry(0x8825, 4, 1, gpsIfdOffset),
  ];
  const exifEntries = [
    entry(0x9003, 2, dateTimeRef.count, at(dateTimeRef)), // DateTimeOriginal
    entry(0x9011, 2, offsetRef.count, at(offsetRef)),     // OffsetTimeOriginal
  ];
  const gpsEntries = [
    entry(0x0001, 2, latRef.count, at(latRef)),
    entry(0x0002, 5, latValue.count, at(latValue)),
    entry(0x0003, 2, lngRef.count, at(lngRef)),
    entry(0x0004, 5, lngValue.count, at(lngValue)),
  ];
  const buildIfd = (entries) => {
    const buf = Buffer.alloc(2 + entries.length * 12 + 4);
    buf.writeUInt16LE(entries.length, 0);
    entries.forEach((e, index) => {
      const base = 2 + index * 12;
      buf.writeUInt16LE(e.tag, base);
      buf.writeUInt16LE(e.type, base + 2);
      buf.writeUInt32LE(e.count, base + 4);
      buf.writeUInt32LE(e.value, base + 8);
    });
    return buf;
  };

  const header = Buffer.alloc(8);
  header.write('II', 0, 'latin1');
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(ifd0Offset, 4);
  const tiff = Buffer.concat([header, buildIfd(ifd0Entries), buildIfd(exifEntries), buildIfd(gpsEntries), ...areas.map(pad)]);

  const app1Body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(app1Body.length + 2, 0);
  return new Uint8Array(Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]), app1Length, app1Body, Buffer.from([0xff, 0xd9]),
  ]));
}

/* ------------------------------ 1. checklist & mã xác minh ------------------------------ */

const load = makeLoader();
const types = load('lib/types.ts');

assert.equal(types.L2_FACTORY_PHOTO_ITEMS.length, 9, 'L2 phải đúng 9 ảnh bắt buộc');
assert.deepEqual(types.L2_FACTORY_PHOTO_ITEMS.map((i) => i.order), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.deepEqual(types.L2_FACTORY_PHOTO_ITEMS.filter((i) => i.requires_code).map((i) => i.key),
  ['factory_gate', 'production_line_running', 'finished_goods_warehouse'], 'Chỉ 3 ảnh 🔖 cần mã viết tay');
assert.equal(types.L2_FACTORY_PHOTO_ITEMS.every((i) => typeof i.requirement === 'string' && i.requirement.length > 3), true);
assert.equal(types.L3_EXPORT_ITEMS.length, 6);
assert.deepEqual(types.L3_EXPORT_ITEMS.filter((i) => i.required).map((i) => i.key), ['bill_of_lading', 'customs_declaration']);

const rules = load('lib/verification-submission.ts');
const code = rules.issueVerificationCode(2);
assert.match(code, /^VX-L2-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/, `Mã L2 sai định dạng: ${code}`);
assert.match(rules.issueVerificationCode(3), /^VX-L3-/);
assert.equal(new Set(Array.from({ length: 40 }, () => rules.issueVerificationCode(2))).size, 40, 'Mã phải ngẫu nhiên');
assert.equal(rules.codeMatches('VX-L2-7KQM-4TRD', 'vx l2 7kqm 4trd'), true, 'So mã phải bỏ dấu/cách/chữ thường');
assert.equal(rules.codeMatches('VX-L2-7KQM-4TRD', 'VX-L2-7KQM-4TRX'), false);
assert.equal(rules.codeMatches('VX-L2-7KQM-4TRD', null), null, 'AI không đọc ra mã thì chưa kết luận');
assert.equal(rules.requiresHandwrittenCode('factory_gate'), true);
assert.equal(rules.requiresHandwrittenCode('packing_area'), false);
assert.deepEqual(rules.requiredPhotoKeys().length, 9);

const expired = rules.codeExpired({ code_issued_at: new Date(Date.now() - (rules.VERIFICATION_CODE_TTL_HOURS + 1) * 3600_000).toISOString() });
assert.equal(expired, true, 'Mã quá hạn phải bị coi là hết hạn');
assert.equal(rules.codeExpired({ code_issued_at: new Date().toISOString() }), false);

/* ------------------------------ 2. readiness & hàng đợi tự động ------------------------------ */

const allItems = (keys, flags = []) => keys.map((checklist_key) => ({ checklist_key, media_id: `m-${checklist_key}`, flags }));
const l2base = { target_level: 2, verification_code: 'VX-L2-AAAA-BBBB', code_issued_at: new Date().toISOString() };

assert.equal(rules.readiness({ submission: { ...l2base, verification_code: null }, items: allItems(rules.requiredPhotoKeys()) }).ready, false, 'Thiếu mã thì chưa nộp được');
const missingOne = rules.requiredPhotoKeys().slice(0, 8);
assert.equal(rules.readiness({ submission: l2base, items: allItems(missingOne) }).ready, false, 'Thiếu 1/9 ảnh thì chưa nộp được');
assert.deepEqual(rules.readiness({ submission: l2base, items: allItems(missingOne) }).missing, ['Bẫy / trạm kiểm soát côn trùng, chuột'], 'missing trả nhãn mục để hiển thị cho NCC');
const full = rules.readiness({ submission: l2base, items: allItems(rules.requiredPhotoKeys()) });
assert.equal(full.ready, true);
assert.deepEqual(full.missing, []);
// Cờ nghiêm trọng KHÔNG chặn nộp (NCC vẫn gửi được để giải trình) nhưng phải hiện ra.
const flagged = rules.readiness({ submission: l2base, items: allItems(rules.requiredPhotoKeys(), [{ flag: 'no_exif', severity: 'warning', source: 'exif', detail: 'x' }]) });
assert.equal(flagged.ready, true);
assert.equal(flagged.warnings.length, 9);
// Cờ kỹ thuật (EXIF/GPS/giờ chụp) không còn chặn; chỉ tờ mã trong ảnh 🔖 mới chặn.
const codeSheetMissing = rules.readiness({
  submission: l2base,
  items: allItems(rules.requiredPhotoKeys()).map((i) => (i.checklist_key === 'factory_gate'
    ? { ...i, flags: [{ flag: 'code_missing', severity: 'hard', source: 'ai', detail: 'AI không thấy tờ mã' }] }
    : i)),
});
assert.equal(codeSheetMissing.ready, false, 'Ảnh 🔖 không thấy tờ mã thì chưa nộp được');
assert.match(codeSheetMissing.blockers.join(' '), /Tờ mã xác minh chưa đúng ở: Cổng nhà máy/);
const codeWrong = rules.readiness({
  submission: l2base,
  items: allItems(rules.requiredPhotoKeys()).map((i) => (i.checklist_key === 'finished_goods_warehouse'
    ? { ...i, flags: [{ flag: 'code_mismatch', severity: 'hard', source: 'ai', detail: 'mã khác' }] }
    : i)),
});
assert.equal(codeWrong.ready, false, 'Mã trong ảnh không khớp mã phát hành thì chưa nộp được');
assert.equal(rules.ORIGINAL_PHOTO_REQUIRED, false, 'Chính sách tạm nới: không bắt buộc ảnh gốc');
// L3 chỉ cần 2 chứng từ bắt buộc.
assert.equal(rules.readiness({ submission: { target_level: 3 }, items: allItems(['bill_of_lading', 'customs_declaration']) }).ready, true);
assert.equal(rules.readiness({ submission: { target_level: 3 }, items: allItems(['bill_of_lading']) }).ready, false);

assert.deepEqual(rules.autoQueueStatus({ ready: true, aiFailedItems: [], manipulationSuspected: false }).status, 'pending_review');
assert.deepEqual(rules.autoQueueStatus({ ready: true, aiFailedItems: ['Cổng nhà máy: không thấy biển tên'], manipulationSuspected: false }).status, 'returned');
assert.deepEqual(rules.autoQueueStatus({ ready: true, aiFailedItems: [], manipulationSuspected: true }).status, 'returned');
assert.deepEqual(rules.autoQueueStatus({ ready: false, aiFailedItems: [], manipulationSuspected: null }).status, 'returned');

/* ------------------------------ 3. link nguồn công khai (chống SSRF) ------------------------------ */

assert.equal(rules.assessSourceLink('https://vietnamexport.com/supplier/123').allowed, true);
assert.equal(rules.assessSourceLink('https://www.vietnamexport.com/x').allowed, true, 'Subdomain của allowlist vẫn hợp lệ');
assert.equal(rules.assessSourceLink('https://evil-vietnamexport.com/x').allowed, false, 'Domain giả mạo đuôi không được phép');
for (const blocked of ['http://127.0.0.1/admin', 'http://localhost/x', 'http://192.168.1.10/x', 'http://10.0.0.5/x', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/x', 'ftp://vietnamexport.com/x', 'http://crm.internal/x']) {
  const assessment = rules.assessSourceLink(blocked);
  assert.equal(assessment.allowed, false, `Không được phép quét ${blocked}`);
  if (!blocked.startsWith('ftp')) assert.equal(assessment.ok, false, `Phải chặn hẳn ${blocked}`);
}
assert.equal(rules.assessSourceLink('https://example.com/x').ok, true, 'Link lạ vẫn được lưu để nhân viên tự mở');
assert.equal(rules.assessSourceLink('https://example.com/x').allowed, false);
assert.equal(rules.assessSourceLink('không phải link').ok, false);

/* ------------------------------ 4. EXIF + cờ đối chứng ------------------------------ */

const exif = load('lib/media/exif.ts');
const bytes = jpegWithExif();
const parsed = exif.parseExif(bytes);
assert.equal(parsed.has_exif, true, 'Phải đọc được khối EXIF');
assert.equal(parsed.captured_at, '2026-10-18T02:12:33.000Z', `Đổi giờ VN sang UTC sai: ${parsed.captured_at}`);
assert.ok(Math.abs(parsed.lat - 21.0285) < 0.001, `GPS vĩ độ sai: ${parsed.lat}`);
assert.ok(Math.abs(parsed.lng - 105.8542) < 0.001, `GPS kinh độ sai: ${parsed.lng}`);
assert.equal(parsed.make, 'Apple');
assert.equal(parsed.model, 'iPhone 15');
assert.equal(parsed.software, 'vexim-test');
assert.equal(exif.parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])).has_exif, false, 'Ảnh không EXIF phải báo has_exif=false');
assert.equal(exif.parseExif(new Uint8Array([1, 2, 3])).has_exif, false, 'Tệp rác không được ném lỗi');
assert.equal(exif.softwareSignal('Adobe Photoshop 25.0'), 'editor');
assert.equal(exif.softwareSignal('Zalo 2.0'), 'messenger');
assert.equal(exif.softwareSignal('vexim-test'), null);
assert.ok(Math.abs(exif.distanceMeters(21.0285, 105.8542, 21.0385, 105.8542) - 1110) < 200, 'Haversine sai');
assert.equal(exif.distanceMeters(null, null, 1, 1), null);

const integrity = load('lib/media/image-integrity.ts');
const goodFlags = integrity.photoIntegrityFlags({ checklistKey: 'factory_gate', exif: parsed, capture: { lat: 21.0285, lng: 105.8542 }, width: 3000, height: 4000, codeIssuedAt: '2026-10-18T01:00:00.000Z' });
assert.deepEqual(goodFlags.map((f) => f.flag), [], 'Ảnh đúng chuẩn không được nêu cờ');

const zaloFlags = integrity.photoIntegrityFlags({ checklistKey: 'factory_gate', exif: exif.parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), capture: { lat: null, lng: null }, width: 1000, height: 800, codeIssuedAt: null });
assert.ok(zaloFlags.some((f) => f.flag === 'no_exif'), 'Ảnh mất EXIF phải bị nêu cờ');
assert.ok(zaloFlags.every((f) => f.severity === 'warning'), 'Từ 21/10/2026 không còn cờ kỹ thuật nào ở mức hard: ảnh điện thoại, ảnh qua Zalo đều nhận');
assert.ok(zaloFlags.some((f) => f.flag === 'no_gps' && f.severity === 'warning'), 'Ảnh không GPS chỉ là ghi chú');
assert.ok(zaloFlags.some((f) => f.flag === 'no_capture_time'));

const editedFlags = integrity.photoIntegrityFlags({ checklistKey: 'packing_area', exif: { ...parsed, software: 'Adobe Photoshop Lightroom Classic 13.0' }, capture: { lat: 21.0285, lng: 105.8542 }, width: 2000, height: 1500, codeIssuedAt: null });
assert.ok(editedFlags.some((f) => f.flag === 'edited_software' && f.severity === 'warning'), 'Dấu hiệu chỉnh sửa chỉ là ghi chú, không chặn hồ sơ');

const night = jpegWithExif({ dateTime: '2026:10:18 22:40:10' });
const nightFlags = integrity.photoIntegrityFlags({ checklistKey: 'production_line_running', exif: exif.parseExif(night), capture: { lat: 21.0285, lng: 105.8542 }, width: 3000, height: 4000, codeIssuedAt: null });
assert.ok(nightFlags.some((f) => f.flag === 'not_daylight' && f.severity === 'warning'), 'Chụp 22:40 chỉ là ghi chú, không chặn hồ sơ');

const beforeCode = integrity.photoIntegrityFlags({ checklistKey: 'factory_gate', exif: parsed, capture: { lat: 21.0285, lng: 105.8542 }, width: 3000, height: 4000, codeIssuedAt: '2026-10-19T01:00:00.000Z' });
assert.ok(beforeCode.some((f) => f.flag === 'capture_before_code'), 'Ảnh chụp trước khi phát hành mã phải bị nêu cờ');

const farFlags = integrity.photoIntegrityFlags({ checklistKey: 'raw_material_warehouse', exif: parsed, capture: { lat: 10.8231, lng: 106.6297 }, width: 3000, height: 4000, codeIssuedAt: null });
assert.ok(farFlags.some((f) => f.flag === 'gps_mismatch'), 'GPS ảnh (Hà Nội) lệch GPS trình duyệt (TP.HCM) phải bị nêu cờ');

assert.equal(integrity.isDaylight('2026-10-18T02:12:33.000Z'), true, '09:12 giờ VN là ban ngày');
assert.equal(integrity.isDaylight('2026-10-18T15:12:33.000Z'), false, '22:12 giờ VN là ban đêm');
assert.equal(integrity.isDaylight(null), null);
assert.equal(integrity.mergeFlags([[{ flag: 'no_exif', severity: 'warning', source: 'exif', detail: null }], [{ flag: 'no_exif', severity: 'hard', source: 'ai', detail: 'x' }]])[0].severity, 'hard', 'Gộp cờ phải giữ mức nặng hơn');

/* ------------------------------ 5. phân tích đầu ra AI ------------------------------ */

const ai = load('lib/ai/evidence-review.ts');
const raw = {
  items: [
    ...types.L2_FACTORY_PHOTO_ITEMS.map((item, index) => ({
      key: item.key,
      verdict: index === 0 ? 'pass' : index === 1 ? 'fail' : 'uncertain',
      reason: `lý do ${index}`,
      detected_text: index === 0 ? 'CÔNG TY TNHH ABC' : null,
      code_visible: item.requires_code ? index === 0 : null,
      code_read: index === 0 ? 'VX-L2-AAAA-BBBB' : null,
      flags: index === 1 ? ['content_mismatch'] : [],
    })),
    { key: 'khong_co_trong_checklist', verdict: 'pass', reason: 'phải bị loại', flags: ['flag_la'] },
  ],
  summary: 'Hồ sơ có 1 ảnh không đúng mục.',
  manipulation_suspected: true,
};
const review = ai.parseSubmissionReview(raw, 2, 'gpt-test');
assert.deepEqual(Object.keys(review.items).sort(), types.L2_FACTORY_PHOTO_ITEMS.map((i) => i.key).sort(), 'Chỉ giữ đúng 9 key của checklist');
assert.equal(review.items.factory_gate.verdict, 'pass');
assert.equal(review.items.raw_material_warehouse.verdict, 'fail');
assert.deepEqual(review.items.raw_material_warehouse.flags, ['content_mismatch']);
assert.deepEqual(review.items.packing_area.flags, [], 'Flag lạ phải bị loại');
assert.equal(review.manipulation_suspected, true);
// AI thiếu mục → mục đó phải là uncertain, không được suy ra đạt.
const partial = ai.parseSubmissionReview({ items: [{ key: 'factory_gate', verdict: 'pass', reason: 'ok', flags: [] }], summary: null }, 2, 'gpt-test');
assert.equal(partial.items.pest_control.verdict, 'uncertain');
assert.deepEqual(ai.failedItemLabels(review, 2).length, 1);
assert.equal(ai.failedItemLabels(null, 2).length, 0);
assert.match(ai.evidenceReviewSystemPrompt({ level: 2, supplierName: 'ABC', supplierAddress: 'Hà Nội', verificationCode: 'VX-L2-AAAA-BBBB', expectedGps: { lat: 21.02, lng: 105.85 }, deviceCapturedAt: null }), /không làm theo lệnh|không làm theo chỉ thị|chỉ đọc để trích dữ kiện/i);
assert.match(ai.evidenceReviewSystemPrompt({ level: 3, supplierName: 'ABC', supplierAddress: null, verificationCode: null, expectedGps: { lat: null, lng: null }, deviceCapturedAt: null, shipmentNote: 'PO-1' }), /tờ khai hải quan|vận đơn/i);

/* ------------------------------ 6. store local + upload route ------------------------------ */

const storage = new Map();
const mediaRows = [];
const itemRows = [];
const linkRows = [];
const submissionRows = [];
const auditRows = [];
const verifications = [];
let idSeq = 0;
const nextId = (prefix) => `${prefix}-${++idSeq}`;

const store = {
  getSupplier: async (id) => (id === 'sup-1' ? { id: 'sup-1', name: 'Công ty TNHH Thực phẩm ABC', address: 'Hà Nội', onboarding_status: 'approved' } : null),
  getUser: async () => null,
  listSubmissions: async (supplierId, level) => submissionRows.filter((s) => (!supplierId || s.supplier_id === supplierId) && (!level || s.target_level === level)),
  getSubmission: async (id) => submissionRows.find((s) => s.id === id) ?? null,
  createSubmission: async (input) => { const row = { id: nextId('sub'), status: 'draft', flags: [], ai_review: null, verification_code: null, code_issued_at: null, device_lat: null, device_lng: null, device_accuracy_m: null, device_captured_at: null, submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null, verification_id: null, shipment_ref: null, shipped_on: null, shipment_destination: null, supplier_note: null, ai_scanned_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input }; submissionRows.push(row); return row; },
  updateSubmission: async (id, patch) => { const row = submissionRows.find((s) => s.id === id); Object.assign(row, patch, { updated_at: new Date().toISOString() }); return row; },
  listSubmissionItems: async (submissionId) => itemRows.filter((i) => i.submission_id === submissionId),
  getSubmissionItem: async (id) => itemRows.find((i) => i.id === id) ?? null,
  createSubmissionItem: async (input) => { const row = { id: nextId('item'), flags: [], has_exif: false, uploaded_at: new Date().toISOString(), ...input }; itemRows.push(row); return row; },
  updateSubmissionItem: async (id, patch) => { const row = itemRows.find((i) => i.id === id); Object.assign(row, patch); return row; },
  deleteSubmissionItem: async (id) => { const index = itemRows.findIndex((i) => i.id === id); if (index >= 0) itemRows.splice(index, 1); },
  listSubmissionLinks: async (submissionId) => linkRows.filter((l) => l.submission_id === submissionId),
  createSubmissionLink: async (input) => { const row = { id: nextId('link'), created_at: new Date().toISOString(), ...input }; linkRows.push(row); return row; },
  updateSubmissionLink: async (id, patch) => { const row = linkRows.find((l) => l.id === id); Object.assign(row, patch); return row; },
  deleteSubmissionLink: async (id) => { const index = linkRows.findIndex((l) => l.id === id); if (index >= 0) linkRows.splice(index, 1); },
  createMedia: async (input) => { const row = { id: nextId('media'), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input }; mediaRows.push(row); return row; },
  getMedia: async (id) => mediaRows.find((m) => m.id === id) ?? null,
  getMediaByPath: async (p) => mediaRows.find((m) => m.storage_path === p) ?? null,
  deleteMedia: async (id) => { const index = mediaRows.findIndex((m) => m.id === id); if (index >= 0) mediaRows.splice(index, 1); },
  getVerification: async (id) => verifications.find((v) => v.id === id) ?? null,
  createVerification: async (input) => { const row = { id: nextId('ver'), checklist: {}, checklist_notes: {}, status: 'scheduled', inspector_id: null, approved_by: null, approved_at: null, public_summary_i18n: {}, internal_notes: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input }; verifications.push(row); return row; },
  updateVerification: async (id, patch) => { const row = verifications.find((v) => v.id === id); Object.assign(row, patch); return row; },
  addAuditLog: async (entry) => { auditRows.push(entry); return entry; },
};

let currentAccess = null;
const sharpStub = () => {
  const chain = {
    rotate: () => chain, resize: () => chain, jpeg: () => chain, webp: () => chain,
    toBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    metadata: async () => ({ width: 3000, height: 4000 }),
  };
  return chain;
};

const uploadRoute = makeLoader({
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  'next/cache': { revalidatePath: () => {} },
  '@/lib/db': { getStore: () => store },
  '@/lib/supplier-portal/submission-access': { supplierSubmissionAccess: async () => currentAccess, supplierLevelAccess: async () => null, staffSubmissionAccess: async () => null },
  '@/lib/media/storage': {
    putObject: async (p, data) => { storage.set(p, data); return { driver: 'local', path: p }; },
    getObject: async (p) => (storage.has(p) ? { data: storage.get(p), driver: 'local' } : null),
    deleteObject: async (p) => { storage.delete(p); },
  },
  sharp: sharpStub,
})('app/api/supplier-portal/submissions/[id]/upload/route.ts');

const submission = await store.createSubmission({ supplier_id: 'sup-1', target_level: 2, status: 'draft', created_by: 'user-1' });
await store.updateSubmission(submission.id, { verification_code: 'VX-L2-AAAA-BBBB', code_issued_at: '2026-10-18T01:00:00.000Z' });
currentAccess = {
  store, submission: await store.getSubmission(submission.id), items: [], links: [],
  supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com',
};

function formFor(key, file, extra = {}) {
  const form = new FormData();
  form.set('checklistKey', key);
  form.set('file', file, file.name);
  for (const [name, value] of Object.entries(extra)) if (value != null) form.set(name, String(value));
  return form;
}

// a) NCC khác không tải được vào hồ sơ này.
currentAccess = null;
let res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST' }), { params: Promise.resolve({ id: submission.id }) });
assert.equal(res.status, 403, 'Không đăng nhập/khác doanh nghiệp phải bị chặn');

currentAccess = { store, submission: await store.getSubmission(submission.id), items: [], links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };

// b) Ảnh gốc có EXIF + GPS khớp → lưu được, không có cờ.
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('factory_gate', new File([bytes], 'gate.jpg', { type: 'image/jpeg' }), { lat: 21.0285, lng: 105.8542, accuracy: 12, capturedAt: '2026-10-18T02:20:00.000Z' }) }), { params: Promise.resolve({ id: submission.id }) });
let body = await res.json();
assert.equal(res.status, 200, `Upload ảnh gốc lỗi: ${JSON.stringify(body)}`);
assert.equal(body.ok, true);
assert.deepEqual(body.flags, [], 'Ảnh đúng chuẩn không được nêu cờ');
let items = await store.listSubmissionItems(submission.id);
assert.equal(items.length, 1);
assert.equal(items[0].has_exif, true);
assert.ok(Math.abs(items[0].exif_lat - 21.0285) < 0.001);
assert.equal(items[0].exif_captured_at, '2026-10-18T02:12:33.000Z');
assert.ok(storage.has(items[0].storage_path), 'Ảnh gốc phải nằm trong kho');
assert.equal(storage.get(items[0].storage_path).length, bytes.length, 'Phải giữ NGUYÊN bytes ảnh gốc (không nén lại)');
const gateMedia = mediaRows.find((m) => m.id === items[0].media_id);
assert.equal(gateMedia.audience, 'internal', 'Bằng chứng tự gửi luôn là nội bộ');
assert.equal(gateMedia.owner_type, 'verification');
assert.equal(gateMedia.verification_id, submission.id);
assert.equal(gateMedia.checklist_key, 'factory_gate');

// c) Ảnh mất EXIF (kiểu gửi qua Zalo) → nêu cờ, GPS trình duyệt vẫn được ghi.
const noExifJpeg = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02, 0x00, 0xff, 0xd9]), Buffer.alloc(64)]));
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('production_line_running', new File([noExifJpeg], 'line.jpg', { type: 'image/jpeg' }), { lat: 21.03, lng: 105.85 }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.ok, true);
assert.ok(body.flags.some((f) => f.flag === 'no_exif'), 'Phải ghi chú ảnh mất EXIF');
assert.ok(body.flags.some((f) => f.flag === 'no_gps'), 'Ảnh 🔖 không GPS phải được ghi chú');
assert.ok(body.flags.every((f) => f.severity === 'warning'), 'Ảnh qua Zalo vẫn tải được, không bị cờ hard');

// d) PDF không được nhận ở L2.
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('packing_area', new File([new Uint8Array(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'))], 'doc.pdf', { type: 'application/pdf' })) }), { params: Promise.resolve({ id: submission.id }) });
assert.equal(res.status, 400);
assert.match((await res.json()).message, /chỉ nhận ảnh/i);

// e) Key lạ bị từ chối.
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('business_license', new File([bytes], 'x.jpg', { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: submission.id }) });
assert.equal(res.status, 400, 'Key của L1 không được dùng ở cổng L2');

// f) Hồ sơ đã nộp thì khóa bằng chứng.
await store.updateSubmission(submission.id, { status: 'pending_review' });
currentAccess = { store, submission: await store.getSubmission(submission.id), items: [], links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('packing_area', new File([bytes], 'p.jpg', { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: submission.id }) });
assert.equal(res.status, 400);
assert.match((await res.json()).message, /đã nộp|đã xét/i);
await store.updateSubmission(submission.id, { status: 'draft' });
currentAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };

// g) GPS trình duyệt được ghi lên hồ sơ (để đối chiếu về sau).
const freshSubmission = await store.getSubmission(submission.id);
assert.equal(freshSubmission.device_lat, 21.0285);
assert.equal(freshSubmission.device_lng, 105.8542);

/* ------------------------------ 7. nộp hồ sơ + AI tự xếp hàng đợi ------------------------------ */

const aiResponse = (verdictByKey) => ({
  output: [{ content: [{ type: 'output_text', text: JSON.stringify({
    items: types.L2_FACTORY_PHOTO_ITEMS.map((item) => ({ key: item.key, verdict: verdictByKey[item.key] ?? 'uncertain', reason: `AI: ${item.label}`, detected_text: null, code_visible: null, code_read: null, flags: [] })),
    summary: 'Hồ sơ đủ 9 ảnh; biển tên công ty đọc được.', manipulation_suspected: false,
  }) }] }],
});
let aiCalls = 0;
let aiVerdicts = {};
const scanRoute = makeLoader({
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  'next/cache': { revalidatePath: () => {} },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { getSession: async () => ({ uid: 'user-1', email: 'supplier@example.com', role: 'supplier' }) },
  '@/lib/auth/permissions': { hasPermission: () => false },
  '@/lib/supplier-portal/submission-access': {
    supplierSubmissionAccess: async () => currentAccess,
    staffSubmissionAccess: async () => null,
  },
  '@/lib/media/storage': {
    putObject: async (p, data) => { storage.set(p, data); return { driver: 'local', path: p }; },
    getObject: async (p) => (storage.has(p) ? { data: storage.get(p), driver: 'local' } : null),
    deleteObject: async (p) => { storage.delete(p); },
  },
  sharp: sharpStub,
})('app/api/supplier-portal/submissions/[id]/ai-scan/route.ts');

process.env.OPENAI_API_KEY = 'test-key';
globalThis.fetch = async (url, init) => {
  assert.equal(url, 'https://api.openai.com/v1/responses');
  aiCalls += 1;
  const payload = JSON.parse(init.body);
  assert.equal(payload.store, false, 'Không được lưu phản hồi ở nhà cung cấp AI');
  assert.ok(payload.input[0].content[0].text.includes('không tự duyệt') || payload.input[0].content[0].text.includes('KHÔNG tự phê duyệt'), 'Prompt phải cấm AI tự duyệt');
  return Response.json(aiResponse(aiVerdicts));
};

// Đủ 9 ảnh đúng chuẩn → nộp thành công, vào hàng đợi chờ Vexim.
await store.updateSubmission(submission.id, { code_issued_at: new Date(Date.now() - 3600_000).toISOString() });
for (const key of types.L2_FACTORY_PHOTO_ITEMS.map((i) => i.key)) {
  if ((await store.listSubmissionItems(submission.id)).some((i) => i.checklist_key === key)) continue;
  currentAccess = { store, submission: await store.getSubmission(submission.id), items: [], links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
  res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor(key, new File([jpegWithExif()], `${key}.jpg`, { type: 'image/jpeg' }), { lat: 21.0285, lng: 105.8542 }) }), { params: Promise.resolve({ id: submission.id }) });
  assert.equal((await res.json()).ok, true, `Không tải được ảnh ${key}`);
}
currentAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
assert.equal((await store.listSubmissionItems(submission.id)).length, 9, 'Phải đủ 9 ảnh');

aiVerdicts = {};
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.status, 'pending_review', `Hồ sơ đúng chuẩn phải vào hàng đợi chờ duyệt: ${JSON.stringify(body)}`);
assert.equal(body.aiScanned, true);
assert.equal(aiCalls, 1);
let stored = await store.getSubmission(submission.id);
assert.equal(stored.status, 'pending_review');
assert.ok(stored.submitted_at, 'Phải ghi thời điểm nộp');
assert.equal(stored.ai_review.model, 'gpt-4.1-mini');
assert.equal(Object.keys(stored.ai_review.items).length, 9);
assert.ok(auditRows.some((a) => a.action === 'supplier.submission.ai_scan.l2'), 'Phải ghi audit log lượt quét');

// AI báo fail một mục → hệ thống TỰ trả hồ sơ kèm lý do (không đưa vào hàng đợi).
await store.updateSubmission(submission.id, { status: 'draft' });
aiVerdicts = { factory_gate: 'fail' };
currentAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.status, 'returned', 'AI báo fail thì hồ sơ phải bị trả lại');
assert.ok(body.reasons.some((r) => r.includes('Cổng nhà máy')), `Lý do trả phải nêu đúng mục: ${body.reasons}`);
stored = await store.getSubmission(submission.id);
assert.match(stored.review_note, /Cổng nhà máy/);
const gateItem = (await store.listSubmissionItems(submission.id)).find((i) => i.checklist_key === 'factory_gate');
assert.equal(gateItem.ai_verdict, 'fail', 'Kết quả AI phải ghi xuống từng mục');

// Không có OPENAI_API_KEY → hồ sơ vẫn nộp được, ghi rõ chưa quét AI.
delete process.env.OPENAI_API_KEY;
await store.updateSubmission(submission.id, { status: 'draft', review_note: null });
currentAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.status, 'pending_review', 'Không có AI thì vẫn phải cho nộp để Vexim kiểm thủ công');
assert.equal(body.aiScanned, false);
assert.match(body.message, /chưa quét được bằng AI/i);
process.env.OPENAI_API_KEY = 'test-key';

/* ------------------------------ 8. nhân viên xét hồ sơ ------------------------------ */

// Hồ sơ đang chờ duyệt (kết quả của mục 7) — đây là trạng thái nhân viên nhận được.
await store.updateSubmission(submission.id, { status: 'pending_review' });
let staffAccess = null;
const reviewRoute = makeLoader({
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  'next/cache': { revalidatePath: () => {} },
  '@/lib/auth/session': { guard: async () => null },
  '@/lib/supplier-portal/submission-access': { staffSubmissionAccess: async () => staffAccess },
  '@/lib/media/storage': {
    putObject: async (p, data) => { storage.set(p, data); return { driver: 'local', path: p }; },
    getObject: async (p) => (storage.has(p) ? { data: storage.get(p), driver: 'local' } : null),
    deleteObject: async (p) => { storage.delete(p); },
  },
  sharp: sharpStub,
})('app/api/submission-review/[id]/route.ts');

staffAccess = {
  store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [],
  session: { uid: 'staff-1', email: 'inspector@veximtrade.com', role: 'sourcing' }, canReview: true,
};
res = await reviewRoute.POST(new Request('http://x/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'return', note: 'ngắn' }) }), { params: Promise.resolve({ id: submission.id }) });
assert.equal(res.status, 400, 'Trả hồ sơ phải kèm lý do đủ rõ');

res = await reviewRoute.POST(new Request('http://x/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'return', note: 'Ảnh cổng nhà máy không thấy biển tên; cần chụp lại đúng mã.' }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.ok, true);
assert.equal((await store.getSubmission(submission.id)).status, 'returned');

await store.updateSubmission(submission.id, { status: 'pending_review' });
staffAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], session: { uid: 'staff-1', email: 'inspector@veximtrade.com', role: 'sourcing' }, canReview: true };
res = await reviewRoute.POST(new Request('http://x/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'accept', note: 'Đã gọi điện đối chiếu' }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.ok, true, `Nhận hồ sơ lỗi: ${JSON.stringify(body)}`);
const verification = await store.getVerification(body.verificationId);
assert.ok(verification, 'Phải tạo đợt kiểm của nhân viên');
assert.equal(verification.target_level, 2);
assert.equal(verification.status, 'in_progress', 'Đợt kiểm mới KHÔNG được tự duyệt');
assert.equal(verification.inspector_id, 'staff-1');
assert.equal(verification.approved_by, null, 'Không tự phê duyệt');
const copied = (await Promise.all(mediaRows.filter((m) => m.verification_id === verification.id).map(async (m) => m))).length;
assert.equal(copied, 9, 'Phải sao đủ 9 bằng chứng sang đợt kiểm');
stored = await store.getSubmission(submission.id);
assert.equal(stored.status, 'accepted');
assert.equal(stored.verification_id, verification.id);
assert.ok(auditRows.some((a) => a.action === 'staff.submission.accepted.l2'), 'Phải ghi audit log quyết định của nhân viên');
assert.match(verification.internal_notes, /Hồ sơ NCC tự gửi/, 'Đợt kiểm phải ghi rõ nguồn bằng chứng là NCC tự gửi');

/* ------------------------------ 9. L3: chứng từ + link nguồn ------------------------------ */

const l3 = await store.createSubmission({ supplier_id: 'sup-1', target_level: 3, status: 'draft', created_by: 'user-1' });
currentAccess = { store, submission: l3, items: [], links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
const pdfBytes = new Uint8Array(Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'));
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('bill_of_lading', new File([pdfBytes], 'bl.pdf', { type: 'application/pdf' })) }), { params: Promise.resolve({ id: l3.id }) });
body = await res.json();
assert.equal(body.ok, true, `L3 phải nhận PDF: ${JSON.stringify(body)}`);
assert.deepEqual(body.flags, [], 'L3 không áp cờ định vị/ban ngày của ảnh nhà máy');
const pdfItem = (await store.listSubmissionItems(l3.id))[0];
assert.equal(pdfItem.mime, 'application/pdf');
assert.equal(pdfItem.has_exif, false);

// L3 chưa đủ 2 chứng từ bắt buộc thì chưa nộp được.
currentAccess = { store, submission: await store.getSubmission(l3.id), items: await store.listSubmissionItems(l3.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: l3.id }) });
body = await res.json();
assert.equal(body.ok, false);
assert.ok(body.message.includes('thiếu') || body.reasons.some((r) => /tờ khai hải quan/i.test(r)), `L3 thiếu chứng từ phải báo rõ: ${JSON.stringify(body)}`);

// Link nguồn: domain công khai được lưu kèm cờ allowed; link nội bộ bị chặn.
const actions = makeLoader({
  'next/cache': { revalidatePath: () => {} },
  '@/lib/db': { getStore: () => store },
  '@/lib/supplier-portal/submission-access': { supplierSubmissionAccess: async () => currentAccess },
  '@/lib/media/storage': {
    putObject: async (p, data) => { storage.set(p, data); return { driver: 'local', path: p }; },
    getObject: async (p) => (storage.has(p) ? { data: storage.get(p), driver: 'local' } : null),
    deleteObject: async (p) => { storage.delete(p); },
  },
  sharp: sharpStub,
})('app/supplier/portal/verification/submission-actions.ts');

currentAccess = { store, submission: await store.getSubmission(l3.id), items: await store.listSubmissionItems(l3.id), links: await store.listSubmissionLinks(l3.id), supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
let action = await actions.addSourceLinkAction(Object.assign(new FormData(), {}) ?? new FormData());
void action;
const linkForm = new FormData();
linkForm.set('submission_id', l3.id);
linkForm.set('url', 'https://vietnamexport.com/supplier/abc');
action = await actions.addSourceLinkAction(linkForm);
assert.equal(action.ok, true, action.message);
assert.equal((await store.listSubmissionLinks(l3.id))[0].allowed_source, true);

const badForm = new FormData();
badForm.set('submission_id', l3.id);
badForm.set('url', 'http://169.254.169.254/latest/meta-data/');
action = await actions.addSourceLinkAction(badForm);
assert.equal(action.ok, false, 'Link metadata nội bộ phải bị chặn');
assert.equal((await store.listSubmissionLinks(l3.id)).length, 1);

// Mã xác minh chỉ phát hành cho hồ sơ L2 đang mở.
const codeForm = new FormData();
codeForm.set('submission_id', l3.id);
action = await actions.issueSubmissionCodeAction(codeForm);
assert.equal(action.ok, true, `L3 vẫn phát hành mã được (không bắt buộc dùng): ${action.message}`);

currentAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
const lockedForm = new FormData();
lockedForm.set('submission_id', submission.id);
action = await actions.issueSubmissionCodeAction(lockedForm);
assert.equal(action.ok, false, 'Hồ sơ đã được nhận thì không phát hành mã mới');
const deleteForm = new FormData();
deleteForm.set('submission_id', submission.id);
deleteForm.set('item_id', (await store.listSubmissionItems(submission.id))[0].id);
action = await actions.deleteSubmissionItemAction(deleteForm);
assert.equal(action.ok, false, 'Hồ sơ đã nhận: bằng chứng phải bị khóa');

/* ------------------- 9. hướng dẫn NCC: nới ảnh, giữ bắt buộc tờ mã ------------------- */

const readPage = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const panel = readPage('app/supplier/portal/verification/verification-panel.tsx');
const portalPage = readPage('app/supplier/portal/verification/level-page.tsx');
const itemCard = readPage('app/supplier/portal/verification/submission-item-card.tsx');

assert.ok(panel.includes('Tải tờ mã về'), 'Cổng NCC phải có nút tải tờ mã về');
assert.ok(panel.includes('downloadCodeSheet') && panel.includes('toBlob'), 'Tờ mã phải tải được thành tệp, không chỉ in');
assert.ok(panel.includes('Vị trí khi chụp') && panel.includes('Không bắt buộc'), 'Định vị không còn là bước bắt buộc');
assert.ok(panel.includes('Tờ mã xác minh') && panel.includes('Bắt buộc'), 'Tờ mã vẫn là bước bắt buộc');
assert.ok(portalPage.includes('kể cả ảnh đã gửi qua Zalo, đều nhận'), 'Trang NCC phải nói rõ ảnh qua Zalo vẫn nhận');
assert.ok(!portalPage.includes('Gửi <strong>ảnh gốc'), 'Trang NCC không còn đòi ảnh gốc');
assert.ok(!itemCard.includes('capture={level === 2'), 'Ô chọn tệp không ép mở camera, NCC chọn được ảnh từ thư viện');
assert.ok(itemCard.includes('bắt buộc có tờ mã xác minh đặt cạnh cảnh'), 'Ảnh 🔖 phải nhắc tờ mã ngay dưới nút tải');

console.log('✅ check-supplier-self-verification: tất cả assertion đạt');
console.log(`   · 9 ảnh L2 + 6 chứng từ L3 · mã xác minh ${code} · ${aiCalls} lượt gọi AI giả lập · ${mediaRows.length} tệp media · ${verifications.length} đợt kiểm được tạo`);
