import "server-only";

import { aplusMissingEnglish, aplusTranslationConfigured, translateAplusModules } from "@/lib/ai/translate-aplus";
import { aplusNeedsTranslation, validateAplusModules, type AplusModule, type AplusProblem } from "@/lib/products/aplus";

export type PreparedAplus =
  | { ok: true; modules: AplusModule[]; translationFailed: boolean }
  | { ok: false; problem: AplusProblem | null; translation: boolean };

/**
 * Chuẩn bị nội dung A+ trước khi lưu: kiểm tra bản nháp (bản tiếng Việt), dịch các khối có bản
 * tiếng Việt mới (hoặc được bấm "Dịch lại từ tiếng Việt"), rồi kiểm tra đầy đủ bản tiếng Anh người
 * mua thấy. Dịch lỗi mà bản tiếng Anh cũ vẫn đủ thì vẫn lưu (khối đó dịch lại ở lần lưu sau);
 * thiếu bản tiếng Anh thì báo lỗi, không lưu.
 */
export async function prepareAplusForSave(raw: unknown, ctx: { supplierId: string; productId: string }, force: ReadonlySet<string> = new Set()): Promise<PreparedAplus> {
  const draft = validateAplusModules(raw, ctx, { draft: true });
  if (!draft.ok) return { ok: false, problem: draft.problem, translation: false };
  let modules = draft.modules;
  let translationFailed = false;
  const wanted = modules.some((module) => force.has(module.id) || aplusNeedsTranslation(module));
  if (wanted) {
    if (!aplusTranslationConfigured()) translationFailed = true;
    else {
      try { modules = await translateAplusModules(modules, force); }
      catch (error) { console.error("[aplus] translate", error); translationFailed = true; }
    }
  }
  if (translationFailed && aplusMissingEnglish(modules) >= 0) return { ok: false, problem: null, translation: true };
  const final = validateAplusModules(modules, ctx);
  if (!final.ok) {
    // Bản tiếng Anh còn chữ tiếng Việt vì chưa dịch được: báo lỗi dịch thay vì lỗi ngôn ngữ.
    if (translationFailed && final.problem.code === "language") return { ok: false, problem: null, translation: true };
    return { ok: false, problem: final.problem, translation: false };
  }
  return { ok: true, modules: final.modules, translationFailed };
}
