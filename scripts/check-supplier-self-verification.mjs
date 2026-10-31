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
assert.equal(types.L3_EXPORT_ITEMS.length, 7);
assert.deepEqual(types.L3_EXPORT_ITEMS.filter((i) => i.required).map((i) => i.key), []);
assert.ok(types.L3_EXPORT_ITEMS.some((i) => i.key === 'other_export_evidence'));

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

/* ------------------------------ 2. điều kiện nộp & AI chỉ hỗ trợ ------------------------------ */

const allItems = (keys, flags = []) => keys.map((checklist_key) => ({ checklist_key, media_id: `m-${checklist_key}`, storage_path: `photos/${checklist_key}.jpg`, flags }));
const l2base = { target_level: 2, verification_code: 'VX-L2-AAAA-BBBB', code_issued_at: new Date().toISOString() };

assert.equal(rules.readiness({ submission: { ...l2base, verification_code: null }, items: allItems(rules.requiredPhotoKeys()) }).ready, false, 'Thiếu mã thì chưa nộp được');
const missingOne = rules.requiredPhotoKeys().slice(0, 8);
assert.equal(rules.readiness({ submission: l2base, items: allItems(missingOne) }).ready, false, 'Thiếu 1/9 ảnh thì chưa nộp được');
assert.deepEqual(rules.readiness({ submission: l2base, items: allItems(missingOne) }).missing, ['Bẫy / trạm kiểm soát côn trùng, chuột'], 'missing trả nhãn mục để hiển thị cho NCC');
const full = rules.readiness({ submission: l2base, items: allItems(rules.requiredPhotoKeys()) });
assert.equal(full.ready, true);
assert.deepEqual(full.missing, []);
assert.equal(rules.readiness({ submission: { ...l2base, code_issued_at: null }, items: allItems(rules.requiredPhotoKeys()) }).ready, false, 'Không có thời điểm cấp thì không thể khẳng định mã còn hiệu lực');
const noPath = allItems(rules.requiredPhotoKeys()).map((item, i) => i === 0 ? { ...item, storage_path: null } : item);
assert.equal(rules.readiness({ submission: l2base, items: noPath }).ready, false, 'Mục không có tệp thực không tính là đã tải');

// Cờ nghiêm trọng KHÔNG chặn nộp (NCC vẫn gửi được để giải trình) nhưng phải hiện ra.
const flagged = rules.readiness({ submission: l2base, items: allItems(rules.requiredPhotoKeys(), [{ flag: 'no_exif', severity: 'warning', source: 'exif', detail: 'x' }]) });
assert.equal(flagged.ready, true);
assert.equal(flagged.warnings.length, 9);
// Historic AI code flags, even `hard`, are suggestions and never block sending.
for (const [flag, key] of [['code_missing', 'factory_gate'], ['code_mismatch', 'finished_goods_warehouse']]) {
  const check = rules.readiness({
    submission: l2base,
    items: allItems(rules.requiredPhotoKeys()).map((i) => i.checklist_key === key
      ? { ...i, flags: [{ flag, severity: 'hard', source: 'ai', detail: 'AI cần kiểm tra mã' }] }
      : i),
  });
  assert.equal(check.ready, true, `${flag} do AI đọc không được chặn nộp`);
  assert.equal(check.blockers.length, 0);
  assert.ok(check.warnings.some((w) => w.includes('AI lưu ý') && w.includes('AI cần kiểm tra mã')));
}
// A system flag for an image uploaded before a code was issued is still a gate.
const preCodeUpload = rules.readiness({
  submission: l2base,
  items: allItems(rules.requiredPhotoKeys()).map((i) => i.checklist_key === 'factory_gate'
    ? { ...i, flags: [{ flag: 'code_missing', severity: 'hard', source: 'system', detail: 'Tải trước khi phát hành mã' }] }
    : i),
});
assert.equal(preCodeUpload.ready, false);
assert.match(preCodeUpload.blockers.join(' '), /Tờ mã xác minh chưa đúng ở: Cổng nhà máy/);
const oldGpsHard = rules.readiness({ submission: l2base, items: allItems(rules.requiredPhotoKeys(), [{ flag: 'no_gps', severity: 'hard', source: 'gps', detail: 'Ảnh thiếu GPS cũ' }]) });
assert.equal(oldGpsHard.ready, true);
assert.equal(oldGpsHard.blockers.length, 0, 'Cờ kỹ thuật cũ không hiển thị là việc bắt buộc');
assert.ok(oldGpsHard.warnings.some((warning) => warning.includes('Ảnh thiếu GPS cũ')));

assert.equal(rules.readiness({ submission: { ...l2base, code_issued_at: new Date(Date.now() - 73 * 3600_000).toISOString() }, items: allItems(rules.requiredPhotoKeys()) }).ready, false, 'Mã quá hạn vẫn chặn nộp');
assert.equal(rules.ORIGINAL_PHOTO_REQUIRED, false, 'Chính sách tạm nới: không bắt buộc ảnh gốc');
// L3 cần ít nhất một chứng từ bất kỳ trong danh mục, không bắt buộc vận đơn/tờ khai.
assert.equal(rules.readiness({ submission: { target_level: 3 }, items: [] }).ready, false);
assert.equal(rules.readiness({ submission: { target_level: 3 }, items: allItems(['factory_gate']) }).ready, false);
for (const { key } of types.L3_EXPORT_ITEMS) {
  assert.equal(rules.readiness({ submission: { target_level: 3 }, items: allItems([key]) }).ready, true, `Chỉ có ${key} vẫn được gửi để nhân viên xem`);
}
const oldAiFlags = rules.readiness({ submission: { target_level: 3 }, items: allItems(['other_export_evidence'], [{ flag: 'content_mismatch', severity: 'hard', source: 'ai', detail: 'AI cũ báo không đạt' }]) });
assert.equal(oldAiFlags.ready, true);
assert.equal(oldAiFlags.blockers.length, 0, 'Cờ AI cũ không gây cản trở hay báo sai');

assert.equal(rules.autoQueueStatus, undefined, 'AI không còn quyết định trạng thái hồ sơ');

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
  getSupplier: async (id) => (id === 'sup-1' ? { id: 'sup-1', name: 'Công ty TNHH Thực phẩm ABC', address: 'Hà Nội', supplier_type: 'manufacturer', onboarding_status: 'approved' } : null),
  getUser: async () => null,
  listSubmissions: async (supplierId, level) => submissionRows.filter((s) => (!supplierId || s.supplier_id === supplierId) && (!level || s.target_level === level)),
  getSubmission: async (id) => submissionRows.find((s) => s.id === id) ?? null,
  createSubmission: async (input) => { const row = { id: nextId('sub'), status: 'draft', flags: [], ai_review: null, verification_code: null, code_issued_at: null, device_lat: null, device_lng: null, device_accuracy_m: null, device_captured_at: null, submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null, verification_id: null, shipment_ref: null, shipped_on: null, shipment_destination: null, supplier_note: null, ai_scanned_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input }; submissionRows.push(row); return row; },
  updateSubmission: async (id, patch) => { const row = submissionRows.find((s) => s.id === id); Object.assign(row, patch, { updated_at: new Date().toISOString() }); return row; },
  updateEditableSubmission: async (id, patch, expectedStatus) => {
    const row = submissionRows.find((s) => s.id === id);
    if (!row || !['draft', 'returned'].includes(row.status) || (expectedStatus && row.status !== expectedStatus)) return null;
    Object.assign(row, patch, { updated_at: new Date().toISOString() }); return row;
  },
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
// Hồi quy FK: media_assets.verification_id trỏ tới verifications(id). Bằng chứng
// tự gửi phải dùng owner_type 'submission' + submission_id, KHÔNG được nhét id
// hồ sơ vào verification_id (đó chính là lỗi "media_assets_verification_id_fkey").
assert.equal(gateMedia.owner_type, 'submission', 'Bằng chứng tự gửi có chủ sở hữu riêng');
assert.equal(gateMedia.submission_id, submission.id);
assert.equal(gateMedia.verification_id, null, 'Không được ghi id hồ sơ tự gửi vào verification_id');
assert.equal(gateMedia.checklist_key, 'factory_gate');

