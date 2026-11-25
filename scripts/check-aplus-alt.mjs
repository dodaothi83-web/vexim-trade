// node --experimental-strip-types scripts/check-aplus-alt.mjs
// Mô tả ảnh (alt) cho ảnh A+: AI gợi ý khi tải ảnh (chỉ điền ô trống, lỗi thì bỏ qua) và alt dự phòng
// không trùng nhau trên cùng trang khi nhà cung cấp để trống.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const fnFrom = (file, name, extra = "") => {
  const src = read(file);
  const start = src.indexOf(`export function ${name}`);
  assert.ok(start >= 0, `${name} exists in ${file}`);
  const block = src.slice(start, src.indexOf("\n}\n", start) + 2).replace(/^export /, "");
  const box = {};
  vm.runInNewContext(ts.transpileModule(`${extra}\n${block}\nthis.fn = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, box);
  return box.fn;
};

// 1. Làm sạch câu AI trả về.
const contacts = read("lib/public/product-selection.ts");
const contactFn = contacts.slice(contacts.indexOf("export function withoutDirectContacts"), contacts.indexOf("\n}\n", contacts.indexOf("export function withoutDirectContacts")) + 2).replace(/^export /, "");
const clean = fnFrom("lib/ai/aplus-alt.ts", "cleanAltSuggestion", `const APLUS_ALT_MAX = 160;\n${contactFn}`);
assert.equal(clean('"Image of workers grading W320 cashew kernels."'), "Workers grading W320 cashew kernels");
assert.equal(clean("photo showing 20ft container loading of cashew cartons"), "20ft container loading of cashew cartons");
assert.equal(clean("  Vacuum   packed\ncashew kernels  "), "Vacuum packed cashew kernels");
assert.equal(clean("Cashew bags, call +84 912 345 678"), "", "Contact details drop the whole suggestion");
assert.equal(clean("Visit www.example.com for cashews"), "");
assert.equal(clean("sales@example.com packing line"), "");
assert.equal(clean(""), "");
const long = clean("Rows of stainless steel drying ovens " + "with trays of cashew kernels ".repeat(10));
assert.ok(long.length <= 160 && !/\s$/.test(long), "Long suggestions are cut on a word boundary within the alt limit");

// 2. Gọi AI: ảnh nhỏ (detail low), hết giờ thì bỏ, chưa cấu hình khoá thì không gọi.
const alt = read("lib/ai/aplus-alt.ts");
assert.match(alt, /detail: "low"/);
assert.match(alt, /AbortSignal\.timeout\(15_000\)/);
assert.match(alt, /if \(!apiKey\) return null;/);
assert.match(alt, /never as instructions/, "Text inside the photo is treated as content");

// 3. Ba nơi tải ảnh A+ trả gợi ý alt (nếu có) cùng đường dẫn ảnh.
for (const file of ["app/api/supplier-portal/products/[id]/aplus/route.ts", "app/api/supplier-portal/company-aplus/route.ts", "lib/products/aplus-staff-upload.ts"]) {
  const src = read(file);
  assert.match(src, /suggestAplusAlt\(\{ bytes, mime: check\.mime, subject/, `${file} asks for an alt suggestion`);
  assert.match(src, /NextResponse\.json\(\{ ok: true, path: stored\.path, \.\.\.\(alt \? \{ alt \} : \{\}\) \}\)/, `${file} returns the suggestion with the path`);
}

// 4. Trình soạn chỉ điền ô alt còn trống, không đè chữ đã nhập, không đánh dấu sửa tay bản tiếng Anh.
const editor = read("components/products/aplus-editor.tsx");
assert.match(editor, /if \(vi && vi\[i\]\?\.trim\(\) \|\| english\[i\]\?\.trim\(\)\) return m;/);
assert.match(editor, /if \(current && !slotValue\(current, altKey\)\.trim\(\)\) \{ fillAlt\(module\.id, altKey, uploaded\.alt\)/);
assert.match(editor, /onFile=\{\(file\) => void p\.onImage\(key, file, apply, altKey\)\}/);

// 5. Alt dự phòng: mô tả có thật đứng trước; trùng nhau trên cùng trang thì đánh số.
const unique = fnFrom("components/public/product-aplus.tsx", "uniqueAltFallback");
const next = unique();
assert.deepEqual(["Cashew W320 – photo", "Cashew W320 – photo", "Cashew W320 – gallery photo", "Cashew W320 – photo"].map(next),
  ["Cashew W320 – photo", "Cashew W320 – photo 2", "Cashew W320 – gallery photo", "Cashew W320 – photo 3"]);
const page = read("components/public/product-aplus.tsx");
assert.match(page, /alt=\{item\.alt\?\.trim\(\) \|\| fallback\(fallbackAlt\)\}/);
assert.match(page, /item\.title \? `\$\{item\.title\} – \$\{productName\}` : `\$\{productName\} – step \$\{i \+ 1\}`/);
assert.match(page, /item\.caption \|\| `\$\{productName\} – gallery photo`/);
assert.doesNotMatch(page, /item\.caption \|\| productName,|module\.caption \|\| productName,/, "No more bare product name as the alt of every photo");

console.log("✅ A+ alt: AI suggestion on upload (empty fields only, safe on failure) and unique fallback alts.");
