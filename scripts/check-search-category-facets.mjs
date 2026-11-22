// Run: node --experimental-strip-types --no-warnings scripts/check-search-category-facets.mjs
// Ô lọc danh mục trên /search: chỉ danh mục có kết quả, có số lượng, ẩn khi chỉ còn 1 danh mục.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchCategoryFacets } from "../lib/public/search-category-facets.ts";

const cat = (slug, sort_order = 0) => ({ slug, sort_order, name: slug.toUpperCase() });
const coffee = cat("coffee", 2), tea = cat("tea", 3), rtd = cat("ready-to-drink-coffee", 9), parent = cat("coffee-tea", 1);
const name = (c) => c.name;
const many = (c, n) => Array.from({ length: n }, () => ({ category: c }));

// Nhiều danh mục: đếm đúng, nhiều kết quả lên trước, có "Tất cả".
let out = searchCategoryFacets({ matches: [...many(tea, 2), ...many(coffee, 5), ...many(rtd, 2)], matchesAllCategories: true, selected: null, selectedCount: 0, name });
assert.equal(out.show, true);
assert.deepEqual(out.facets.map((f) => [f.slug, f.count]), [["coffee", 5], ["tea", 2], ["ready-to-drink-coffee", 2]]);
assert.equal(out.allCount, 9);
assert.ok(out.facets.every((f) => !f.selected));

// Chỉ một danh mục, hoặc không có kết quả: ẩn.
assert.equal(searchCategoryFacets({ matches: many(coffee, 17), matchesAllCategories: true, selected: null, selectedCount: 0, name }).show, false);
assert.equal(searchCategoryFacets({ matches: [], matchesAllCategories: true, selected: null, selectedCount: 0, name }).show, false);
// Đang chọn danh mục cha nhưng mọi kết quả chỉ thuộc một danh mục con: không còn gì để lọc.
assert.equal(searchCategoryFacets({ matches: many(coffee, 17), matchesAllCategories: true, selected: parent, selectedCount: 17, name }).show, false);

// Đang chọn danh mục cha không có sản phẩm trực tiếp: hiện ở đầu, được đánh dấu, kèm danh mục con.
out = searchCategoryFacets({ matches: [...many(coffee, 3), ...many(tea, 1)], matchesAllCategories: true, selected: parent, selectedCount: 4, name });
assert.deepEqual(out.facets.map((f) => [f.slug, f.count, f.selected]), [["coffee-tea", 4, true], ["coffee", 3, false], ["tea", 1, false]]);
// Đang chọn danh mục con: đánh dấu đúng chỗ, không thêm dòng trùng.
out = searchCategoryFacets({ matches: [...many(coffee, 3), ...many(rtd, 1)], matchesAllCategories: true, selected: coffee, selectedCount: 3, name });
assert.deepEqual(out.facets.map((f) => [f.slug, f.selected]), [["coffee", true], ["ready-to-drink-coffee", false]]);
// Chỉ đếm được trong danh mục đang chọn: không bịa tổng cho "Tất cả".
assert.equal(searchCategoryFacets({ matches: [...many(coffee, 3), ...many(tea, 1)], matchesAllCategories: false, selected: parent, selectedCount: 4, name }).allCount, null);

// Trang tìm kiếm dùng danh sách chọn một chạm, không còn <select name="cat">.
const page = readFileSync(new URL("../app/(public)/search/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(page, /<select name="cat"/);
assert.match(page, /type="radio" name="cat"/);
assert.match(page, /type="hidden" name="cat" value=\{state\.category\}/);
console.log("✅ Search category filter: only categories with results, counts, hidden when there is nothing to narrow.");