// b2) Hồi quy lỗi production: CSDL thiếu migration mới → createMedia ném lỗi khoá ngoại.
//     NCC không được thấy nguyên văn lỗi Postgres; tệp vừa ghi phải được dọn khỏi kho.
{
  const originalCreateMedia = store.createMedia;
  const storageBefore = storage.size;
  store.createMedia = async () => {
    throw new Error('insert or update on table "media_assets" violates foreign key constraint "media_assets_verification_id_fkey"');
  };
  res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('pest_control', new File([bytes], 'pest.jpg', { type: 'image/jpeg' }), { lat: 21.0285, lng: 105.8542 }) }), { params: Promise.resolve({ id: submission.id }) });
  const failed = await res.json();
  store.createMedia = originalCreateMedia;
  assert.equal(res.status, 400);
  assert.equal(failed.ok, false);
  assert.ok(!/violates|constraint|media_assets/i.test(failed.message), `Không lộ lỗi CSDL ra NCC: ${failed.message}`);
  assert.match(failed.message, /thử lại sau ít phút/i);
  assert.equal(storage.size, storageBefore, 'Lỗi lưu media phải dọn tệp vừa ghi khỏi kho');
  assert.equal((await store.listSubmissionItems(submission.id)).length, 1, 'Lỗi lưu media không được tạo mục bằng chứng');
}

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

let aiManipulation = false;
const aiResponse = (verdictByKey) => ({
  output: [{ content: [{ type: 'output_text', text: JSON.stringify({
    items: types.L2_FACTORY_PHOTO_ITEMS.map((item) => ({
      key: item.key, verdict: typeof verdictByKey[item.key] === 'string' ? verdictByKey[item.key] : 'uncertain',
      reason: null, detected_text: null, code_visible: null, code_read: null, flags: [],
      ...(typeof verdictByKey[item.key] === 'object' ? verdictByKey[item.key] : {}),
    })),
    summary: 'Hồ sơ đủ 9 ảnh; biển tên công ty đọc được.', manipulation_suspected: aiManipulation,
  }) }] }],
});
let aiCalls = 0;
let aiVerdicts = {};
let throwRevalidation = false;
const staffNotifications = [];
const scanRoute = makeLoader({
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  'next/cache': { revalidatePath: () => { if (throwRevalidation) throw new Error('simulated cache failure'); } },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': { getSession: async () => ({ uid: 'user-1', email: 'supplier@example.com', role: 'supplier' }) },
  '@/lib/auth/permissions': { hasPermission: () => false },
  '@/lib/supplier-portal/submission-access': {
    supplierSubmissionAccess: async (id) => currentAccess?.submission.id === id && currentAccess.supplierId === currentAccess.submission.supplier_id ? currentAccess : null,
    staffSubmissionAccess: async () => null,
  },
  '@/lib/media/storage': {
    putObject: async (p, data) => { storage.set(p, data); return { driver: 'local', path: p }; },
    getObject: async (p) => (storage.has(p) ? { data: storage.get(p), driver: 'local' } : null),
    deleteObject: async (p) => { storage.delete(p); },
  },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierSubmission: async (supplierId, level) => { staffNotifications.push({ supplierId, level }); return 'sent'; } },
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

// A partial scan may omit oversized/unavailable photos. A model must not be
// allowed to claim it saw them; the actual omission is visible to the reviewer.
const oversizedPath = currentAccess.items.find((item) => item.checklist_key === 'factory_gate').storage_path;
const partialScanService = makeLoader({
  '@/lib/media/storage': { getObject: async (path) => ({ data: path === oversizedPath ? new Uint8Array(4 * 1024 * 1024 + 1) : new Uint8Array([1, 2, 3]), driver: 'local' }) },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierSubmission: async () => 'sent' },
})('lib/verification-submission-service.ts');
const normalFetch = globalThis.fetch;
let modelImageCount = 0;
globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(init.body);
  modelImageCount = request.input[1].content.filter((part) => part.type === 'input_image').length;
  return Response.json(aiResponse({ factory_gate: { verdict: 'pass', reason: 'Bịa là đã thấy ảnh', detected_text: 'Bịa chữ' }, packing_area: 'pass' }));
};
const partialScan = await partialScanService.runEvidenceScan({ bundle: { submission: currentAccess.submission, items: currentAccess.items, links: [] }, supplier: await store.getSupplier('sup-1') });
globalThis.fetch = normalFetch;
assert.equal(modelImageCount, 8, 'Ảnh vượt giới hạn không được gửi cho AI');
assert.equal(partialScan.items.factory_gate.verdict, 'uncertain', 'Không tin kết luận bịa cho ảnh chưa gửi');
assert.equal(partialScan.items.factory_gate.detected_text, null);
assert.match(partialScan.items.factory_gate.reason, /chưa quét được ảnh/);
assert.equal(partialScan.items.packing_area.verdict, 'pass', 'Ảnh thực sự được quét vẫn giữ gợi ý');
assert.ok(rules.aiReviewFindings(partialScan, currentAccess.submission.verification_code).some((finding) => /Cổng nhà máy.*chưa quét/.test(finding)));
const readFailureService = makeLoader({
  '@/lib/media/storage': { getObject: async (path) => { if (path === oversizedPath) throw new Error('private storage failure'); return { data: new Uint8Array([1, 2, 3]), driver: 'local' }; } },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierSubmission: async () => 'sent' },
})('lib/verification-submission-service.ts');
globalThis.fetch = async () => Response.json(aiResponse({ factory_gate: 'pass' }));
const failedReadReview = await readFailureService.runEvidenceScan({ bundle: { submission: currentAccess.submission, items: currentAccess.items, links: [] }, supplier: await store.getSupplier('sup-1') });
globalThis.fetch = normalFetch;
assert.equal(failedReadReview.items.factory_gate.verdict, 'uncertain');
assert.match(failedReadReview.items.factory_gate.reason, /chưa quét được ảnh/);


// Multiple photos in one category cannot consume the whole AI limit or attach
// one photo's verdict to a different, unsent photo.
const duplicateItems = currentAccess.items.map((item) => ({ ...item, flags: [...item.flags] }));
const originalGate = duplicateItems.find((item) => item.checklist_key === 'factory_gate');
const duplicateGate = { ...originalGate, id: 'unscanned-gate', storage_path: 'too-large-duplicate.jpg', uploaded_at: '2099-01-01T00:00:00Z',
  ai_verdict: 'fail', flags: [{ flag: 'code_missing', source: 'ai', severity: 'hard' }, { flag: 'no_gps', source: 'gps', severity: 'warning' }] };
duplicateItems.push(duplicateGate);
const duplicateSubmission = { ...currentAccess.submission, status: 'draft', ai_review: null, ai_scanned_at: null };
const duplicateService = makeLoader({
  '@/lib/media/storage': { getObject: async (path) => ({ data: path === duplicateGate.storage_path ? new Uint8Array(4 * 1024 * 1024 + 1) : new Uint8Array([1, 2, 3]), driver: 'local' }) },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierSubmission: async () => 'sent' },
})('lib/verification-submission-service.ts');
const duplicateStore = {
  getSubmission: async () => duplicateSubmission,
  listSubmissionItems: async () => duplicateItems,
  updateSubmissionItem: async (id, patch) => { const item = duplicateItems.find((row) => row.id === id); Object.assign(item, patch); return item; },
  updateSubmission: async (_id, patch) => { Object.assign(duplicateSubmission, patch); return duplicateSubmission; },
  addAuditLog: async () => ({}),
};
globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(init.body);
  modelImageCount = request.input[1].content.filter((part) => part.type === 'input_image').length;
  return Response.json(aiResponse({ factory_gate: 'pass' }));
};
const duplicateResult = await duplicateService.scanAndQueueSubmission(duplicateStore, { bundle: { submission: duplicateSubmission, items: duplicateItems, links: [] },
  supplier: await store.getSupplier('sup-1'), actorId: 'staff-1', actorEmail: null, submit: false });
