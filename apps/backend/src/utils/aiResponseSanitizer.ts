const finalDisclaimerPatterns = [
  /\bi\s*(am|'m)?\s*not\s+(a\s+)?(veterinarian|vet|doctor)\b/i,
  /\bthis\s+(does|is)\s+not\s+(replace|a\s+substitute\s+for).*\b(veterinary|vet|medical)\b/i,
  /\bdoes\s+not\s+replace\s+(a\s+)?(veterinarian|vet|doctor|veterinary\s+care)\b/i,
  /\bnot\s+veterinary\s+advice\b/i,
  /^please\s+remember.*\b(i\s+am|i'm)\b.*\b(assistant|ai)\b/i,
  /я\s+не\s+(ветеринар|врач)/i,
  /(это|ответ|совет|помощник|ai|ии).{0,100}не\s+заменя(ет|ют)\s+(ветеринара|врача|ветеринарн)/i,
  /не\s+является\s+заменой\s+(ветеринар|врач)/i,
  /^пожалуйста,?\s*помните.*(я|это).*(помощник|ai|ии)/i,
  /^пожалуйста,?\s*помните.*(не\s+(ветеринар|врач)|не\s+заменя)/i,
  /no\s+(soy|sustituye|reemplaza).*(veterinario|veterinaria)/i,
  /ne\s+(suis|remplace).*(veterinaire|vétérinaire)/i,
  /(ich\s+bin\s+kein|ersetzt\s+keinen).*(tierarzt|tierärzt)/i,
  /不能替代兽医/
];

function normalizeBulletMarkers(text: string) {
  return text.replace(/(^|\n)[\t ]*\*[\t ]+/g, "$1- ");
}

function normalizeDisclaimerLine(line: string) {
  return line
    .replace(/^[\s>*-]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}

function isFinalBoilerplateDisclaimerLine(line: string) {
  const normalized = normalizeDisclaimerLine(line);
  return finalDisclaimerPatterns.some((pattern) => pattern.test(normalized));
}

function stripTrailingBoilerplateDisclaimer(text: string) {
  const lines = text.trim().split(/\r?\n/);
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length > 0 && isFinalBoilerplateDisclaimerLine(lines[lines.length - 1])) {
    lines.pop();
    while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
  }
  return lines.join("\n").trim();
}

export function sanitizeAiFinalAnswer(content: string, maxLength: number) {
  const withoutThinkBlocks = content.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  const withoutUnclosedThink = withoutThinkBlocks.replace(/<think\b[^>]*>[\s\S]*$/gi, "");
  const withoutOrphanClosingThink = withoutUnclosedThink.replace(/^[\s\S]*?<\/think>/gi, "");
  const withoutOrphanThinkTags = withoutOrphanClosingThink.replace(/<\/?think\b[^>]*>/gi, "");
  const withNormalizedBullets = normalizeBulletMarkers(withoutOrphanThinkTags);
  const withoutBoilerplateDisclaimer = stripTrailingBoilerplateDisclaimer(withNormalizedBullets);
  const text = withoutBoilerplateDisclaimer.trim().slice(0, maxLength);
  return {
    text,
    reasoningStripped: withoutOrphanThinkTags !== content
  };
}
