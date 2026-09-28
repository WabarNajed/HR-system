/**
 * Form Builder logic (isomorphic): new fields, visibility-rule editing model, client validation and
 * the save payload. Visibility semantics follow docs/DATABASE.md §10 (the renderer and the RPCs use
 * the same rules).
 */
import type { BuilderFieldPayload } from './schemas';
import type { BuilderField, FieldOption, RequestFieldType, VisibilityRule } from './types';

export const OPTION_TYPES: ReadonlySet<RequestFieldType> = new Set(['dropdown', 'multi_select']);
export const NUMERIC_TYPES: ReadonlySet<RequestFieldType> = new Set(['number', 'currency']);
const NO_PLACEHOLDER: ReadonlySet<RequestFieldType> = new Set(['yes_no', 'attachment', 'date', 'datetime', 'time']);
/** Field types that can drive a visibility rule. */
const RULE_SOURCE_EXCLUDED: ReadonlySet<RequestFieldType> = new Set(['attachment', 'long_text']);

export const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/;
export const OPTION_VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;

export function supportsPlaceholder(type: RequestFieldType): boolean {
  return !NO_PLACEHOLDER.has(type);
}

export function canDriveRule(field: Pick<BuilderField, 'field_type'>): boolean {
  return !RULE_SOURCE_EXCLUDED.has(field.field_type);
}

