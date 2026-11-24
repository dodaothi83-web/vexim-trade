// Mô-đun thật/giả cho các script kiểm tra nạp mã bằng vm (thêm vào bảng mock của script).
//  - publicUrl / publicImagePath: nạp đúng mã thật (thuần, không phụ thuộc gì) để link ảnh khớp.
//  - mediaCdn / revalidatePublic: bản giả không làm gì (CDN và revalidateTag chỉ chạy trên máy chủ).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, mocks = {}) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, process, require: (key) => {
    if (!(key in mocks)) throw new Error(`media-mocks: unexpected import ${key} in ${path}`);
    return mocks[key];
  } });
  return exports;
}

export const publicUrl = load('../../lib/media/public-url.ts');
export const publicImagePath = load('../../lib/media/public-image-path.ts', { '@/lib/media/public-url': publicUrl });
export const mediaCdn = {
  CDN_CACHE_CONTROL: 'public, max-age=31536000, immutable',
  mediaCdnEnabled: () => false,
  cdnOwnerOf: () => null,
  syncMediaCdn: async () => {},
  removeDeletedMediaFromCdn: async () => {},
  removeMediaFromCdn: async () => {},
  publishMediaToCdn: async (asset) => asset,
};
export const revalidatePublic = { PUBLIC_CATALOG_TAG: 'public-catalog', revalidatePublicCatalog() {} };

/** Gộp vào bảng mock: `{ ...mediaMocks, ...mocks }`. */
export const mediaMocks = {
  '@/lib/media/public-url': publicUrl,
  '@/lib/media/public-image-path': publicImagePath,
  '@/lib/media/cdn': mediaCdn,
  '@/lib/public/revalidate-public': revalidatePublic,
};