globalThis.fetch = normalFetch;
assert.equal(modelImageCount, 9, 'Tối đa một ảnh mỗi mục, không để ảnh trùng chiếm chỗ mục khác');
assert.ok(duplicateResult.aiReview.scanned_item_ids.includes(originalGate.id));
assert.ok(!duplicateResult.aiReview.scanned_item_ids.includes(duplicateGate.id));
assert.equal(duplicateResult.aiReview.unscanned_extra_count, 1);
assert.ok(duplicateResult.reasons.some((reason) => /chưa quét thêm 1 ảnh/.test(reason)));
assert.equal(originalGate.ai_verdict, 'pass');
assert.equal(duplicateGate.ai_verdict, null, 'Ảnh không gửi AI không nhận verdict của ảnh khác');
assert.ok(!duplicateGate.flags.some((flag) => flag.source === 'ai'));
assert.ok(duplicateGate.flags.some((flag) => flag.source === 'gps'), 'Giữ ghi chú kỹ thuật cũ');
const duplicateView = load('lib/supplier-portal/submission-view.ts').buildPortalSubmission({ submission: duplicateSubmission, items: duplicateItems, links: [] }, { forStaff: true });
assert.equal(duplicateView.items.find((item) => item.id === duplicateGate.id).aiVerdict, null);



aiVerdicts = {};
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.status, 'pending_review', `Hồ sơ đúng chuẩn phải vào hàng đợi chờ duyệt: ${JSON.stringify(body)}`);
assert.equal(body.aiScanned, true);
assert.match(body.message, /chuyển vào hàng đợi chờ duyệt/i, 'Nộp thành công phải nói rõ hồ sơ đã vào hàng đợi');
assert.equal(aiCalls, 1);
let stored = await store.getSubmission(submission.id);
assert.equal(stored.status, 'pending_review');
assert.ok(stored.submitted_at, 'Phải ghi thời điểm nộp');
assert.equal(stored.ai_review.model, 'gpt-4.1-mini');
assert.equal(Object.keys(stored.ai_review.items).length, 9);
assert.ok(auditRows.some((a) => a.action === 'supplier.submission.ai_scan.l2'), 'Phải ghi audit log lượt quét');

// AI reports a failed photo, missing/wrong code and possible manipulation:
// all findings go to staff, but no AI output returns or blocks a complete case.
await store.updateSubmission(submission.id, { status: 'draft' });
aiVerdicts = {
  factory_gate: { verdict: 'fail', reason: 'Không thấy cổng', code_visible: false, flags: ['content_mismatch', 'code_missing'] },
  production_line_running: { verdict: 'uncertain', code_visible: true, code_read: 'VX-L2-WRONG-CODE', flags: [] },
};
aiManipulation = true;
currentAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
const noticesBeforeFlagged = staffNotifications.length;
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.ok, true);
assert.equal(body.status, 'pending_review', 'AI nghi ngờ không được tự trả hoặc chặn');
assert.match(body.message, /đã được gửi.*nhân viên.*quyết định/i);
assert.ok(body.reasons.some((r) => r.includes('Cổng nhà máy') && r.includes('tờ mã')), `Phải nêu điểm nghi thiếu mã: ${body.reasons}`);
assert.ok(body.reasons.some((r) => r.includes('Dây chuyền') && r.includes('không khớp')), `Phải nêu điểm nghi sai mã: ${body.reasons}`);
assert.ok(body.reasons.some((r) => /chỉnh sửa|dàn dựng/.test(r)), `Phải nêu nghi vấn dàn dựng: ${body.reasons}`);
assert.equal(staffNotifications.length, noticesBeforeFlagged + 1, 'Hồ sơ có cảnh báo vẫn báo cho nhân viên');
stored = await store.getSubmission(submission.id);
assert.equal(stored.review_note, null, 'Gợi ý AI không được giả làm lý do nhân viên trả');
assert.equal(stored.ai_review.manipulation_suspected, true);
const gateItem = (await store.listSubmissionItems(submission.id)).find((i) => i.checklist_key === 'factory_gate');
assert.equal(gateItem.ai_verdict, 'fail', 'Kết quả AI phải ghi xuống từng mục');
assert.ok(gateItem.flags.some((f) => f.source === 'ai' && f.flag === 'code_missing' && f.severity === 'warning'));
assert.equal(rules.readiness({ submission: stored, items: await store.listSubmissionItems(submission.id) }).ready, true);
const portalFactory = load('lib/supplier-portal/submission-view.ts');
const staffFactoryView = portalFactory.buildPortalSubmission({ submission: stored, items: await store.listSubmissionItems(submission.id), links: [] }, { forStaff: true });
assert.ok(staffFactoryView.aiFindings.some((finding) => finding.includes('Cổng nhà máy')));
assert.ok(staffFactoryView.aiFindings.some((finding) => /dàn dựng/.test(finding)));
assert.equal(staffFactoryView.aiFindingsMayBeOutdated, false, 'Kết quả ứng với ảnh và mã hiện tại');
const originalEvidence = await store.listSubmissionItems(submission.id);
const changedEvidence = originalEvidence.map((item) => item.id === gateItem.id ? { ...item, storage_path: `${item.storage_path}-replacement` } : item);
const changedView = portalFactory.buildPortalSubmission({ submission: stored, items: changedEvidence, links: [] }, { forStaff: true });
assert.equal(changedView.aiFindingsMayBeOutdated, true, 'Cảnh báo kết quả cũ khi ảnh thay đổi');
assert.equal(rules.aiReviewMayBeOutdated({ ...stored, verification_code: 'VX-L2-NEW-CODE' }, originalEvidence), true, 'Đổi mã cũng làm kết quả cũ');
assert.equal(rules.aiReviewMayBeOutdated({ ...stored, ai_review: { ...stored.ai_review, evidence_snapshot: undefined } }, originalEvidence), true, 'Kết quả lịch sử không có snapshot vẫn hiển thị là có thể cũ');
assert.equal(rules.aiReviewMayBeOutdated(stored, [...originalEvidence].reverse()), false, 'Thứ tự ảnh không ảnh hưởng snapshot');
assert.ok(rules.aiReviewFindings({ items: { packing_area: { verdict: 'uncertain', reason: 'Ảnh khu đóng gói quá tối', flags: [] } } }, stored.verification_code).some((finding) => /quá tối/.test(finding)), 'Điểm chưa chắc chắn có nhận xét vẫn hiện cho nhân viên');


// A later successful scan replaces stale AI flags; non-AI integrity flags survive.
await store.updateSubmission(submission.id, { status: 'draft' });
aiVerdicts = {}; aiManipulation = false;
const gateNonAiBefore = gateItem.flags.filter((f) => f.source !== 'ai').map((f) => f.flag);
currentAccess = { ...currentAccess, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id) };
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: false }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.status, 'draft');
assert.equal(gateItem.flags.some((f) => f.source === 'ai'), false, 'Quét lại phải thay cảnh báo AI cũ');
assert.deepEqual(gateItem.flags.filter((f) => f.source !== 'ai').map((f) => f.flag), gateNonAiBefore);

// Không có OPENAI_API_KEY → hồ sơ vẫn nộp được, ghi rõ chưa quét AI.
delete process.env.OPENAI_API_KEY;
await store.updateSubmission(submission.id, { status: 'draft', review_note: null });
currentAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.status, 'pending_review', 'Không có AI thì vẫn phải cho nộp để Vexim kiểm thủ công');
assert.equal(body.aiScanned, false);
assert.equal(body.message, 'Hệ thống chưa quét được bằng AI. Hồ sơ đã được gửi để nhân viên đối chiếu.');
assert.doesNotMatch(body.message, /chưa cấu hình|tệp đọc được|\([^)]*\)/i, 'Không lộ lý do kỹ thuật trong thông báo NCC');

