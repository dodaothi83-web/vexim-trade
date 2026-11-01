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
// Kho ảnh không còn khối riêng ở đầu mục: ảnh đã chọn hiện trong 6 ô, chỉ ảnh chưa dùng
// mới hiện thành dải "Ảnh có sẵn trong kho" nên không có ảnh nào bị lặp hai lần.
assert.match(editor, /Ảnh có sẵn trong kho/, 'kho ảnh có tên riêng cho phần ảnh chưa dùng');
assert.match(editor, /const unusedBank = bankMedia\.filter/, 'kho ảnh chỉ lấy ảnh chưa chọn');
assert.doesNotMatch(editor, /Kho ảnh của bạn/, 'đã bỏ khối "Kho ảnh của bạn" trùng với 6 ô ảnh');
assert.match(editor, /Chọn ảnh là tải lên ngay và tự gắn vào ô trống\./,
  'phải nói rõ chọn ảnh là tải lên ngay, không có bước xác nhận thứ hai');
assert.match(editor, /ảnh thứ 7 trở đi nằm trong kho cho sản phẩm khác\./,
  'phải nói rõ ảnh thứ 7 trở đi nằm lại kho vì sản phẩm chỉ hiện 6 ảnh');
assert.match(editor, /async function uploadFiles\(list: File\[\]\)/,
  'tệp vừa chọn phải được tải lên ngay trong chooseFiles');
assert.match(editor, /void uploadFiles\(files\);/,
  'chọn tệp xong là tải luôn, không chờ bấm nút');
assert.ok(!editor.includes('Thêm ${selected.length} ảnh vào kho'),
  'đã bỏ nút xác nhận tải ảnh thủ công');
// Ảnh cũ vượt quá 6 ô phải hiện ra kèm nút xóa, không được biến mất im lặng.
assert.match(editor, /const overflowImages = product/, 'ảnh ngoài 6 ô được tính riêng để hiện ra');
assert.match(editor, /Ảnh ngoài 6 ô/, 'ảnh ngoài 6 ô có dải riêng kèm nút xóa');
assert.match(editor, /aria-label="Xóa ảnh ngoài 6 ô"/, 'xóa được ảnh ngoài 6 ô');
// Ba hạn mức: 6 ảnh mỗi sản phẩm, 12 tệp mỗi sản phẩm, 12 ảnh mỗi kho.
assert.match(editor, /if \(imageCount \+ incomingImages > 6\)/, 'chặn ảnh thứ 7 của một sản phẩm');
assert.match(editor, /if \(ownedCount \+ files\.length > 12\)/, 'giữ hạn mức 12 tệp mỗi sản phẩm');
assert.match(editor, /if \(bankOwnCount \+ files\.length > 12\)/, 'giữ hạn mức 12 ảnh mỗi kho');

const mediaRoute = read('../app/api/supplier-portal/products/[id]/media/route.ts');
assert.match(mediaRoute, /kind === "image" && current\.filter\(\(m\) => m\.kind === "image"\)\.length >= 6/,
  'API cũng chặn ở 6 ảnh');
assert.doesNotMatch(mediaRoute, /Tối đa 8 ảnh/, 'không còn thông báo 8 ảnh ở API');
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
assert.match(actions, /owner_type: "product", product_id: saved\.id,\s*\n?\s*supplier_id: access\.supplier\.id/,
  'ảnh gắn vào sản phẩm vẫn thuộc nhà cung cấp — xoá supplier_id thì cổng lọc mất ảnh ngay sau khi lưu');
// Ảnh kho nằm ở namespace riêng, không công khai: gắn vào sản phẩm phải chép sang products/<id>/.
const bankMedia = read('../lib/supplier-portal/bank-media.ts');
assert.match(actions, /moveBankImageIntoProduct/, 'bước gắn ảnh dùng chung hàm chép ảnh sang thư mục sản phẩm');
assert.match(bankMedia, /export async function moveBankImageIntoProduct/,
  'phải chép ảnh kho sang thư mục sản phẩm để người mua tải được');
assert.match(bankMedia, /products\/\$\{productId\}\/\$\{asset\.id\}/,
  'bản sao phải nằm trong products/<product_id>/ và đặt tên theo mã ảnh');
assert.match(bankMedia, /export async function repairAttachedBankMedia/,
  'ảnh gắn bằng bản cũ (supplier_id null, đường dẫn kho) phải được sửa lại');
assert.match(bankMedia, /if \(stillInBank && !moved\) continue;/, 'chép tệp hỏng thì giữ ảnh trong kho, không làm mất ảnh');
for (const page of ['../app/supplier/portal/products/[id]/page.tsx', '../app/supplier/portal/products/page.tsx']) {
  const source = read(page);
  assert.match(source, /repairAttachedBankMedia\(/, `${page}: phải sửa ảnh cũ ngay khi mở trang, không đợi người bán bấm Lưu`);
}
const visibility = read('../lib/supplier-portal/product-view.ts');
assert.match(visibility, /asset\.supplier_id === supplierId/,
  'cổng nhà cung cấp chỉ hiện ảnh thuộc đúng nhà cung cấp — lý do ảnh mất sau khi lưu');
assert.match(actions, /bankOrder >= 6/, 'tối đa 6 ảnh gắn vào một sản phẩm, khớp 6 ô ảnh');

// 6. Ảnh trong kho không bao giờ công khai.
const fileRoute = read('../app/api/media/file/[...path]/route.ts');
assert.match(fileRoute, /const ownBankImage = [\s\S]*owner_type === "supplier"[\s\S]*created_by === user\.id/,
  'ảnh kho chỉ chủ tài khoản xem được');
const publicRoute = read('../app/public-media/[...path]/route.ts');
assert.ok(!publicRoute.includes('supplier-media/'), 'namespace kho ảnh không được phục vụ công khai');

console.log('OK check-supplier-media-bank');