/** A key unique within the form: `<base>`, `<base>_2`, … */
export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  const clean = base.replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '').slice(0, 63) || 'field';
  if (!taken.has(clean)) return clean;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${clean.slice(0, 58)}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${clean.slice(0, 50)}_${Date.now() % 100000}`;
}

/** `Other reason` → `other_reason`. */
export function slugifyValue(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

let uidCounter = 0;
export function newUid(): string {
  uidCounter += 1;
  return `new-${Date.now().toString(36)}-${uidCounter}`;
}

export function createField(
  type: RequestFieldType,
  taken: ReadonlySet<string>,
  names: { ar: string; en: string },
  optionNames: { ar: string; en: string },
): BuilderField {
  return {
    uid: newUid(),
    id: undefined,
    key: uniqueKey(type, taken),
    field_type: type,
    label_ar: names.ar,
    label_en: names.en,
    help_ar: null,
    help_en: null,
    placeholder_ar: null,
    placeholder_en: null,
    required: false,
    options: OPTION_TYPES.has(type)
      ? [
          { value: 'option_1', label_ar: `${optionNames.ar} 1`, label_en: `${optionNames.en} 1` },
          { value: 'option_2', label_ar: `${optionNames.ar} 2`, label_en: `${optionNames.en} 2` },
        ]
      : [],
    sort_order: 0,
    visibility: null,
    validation: {},
    is_system: false,
    is_active: true,
    uses: 0,
  };
}

export function duplicateField(field: BuilderField, taken: ReadonlySet<string>, copySuffix: { ar: string; en: string }): BuilderField {
  return {
    ...structuredClone(field),
    uid: newUid(),
    id: undefined,
    key: uniqueKey(`${field.key}_copy`, taken),
    label_ar: `${field.label_ar} ${copySuffix.ar}`.slice(0, 200),
    label_en: `${field.label_en} ${copySuffix.en}`.slice(0, 200),
    is_system: false,
    uses: 0,
  };
}

/** Saved keys that hold request values are immutable (and so is the key of a system field). */
export function isKeyLocked(field: BuilderField): boolean {
  return Boolean(field.id) && (Boolean(field.is_system) || field.uses > 0);
}

/** The value format of a used field must not change: its type is locked too. */
export function isTypeLocked(field: BuilderField): boolean {
  return Boolean(field.id) && (Boolean(field.is_system) || field.uses > 0);
}

/* ─── Visibility rule editing model ───────────────────────────────────────── */

export type RuleCondition = { field: string; op: 'in' | 'not_in'; values: unknown[] };
export type RuleModel = { combinator: 'all' | 'any'; conditions: RuleCondition[] } | { unsupported: VisibilityRule };

function flatCondition(rule: VisibilityRule): RuleCondition | null {
  if (!rule || typeof rule !== 'object' || !('field' in rule)) return null;
  if (Array.isArray(rule.in)) return { field: rule.field, op: 'in', values: rule.in };
  if (Array.isArray(rule.not_in)) return { field: rule.field, op: 'not_in', values: rule.not_in };
  return null;
}

export function parseRule(rule: VisibilityRule | null): RuleModel {
  if (!rule || (typeof rule === 'object' && Object.keys(rule).length === 0)) return { combinator: 'all', conditions: [] };
  const flat = flatCondition(rule);
  if (flat) return { combinator: 'all', conditions: [flat] };
  const group = 'all' in rule ? { combinator: 'all' as const, list: rule.all } : 'any' in rule ? { combinator: 'any' as const, list: rule.any } : null;
  if (group && Array.isArray(group.list)) {
    const conditions = group.list.map(flatCondition);
    if (conditions.every((c): c is RuleCondition => c !== null)) return { combinator: group.combinator, conditions };
  }
  return { unsupported: rule };
}

export function serializeRule(model: RuleModel): VisibilityRule | null {
  if ('unsupported' in model) return model.unsupported;
  const conditions = model.conditions.filter((c) => c.field);
  const toRule = (c: RuleCondition): VisibilityRule => (c.op === 'in' ? { field: c.field, in: c.values } : { field: c.field, not_in: c.values });
  if (!conditions.length) return null;
  if (conditions.length === 1) return toRule(conditions[0]!);
  return model.combinator === 'all' ? { all: conditions.map(toRule) } : { any: conditions.map(toRule) };
}

export function ruleRefs(rule: VisibilityRule | null | undefined): string[] {
  if (!rule || typeof rule !== 'object') return [];
  if ('field' in rule) return [rule.field];
  if ('all' in rule && Array.isArray(rule.all)) return rule.all.flatMap(ruleRefs);
  if ('any' in rule && Array.isArray(rule.any)) return rule.any.flatMap(ruleRefs);
  return [];
}

/* ─── Validation ──────────────────────────────────────────────────────────── */

/** uid → i18n keys of the problems of that field. */
export function validateFields(fields: readonly BuilderField[]): Map<string, string[]> {
  const problems = new Map<string, string[]>();
  const add = (uid: string, key: string) => problems.set(uid, [...(problems.get(uid) ?? []), key]);
  const keys = new Map<string, number>();
  for (const f of fields) keys.set(f.key, (keys.get(f.key) ?? 0) + 1);
  const known = new Set(fields.map((f) => f.key));

  for (const f of fields) {
    if (!f.label_ar.trim() || !f.label_en.trim()) add(f.uid, 'requestConfig.builder.problems.label');
    if (!KEY_RE.test(f.key)) add(f.uid, 'requestConfig.validation.key');
    else if ((keys.get(f.key) ?? 0) > 1) add(f.uid, 'requestConfig.builder.problems.keyDuplicate');
    if (OPTION_TYPES.has(f.field_type)) {
      if (!f.options.length) add(f.uid, 'requestConfig.builder.problems.noOptions');
      const values = new Set<string>();
      for (const o of f.options) {
        if (!OPTION_VALUE_RE.test(o.value) || !o.label_ar.trim() || !o.label_en.trim()) {
          add(f.uid, 'requestConfig.builder.problems.optionInvalid');
          break;
        }
        if (values.has(o.value)) {
          add(f.uid, 'requestConfig.builder.problems.optionDuplicate');
          break;
        }
        values.add(o.value);
      }
    }
    const min = f.validation.min;
    const max = f.validation.max;
    if (typeof min === 'number' && typeof max === 'number' && min > max) add(f.uid, 'requestConfig.builder.problems.range');
    const refs = ruleRefs(f.visibility);
    if (refs.some((r) => r === f.key || !(known.has(r) || r === 'subtype'))) add(f.uid, 'requestConfig.builder.problems.rule');
    const model = parseRule(f.visibility);
    if (!('unsupported' in model) && model.conditions.some((c) => !c.values.length)) add(f.uid, 'requestConfig.builder.problems.ruleValues');
  }
  return problems;
}

/* ─── Payload & dirty tracking ────────────────────────────────────────────── */

function blank(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s ? s : null;
}

export function toPayload(fields: readonly BuilderField[]): BuilderFieldPayload[] {
  return fields.map((f) => ({
    id: f.id ?? null,
    key: f.key.trim(),
    field_type: f.field_type,
    label_ar: f.label_ar.trim(),
    label_en: f.label_en.trim(),
    help_ar: blank(f.help_ar),
    help_en: blank(f.help_en),
    placeholder_ar: blank(f.placeholder_ar),
    placeholder_en: blank(f.placeholder_en),
    required: f.required,
    is_active: f.is_active !== false,
    options: OPTION_TYPES.has(f.field_type)
      ? f.options.map((o: FieldOption) => ({ value: o.value.trim(), label_ar: o.label_ar.trim(), label_en: o.label_en.trim() }))
      : [],
    visibility: f.visibility ?? null,
    validation: cleanValidation(f),
  }));
}

function cleanValidation(f: BuilderField): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(f.validation ?? {}) };
  for (const k of ['min', 'max'] as const) {
    if (out[k] === null || out[k] === undefined || out[k] === '' || Number.isNaN(out[k])) delete out[k];
  }
  if (!NUMERIC_TYPES.has(f.field_type) && !f.validation?.computed) {
    delete out.min;
    delete out.max;
  }
  return out;
}

export function fingerprint(fields: readonly BuilderField[]): string {
  return JSON.stringify(toPayload(fields));
}