// Hết lượt AI L2 không tiêu thụ hoặc chặn hạn mức gửi thủ công L3.
await store.updateSubmission(submission.id, { status: 'draft' });
currentAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: false }) }), { params: Promise.resolve({ id: submission.id }) });
assert.equal(res.status, 429, 'Đã hết lượt AI L2');
process.env.OPENAI_API_KEY = 'test-key';
const aiCallsBeforeQuotaSubmit = aiCalls;
res = await scanRoute.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(res.status, 200);
assert.equal(body.ok, true);
assert.equal(body.status, 'pending_review', 'Hết lượt AI không được chặn nộp hồ sơ');
assert.equal(body.aiScanned, false);
assert.equal(aiCalls, aiCallsBeforeQuotaSubmit, 'Không gọi AI khi đã hết lượt');
assert.match(body.message, /đã được gửi để nhân viên đối chiếu/);

// Nhân viên có hạn mức riêng; quét thử không được nói nhầm rằng hồ sơ đã nộp.
const staffScanFactory = makeLoader({
  'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
  'next/cache': { revalidatePath: () => {} },
  '@/lib/auth/session': { getSession: async () => ({ uid: 'staff-scan-1', email: 'staff@example.com', role: 'reviewer' }) },
  '@/lib/auth/permissions': { hasPermission: () => true },
  '@/lib/supplier-portal/submission-access': { staffSubmissionAccess: async () => currentAccess, supplierSubmissionAccess: async () => null },
  '@/lib/media/storage': { getObject: async (p) => storage.has(p) ? { data: storage.get(p), driver: 'local' } : null },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierSubmission: async () => 'sent' },
  sharp: sharpStub,
})('app/api/supplier-portal/submissions/[id]/ai-scan/route.ts');
aiVerdicts = {};
res = await staffScanFactory.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: false }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.aiScanned, true);
assert.equal(body.status, 'pending_review', 'Nhân viên quét lại không thay trạng thái đang chờ');
assert.equal(body.message, 'AI đã quét thử. Hãy xem kết quả trước khi tiếp tục.');

// Không tiết lộ lỗi kỹ thuật, kể cả khi dịch vụ AI thực sự phát sinh lỗi.
await store.updateSubmission(submission.id, { status: 'pending_review' });
currentAccess = { ...currentAccess, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id) };
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('sensitive provider error'); };
res = await staffScanFactory.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: false }) }), { params: Promise.resolve({ id: submission.id }) });
globalThis.fetch = previousFetch;
body = await res.json();
assert.equal(body.aiScanned, false);
assert.equal(body.status, 'pending_review');
assert.equal(body.message, 'Hệ thống chưa quét được bằng AI. Hồ sơ vẫn được lưu để nhân viên đối chiếu.');
assert.doesNotMatch(body.message, /sensitive|chưa cấu hình|tệp đọc được/);
assert.ok((await store.getSubmission(submission.id)).ai_review, 'Giữ kết quả quét thành công trước đó khi dịch vụ lỗi');

// Even a staff rescan reporting a failure/manipulation cannot overturn a
// human decision made while the AI request is in flight.
aiVerdicts = { factory_gate: { verdict: 'fail', code_visible: false, reason: 'AI không thấy tờ mã', flags: ['code_missing'] } };
aiManipulation = true;
await store.updateSubmission(submission.id, { status: 'pending_review', review_note: 'Ghi chú cũ' });
currentAccess = { ...currentAccess, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id) };
globalThis.fetch = async () => {
  await store.updateSubmission(submission.id, { status: 'returned', review_note: 'Nhân viên yêu cầu bổ sung.', reviewed_by: 'reviewer-1' });
  return Response.json(aiResponse(aiVerdicts));
};
res = await staffScanFactory.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: false }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.ok, true);
assert.equal(body.status, 'returned', 'Quét lại không hoàn tác quyết định của nhân viên');
assert.equal((await store.getSubmission(submission.id)).review_note, 'Nhân viên yêu cầu bổ sung.');
assert.equal((await store.getSubmission(submission.id)).reviewed_by, 'reviewer-1');
assert.ok(body.reasons.some((r) => /tờ mã/.test(r)));
assert.ok(body.reasons.some((r) => /dàn dựng/.test(r)));
globalThis.fetch = previousFetch;

// A submission started from a draft cannot overwrite a different returned
// state recorded by staff while the scan runs.
await store.updateSubmission(submission.id, { status: 'draft', review_note: null, reviewed_by: null });
currentAccess = { ...currentAccess, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id) };
globalThis.fetch = async () => {
  await store.updateSubmission(submission.id, { status: 'returned', review_note: 'Nhân viên vừa trả hồ sơ.', reviewed_by: 'reviewer-2' });
  return Response.json(aiResponse(aiVerdicts));
};
res = await staffScanFactory.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.ok, false);
assert.equal(body.status, 'returned');
assert.match(body.message, /vừa thay đổi/i);
assert.equal((await store.getSubmission(submission.id)).review_note, 'Nhân viên vừa trả hồ sơ.');
globalThis.fetch = previousFetch;

// Changed evidence cannot receive findings for the previous photo or be sent
// as if it were the version the supplier submitted.
await store.updateSubmission(submission.id, { status: 'draft', review_note: null, reviewed_by: null });
currentAccess = { ...currentAccess, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id) };
const oldPath = gateItem.storage_path;
globalThis.fetch = async () => { gateItem.storage_path = `${oldPath}-changed`; return Response.json(aiResponse(aiVerdicts)); };
res = await staffScanFactory.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.ok, false);
assert.equal(body.status, 'draft');
assert.match(body.message, /vừa thay đổi/i);
gateItem.storage_path = oldPath;
globalThis.fetch = previousFetch;

// A failure writing an individual AI result cannot block submission; the full
// review still reaches the staff view independently of the per-item write.
const originalUpdateItem = store.updateSubmissionItem;
gateItem.ai_verdict = 'pass'; // old per-item value will not be updated
store.updateSubmissionItem = async (id, patch) => {
  if (id === gateItem.id) throw new Error('simulated per-item AI write failure');
  return originalUpdateItem(id, patch);
};
currentAccess = { ...currentAccess, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id) };
res = await staffScanFactory.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
store.updateSubmissionItem = originalUpdateItem;
assert.equal(body.ok, true);
assert.equal(body.status, 'pending_review');
assert.ok(body.reasons.some((r) => r.includes('Cổng nhà máy')));
const savedAfterItemFailure = await store.getSubmission(submission.id);
const afterItemFailureView = portalFactory.buildPortalSubmission({ submission: savedAfterItemFailure, items: await store.listSubmissionItems(submission.id), links: [] }, { forStaff: true });
assert.ok(afterItemFailureView.aiFindings.some((r) => r.includes('Cổng nhà máy')), 'CRM vẫn thấy kết quả AI đầy đủ ở hồ sơ');
assert.equal(afterItemFailureView.items.find((item) => item.id === gateItem.id).aiVerdict, 'fail', 'Kết quả hồ sơ mới thắng metadata cũ khi không lưu được mục ảnh');
assert.ok(!afterItemFailureView.items.find((item) => item.id === gateItem.id).flags.some((flag) => flag.source === 'ai'), 'Không trình bày cờ AI cũ như kết quả mới');
aiVerdicts = {}; aiManipulation = false;

// The final status compare-and-swap protects a staff decision made in the
// narrow window after the last read but before the conditional write.
const originalUpdateEditable = store.updateEditableSubmission;
await store.updateSubmission(submission.id, { status: 'draft', review_note: null, reviewed_by: null });
store.updateEditableSubmission = async (id, patch, expected) => {
  await store.updateSubmission(id, { status: 'returned', review_note: 'Nhân viên vừa trả ở bước cuối.', reviewed_by: 'reviewer-cas' });
  return originalUpdateEditable(id, patch, expected);
};
currentAccess = { ...currentAccess, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id) };
res = await staffScanFactory.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
store.updateEditableSubmission = originalUpdateEditable;
assert.equal(body.ok, false);
assert.equal(body.status, 'returned');
assert.match(body.message, /vừa thay đổi/i);
assert.equal((await store.getSubmission(submission.id)).review_note, 'Nhân viên vừa trả ở bước cuối.');

