// node scripts/check-supplier-media-bank.mjs
// Kho ảnh của nhà cung cấp: tải ảnh trước khi có sản phẩm, gắn ảnh vào sản phẩm
// đúng lúc lưu — không có bước "lưu nháp rồi mới tải ảnh".
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

// 1. Bảng media đã cho phép tệp thuộc nhà cung cấp, không cần migration mới.
const schema = read('../supabase/schema.sql');
assert.match(schema, /owner_type = 'supplier' and supplier_id is not null and product_id\s+is null/,
  'media_assets phải cho phép tệp owner_type=supplier với product_id null');

// 2. API kho ảnh: chỉ nhận ảnh của chính tài khoản, luôn ở chế độ nội bộ.
const bank = read('../app/api/supplier-portal/media/route.ts');
assert.match(bank, /listMedia\("supplier", access\.supplier\.id\)/, 'phải đếm ảnh theo nhà cung cấp');
assert.match(bank, /owner_type: "supplier", product_id: null, supplier_id: access\.supplier\.id/,
  'ảnh trong kho phải có owner_type=supplier và product_id null');
assert.match(bank, /audience: "internal"/, 'ảnh trong kho luôn ở chế độ nội bộ');
assert.match(bank, /supplier-media\/\$\{/, 'tệp kho ảnh phải nằm trong namespace riêng');
assert.match(bank, /asset\.owner_type !== "supplier" \|\| asset\.supplier_id !== access\.supplier\.id \|\|\s*\n?\s*asset\.created_by !== access\.user\.id/,
  'chỉ người tải lên được xóa ảnh trong kho');
assert.match(bank, /BANK_LIMIT = 12/, 'kho ảnh giới hạn 12 ảnh');

// 3. Trang tạo sản phẩm truyền kho ảnh vào form.
const page = read('../app/supplier/portal/products/new/page.tsx');
assert.match(page, /listMedia\("supplier", access\.supplier\.id\)/, 'trang tạo sản phẩm phải đọc kho ảnh');
assert.match(page, /bankMedia=\{bankMedia\}/, 'trang tạo sản phẩm phải truyền kho ảnh xuống form');

// 4. Form: tải ảnh khi chưa có sản phẩm, không cần lưu nháp trước.
const editor = read('../app/supplier/portal/products/product-editor.tsx');
assert.match(editor, /bankMedia\?: MediaAsset\[\]/, 'form phải nhận danh sách ảnh trong kho');
assert.match(editor, /const \[pickedBank, setPickedBank\] = useState<string\[\]>\(\[\]\)/,
  'form phải giữ danh sách ảnh sẽ gắn');
assert.match(editor, /fetch\("\/api\/supplier-portal\/media", \{ method: "POST", body \}\)/,
  'ảnh mới tải phải đi vào kho ảnh khi sản phẩm chưa tồn tại');
assert.match(editor, /Kho ảnh của bạn/, 'khối ảnh phải có tên kho ảnh');
assert.match(editor, /Ảnh vào kho ảnh trước, gắn vào sản phẩm khi bạn bấm Lưu\./,
  'phải nói rõ ảnh vào kho trước rồi gắn khi lưu');
assert.match(editor, /form\.set\("bank_media_ids", JSON\.stringify\(pickedBank\.slice\(0, 6\)\)\)/,
  'ảnh đã chọn phải gửi kèm khi lưu, tối đa 6 ô ảnh');
// Ảnh chọn trong kho phải hiện ngay trong 6 ô: ảnh đầu tiên là ảnh chính, nên ảnh đại diện
// không còn trống trước khi bấm Lưu.
assert.match(editor, /const pickedImages = pickedBank/,
  'ảnh đang chọn trong kho phải được dựng thành danh sách ảnh để hiện trong 6 ô');
assert.match(editor, /const cover = product \? savedCover : pickedImages\[0\] \?\? null;/,
  'sản phẩm mới lấy ảnh chọn đầu tiên làm ảnh đại diện');
assert.match(editor, /: pickedImages\.slice\(0, 6\);/,
  'sáu ô ảnh của sản phẩm mới lấy từ ảnh đang chọn trong kho');
assert.match(editor, /\[mediaId, \.\.\.current\.filter\(\(id\) => id !== mediaId\)\]/,
  'bấm ngôi sao phải đổi được ảnh chính trước khi lưu');
assert.ok(!editor.includes('ensureDraft'), 'không được quay lại cơ chế lưu nháp trước khi tải ảnh');
assert.ok(!editor.includes('Lưu nháp rồi tải ảnh'), 'không được có nút lưu nháp trước khi tải ảnh');
assert.ok(!editor.includes('Bản nháp được lưu tự động khi bạn bấm tải tệp'),
  'không được nhắc người bán phải lưu trước khi tải ảnh');

// 5. Lưu sản phẩm mới thì gắn ảnh: chỉ nhận ảnh còn thuộc đúng nhà cung cấp.
const actions = read('../app/supplier/portal/product-actions.ts');
assert.match(actions, /function parseBankMediaIds/, 'phải có bộ đọc mã ảnh trong kho');
assert.match(actions, /parseBankMediaIds\(form\.get\("bank_media_ids"\)\)/, 'lưu sản phẩm phải đọc ảnh kho');
assert.match(actions, /asset\.owner_type !== "supplier" \|\| asset\.supplier_id !== access\.supplier\.id/,
  'chỉ gắn ảnh thuộc đúng nhà cung cấp');
assert.match(actions, /owner_type: "product", product_id: saved\.id, supplier_id: null/,
  'ảnh gắn vào sản phẩm phải đổi chủ sở hữu sang sản phẩm');
assert.match(actions, /bankOrder >= 8/, 'tối đa 8 ảnh gắn vào một sản phẩm');

// 6. Ảnh trong kho không bao giờ công khai.
const fileRoute = read('../app/api/media/file/[...path]/route.ts');
assert.match(fileRoute, /const ownBankImage = [\s\S]*owner_type === "supplier"[\s\S]*created_by === user\.id/,
  'ảnh kho chỉ chủ tài khoản xem được');
const publicRoute = read('../app/public-media/[...path]/route.ts');
assert.ok(!publicRoute.includes('supplier-media/'), 'namespace kho ảnh không được phục vụ công khai');

console.log('OK check-supplier-media-bank');
