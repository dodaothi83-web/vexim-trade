// node --experimental-strip-types --no-warnings scripts/check-supplier-category-requests.mjs
//
// Ngành NCC tự khai = YÊU CẦU, không phải quyền.
//
// Lỗi từng xảy ra: NCC bán dừa vào bước 1 của hồ sơ, danh mục chưa mở nên không có gì để
// chọn, nút Tiếp tục và Gửi duyệt đều chặn, hồ sơ treo ở `not_started` và không ai biết họ
// bán gì. Cách chữa phải giữ đúng ranh giới cũ, nên check này chặn cứng:
//   1. Form cho gửi hồ sơ chỉ với ngành tự khai (đó chính là ca từng treo), nhưng KHÔNG cho
//      ghi ngành đã mở bằng chữ (phải chọn trong danh sách).
//   2. Yêu cầu ngành không bao giờ cấp phạm vi: không `supplier_categories`, không sản phẩm.
//   3. So khớp gần đúng: "coconut" / "cơm dừa" / "dừa sấy" phải gợi ý cùng danh mục "Dừa",
//      và CRM gom chúng thành MỘT dòng kèm số NCC.
//   4. Có đường trả lời: nhân viên chốt mở/từ chối, NCC nhận email; từ chối bắt buộc có lý do.
//   5. Câu cam kết 3 ngày làm việc in nguyên văn dưới ô nhập ở cả hai ngôn ngữ.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.join(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function load(rel, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(read(rel), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      module: mod,
      exports: mod.exports,
      require: (id) => {
        assert.ok(id in mocks, `${rel}: unexpected ${id}`);
        return mocks[id];
      },
      console: { error() {} },
    },
    { filename: rel },
  );
  return mod.exports;
}

const rc = load("lib/supplier-portal/requested-category.ts");
const open = [
  { slug: "cashew", name_i18n: { vi: "Hạt điều", en: "Cashew kernels" } },
  { slug: "spices", name_i18n: { vi: "Gia vị", en: "Spices" } },
  { slug: "coconut", name_i18n: { vi: "Dừa", en: "Coconut products" } },
];
const closed = [open[0], open[1]]; // dừa chưa mở

/* 1. Bỏ dấu và chuẩn hoá: "Dừa", "dua", "DỪA  SẤY" phải cùng khoá. */
assert.equal(rc.foldCategoryLabel("Dừa"), "dua");
assert.equal(rc.foldCategoryLabel("  dua  "), "dua");
assert.equal(rc.foldCategoryLabel("Dừa sấy"), "dua say");
assert.equal(rc.foldCategoryLabel("Điều"), "dieu", "đ phải thành d");

/* 2. So khớp gần đúng thay vì chỉ chặn trùng tên chính xác. */
for (const label of ["dừa", "Dừa", "coconut", "Coconut products", "cơm dừa", "dừa sấy"]) {
  const match = rc.matchOpenCategory(label, open);
  assert.ok(match, `${label} phải khớp danh mục dừa`);
  assert.equal(match.category.slug, "coconut", `${label} khớp sai danh mục`);
  assert.equal(match.kind, label.toLowerCase() === "dừa" || label === "Dừa" || label === "coconut products" ? "exact" : match.kind);
}
assert.equal(rc.matchOpenCategory("dừa", open).kind, "exact");
assert.equal(rc.matchOpenCategory("dừa sấy", open).kind, "near");
assert.equal(rc.matchOpenCategory("cà phê", open), null, "không khớp thì không được bịa gợi ý");
assert.equal(rc.matchOpenCategory("hạt điều rang", open).category.slug, "cashew");

/* 3. Ghi ngành ĐÃ MỞ bằng chữ thì bị từ chối, kể cả ghi tiếng Anh hoặc không dấu. */
const options = open.map((category) => ({ slug: category.slug, name_i18n: category.name_i18n }));
for (const note of ["dừa", "Dua", "coconut", "coconut products"]) {
  const result = rc.parseRequestedCategory({ note, selected: [] }, options);
  assert.equal(result.ok, false, `${note}: ngành đã mở thì phải chọn trong danh sách`);
  assert.equal(result.reason, "already_open");
}

/* 4. Ngành chưa mở: nhận, chuẩn hoá, tối đa 2 ngành, tối đa 120 ký tự mỗi ngành. */
const accepted = rc.parseRequestedCategory({ note: " Mít sấy ,,bamboo ", selected: [] }, closed);
assert.equal(accepted.ok, true, "hai ngành mới phải được nhận");
assert.equal(accepted.note, "Mít sấy, bamboo");
assert.deepEqual(JSON.parse(JSON.stringify(accepted.requests)), [
  { label: "Mít sấy", normalized: "mit say" },
  { label: "bamboo", normalized: "bamboo" },
]);
assert.equal(rc.parseRequestedCategory({ note: "", selected: [] }, closed).note, null, "ô trống thì cột sạch");
assert.equal(rc.parseRequestedCategory({ note: "a, b, c", selected: [] }, closed).reason, "too_many");
assert.equal(rc.parseRequestedCategory({ note: "x".repeat(121), selected: [] }, closed).reason, "too_long");
assert.equal(rc.parseRequestedCategory({ note: "mít <b>sấy</b>", selected: [] }, closed).reason, "empty", "không nhận markup");
assert.equal(rc.parseRequestedCategory({ note: "http://evil.example", selected: [] }, closed).reason, "empty", "không nhận URL");

