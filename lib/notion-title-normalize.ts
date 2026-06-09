/** 師傅別名：Notion 歷史寫法 → 正式姓名 */
export const STAFF_NAME_ALIASES: Record<string, string> = {
  約翰: '錦',
  貴董: '錦',
};

export function normalizeStaffName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const trimmed = name.trim();
  return STAFF_NAME_ALIASES[trimmed] ?? trimmed;
}

/**
 * 標題開頭師傅別名（約翰90分 → 錦90分）
 */
export function normalizeStaffPrefixInTitle(title: string): string {
  let result = title;
  for (const [alias, canonical] of Object.entries(STAFF_NAME_ALIASES)) {
    if (result.startsWith(alias)) {
      result = canonical + result.slice(alias.length);
      break;
    }
  }
  return result;
}

/**
 * 舊儲值標題：1500/4000 或 3400/4000（已用/總額）→ +4000-1500、2500（總額-已用、餘額）
 */
export function normalizeLegacyBalanceSlashes(title: string): string {
  return title.replace(/(-?\d+)\/(\d+)/g, (match, usedRaw, storedRaw, offset, full) => {
    const used = Number(usedRaw);
    const stored = Number(storedRaw);
    if (!Number.isFinite(used) || !Number.isFinite(stored) || stored <= 0) {
      return match;
    }
    const after = full.slice(offset + match.length);
    const before = full.slice(0, offset);
    const isBalanceContext =
      /VIP/i.test(after) ||
      /VIP/i.test(before.slice(-3)) ||
      /分/.test(before.slice(-8));
    if (!isBalanceContext) return match;
    const remaining = Math.max(0, stored - used);
    return `+${stored}-${used}、${remaining}`;
  });
}

export function normalizeNotionTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  return normalizeLegacyBalanceSlashes(normalizeStaffPrefixInTitle(trimmed));
}

export function titleNeedsNormalization(title: string): boolean {
  return normalizeNotionTitle(title) !== title.trim();
}