// When only the optional root AI payload fails to save, retry the same CAS
// without it. A real status write failure still propagates instead of lying.
await store.updateSubmission(submission.id, { status: 'draft', review_note: null, reviewed_by: null });
let rootAiFailures = 0;
store.updateEditableSubmission = async (id, patch, expected) => {
  if (patch.ai_review) { rootAiFailures++; throw new Error('simulated AI payload save failure'); }
  return originalUpdateEditable(id, patch, expected);
};
currentAccess = { ...currentAccess, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id) };
res = await staffScanFactory.POST(new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
store.updateEditableSubmission = originalUpdateEditable;
assert.equal(rootAiFailures, 1);
assert.equal(body.ok, true);
assert.equal(body.status, 'pending_review');
assert.equal(body.aiScanned, false);
assert.match(body.message, /Chưa lưu được kết quả AI/i);

// If no new scan can run after a photo was changed, keep the old findings but
// tell both sides they may not describe the new evidence; still accept the case.
const skipService = makeLoader({
  '@/lib/media/storage': { getObject: async () => { throw new Error('skipAi must not read storage'); } },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierSubmission: async () => 'sent' },
})('lib/verification-submission-service.ts');
await store.updateSubmission(submission.id, { status: 'draft' });
const unchangedPath = gateItem.storage_path;
gateItem.storage_path = `${unchangedPath}-new-photo`;
const skippedBundle = { submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [] };
const skippedResult = await skipService.scanAndQueueSubmission(store, { bundle: skippedBundle, supplier: await store.getSupplier('sup-1'), actorId: 'user-1', actorEmail: null, submit: true, skipAi: true });
assert.equal(skippedResult.ok, true);
assert.equal(skippedResult.status, 'pending_review');
assert.match(skippedResult.message, /lần trước.*không khớp ảnh hiện tại/i);
const skippedView = portalFactory.buildPortalSubmission({ submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [] }, { forStaff: true });
assert.equal(skippedView.aiFindingsMayBeOutdated, true);
gateItem.storage_path = unchangedPath;

// A stale create-code request must not revert a case already sent by another tab.
const staleCodeInput = { ...(await store.getSubmission(submission.id)), status: 'draft' };
const codeBeforeRace = (await store.getSubmission(submission.id)).verification_code;
await assert.rejects(skipService.issueCodeForSubmission(store, { submission: staleCodeInput, userId: 'user-1', userEmail: null, supplierName: 'ABC' }), /Hồ sơ vừa thay đổi/);
assert.equal((await store.getSubmission(submission.id)).status, 'pending_review');
assert.equal((await store.getSubmission(submission.id)).verification_code, codeBeforeRace);

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
  session: { uid: 'staff-1', email: 'inspector@veximtrade.com', role: 'reviewer' }, canReview: true,
};
res = await reviewRoute.POST(new Request('http://x/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'return', note: 'ngắn' }) }), { params: Promise.resolve({ id: submission.id }) });
assert.equal(res.status, 400, 'Trả hồ sơ phải kèm lý do đủ rõ');

res = await reviewRoute.POST(new Request('http://x/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'return', note: 'Ảnh cổng nhà máy không thấy biển tên; cần chụp lại đúng mã.' }) }), { params: Promise.resolve({ id: submission.id }) });
body = await res.json();
assert.equal(body.ok, true);
assert.equal((await store.getSubmission(submission.id)).status, 'returned');

await store.updateSubmission(submission.id, { status: 'pending_review' });
staffAccess = { store, submission: await store.getSubmission(submission.id), items: await store.listSubmissionItems(submission.id), links: [], session: { uid: 'staff-1', email: 'inspector@veximtrade.com', role: 'reviewer' }, canReview: true };
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
// Mọi verification_id phải là đợt kiểm THẬT (khoá ngoại media_assets_verification_id_fkey).
const assertMediaOwners = (knownSubmissionIds) => {
  const verificationIds = new Set(verifications.map((v) => v.id));
  for (const row of mediaRows) {
    if (row.verification_id != null) {
      assert.ok(verificationIds.has(row.verification_id), `verification_id phải là đợt kiểm thật, nhận: ${row.verification_id}`);
      assert.ok(!knownSubmissionIds.includes(row.verification_id), 'Không bao giờ ghi id hồ sơ tự gửi vào verification_id');
    }
    if (row.owner_type === 'submission') {
      assert.ok(knownSubmissionIds.includes(row.submission_id), 'owner_type submission phải kèm submission_id hợp lệ');
      assert.equal(row.verification_id, null);
    }
  }
};
assertMediaOwners([submission.id]);
stored = await store.getSubmission(submission.id);
assert.equal(stored.status, 'accepted');
assert.equal(stored.verification_id, verification.id);
assert.ok(auditRows.some((a) => a.action === 'staff.submission.accepted.l2'), 'Phải ghi audit log quyết định của nhân viên');
assert.match(verification.internal_notes, /Hồ sơ nhà cung cấp tự gửi/, 'Đợt kiểm phải ghi rõ nguồn bằng chứng là NCC tự gửi');

/* ------------------------------ 9. L3: chứng từ + link nguồn ------------------------------ */

const l3 = await store.createSubmission({ supplier_id: 'sup-1', target_level: 3, status: 'draft', created_by: 'user-1' });
const aiCallsBeforeL3 = aiCalls;
currentAccess = { store, submission: l3, items: [], links: [], supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
const submitReq = (submit) => new Request('http://x/ai-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit }) });
res = await scanRoute.POST(submitReq(true), { params: Promise.resolve({ id: l3.id }) });
body = await res.json();
assert.equal(body.ok, false, 'L3 rỗng không được nộp');
assert.match(body.message, /ít nhất một chứng từ/);
assert.equal((await store.getSubmission(l3.id)).status, 'draft');

const pdfBytes = new Uint8Array(Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'));
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([pdfBytes], 'other.pdf', { type: 'application/pdf' })) }), { params: Promise.resolve({ id: l3.id }) });
body = await res.json();
assert.equal(body.ok, true, `L3 phải nhận PDF chứng từ khác: ${JSON.stringify(body)}`);
assert.deepEqual(body.flags, [], 'L3 không áp cờ định vị/ban ngày của ảnh nhà máy');
const pdfItem = (await store.listSubmissionItems(l3.id))[0];
assert.equal(pdfItem.mime, 'application/pdf');
assert.equal(pdfItem.has_exif, false);
assert.equal(aiCalls, aiCallsBeforeL3, 'Tải lên không gọi AI');
assert.equal((await store.getMedia(pdfItem.media_id)).audience, 'internal');

const evidenceOps = makeLoader({
  '@/lib/media/storage': {
    putObject: async (p, data) => { storage.set(p, data); return { driver: 'local', path: p }; },
    deleteObject: async (p) => { storage.delete(p); },
  }, sharp: sharpStub,
})('lib/supplier-portal/submission-evidence.ts');

// Nếu lưu mục mới thất bại hoặc hồ sơ vừa đổi trạng thái, chứng từ cũ không mất.
{
  const beforeFiles = storage.size, beforeMedia = mediaRows.length;
  const createItem = store.createSubmissionItem;
  store.createSubmissionItem = async () => { throw new Error('simulated item insert failure'); };
  res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([bytes], 'failed.jpg', { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: l3.id }) });
  store.createSubmissionItem = createItem;
  assert.equal(res.status, 400);
  assert.equal(storage.size, beforeFiles);
  assert.equal(mediaRows.length, beforeMedia);
  assert.ok(storage.has(pdfItem.storage_path), 'Lỗi lưu mới không xoá chứng từ cũ');

  store.createSubmissionItem = async () => { throw new Error('createSubmissionItem: L3_EVIDENCE_LIMIT'); };
  res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([bytes], 'race.jpg', { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: l3.id }) });
  store.createSubmissionItem = createItem;
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /xóa một tệp/i, 'Lỗi CSDL được đổi thành hướng dẫn cho NCC');
  assert.equal(storage.size, beforeFiles);
  assert.ok(storage.has(pdfItem.storage_path));

  const getSubmission = store.getSubmission;
  store.getSubmission = async (id) => id === l3.id ? { ...await getSubmission(id), status: 'pending_review' } : getSubmission(id);
  res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([bytes], 'stale.jpg', { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: l3.id }) });
  store.getSubmission = getSubmission;
  assert.equal(res.status, 400, 'Hồ sơ đổi trạng thái trong khi tải thì không lưu mục mới');
  assert.equal(storage.size, beforeFiles);
  assert.equal(mediaRows.length, beforeMedia);
  assert.ok(storage.has(pdfItem.storage_path));

  const deleteItem = store.deleteSubmissionItem;
  store.deleteSubmissionItem = async () => { throw new Error('simulated delete failure'); };
  await assert.rejects(evidenceOps.removeSubmissionItem(store, pdfItem), /simulated delete failure/);
  store.deleteSubmissionItem = deleteItem;
  assert.ok(storage.has(pdfItem.storage_path), 'Lỗi xoá bản ghi không xoá tệp gốc');
}

