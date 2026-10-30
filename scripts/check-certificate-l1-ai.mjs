// node scripts/check-certificate-l1-ai.mjs — L1 AI certificate scan (owner/partner/expiry), auto-publish, staff brake, and 60/30/7/1-day reminders.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const nodeRequire = createRequire(import.meta.url);

function resolveFile(target) {
  for (const cand of [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  throw new Error(`Cannot resolve ${target}`);
}

const cache = new Map();
function loadTs(relPath, overrides = {}) {
  const abs = resolveFile(path.join(ROOT, relPath));
  const key = `${abs}::${Object.keys(overrides).sort().join(",")}`;
  if (cache.has(key)) return cache.get(key).exports;

  const module = { exports: {} };
  cache.set(key, module);

  const localRequire = (id) => {
    if (id in overrides) return overrides[id];
    if (id === "server-only") return {};
    if (id.startsWith("@/")) {
      return loadTs(id.slice(2), overrides);
    }
    if (id.startsWith(".")) {
      const resolved = path.relative(ROOT, path.resolve(path.dirname(abs), id));
      return loadTs(resolved, overrides);
    }
    return nodeRequire(id);
  };

  const source = fs.readFileSync(abs, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const fn = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) {\n${transpiled}\n});`,
    { filename: abs },
  ).runInThisContext();
  fn(module.exports, localRequire, module, abs, path.dirname(abs));
  return module.exports;
}

// 1. Deleted separate certificate pages & old workflow script must be gone
for (const removed of [
  "app/crm/suppliers/[slug]/certificates/page.tsx",
  "app/crm/suppliers/[slug]/certificates/actions.ts",
  "app/crm/suppliers/[slug]/certificates/review-controls.tsx",
  "app/supplier/portal/certificates/page.tsx",
  "app/supplier/portal/certificates/certificate-submission.tsx",
  "scripts/check-certificate-workflow.mjs",
]) {
  assert.equal(fs.existsSync(path.join(ROOT, removed)), false, `${removed} should be deleted`);
}

// 2. Parse & normalize AI output
const { parseCertificateScan } = loadTs("lib/ai/certificate-scan.ts");
const parsedOwner = parseCertificateScan({
  certificate_name: "HACCP",
  holder_name: "Công ty TNHH Cà phê Ban Mê",
  holder_match: "owner",
  issuer: "SGS Vietnam",
  certificate_number: "SG-2026-01",
  valid_until: "2027-05-20",
  summary: "Chứng nhận HACCP đứng tên chính chủ NCC.",
  confidence: "high",
});
assert.equal(parsedOwner.holder_match, "owner");
assert.equal(parsedOwner.valid_until, "2027-05-20");
assert.equal(parsedOwner.confidence, "high");

const partnerWithoutName = parseCertificateScan({
  certificate_name: "ISO 22000",
  holder_name: "   ",
  holder_match: "partner",
  valid_until: "2026-02-30", // invalid calendar date
  confidence: "unknown-level",
});
assert.equal(partnerWithoutName.holder_match, "unclear", "Partner without holder_name must downgrade to unclear");
assert.equal(partnerWithoutName.valid_until, null, "Invalid calendar date must normalize to null");
assert.equal(partnerWithoutName.confidence, "low", "Unknown confidence must normalize to low");

// 3. Ingest scan decision matrix + upsert + staff_hidden preservation + expiry_notified reset
const certService = loadTs("lib/certificate-service.ts");
const supplier = {
  id: "sup-1",
  name: "Công ty TNHH Cà phê Ban Mê",
  trade_name: "Ban Me Coffee",
  display_name: "Ban Me Coffee Co.",
};
const certs = [];
const audits = [];
const decisionsSent = [];
const staffAlerts = [];
let seq = 1;
const stubStore = {
  listSuppliers: async () => [supplier],
  listCertificates: async (sid) => certs.filter((c) => c.supplier_id === sid),
  getCertificate: async (id) => certs.find((c) => c.id === id) ?? null,
  createCertificate: async (patch) => {
    const row = {
      id: `cert-${seq++}`,
      supplier_id: patch.supplier_id,
      name: patch.name ?? "",
      issuer: patch.issuer ?? null,
      number: patch.number ?? null,
      valid_until: patch.valid_until ?? null,
      file_media_id: patch.file_media_id ?? null,
      check_status: patch.check_status ?? "on_file",
      holder_name: patch.holder_name ?? null,
      holder_match: patch.holder_match ?? "unclear",
      ai_scanned_at: patch.ai_scanned_at ?? null,
      ai_summary: patch.ai_summary ?? null,
      ai_confidence: patch.ai_confidence ?? null,
      source: patch.source ?? "manual",
      checklist_key: patch.checklist_key ?? null,
      verification_id: patch.verification_id ?? null,
      staff_hidden: Boolean(patch.staff_hidden),
      expiry_notified: patch.expiry_notified ?? {},
      review_status: patch.review_status ?? "pending",
      review_note: patch.review_note ?? null,
      publicly_visible: Boolean(patch.publicly_visible),
      checked_at: patch.checked_at ?? null,
      checked_by: null,
      notes: null,
      created_at: "2026-10-21T00:00:00Z",
      updated_at: "2026-10-21T00:00:00Z",
    };
    certs.push(row);
    return row;
  },
  updateCertificate: async (id, patch) => {
    const idx = certs.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    certs[idx] = { ...certs[idx], ...patch, updated_at: "2026-10-21T01:00:00Z" };
    return certs[idx];
  },
  addAuditLog: async (entry) => {
    audits.push(entry);
  },
};

// 3a. Owner match + future valid_until => auto-published
const ownerScan = await certService.ingestCertificateScan(
  {
    supplier,
    mediaId: "media-1",
    bytes: new Uint8Array([1, 2, 3]),
    checklistKey: "haccp_or_brc",
    source: "l1-supplier",
  },
  {
    store: stubStore,
    today: "2026-10-21",
    scanFn: async () => ({
      ok: true,
      data: {
        certificate_name: "HACCP Codex",
        holder_name: "Công ty TNHH Cà phê Ban Mê",
        holder_match: "owner",
        issuer: "QUACERT",
        certificate_number: "HC-001",
        valid_until: "2026-12-05", // 45 days from 2026-10-21
        summary: "Chính chủ Công ty TNHH Cà phê Ban Mê, hạn 2026-12-05.",
        confidence: "high",
      },
    }),
    notifyDecisionFn: async (payload) => {
      decisionsSent.push(payload);
      return "sent";
    },
    notifyStaffFn: async (sup, name) => {
      staffAlerts.push({ sup: sup.id, name });
      return "sent";
    },
  },
);
assert.equal(ownerScan.decision.autoPublish, true);
assert.equal(ownerScan.certificate.review_status, "approved");
assert.equal(ownerScan.certificate.publicly_visible, true);
assert.equal(ownerScan.certificate.holder_match, "owner");
assert.equal(decisionsSent.length, 1);

// 3b. Partner match + future valid_until => auto-published with partner holder_name
const partnerScan = await certService.ingestCertificateScan(
  {
    supplier,
    mediaId: "media-2",
    bytes: new Uint8Array([4, 5, 6]),
    checklistKey: "food_safety",
    source: "l1-supplier",
  },
  {
    store: stubStore,
    today: "2026-10-21",
    scanFn: async () => ({
      ok: true,
      data: {
        certificate_name: "ATTP Nhà máy chế biến",
        holder_name: "Công ty Cổ phần Chế biến Nông sản Tây Nguyên",
        holder_match: "partner",
        issuer: "Chi cục ATTP Đắk Lắk",
        certificate_number: "ATTP-778",
        valid_until: "2027-08-01",
        summary: "Giấy ATTP đứng tên đơn vị đối tác sản xuất.",
        confidence: "medium",
      },
    }),
    notifyDecisionFn: async (payload) => {
      decisionsSent.push(payload);
      return "sent";
    },
    notifyStaffFn: async () => "sent",
  },
);
assert.equal(partnerScan.decision.autoPublish, true);
assert.equal(partnerScan.certificate.holder_match, "partner");
assert.equal(
  partnerScan.certificate.holder_name,
  "Công ty Cổ phần Chế biến Nông sản Tây Nguyên",
);
assert.equal(certs.length, 2);

// 3c. Unclear / expired => stays pending, not publicly_visible, alerts staff
const unclearScan = await certService.ingestCertificateScan(
  {
    supplier,
    mediaId: "media-3",
    bytes: new Uint8Array([7, 8]),
    checklistKey: "export_license",
    source: "l1-supplier",
  },
  {
    store: stubStore,
    today: "2026-10-21",
    scanFn: async () => ({
      ok: true,
      data: {
        certificate_name: "Giấy phép xuất khẩu",
        holder_name: null,
        holder_match: "unclear",
        issuer: null,
        certificate_number: null,
        valid_until: "2026-01-01",
        summary: "Ảnh mờ và đã quá hạn.",
        confidence: "low",
      },
    }),
    notifyDecisionFn: async () => "sent",
    notifyStaffFn: async (sup, name) => {
      staffAlerts.push({ sup: sup.id, name });
      return "sent";
    },
  },
);
assert.equal(unclearScan.decision.autoPublish, false);
assert.equal(unclearScan.certificate.review_status, "pending");
assert.equal(unclearScan.certificate.publicly_visible, false);
assert.equal(staffAlerts.length, 1);

// 4. Cron expiry reminders at 60 / 30 / 7 / 1 days (idempotent) + reset on re-upload
const reminderCalls = [];
const notifyExpiryStub = async (input) => {
  reminderCalls.push(input);
  return "sent";
};

// On 2026-10-21, cert-1 (valid_until 2026-12-05) has 45 days left -> threshold 60 ("d60")
let r1 = await certService.sendCertificateExpiryReminders({
  store: stubStore,
  notifyFn: notifyExpiryStub,
  today: "2026-10-21",
  nowIso: "2026-10-21T02:00:00Z",
});
assert.equal(r1.reminded, 1);
assert.equal(reminderCalls.at(-1).threshold, 60);
assert.equal(reminderCalls.at(-1).daysLeft, 45);
assert.ok(certs[0].expiry_notified.d60);

// Running again on the same day must not re-send
let r1Repeat = await certService.sendCertificateExpiryReminders({
  store: stubStore,
  notifyFn: notifyExpiryStub,
  today: "2026-10-21",
  nowIso: "2026-10-21T05:00:00Z",
});
assert.equal(r1Repeat.reminded, 0);
assert.equal(r1Repeat.alreadyNotified, 1);

// Advance to 25 days left (2026-11-10) -> threshold 30 ("d30")
let r2 = await certService.sendCertificateExpiryReminders({
  store: stubStore,
  notifyFn: notifyExpiryStub,
  today: "2026-11-10",
  nowIso: "2026-11-10T02:00:00Z",
});
assert.equal(r2.reminded, 1);
assert.equal(reminderCalls.at(-1).threshold, 30);
assert.ok(certs[0].expiry_notified.d30);

// Advance to 5 days left (2026-11-30) -> threshold 7 ("d7")
let r3 = await certService.sendCertificateExpiryReminders({
  store: stubStore,
  notifyFn: notifyExpiryStub,
  today: "2026-11-30",
  nowIso: "2026-11-30T02:00:00Z",
});
assert.equal(r3.reminded, 1);
assert.equal(reminderCalls.at(-1).threshold, 7);

// Advance to 1 day left (2026-12-04) -> threshold 1 ("d1")
let r4 = await certService.sendCertificateExpiryReminders({
  store: stubStore,
  notifyFn: notifyExpiryStub,
  today: "2026-12-04",
  nowIso: "2026-12-04T02:00:00Z",
});
assert.equal(r4.reminded, 1);
assert.equal(reminderCalls.at(-1).threshold, 1);

// Staff sets staff_hidden = true on cert-1, then supplier re-uploads renewed certificate for haccp_or_brc
await stubStore.updateCertificate(certs[0].id, { staff_hidden: true });
const renewed = await certService.ingestCertificateScan(
  {
    supplier,
    mediaId: "media-renewed",
    bytes: new Uint8Array([9, 9, 9]),
    checklistKey: "haccp_or_brc",
    source: "l1-supplier",
  },
  {
    store: stubStore,
    today: "2026-12-04",
    scanFn: async () => ({
      ok: true,
      data: {
        certificate_name: "HACCP Codex",
        holder_name: "Công ty TNHH Cà phê Ban Mê",
        holder_match: "owner",
        issuer: "QUACERT",
        certificate_number: "HC-001",
        valid_until: "2027-12-05",
        summary: "Bản gia hạn mới tới 2027-12-05.",
        confidence: "high",
      },
    }),
    notifyDecisionFn: async () => "sent",
    notifyStaffFn: async () => "sent",
  },
);
assert.equal(renewed.certificate.id, "cert-1", "Re-upload updates the existing certificate record");
assert.equal(renewed.certificate.valid_until, "2027-12-05");
assert.deepEqual(renewed.certificate.expiry_notified, {}, "Renewed expiry date resets reminder markers");
assert.equal(renewed.certificate.staff_hidden, true, "AI re-scan must never clear staff_hidden brake");

// 5. Public supplier certificate filter
const { publicSupplierCertificates } = loadTs("lib/public/certificates.ts");
// While cert-1 has staff_hidden=true, only cert-2 (partner) is returned
let pub = publicSupplierCertificates("sup-1", certs, [], "2026-12-04");
assert.equal(pub.length, 1);
assert.equal(pub[0].id, "cert-2");
assert.equal(pub[0].holderMatch, "partner");

// Unhide cert-1 -> both owner and partner certificates appear with expiry dates
await stubStore.updateCertificate("cert-1", { staff_hidden: false });
pub = publicSupplierCertificates("sup-1", certs, [], "2026-12-04");
assert.equal(pub.length, 2);
assert.deepEqual(
  pub.map((c) => [c.id, c.holderMatch, c.validUntil]),
  [
    ["cert-1", "owner", "2027-12-05"],
    ["cert-2", "partner", "2027-08-01"],
  ],
);

// 6. Supplier dashboard cert-expiring notice within 60 days
const { buildSupplierDashboard } = loadTs("lib/supplier-portal/dashboard.ts");
const dashWithExpiring = buildSupplierDashboard({
  supplierId: "sup-1",
  supplier: { id: "sup-1", onboarding_status: "approved", updated_at: "2026-10-21T00:00:00Z" },
  invites: [],
  requests: [],
  reviews: [],
  products: [],
  certificates: [
    {
      ...certs[0],
      valid_until: "2026-11-15", // 25 days from 2026-10-21
    },
  ],
  reads: [],
  days: 30,
  now: new Date("2026-10-21T12:00:00Z"),
});
assert.ok(
  dashWithExpiring.notices.some(
    (n) => n.key === "cert-expiring:cert-1" && n.title.includes("còn 25 ngày"),
  ),
  "Dashboard must surface cert-expiring notice when certificate expires within 60 days",
);

console.log("✅ L1 AI certificate scan: owner/partner labels, expiry auto-display, staff hide brake, and 60/30/7/1-day idempotent reminders.");