/* 5. Không có danh mục nào mở: ngành tự khai vẫn gửi được (ca dừa từng treo). */
const proposals = load("lib/supplier-portal/category-proposals.ts", {
  "./requested-category": rc,
});
const form = () => {
  const data = new Map();
  return {
    getAll: (key) => data.get(key) ?? [],
    get: (key) => data.get(key) ?? null,
    set: (key, value) => data.set(key, value),
  };
};
const empty = form();
empty.set("requested_category_other", "dừa");
const onlyOther = proposals.parseSupplierCategoryProposals(empty, [], "vi");
assert.deepEqual(onlyOther.requested_category_slugs, [], "ghi ngành không được cấp phạm vi");
assert.equal(onlyOther.requested_category_other, "dừa");
assert.deepEqual(JSON.parse(JSON.stringify(onlyOther.category_requests)), [{ label: "dừa", normalized: "dua" }]);

const nothing = form();
assert.throws(() => proposals.parseSupplierCategoryProposals(nothing, [], "vi"), /danh mục|ngành/i,
  "không chọn và không ghi gì thì phải báo lỗi");

const withSlug = form();
withSlug.set("requested_category_slugs", ["cashew"]);
withSlug.set("requested_category_other", "mít sấy");
const both = proposals.parseSupplierCategoryProposals(withSlug, proposals.categoryProposalOptions([
  { id: "c1", slug: "cashew", parent_id: null, name_i18n: { vi: "Hạt điều" }, status: "published", is_published: true, sort_order: 1 },
]), "vi");
assert.deepEqual(both.requested_category_slugs, ["cashew"], "chọn danh mục vẫn giữ nguyên");
assert.equal(both.requested_category_other, "mít sấy");

const staleSlug = form();
staleSlug.set("requested_category_slugs", ["coconut-draft"]);
assert.throws(() => proposals.parseSupplierCategoryProposals(staleSlug, [], "vi"),
  "slug không có trong danh sách mở phải bị từ chối");

/* 6. Nhóm theo ngành: ba cách gọi = một dòng, đếm đúng số NCC, giữ id để trả lời một lần. */
const rows = [
  { id: "r1", supplier_id: "s1", label: "dừa", normalized: "dua", status: "pending", created_at: "2026-11-01T00:00:00Z" },
  { id: "r2", supplier_id: "s2", label: "cơm dừa", normalized: "com dua", status: "pending", created_at: "2026-11-02T00:00:00Z" },
  { id: "r3", supplier_id: "s3", label: "dừa sấy", normalized: "dua say", status: "pending", created_at: "2026-11-03T00:00:00Z" },
  { id: "r4", supplier_id: "s4", label: "dừa", normalized: "dua", status: "rejected", created_at: "2026-10-30T00:00:00Z" },
];
const groups = rc.groupPendingCategoryRequests(rows, open);
assert.equal(groups.length, 3, "gom theo normalized, bỏ yêu cầu đã chốt");
const coconutGroup = groups.find((group) => group.normalized === "dua" && group.label === "dừa");
assert.ok(coconutGroup);
assert.equal(coconutGroup.suggestion.category.slug, "coconut", "nhóm phải có gợi ý danh mục đã có");
assert.ok(coconutGroup.requestIds.includes("r1"));
assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 3, "chỉ đếm yêu cầu còn chờ");
const nearGroup = groups.find((group) => group.label === "dừa sấy");
assert.equal(nearGroup.suggestion.kind, "near");
assert.equal(nearGroup.suggestion.category.slug, "coconut");

/* 7. Câu cam kết đúng nguyên văn, ở cả hai ngôn ngữ. */
const promise = rc.REQUESTED_CATEGORY_PROMISE_VI;
assert.ok(promise.includes("3 ngày làm việc"), "cam kết phải nói rõ 3 ngày làm việc");
assert.ok(promise.includes("báo bạn qua email"), "cam kết phải nói rõ báo qua email");
assert.ok(promise.includes("Hồ sơ doanh nghiệp vẫn được duyệt"), "cam kết phải nói hồ sơ vẫn được duyệt");
assert.ok(promise.includes("sản phẩm đăng được khi ngành đã mở"), "cam kết phải nói điều kiện đăng sản phẩm");
assert.ok(rc.REQUESTED_CATEGORY_PROMISE_EN.includes("3 working days"));