// Nhiều chứng từ được giữ tới ba tệp mỗi mục; không tự xoá chứng từ cũ.
for (const fileName of ['second.jpg', 'third.jpg']) {
  currentAccess = { ...currentAccess, submission: await store.getSubmission(l3.id), items: await store.listSubmissionItems(l3.id) };
  res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([bytes], fileName, { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: l3.id }) });
  assert.equal((await res.json()).ok, true);
}
assert.equal((await store.listSubmissionItems(l3.id)).length, 3, 'Giữ được ba tệp cùng loại');
assert.ok((await store.listSubmissionItems(l3.id)).some((item) => item.id === pdfItem.id), 'PDF vẫn còn khi chưa vượt giới hạn');
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([pdfBytes], 'fourth.pdf', { type: 'application/pdf' })) }), { params: Promise.resolve({ id: l3.id }) });
body = await res.json();
assert.equal(res.status, 400);
assert.match(body.message, /xóa một tệp/i);
assert.equal((await store.listSubmissionItems(l3.id)).length, 3);
assert.ok((await store.listSubmissionItems(l3.id)).some((item) => item.id === pdfItem.id), 'Tệp cũ không bị tự động xoá');
assert.ok(storage.has(pdfItem.storage_path));
await evidenceOps.removeSubmissionItem(store, pdfItem); // NCC chọn xóa chứng từ cũ.
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([pdfBytes], 'fourth.pdf', { type: 'application/pdf' })) }), { params: Promise.resolve({ id: l3.id }) });
assert.equal((await res.json()).ok, true);
assert.equal((await store.listSubmissionItems(l3.id)).length, 3);
assert.equal(aiCalls, aiCallsBeforeL3, 'Không gửi ảnh hay PDF lúc tải');

// Tệp sai loại hoặc quá cỡ vẫn bị từ chối.
currentAccess = { ...currentAccess, submission: await store.getSubmission(l3.id), items: await store.listSubmissionItems(l3.id) };
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('commercial_invoice', new File(['not an image'], 'bad.txt', { type: 'text/plain' })) }), { params: Promise.resolve({ id: l3.id }) });
assert.equal(res.status, 400);
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })) }), { params: Promise.resolve({ id: l3.id }) });
assert.equal(res.status, 413);
assert.equal((await store.listSubmissionItems(l3.id)).length, 3);

// API cũ quét thử cũng bị chặn, không thay đổi hồ sơ hay gọi AI.
res = await scanRoute.POST(submitReq(false), { params: Promise.resolve({ id: l3.id }) });
assert.equal(res.status, 409);
assert.equal((await store.getSubmission(l3.id)).status, 'draft');
assert.equal(aiCalls, aiCallsBeforeL3);
res = await scanRoute.POST(submitReq('false'), { params: Promise.resolve({ id: l3.id }) });
assert.equal(res.status, 409, 'Chuỗi false không được hiểu thành yêu cầu nộp');
assert.equal((await store.getSubmission(l3.id)).status, 'draft');

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

// Tái nộp một hồ sơ cũ từng bị AI trả: dữ liệu lịch sử được giữ, không cản nộp.
const legacyItem = (await store.listSubmissionItems(l3.id)).find((item) => item.mime === 'image/jpeg');
await store.updateSubmissionItem(legacyItem.id, { ai_verdict: 'fail', ai_reason: 'AI cũ báo không đạt', flags: [{ flag: 'content_mismatch', severity: 'hard', source: 'ai', detail: 'AI cũ báo không đạt' }] });
const oldReview = { model: 'old-model', summary: 'Kết quả AI cũ', manipulation_suspected: true, items: {} };
await store.updateSubmission(l3.id, { status: 'returned', review_note: 'AI cũ trả hồ sơ', reviewed_by: null, ai_review: oldReview, ai_scanned_at: '2026-10-20T00:00:00Z' });
currentAccess = { store, submission: { ...(await store.getSubmission(l3.id)) }, items: await store.listSubmissionItems(l3.id), links: await store.listSubmissionLinks(l3.id), supplierId: 'sup-1', userId: 'user-1', userEmail: 'supplier@example.com' };
const portalView = load('lib/supplier-portal/submission-view.ts');
const supplierView = portalView.buildPortalSubmission(currentAccess);
assert.equal(supplierView.ready, true);
assert.equal(supplierView.requiredTotal, 1);
assert.equal(supplierView.uploadedTotal, 1);
assert.equal(supplierView.aiScannedAt, null, 'NCC không bị hiểu nhầm kết quả AI cũ là yêu cầu mới');
assert.equal(supplierView.items.find((item) => item.id === legacyItem.id).aiVerdict, null);
assert.match(supplierView.reviewNote, /có thể nộp lại/);
assert.match(supplierView.reviewNote, /AI cũ trả hồ sơ/, 'Giữ ghi chú trước đây khi chưa nộp lại');
assert.doesNotMatch(supplierView.reviewNote, /lần quét trước/, 'Không phỏng đoán nguồn của trạng thái cũ');
const staffView = portalView.buildPortalSubmission(currentAccess, { forStaff: true });
assert.equal(staffView.items.find((item) => item.id === legacyItem.id).aiVerdict, 'fail', 'Nhân viên vẫn xem được lịch sử');

const updateEditable = store.updateEditableSubmission;
store.updateEditableSubmission = async () => { throw new Error('updateEditableSubmission: L3_EVIDENCE_REQUIRED'); };
res = await scanRoute.POST(submitReq(true), { params: Promise.resolve({ id: l3.id }) });
body = await res.json();
store.updateEditableSubmission = updateEditable;
assert.equal(body.ok, false);
assert.match(body.message, /tải ít nhất một chứng từ/i, 'Bằng chứng vừa bị xóa không thể nộp với dữ liệu cũ');
assert.equal((await store.getSubmission(l3.id)).status, 'returned');

throwRevalidation = true;
res = await scanRoute.POST(submitReq(true), { params: Promise.resolve({ id: l3.id }) });
throwRevalidation = false;
body = await res.json();
assert.equal(res.status, 200, 'Hết hạn mức AI L2 hoặc lỗi làm mới cache không được chặn hồ sơ đã nộp');
assert.equal(body.ok, true);
assert.equal(body.status, 'pending_review');
assert.equal(body.aiScanned, false);
assert.equal(aiCalls, aiCallsBeforeL3, 'Ảnh và PDF L3 không được gửi AI dù key tồn tại');
assert.equal((await store.getSubmission(l3.id)).review_note, null);
assert.deepEqual((await store.getSubmission(l3.id)).ai_review, oldReview, 'Không xóa lịch sử AI cũ');
assert.equal((await store.getSubmissionItem(legacyItem.id)).ai_verdict, 'fail');
const submittedAudit = auditRows.find((a) => a.action === 'supplier.submission.submitted.l3' && a.after.review_method === 'manual');
assert.ok(submittedAudit);
assert.equal(submittedAudit.before.review_note, 'AI cũ trả hồ sơ', 'Lưu ghi chú trước đó khi nộp lại');
assert.ok(staffNotifications.some((n) => n.supplierId === 'sup-1' && n.level === 3), 'Gửi thông báo nhân viên khi nộp');
assert.equal(verifications.filter((v) => v.target_level === 3).length, 0, 'Nộp không tự tạo/duyệt xác minh');

