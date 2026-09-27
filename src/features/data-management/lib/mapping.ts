/**
 * Column → field mapping suggestions: header synonyms (Arabic/English, spelling-insensitive) with a
 * confidence score, refined by the column's values (Hijri vs Gregorian dates, Arabic vs Latin
 * names, e-mails, Iqama numbers, inside/outside-Kingdom words).
 */
import { hasArabic, headerTokens, matchKey, normalizeHeader } from './normalize';
import { fieldSynonyms, getSchema, type FieldDef } from './schemas';
import { EXTRA, IGNORE, type ColumnMapping, type ExtractedTable, type ImportType, type JsonCell, type MappingSuggestion } from './types';
import { cellText, isBlank, parseDateValue, parseEmailValue, parseGenderValue, parseOutsideKingdom } from './values';

/** Headers of row-serial columns. */
const SERIAL_HEADERS = new Set(['م', '#', 'no', 'sn', 's no', 'sr', 'sr no', 'serial', 'seq', 'index', 'مسلسل', 'تسلسل', 'التسلسل', 'ت', 'الرقم التسلسلي', 'رقم تسلسلي', 'ر']);

/** Tokens too generic to identify a column on their own. */
const GENERIC = new Set(['number', 'date', 'name', 'id', 'type', 'status', 'code', 'of', 'the', 'and', 'in', 'on', 'or', 'no', 'في', 'من', 'او', 'و', 'علي', 'الي']);

type PreparedSynonym = { norm: string; tokens: string[] };
type PreparedField = { field: FieldDef; synonyms: PreparedSynonym[] };

const prepared = new Map<ImportType, PreparedField[]>();

function prepare(type: ImportType): PreparedField[] {
  const cached = prepared.get(type);
  if (cached) return cached;
  const list = getSchema(type).fields.map((field) => ({
    field,
    synonyms: fieldSynonyms(field)
      .map((s) => ({ norm: normalizeHeader(s), tokens: headerTokens(s) }))
      .filter((s) => s.tokens.length > 0),
  }));
  prepared.set(type, list);
  return list;
}

function meaningful(tokens: readonly string[]): string[] {
  return tokens.filter((t) => !GENERIC.has(t));
}

/** Header ↔ synonym similarity (0..1). */
function similarity(headerNorm: string, header: readonly string[], syn: PreparedSynonym): { score: number; exact: boolean } {
  if (headerNorm === syn.norm) return { score: 1, exact: true };
  const hs = new Set(header);
  const ss = new Set(syn.tokens);
  const synInHeader = syn.tokens.every((t) => hs.has(t));
  const headerInSyn = header.every((t) => ss.has(t));
  const hm = meaningful(header);
  const sm = meaningful(syn.tokens);
  if (synInHeader && sm.length > 0) return { score: 0.55 + 0.4 * (ss.size / hs.size), exact: false };
  if (headerInSyn && hm.length > 0) return { score: 0.45 + 0.35 * (hs.size / ss.size), exact: false };
  if (hm.length && sm.length) {
    const hms = new Set(hm);
    const inter = sm.filter((t) => hms.has(t)).length;
    const union = new Set([...hm, ...sm]).size;
    const jaccard = inter / union;
    if (jaccard >= 0.5) return { score: 0.3 + 0.4 * jaccard, exact: false };
  }
  return { score: 0, exact: false };
}

export type FieldScore = { key: string; score: number; exact: boolean };

