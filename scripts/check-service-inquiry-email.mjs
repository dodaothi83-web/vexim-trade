// Regression tests cho email form "Đăng ký dịch vụ" (Section 4 trang chủ).
// Không cần Resend/Supabase. Chạy: node scripts/check-service-inquiry-email.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadTS(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, process, console, Date, Set, Map, Intl, Math, String, JSON,
    require: (id) => {
      assert.ok(id in mocks, `Unexpected import ${id} in ${file}`);
      return mocks[id];
    },
  }, { filename: file });
  return module.exports;
}

const COMPANY = {
  name: "Vexim Trade",
  email: "sales@veximtrade.com",
  website: "https://veximtrade.com",
  phone: "+84373685634",
  phoneDisplay: "+84 373 685 634",
  address: "Số 25/6 Ngõ 51 Ngoạ Long, Tây Tựu, Hà Nội, Việt Nam",
  tagline: "Vietnam Export Sourcing Partner",
  legalName: "VEXIM GLOBAL CO., LTD",
  contactEmail: "contact@veximglobal.com",
};

const pipeline = loadTS("../lib/pipeline.ts", {});
const stageContent = loadTS("../lib/email/stage-content.ts", {});
const templates = loadTS("../lib/email/templates.ts", {
  "@/lib/config": { COMPANY, MAIL_DOMAIN: "veximtrade.com", FROM_ADDRESS: "Vexim <sales@veximtrade.com>" },
  "@/lib/email/stage-content": stageContent,
  "@/lib/pipeline": pipeline,
});
const mail = loadTS("../lib/email/service-inquiry.ts", {
  "@/lib/config": { COMPANY },
  "@/lib/email/templates": templates,
});

const base = {
  lang: "vi",
  serviceKey: "featured_ads",
  serviceTitle: "3. Quảng cáo nổi bật",
  companyName: "Công ty TNHH Hạt Điều Bình Phước",
  contactName: "Nguyễn Văn An",
  phone: "0912 345 678",
  email: "an@hatdieu-bp.vn",
  productsText: "Hạt điều W320, W240",
  note: "Cần lên vị trí đầu ngành hạt điều trong tháng 11.",
  reference: "DV-261021-4F7K",
  submittedAt: new Date("2026-10-21T03:05:00Z"),
};

/* 1. Tiêu đề đọc như người viết ------------------------------------------ */
const viSubject = mail.serviceInquiryInternalSubject(base);
assert.ok(!viSubject.includes("["), "no machine bracket tag in subject");
assert.ok(!viSubject.includes("—") && !viSubject.includes("–"), "no long dash in subject");
assert.ok(!/^\s*\d+[.)]/.test(viSubject), "no numbering prefix in subject");
assert.ok(viSubject.includes("Công ty TNHH Hạt Điều Bình Phước"), "subject names the company");
assert.ok(viSubject.includes("quảng cáo nổi bật"), "subject uses short desk label");
assert.ok(viSubject.includes(base.reference), "subject carries the reference code");
assert.ok(viSubject.length <= 100, `subject should stay scannable (${viSubject.length} chars)`);

const enSubject = mail.serviceInquiryInternalSubject({ ...base, lang: "en", serviceTitle: "3. Featured Placement" });
assert.ok(!enSubject.includes("Đăng ký") && !enSubject.includes("dịch vụ"), "internal subject stays in Vietnamese for staff");
assert.equal(
  mail.serviceInquiryInternalSubject({ ...base, serviceKey: "laser_cutting", serviceTitle: "2. Some Vendor Service" }),
  `Công ty TNHH Hạt Điều Bình Phước đăng ký some vendor service (${base.reference})`,
  "unknown service key falls back to the cleaned form title",
);

/* 2. Tên dịch vụ lấy theo mã, không tin tiêu đề do trình duyệt gửi ---------- */
assert.equal(mail.serviceDisplayTitle("fda_compliance", "vi", "Tiêu đề giả"), "Tuân thủ pháp lý FDA");
assert.equal(mail.serviceDisplayTitle("free_listing", "en", undefined), "Free marketplace listing");
assert.equal(mail.serviceDisplayTitle("other", "en", "2. Custom Service"), "Custom Service");

