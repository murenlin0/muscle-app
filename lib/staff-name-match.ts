import { parseStaffPrefixFromCalendarTitle } from '@/lib/booking-message';
import { canonicalStaffName } from '@/lib/multi-staff-split';
import { normalizeStaffName, STAFF_NAME_ALIASES } from '@/lib/notion-title-normalize';

function canonicalTarget(name: string): string {
  const trimmed = name.trim();
  const normalized = normalizeStaffName(trimmed) ?? trimmed;
  return canonicalStaffName(normalized);
}

/** 標題前綴／staff_name 比對用別名（如 湘↔湘湘、約翰→錦） */
export function staffTitlePrefixVariants(displayName: string): string[] {
  const canon = canonicalTarget(displayName);
  const out = new Set<string>([canon]);
  if (canon === '湘湘') out.add('湘');
  if (canon === '湘') out.add('湘湘');
  for (const [alias, target] of Object.entries(STAFF_NAME_ALIASES)) {
    if (target === canon) out.add(alias);
  }
  return [...out];
}

function staffFieldMatches(rowStaff: string | null | undefined, target: string): boolean {
  if (!rowStaff?.trim()) return false;
  return canonicalTarget(rowStaff) === canonicalTarget(target);
}

function titlePrefixMatches(rowTitle: string, target: string): boolean {
  const prefix = parseStaffPrefixFromCalendarTitle(rowTitle);
  if (!prefix) return false;
  const normalized = normalizeStaffName(prefix) ?? prefix;
  return canonicalTarget(normalized) === canonicalTarget(target);
}

/** 流水帳列是否屬於指定師傅（比對 staff_name 或標題開頭前綴，不含客戶姓名） */
export function rowMatchesStaffFilter(
  row: { staffName?: string | null; staff_name?: string | null; title: string },
  target: string,
): boolean {
  const t = target.trim();
  if (!t) return true;
  if (staffFieldMatches(row.staffName ?? row.staff_name, t)) return true;
  if (titlePrefixMatches(row.title, t)) return true;

  // 工資等標題無「N分」時，僅比對開頭師傅名（如 仁6/1-6/26）
  const stripped = row.title.replace(/\s/g, '').replace(/^⚠️/, '');
  for (const variant of staffTitlePrefixVariants(t)) {
    if (stripped.startsWith(variant)) return true;
  }
  return false;
}

/** Supabase .or() 篩選：staff_name 精確比對 + 標題開頭前綴（不用 %師傅% 避免誤中客戶名） */
export function buildStaffNameOrFilter(staffName: string): string {
  const parts: string[] = [];
  for (const variant of staffTitlePrefixVariants(staffName)) {
    const safe = variant.replace(/[%,()]/g, '');
    if (!safe) continue;
    parts.push(`staff_name.eq.${safe}`);
    parts.push(`title.ilike.${safe}%`);
    parts.push(`title.ilike.⚠️${safe}%`);
  }
  return parts.join(',');
}