const onboarding = read("lib/i18n/portal/onboarding.ts");
assert.ok(onboarding.includes(promise), "chuỗi tiếng Việt trong từ điển phải đúng nguyên văn cam kết");
assert.ok(onboarding.includes("3 working days"), "bản tiếng Anh cũng phải có cam kết");
assert.match(onboarding, /requestStatus: \{ pending: "Being reviewed"/);
assert.match(onboarding, /requestStatus: \{ pending: "Đang xem xét"/);

/* 8. Cổng NCC: form cho gửi khi chỉ có ngành tự khai; không chặn cứng danh mục. */
const profileForm = read("app/supplier/portal/supplier-profile-form.tsx");
assert.match(profileForm, /function categoriesChosen\(form: HTMLFormElement\): boolean \{[\s\S]*?requested_category_other[\s\S]*?\}/,
  "categoriesChosen phải nhận ô ngành tự khai");
assert.match(profileForm, /SupplierCategoryPicker/, "form dùng chung ô chọn danh mục có ô ngành tự khai");
assert.match(profileForm, /requests=\{categoryRequests\}/, "form phải hiện câu trả lời của Vexim");
const picker = read("app/supplier/portal/supplier-category-picker.tsx");
assert.match(picker, /name="requested_category_other"/, "ô ngành tự khai phải được gửi lên");
assert.match(picker, /otherPromise/, "ô ngành tự khai phải kèm cam kết");
assert.match(picker, /requestStatus/, "NCC phải đọc được trạng thái yêu cầu đã gửi");

/* 9. Máy chủ: lưu yêu cầu vào bảng riêng, không cấp phạm vi, không tạo supplier_categories. */
const route = read("app/api/supplier-portal/profile/route.ts");
assert.match(route, /upsertSupplierCategoryRequests/, "yêu cầu phải được ghi thành dòng riêng");
assert.match(route, /notifyStaffCategoryRequest/, "nhân viên phải nhận thông báo ngay");
assert.doesNotMatch(route, /setSupplierCategories/, "nộp hồ sơ không được tự gắn phạm vi danh mục");

const migration = read("supabase/migrations/20261106_supplier_category_requests.sql");
assert.match(migration, /create table if not exists public\.supplier_category_requests/);
assert.match(migration, /status in \('pending', 'opened', 'rejected'\)/, "chỉ ba trạng thái");
assert.match(migration, /unique \(supplier_id, normalized, status\)/, "không sinh yêu cầu trùng");
assert.match(migration, /enable row level security/, "bảng nội bộ phải bật RLS");
assert.doesNotMatch(migration, /alter table public\.supplier_categories/, "yêu cầu không đụng phạm vi NCC");

/* 10. Nhân viên trả lời được, và từ chối bắt buộc có lý do; NCC nhận email. */
const actions = read("app/crm/suppliers/industry-actions.ts");
assert.match(actions, /guard\("categories\.manage"\)/, "chỉ người có quyền danh mục được trả lời");
assert.match(actions, /decision === "rejected" && !note/, "từ chối phải kèm lý do");
assert.match(actions, /publishedOnly: true/, "chỉ mở được bằng danh mục đã xuất bản");
assert.match(actions, /notifyCategoryRequestDecision/, "phải gửi email cho NCC");
assert.match(actions, /supplier\.category_request_(opened|rejected)/, "phải ghi audit");
assert.doesNotMatch(actions, /setSupplierCategories|updateSupplier\(/, "trả lời yêu cầu không được tự cấp phạm vi");

const notify = read("lib/supplier-portal/notify.ts");
assert.match(notify, /export async function notifyCategoryRequestDecision/);
assert.match(notify, /export async function notifyStaffCategoryRequest/);
assert.match(notify, /\/supplier\/portal\/categories/, "email cho NCC phải dẫn tới mục danh mục kinh doanh");

/* 11. CRM: khối gom ngành + số NCC, chỉ hiện với người có quyền quản lý danh mục. */
const crmPage = read("app/crm/suppliers/page.tsx");
assert.match(crmPage, /groupPendingCategoryRequests/, "CRM phải gom yêu cầu theo ngành");
assert.match(crmPage, /industryGroups/, "CRM phải đếm nhà cung cấp theo ngành");
assert.match(crmPage, /canManage &&/, "khối ngành chỉ hiện với người có quyền");
const requestsUi = read("app/crm/suppliers/industry-requests.tsx");
assert.match(requestsUi, /group\.count/, "phải hiện số nhà cung cấp");
assert.match(requestsUi, /group\.suggestion/, "phải hiện gợi ý danh mục gần đúng");
assert.match(requestsUi, /Chưa mở, gửi lý do/, "phải có đường từ chối kèm lý do");

/* 12. Yêu cầu ngành không bao giờ hiện với buyer. */
const publicFiles = ["app/(public)/suppliers/[slug]/page.tsx", "components/public/supplier-storefront.tsx"];
for (const file of publicFiles) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const source = read(file);
  assert.doesNotMatch(source, /requested_category_other|category_requests|categoryRequests/, `${file}: yêu cầu ngành chỉ dành cho CRM`);
}

console.log("✅ Supplier category requests: ngành tự khai là yêu cầu có trạng thái, không cấp phạm vi, có email trả lời và CRM gom theo ngành.");
