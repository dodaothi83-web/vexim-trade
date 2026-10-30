export function formatCompanyIntroductionSummary(value: string): string {
  let text = value.trim();

  // Remove markdown links, including the nested citation format sometimes returned by web search.
  for (let pass = 0; pass < 6; pass += 1) {
    const next = text.replace(/\[[^\[\]]+\]\(https?:\/\/[^)\s]+\)/gi, "");
    if (next === text) break;
    text = next;
  }

  for (let pass = 0; pass < 6; pass += 1) {
    const next = text.replace(/\[\s*\]|\(\s*\)/g, "");
    if (next === text) break;
    text = next;
  }

  return text
    .replace(/\s*\([^)]*(?:https?:\/\/|www\.)[^)]*\)/gi, "")
    .replace(/\s*\((?:[a-z\d-]+\.)+[a-z]{2,}(?:\/[^)]*)?\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