/** Scores every field of the entity for one header label (best first). */
export function scoreHeader(type: ImportType, label: string): FieldScore[] {
  const tokens = headerTokens(label);
  if (!tokens.length) return [];
  const norm = tokens.join(' ');
  const out: FieldScore[] = [];
  for (const { field, synonyms } of prepare(type)) {
    let best = { score: 0, exact: false };
    for (const syn of synonyms) {
      const s = similarity(norm, tokens, syn);
      if (s.score > best.score || (s.score === best.score && s.exact)) best = s;
      if (best.score === 1) break;
    }
    if (best.score > 0) out.push({ key: field.key, score: best.score, exact: best.exact });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Best score of a label for any field — used by header-row detection. */
export function headerLabelScore(type: ImportType): (label: string) => number {
  return (label) => scoreHeader(type, label)[0]?.score ?? 0;
}

/* ─── Value profiling ─────────────────────────────────────────────────────── */

type Profile = {
  filled: number;
  arabic: number;
  latin: number;
  hijri: number;
  gregorian: number;
  emails: number;
  ids: number;
  genders: number;
  kingdomWords: number;
};

export function profileValues(values: readonly JsonCell[]): Profile {
  const p: Profile = { filled: 0, arabic: 0, latin: 0, hijri: 0, gregorian: 0, emails: 0, ids: 0, genders: 0, kingdomWords: 0 };
  for (const v of values) {
    if (isBlank(v)) continue;
    p.filled++;
    const text = cellText(v) ?? '';
    if (hasArabic(text)) p.arabic++;
    else if (/[A-Za-z]/.test(text)) p.latin++;
    const d = parseDateValue(v);
    if (d && d.ok) {
      if (d.calendar === 'hijri') p.hijri++;
      else p.gregorian++;
    }
    const e = parseEmailValue(v);
    if (e && e.ok) p.emails++;
    if (/^[12]\d{9}$/.test(text.replace(/\s/g, ''))) p.ids++;
    const g = parseGenderValue(v);
    if (g && g.ok) p.genders++;
    if (/خارج|داخل|outside|inside/i.test(text)) {
      const k = parseOutsideKingdom(v);
      if (k && k.ok) p.kingdomWords++;
    }
  }
  return p;
}

function ratio(n: number, p: Profile): number {
  return p.filled ? n / p.filled : 0;
}

const LANGUAGE_MARKERS_AR = /(عربي|عربيه|arabic|\bar\b)/i;
const LANGUAGE_MARKERS_EN = /(انجليزي|انكليزي|english|\ben\b|latin)/i;

/**
 * Suggests a mapping for every column. Each field is used at most once (highest score wins);
 * unmatched columns become `__extra` (employees: kept in extra_data) or `__ignore`.
 */
export function suggestMapping(type: ImportType, table: ExtractedTable, sampleSize = 200): MappingSuggestion[] {
  const schema = getSchema(type);
  const samples = table.columns.map((col) => table.rows.slice(0, sampleSize).map((r) => r.cells[col.index] ?? null));
  const profiles = samples.map(profileValues);

  // 1. Header candidates.
  type Candidate = { col: number; key: string; score: number; exact: boolean };
  const candidates: Candidate[] = [];
  table.columns.forEach((col, i) => {
    if (col.generated) return;
    for (const s of scoreHeader(type, col.label)) {
      if (s.score >= 0.5) candidates.push({ col: i, key: s.key, score: s.score, exact: s.exact });
    }
  });

  // 2. Value-based refinements of candidate scores.
  for (const c of candidates) {
    const p = profiles[c.col]!;
    const label = table.columns[c.col]!.label;
    if (type === 'employees' || type === 'dependents') {
      if (c.key === 'iqama_expiry_date' && ratio(p.hijri, p) >= 0.6) c.score -= 0.3;
      if (c.key === 'iqama_expiry_hijri' && ratio(p.gregorian, p) >= 0.6 && ratio(p.hijri, p) < 0.2) c.score -= 0.3;
      if (c.key === 'employment_status' && ratio(p.kingdomWords, p) >= 0.6) c.score -= 0.4;
    }
    if (c.key === 'name_ar' && !LANGUAGE_MARKERS_AR.test(label) && p.filled && ratio(p.latin, p) > 0.6) c.score -= 0.35;
    if (c.key === 'name_en' && !LANGUAGE_MARKERS_EN.test(label) && p.filled && ratio(p.arabic, p) > 0.6) c.score -= 0.35;
    if (c.key === 'name_en' && !LANGUAGE_MARKERS_EN.test(label) && p.filled && ratio(p.latin, p) > 0.6) c.score += 0.05;
  }
  // Hijri/Gregorian and Arabic/English swaps for the same header.
  table.columns.forEach((col, i) => {
    const p = profiles[i]!;
    const has = (key: string) => candidates.some((c) => c.col === i && c.key === key);
    const bestFor = (key: string) => candidates.find((c) => c.col === i && c.key === key);
    if ((type === 'employees') && has('iqama_expiry_date') && !has('iqama_expiry_hijri') && ratio(p.hijri, p) >= 0.6) {
      const base = bestFor('iqama_expiry_date')!;
      candidates.push({ col: i, key: 'iqama_expiry_hijri', score: Math.max(0.6, base.score + 0.25), exact: false });
    }
    if (has('name_ar') && !has('name_en') && ratio(p.latin, p) > 0.6 && schema.fields.some((f) => f.key === 'name_en')) {
      const base = bestFor('name_ar')!;
      candidates.push({ col: i, key: 'name_en', score: Math.max(0.6, base.score + 0.3), exact: false });
    }
    if (type === 'employees' && has('employment_status') && ratio(p.kingdomWords, p) >= 0.6) {
      candidates.push({ col: i, key: 'is_outside_kingdom', score: 0.7, exact: false });
    }
  });

  // 3. Greedy assignment.
  candidates.sort((a, b) => b.score - a.score || Number(b.exact) - Number(a.exact));
  const byCol = new Map<number, Candidate>();
  const usedKeys = new Set<string>();
  for (const c of candidates) {
    if (c.score < 0.5 || byCol.has(c.col) || usedKeys.has(c.key)) continue;
    byCol.set(c.col, c);
    usedKeys.add(c.key);
  }

  // 4. Value-only suggestions for columns without a header match.
  const valueRules: Array<{ key: string; test: (p: Profile) => boolean }> =
    type === 'employees'
      ? [
          { key: 'company_email', test: (p) => ratio(p.emails, p) >= 0.6 },
          { key: 'national_id', test: (p) => ratio(p.ids, p) >= 0.8 },
          { key: 'iqama_expiry_hijri', test: (p) => ratio(p.hijri, p) >= 0.8 },
          { key: 'gender', test: (p) => ratio(p.genders, p) >= 0.8 },
          { key: 'is_outside_kingdom', test: (p) => ratio(p.kingdomWords, p) >= 0.8 },
        ]
      : [];
  const serial = (i: number): boolean => {
    const col = table.columns[i]!;
    const key = matchKey(col.label);
    if (!SERIAL_HEADERS.has(key) && !col.generated) return false;
    const nums = samples[i]!.filter((v) => !isBlank(v)).map((v) => Number(cellText(v)));
    if (nums.length < 3 || nums.some((n) => !Number.isInteger(n))) return false;
    let steps = 0;
    for (let k = 1; k < nums.length; k++) if (nums[k] === nums[k - 1]! + 1) steps++;
    return steps / (nums.length - 1) >= 0.8;
  };
  const suggestions: MappingSuggestion[] = table.columns.map((col, i) => {
    const hit = byCol.get(i);
    if (hit) {
      return {
        index: col.index,
        label: col.label,
        target: hit.key,
        confidence: Math.max(0, Math.min(1, Number(hit.score.toFixed(2)))),
        method: hit.exact ? 'exact' : hit.score >= 0.8 ? 'synonym' : 'partial',
      };
    }
    const p = profiles[i]!;
    // Row serial numbers ("م", "#", "No.") carry no information: not imported.
    if (serial(i)) return { index: col.index, label: col.label, target: IGNORE, confidence: 0.6, method: 'values' };
    if (p.filled >= 3) {
      for (const rule of valueRules) {
        if (!usedKeys.has(rule.key) && rule.test(p)) {
          usedKeys.add(rule.key);
          return { index: col.index, label: col.label, target: rule.key, confidence: 0.45, method: 'values' };
        }
      }
    }
    return { index: col.index, label: col.label, target: schema.extraData ? EXTRA : IGNORE, confidence: 0, method: 'none' };
  });
  return suggestions;
}

/** Validates a user mapping: known targets only, each field once. Returns the clean mapping. */
export function sanitizeMapping(type: ImportType, table: ExtractedTable, mapping: readonly ColumnMapping[]): ColumnMapping[] {
  const schema = getSchema(type);
  const keys = new Set(schema.fields.map((f) => f.key));
  const byIndex = new Map(mapping.map((m) => [m.index, m.target]));
  const used = new Set<string>();
  return table.columns.map((col) => {
    let target = byIndex.get(col.index) ?? (schema.extraData ? EXTRA : IGNORE);
    if (target !== IGNORE && target !== EXTRA && (!keys.has(target) || used.has(target))) target = schema.extraData ? EXTRA : IGNORE;
    if (target === EXTRA && !schema.extraData) target = IGNORE;
    if (target !== IGNORE && target !== EXTRA) used.add(target);
    return { index: col.index, label: col.label, target };
  });
}

/** Required field groups not covered by the mapping (e.g. `[['name_ar','name_en']]`). */
export function missingRequired(type: ImportType, mapping: readonly ColumnMapping[]): string[][] {
  const mapped = new Set(mapping.map((m) => m.target));
  return getSchema(type)
    .requiredAnyOf.filter((group) => !group.some((k) => mapped.has(k)))
    .map((g) => [...g]);
}