// Tài khoản khác hoặc hồ sơ đang chờ không thể nộp lại.
currentAccess = { ...currentAccess, supplierId: 'sup-2' };
res = await scanRoute.POST(submitReq(true), { params: Promise.resolve({ id: l3.id }) });
assert.equal(res.status, 403);
currentAccess = { ...currentAccess, supplierId: 'sup-1', submission: await store.getSubmission(l3.id) };
res = await scanRoute.POST(submitReq(true), { params: Promise.resolve({ id: l3.id }) });
assert.equal(res.status, 409);
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('other_export_evidence', new File([bytes], 'locked.jpg', { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: l3.id }) });
assert.equal(res.status, 400, 'Không tải thêm khi chờ kiểm');

// Nhân viên cũng không thể gọi đường quét cũ cho L3.
const staffScanRoute = makeLoader({
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  'next/cache': { revalidatePath: () => {} },
  '@/lib/auth/session': { getSession: async () => ({ uid: 'staff-1', email: 'staff@example.com', role: 'reviewer' }) },
  '@/lib/auth/permissions': { hasPermission: () => true },
  '@/lib/supplier-portal/submission-access': { staffSubmissionAccess: async () => ({ ...currentAccess, session: { uid: 'staff-1' } }), supplierSubmissionAccess: async () => null },
  '@/lib/media/storage': { getObject: async () => { throw new Error('Không được đọc tệp để gửi AI'); } },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierSubmission: async () => 'sent' },
})('app/api/supplier-portal/submissions/[id]/ai-scan/route.ts');
for (const submit of [false, true]) {
  res = await staffScanRoute.POST(submitReq(submit), { params: Promise.resolve({ id: l3.id }) });
  assert.equal(res.status, 409);
}
assert.equal(aiCalls, aiCallsBeforeL3);

// Phòng vệ trực tiếp ở service, không phụ thuộc route/UI.
let unexpectedStorageReads = 0;
const manualService = makeLoader({
  '@/lib/media/storage': { getObject: async () => { unexpectedStorageReads++; throw new Error('L3 không được đọc cho AI'); } },
  '@/lib/supplier-portal/notify': { notifyStaffSupplierSubmission: async () => 'sent' },
})('lib/verification-submission-service.ts');
const l3Bundle = { submission: await store.getSubmission(l3.id), items: await store.listSubmissionItems(l3.id), links: await store.listSubmissionLinks(l3.id) };
assert.equal(await manualService.runEvidenceScan({ bundle: l3Bundle, supplier: await store.getSupplier('sup-1') }), null);
assert.equal(unexpectedStorageReads, 0);
const noScan = await manualService.scanAndQueueSubmission(store, { bundle: l3Bundle, supplier: await store.getSupplier('sup-1'), actorId: 'staff-1', actorEmail: null, submit: false });
assert.equal(noScan.ok, false);
assert.equal((await store.getSubmission(l3.id)).status, 'pending_review');

// Nhân viên nhận vào đợt kiểm riêng; file vẫn nội bộ và chưa được duyệt.
staffAccess = { store, ...l3Bundle, session: { uid: 'staff-1', email: 'inspector@veximtrade.com', role: 'reviewer' }, canReview: true };
res = await reviewRoute.POST(new Request('http://x/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'accept', note: 'Đối chiếu thủ công' }) }), { params: Promise.resolve({ id: l3.id }) });
body = await res.json();
assert.equal(body.ok, true);
const l3Verification = await store.getVerification(body.verificationId);
assert.equal(l3Verification.target_level, 3);
assert.equal(l3Verification.status, 'in_progress');
assert.equal(l3Verification.approved_by, null);
const l3Copied = mediaRows.filter((m) => m.verification_id === l3Verification.id);
assert.equal(l3Copied.length, 3);
assert.ok(l3Copied.every((m) => m.audience === 'internal' && m.status === 'unverified' && m.checklist_key === 'other_export_evidence'));
const evidenceRules = load('lib/verification-evidence.ts');
assert.equal(evidenceRules.hasDeliveryAuditEvidence(l3Copied), false, 'Bản sao chưa kiểm không tự đủ điều kiện duyệt');
l3Copied[0].status = 'checked'; // Tương ứng thao tác nhân viên tự mở và đánh dấu đã kiểm.
assert.equal(evidenceRules.hasDeliveryAuditEvidence(l3Copied), true);

// Yêu cầu cũ đến muộn không ghi đè hồ sơ đã nhận nhờ cập nhật có điều kiện.
const staleBundle = { ...l3Bundle, submission: { ...l3Bundle.submission, status: 'returned' } };
const staleResult = await manualService.scanAndQueueSubmission(store, { bundle: staleBundle, supplier: await store.getSupplier('sup-1'), actorId: 'user-1', actorEmail: null, submit: true });
assert.equal(staleResult.ok, false);
assert.equal((await store.getSubmission(l3.id)).status, 'accepted');
assert.equal(aiCalls, aiCallsBeforeL3);

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

/* ---------------- 10. FK: bằng chứng tự gửi không mượn verification_id ---------------- */

const previewEvidence = makeLoader({ sharp: sharpStub })('lib/supplier-portal/submission-evidence.ts');
assert.equal((await previewEvidence.derivePreviews('image/jpeg', bytes, false)).forAi, null, 'L3 không tạo bản thu nhỏ AI');
assert.ok((await previewEvidence.derivePreviews('image/jpeg', bytes, true)).forAi, 'L2 giữ bản thu nhỏ AI');
const evidenceService = readPage('lib/supplier-portal/submission-evidence.ts');
assert.ok(evidenceService.includes('owner_type: "submission"'), 'Bằng chứng tự gửi phải dùng owner_type "submission"');
assert.ok(evidenceService.includes('submission_id: submission.id'), 'Phải gắn bằng chứng với submission_id của hồ sơ');
assert.ok(!/verification_id:\s*submission\.id/.test(evidenceService), 'Không được ghi id hồ sơ tự gửi vào verification_id (lỗi FK media_assets_verification_id_fkey)');

const verifyService = readPage('lib/verification-submission-service.ts');
assert.ok(verifyService.includes('verification_id: verification.id'), 'Khi nhân viên chấp thuận, tệp sao chép phải trỏ tới đợt kiểm THẬT');

const uploadRouteSource = readPage('app/api/supplier-portal/submissions/[id]/upload/route.ts');
assert.ok(uploadRouteSource.includes('migrationHint(error)'), 'Log lỗi upload phải kèm gợi ý file migration cần chạy');
assert.ok(!/message = error instanceof Error \? error\.message/.test(uploadRouteSource), 'Không trả nguyên văn lỗi CSDL cho NCC');
const hints = readPage('lib/db/migration-hints.ts');
assert.ok(hints.includes('20261031_supplier_submission_media_owner.sql'), 'Phải gợi ý migration media submission khi gặp lỗi FK');
const migrationHints = load('lib/db/migration-hints.ts');
assert.match(migrationHints.migrationHint(new Error('violates check constraint "supplier_submission_items_key_ck"')), /20261039_l3_other_export_evidence/);
assert.match(migrationHints.migrationHint(new Error('violates check constraint "media_checklist_key_ck"')), /20261039_l3_other_export_evidence/);

const migration = readPage('supabase/migrations/20261031_supplier_submission_media_owner.sql');
assert.ok(migration.includes('submission_id uuid'), 'Migration phải thêm cột media_assets.submission_id');
assert.ok(migration.includes('references public.supplier_submissions(id)'), 'submission_id phải có khoá ngoại tới supplier_submissions');
assert.ok(migration.includes("owner_type in ('product', 'supplier', 'verification', 'submission')"), 'owner_type phải nhận thêm submission');
assert.ok(migration.includes("owner_type = 'submission' and submission_id is not null"), 'media_owner_ck phải ràng buộc submission_id');

assertMediaOwners([submission.id, l3.id]);

console.log('✅ check-supplier-self-verification: tất cả assertion đạt');
console.log(`   · 9 ảnh L2 + 7 loại chứng từ L3 · mã xác minh ${code} · ${aiCalls} lượt gọi AI giả lập · ${mediaRows.length} tệp media · ${verifications.length} đợt kiểm được tạo`);

/* L2 trader: scope snapshot, manual contract and staff acceptance. */
const originalGetSupplier = store.getSupplier;
let traderType = 'trading';
store.getSupplier = async (id) => id === 'sup-trader'
  ? { id, name: 'Trading Company', supplier_type: traderType, onboarding_status: 'approved' }
  : originalGetSupplier(id);
const oldFactory = await store.createSubmission({ supplier_id: 'sup-trader', target_level: 2, status: 'draft', l2_scope: null });
const partnerSub = await manualService.getOrCreateSubmission(store, { supplierId: 'sup-trader', level: 2, userId: 'trader-user', supplierType: 'trading' });
assert.notEqual(partnerSub.id, oldFactory.id, 'Previous factory draft is never relabelled as a partner case');
assert.equal(partnerSub.l2_scope, 'partner_contract');
assert.equal((await store.getSubmission(oldFactory.id)).l2_scope, null);
assert.equal((await manualService.getOrCreateSubmission(store, { supplierId: 'sup-trader', level: 2, userId: 'trader-user', supplierType: 'trading' })).id, partnerSub.id);
await assert.rejects(manualService.getOrCreateSubmission(store, { supplierId: 'sup-trader', level: 2, userId: 'trader-user', supplierType: null }), /loại hình/i);
const coopSub = await manualService.getOrCreateSubmission(store, { supplierId: 'sup-coop', level: 2, userId: 'coop-user', supplierType: 'cooperative' });
assert.equal(coopSub.l2_scope, 'factory', 'Cooperative remains on factory flow');
assert.equal(rules.readiness({ submission: partnerSub, items: [] }).ready, false);
currentAccess = { store, submission: partnerSub, items: [], links: [], supplierId: 'sup-trader', userId: 'trader-user', userEmail: 'trader@example.com' };
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('partner_factory_photos', new File([bytes], 'optional.jpg', { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: partnerSub.id }) });
assert.equal(res.status, 200);
assert.equal(rules.readiness({ submission: partnerSub, items: await store.listSubmissionItems(partnerSub.id) }).ready, false, 'Optional photo alone is not a contract');
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('factory_gate', new File([bytes], 'factory.jpg', { type: 'image/jpeg' })) }), { params: Promise.resolve({ id: partnerSub.id }) });
assert.notEqual(res.status, 200, 'Partner cannot upload factory-checklist items');
res = await uploadRoute.POST(new Request('http://x/upload', { method: 'POST', body: formFor('partner_factory_contract', new File([pdfBytes], 'contract.pdf', { type: 'application/pdf' })) }), { params: Promise.resolve({ id: partnerSub.id }) });
assert.equal(res.status, 200, 'A PDF contract is accepted');
let partnerItems = await store.listSubmissionItems(partnerSub.id);
assert.equal(rules.readiness({ submission: partnerSub, items: partnerItems }).ready, false,
  'Hợp đồng chưa đủ: phải khai tên nhà máy đối tác để sau này đối chiếu giấy chứng nhận');
