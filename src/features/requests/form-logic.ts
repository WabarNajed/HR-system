/**
 * Dynamic request form logic shared by the renderer, the wizard, the returned-request editor and
 * server actions. Mirrors the SQL in `20260927000600_request_engine.sql` (private.field_visible,
 * private.jsonb_matches_any, private.normalize_field_value) so the UI shows exactly the fields the
 * database validates (docs/DATABASE.md §10).
 */
import type { AttachmentItem, RequestField, RequestFormValues, VisibilityRule } from './types';

/* ─── Empty values ────────────────────────────────────────────────────────── */

/** `null`, `undefined`, blank strings, `[]` and `{}` are "empty" (never stored). */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

/* ─── Visibility (must match private.field_visible) ───────────────────────── */

/** JSON text form, like Postgres `jsonb #>> '{}'`. */
function textForm(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function matchesAny(value: unknown, candidates: unknown): boolean {
  if (isEmptyValue(value)) return false;
  const list = Array.isArray(candidates) ? candidates : [];
  return list.some(
    (c) => jsonEqual(c, value) || textForm(c) === textForm(value) || (Array.isArray(value) && value.some((v) => jsonEqual(v, c))),
  );
}

/** Evaluates a visibility rule against the form values (`subtype` is the pseudo-field). */
export function isRuleSatisfied(rule: VisibilityRule | null | undefined, values: RequestFormValues): boolean {
  if (!rule || typeof rule !== 'object' || Object.keys(rule).length === 0) return true;
  if ('all' in rule && Array.isArray(rule.all)) return rule.all.every((r) => isRuleSatisfied(r, values));
  if ('any' in rule && Array.isArray(rule.any)) return rule.any.some((r) => isRuleSatisfied(r, values));
  if (!('field' in rule)) return true;
  const value = values[rule.field];
  if ('in' in rule && rule.in !== undefined) return matchesAny(value, rule.in);
  if ('not_in' in rule && rule.not_in !== undefined) return !matchesAny(value, rule.not_in);
  return true;
}

/** Keys of fields whose rule holds (computed to a fixpoint after dropping values of hidden fields). */
export function visibleFieldKeys(fields: readonly RequestField[], values: RequestFormValues): Set<string> {
  let current: RequestFormValues = values;
  let visible = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const next = new Set(fields.filter((f) => isRuleSatisfied(f.visibility, current)).map((f) => f.key));
    const stripped: RequestFormValues = {};
    for (const [k, v] of Object.entries(values)) {
      const field = fields.find((f) => f.key === k);
      if (!field || next.has(k)) stripped[k] = v;
    }
    const stable = next.size === visible.size && [...next].every((k) => visible.has(k));
    visible = next;
    current = stripped;
    if (stable) break;
  }
  return visible;
}

export function visibleFields(fields: readonly RequestField[], values: RequestFormValues): RequestField[] {
  const keys = visibleFieldKeys(fields, values);
  return [...fields].filter((f) => keys.has(f.key)).sort((a, b) => a.sort_order - b.sort_order);
}

/** Computed / read-only fields (e.g. leave `days`) are never sent — the database computes them. */
export function isReadonlyField(field: RequestField): boolean {
  return Boolean(field.validation?.readonly || field.validation?.computed);
}

/* ─── Payload ─────────────────────────────────────────────────────────────── */

/**
 * RPC payload: visible, editable, non-attachment fields with non-empty values. The `subtype` is
 * returned separately (`p_subtype`), never inside the values (DATABASE.md §10).
 */
export function buildRequestPayload(
  fields: readonly RequestField[],
  values: RequestFormValues,
): { values: Record<string, unknown>; subtype: string | null } {
  const visible = visibleFieldKeys(fields, values);
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.key === 'subtype' || field.field_type === 'attachment' || isReadonlyField(field)) continue;
    if (!visible.has(field.key)) continue;
    const raw = values[field.key];
    if (isEmptyValue(raw)) continue;
    out[field.key] = normalizeForPayload(field, raw);
  }
  const subtype = typeof values.subtype === 'string' && values.subtype.trim() ? values.subtype.trim() : null;
  return { values: out, subtype };
}