/* 3. Mã yêu cầu: đúng định dạng, theo giờ Việt Nam ------------------------ */
assert.match(mail.serviceInquiryReference(new Date("2026-10-20T17:30:00Z"), () => 0), /^DV-261021-[0-9A-Z]{4}$/);
assert.match(mail.serviceInquiryReference(new Date("2026-10-21T03:05:00Z"), () => 0.5), /^DV-261021-[0-9A-Z]{4}$/);
assert.notEqual(
  mail.serviceInquiryReference(new Date(), () => 0),
  mail.serviceInquiryReference(new Date(), () => 0.99),
  "random suffix varies between submissions",
);

/* 4. Thư nội bộ: đủ dữ liệu, escape XSS, có text thuần -------------------- */
const hostile = {
  ...base,
  companyName: `<script>alert("company")</script>`,
  contactName: `An "CEO"<img src=x onerror=alert(1)>`,
  note: `Dòng 1\n<img src=x onerror=alert(2)>`,
};
const internal = mail.buildServiceInquiryInternalEmail(hostile);
assert.ok(!internal.html.includes("<script>alert"), "company name is escaped");
assert.ok(!internal.html.includes("<img src=x onerror=alert(2)>"), "note is escaped");
assert.ok(internal.html.includes("&lt;script&gt;"), "escaped company name is still visible");
assert.ok(internal.html.includes("&lt;img src=x onerror=alert(2)&gt;"), "escaped note keeps its text");
assert.ok(internal.html.includes(base.reference), "internal email shows reference");
assert.ok(internal.html.includes("Việc cần làm"), "internal email tells staff what to do next");
assert.ok(internal.html.includes("1 ngày làm việc"), "internal email states the follow-up deadline");

const plainInternal = mail.buildServiceInquiryInternalEmail({ ...base, lang: "en" });
assert.ok(plainInternal.text.includes(base.email), "text version has the reply address");
assert.ok(plainInternal.text.includes("Mã yêu cầu") && plainInternal.text.includes(base.reference));
assert.ok(!plainInternal.html.includes("undefined") && !plainInternal.text.includes("undefined"));

/* 5. Thư xác nhận: đúng ngôn ngữ, không lộ ghi chú nội bộ ---------------- */
const ackVi = mail.buildServiceInquiryAcknowledgement(base);
assert.ok(ackVi.subject.startsWith("Vexim Trade đã nhận đăng ký"), ackVi.subject);
assert.ok(ackVi.subject.includes(base.reference), "ack subject carries the reference");
assert.ok(ackVi.html.includes("Kính gửi anh/chị An"), "ack greets the contact by name");
assert.ok(ackVi.text.includes("1 ngày làm việc"), "ack states the response time");
assert.ok(!ackVi.html.includes(base.note), "internal note never reaches the customer");
assert.ok(!ackVi.text.includes(base.note), "internal note never reaches the customer (text)");
assert.ok(!ackVi.html.includes("Việc cần làm"), "ack does not reuse the internal checklist");
assert.match(ackVi.text, /trang danh mục.*168 giờ.*sau khi duyệt/);
assert.doesNotMatch(ackVi.text, /90 ngày|tìm kiếm|gian hàng nổi bật/i, 'Do not promise unsupported placement or duration');

const ackEn = mail.buildServiceInquiryAcknowledgement({ ...base, lang: "en", serviceTitle: "3. Featured Placement" });
assert.ok(ackEn.subject.startsWith("Vexim Trade received your featured placement registration"), ackEn.subject);
assert.ok(ackEn.html.includes("What happens next"), "ack has a next-step block");
assert.ok(ackEn.html.includes("one business day"));
assert.ok(!ackEn.html.includes("Kính gửi") && !ackEn.text.includes("Trân trọng"), "English form gets an English email");
assert.match(ackEn.text, /category page.*168-hour.*approval/);
assert.doesNotMatch(ackEn.text, /90 day|search results|storefront views/i);

/* 6. Mỗi dịch vụ có bước tiếp theo riêng --------------------------------- */
const steps = ["free_listing", "international_website", "featured_ads", "fda_compliance"].map(
  (key) => mail.buildServiceInquiryAcknowledgement({ ...base, serviceKey: key }).text.split("Bước tiếp theo:")[1],
);
assert.equal(new Set(steps).size, 4, "each service explains its own next step");

console.log("✅ Service registration email: human subject, safe escaping, bilingual acknowledgement, per-service next steps.");
