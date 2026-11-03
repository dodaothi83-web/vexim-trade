// Nạp từ điển cổng nhà cung cấp cho các check chạy bằng VM.
//
// `lib/i18n/portal/index.ts` gộp các cụm lại; ở đây nạp từng cụm (mỗi file không có import
// runtime nào) rồi ghép theo đúng hình dạng của `PortalMessages`.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(rel) {
  const file = new URL(`../../lib/i18n/portal/${rel}`, import.meta.url);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(
    source,
    { module: mod, exports: mod.exports, require: (id) => { throw new Error(`${rel}: unexpected import ${id}`); } },
    { filename: file.pathname },
  );
  return mod.exports;
}

/** @returns {Record<'en' | 'vi', { shell: any, overview: any }>} */
export function loadPortalDictionary() {
  const shared = load('shared.ts').sharedMessages;
  const shell = load('shell.ts').shellMessages;
  const overview = load('overview.ts').overviewMessages;
  const products = load('products.ts').productsMessages;
  const productEditor = load('product-editor.ts').productEditorMessages;
  const profile = load('profile.ts').profileMessages;
  const onboarding = load('onboarding.ts').onboardingMessages;
  const verification = load('verification.ts').verificationMessages;
  const documents = load('documents.ts').documentsMessages;
  const boost = load('boost.ts').boostMessages;
  const rfqs = load('rfqs.ts').rfqsMessages;
  const categories = load('categories.ts').categoriesMessages;
  const traffic = load('traffic.ts').trafficMessages;
  const storefront = load('storefront.ts').storefrontMessages;
  const notices = load('notices.ts').noticesMessages;
  const quantity = load('quantity.ts').quantityMessages;
  return {
    en: { shared: shared.en, shell: shell.en, overview: overview.en, profile: profile.en, onboarding: onboarding.en, products: products.en, productEditor: productEditor.en, verification: verification.en, documents: documents.en, boost: boost.en,
      rfqs: rfqs.en, categories: categories.en, traffic: traffic.en, storefront: storefront.en, notices: notices.en, quantity: quantity.en },
    vi: { shared: shared.vi, shell: shell.vi, overview: overview.vi, profile: profile.vi, onboarding: onboarding.vi, products: products.vi, productEditor: productEditor.vi, verification: verification.vi, documents: documents.vi, boost: boost.vi,
      rfqs: rfqs.vi, categories: categories.vi, traffic: traffic.vi, storefront: storefront.vi, notices: notices.vi, quantity: quantity.vi },
  };
}