let partnerSubNamed = await manualService.savePartnerFactoryName(store, {
  submission: partnerSub, partnerFactoryName: 'Nhà máy Chế biến Nông sản Tây Nguyên',
});
assert.equal(partnerSubNamed.partner_factory_name, 'Nhà máy Chế biến Nông sản Tây Nguyên');
assert.equal(rules.readiness({ submission: partnerSubNamed, items: partnerItems }).ready, true,
  'Tên nhà máy đối tác + hợp đồng là đủ, không cần 9 ảnh, mã hay GPS');
assert.equal(rules.readiness({ submission: { ...partnerSubNamed, partner_factory_name: '   ' }, items: partnerItems }).ready, false,
  'Tên rỗng không được tính là đã khai');
await assert.rejects(manualService.savePartnerFactoryName(store, {
  submission: await store.getSubmission(oldFactory.id), partnerFactoryName: 'Nhà máy nào đó',
}), /nhà máy đối tác/i, 'Hồ sơ nhà máy không nhận tên nhà máy đối tác');
assert.ok(partnerItems.every((item) => !item.flags?.length), 'No AI/EXIF flags on partner evidence');
const partnerBundle = { submission: partnerSub, items: partnerItems, links: [] };
const beforeAi = aiCalls;
assert.equal(await manualService.runEvidenceScan({ bundle: partnerBundle, supplier: await store.getSupplier('sup-trader') }), null);
assert.equal((await manualService.scanAndQueueSubmission(store, { bundle: partnerBundle, supplier: await store.getSupplier('sup-trader'), actorId: 'trader-user', actorEmail: null, submit: false })).ok, false);
currentAccess = { ...currentAccess, items: partnerItems };
res = await scanRoute.POST(submitReq(false), { params: Promise.resolve({ id: partnerSub.id }) });
assert.equal(res.status, 409, 'Manual partner evidence cannot be sent to AI');
res = await scanRoute.POST(submitReq(true), { params: Promise.resolve({ id: partnerSub.id }) });
assert.equal((await res.json()).ok, true);
assert.equal(partnerSub.status, 'pending_review');
assert.equal(aiCalls, beforeAi, 'Submitting a partner contract never calls AI');
assert.equal(partnerSub.verification_code, null);
// Direct service calls cannot copy a file from another legal entity.
const originalContract = partnerItems.find((item) => item.checklist_key === 'partner_factory_contract');
const forgedPartner = { ...partnerBundle, submission: { ...partnerSub }, items: [{ ...originalContract, media_id: gateMedia.id, storage_path: gateMedia.storage_path }] };
const beforeReviews = verifications.length;
await assert.rejects(manualService.acceptSubmissionIntoVerification(store, { bundle: forgedPartner, staffId: 'staff-1', staffEmail: null }), /không thuộc đúng hồ sơ/i);
assert.equal(verifications.length, beforeReviews, 'Invalid evidence must not create even an orphan review');
traderType = 'manufacturer';
await assert.rejects(manualService.acceptSubmissionIntoVerification(store, { bundle: { ...partnerBundle, submission: { ...partnerSub } }, staffId: 'staff-1', staffEmail: null }), /không khớp phạm vi/i);
traderType = 'trading';
staffAccess = { store, submission: partnerSub, items: partnerItems, links: [], session: { uid: 'staff-1', email: 'inspector@veximtrade.com', role: 'reviewer' }, canReview: true };
res = await reviewRoute.POST(new Request('http://x/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'accept' }) }), { params: Promise.resolve({ id: partnerSub.id }) });
body = await res.json();
assert.equal(body.ok, true, body.message);
const partnerReview = await store.getVerification(body.verificationId);
assert.equal(partnerReview.l2_scope, 'partner_contract');
assert.equal(partnerReview.status, 'in_progress');
assert.ok(body.href.includes(`review=${encodeURIComponent(partnerReview.id)}`), 'Review link targets the exact snapshot');
const partnerCopies = mediaRows.filter((m) => m.verification_id === partnerReview.id);
assert.equal(partnerCopies.length, 2);
assert.ok(partnerCopies.every((m) => m.audience === 'internal' && m.status === 'unverified'));
console.log('✅ L2 partner: type-specific draft, PDF contract, manual queue, scope changes and exact-review evidence.');