function normalizeForPayload(field: RequestField, raw: unknown): unknown {
  switch (field.field_type) {
    case 'number':
    case 'currency': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s]/g, ''));
      return Number.isFinite(n) ? n : raw;
    }
    case 'email':
      return typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    case 'short_text':
    case 'long_text':
    case 'phone':
      return typeof raw === 'string' ? raw.trim() : raw;
    case 'yes_no':
      return raw === true || raw === 'true';
    default:
      return raw;
  }
}

/* ─── Client-side validation (the RPCs re-validate) ───────────────────────── */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?[0-9 ()-]{5,20}$/;

/** Attachment items of a field (or all general attachments for `null`). */
export function attachmentsFor(value: unknown): AttachmentItem[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object' && 'kind' in v) as AttachmentItem[]) : [];
}

/**
 * Returns `{ fieldKey: 'validation.<key>' }` for visible fields. A required attachment field is
 * satisfied by any attachment for that field (or a general attachment), like the database.
 */
export function validateRequestValues(
  fields: readonly RequestField[],
  values: RequestFormValues,
  options: { generalAttachments?: number } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  const visible = visibleFieldKeys(fields, values);
  for (const field of fields) {
    if (!visible.has(field.key) || isReadonlyField(field)) continue;
    const value = values[field.key];
    if (field.field_type === 'attachment') {
      if (field.required && attachmentsFor(value).length === 0 && !(options.generalAttachments ?? 0)) {
        errors[field.key] = 'validation.fileRequired';
      }
      continue;
    }
    if (isEmptyValue(value)) {
      if (field.required) errors[field.key] = field.field_type === 'dropdown' ? 'validation.selectOne' : 'validation.required';
      continue;
    }
    const v = field.validation ?? {};
    switch (field.field_type) {
      case 'short_text':
      case 'long_text': {
        const text = String(value).trim();
        const max = field.field_type === 'short_text' ? 500 : 10000;
        if (text.length > max) errors[field.key] = `validation.maxLength|${JSON.stringify({ max })}`;
        else if (v.pattern) {
          try {
            if (!new RegExp(v.pattern).test(text)) errors[field.key] = 'validation.pattern';
          } catch {
            /* invalid regex configured — the database decides */
          }
        }
        break;
      }
      case 'email':
        if (!EMAIL_RE.test(String(value).trim())) errors[field.key] = 'validation.email';
        break;
      case 'phone':
        if (!PHONE_RE.test(String(value).trim())) errors[field.key] = 'validation.phone';
        break;
      case 'number':
      case 'currency': {
        const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s]/g, ''));
        if (!Number.isFinite(n)) errors[field.key] = 'validation.number';
        else if (field.field_type === 'currency' && n < 0) errors[field.key] = 'validation.nonNegative';
        else if (typeof v.min === 'number' && n < v.min) errors[field.key] = `validation.min|${JSON.stringify({ min: v.min })}`;
        else if (typeof v.max === 'number' && n > v.max) errors[field.key] = `validation.max|${JSON.stringify({ max: v.max })}`;
        break;
      }
      case 'multi_select':
        if (!Array.isArray(value)) errors[field.key] = 'validation.invalidValue';
        break;
      default:
        break;
    }
  }
  // Leave-style ranges: end on/after start.
  const start = values.start_date;
  const end = values.end_date;
  if (visible.has('start_date') && visible.has('end_date') && typeof start === 'string' && typeof end === 'string' && start && end && end < start) {
    errors.end_date = 'validation.endBeforeStart';
  }
  return errors;
}

/** Fields that hold user data worth showing read-only (skips empty values and attachment fields). */
export function displayableFields(fields: readonly RequestField[], values: RequestFormValues): RequestField[] {
  return visibleFields(fields, values).filter((f) => f.field_type !== 'attachment' && !isEmptyValue(values[f.key]));
}
