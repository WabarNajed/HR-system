/**
 * Label helpers for values that come from the database (category keys, field types, step types).
 * Keys are guarded with `t.has` because categories can be custom.
 */
type Translator = {
  (key: string): string;
  has: (key: string) => boolean;
};

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

export function categoryLabel(t: unknown, category: string): string {
  const tr = t as Translator;
  const key = `enums.requestCategory.${category}`;
  return tr.has(key) ? tr(key) : humanize(category);
}

export function fieldTypeLabel(t: unknown, type: string): string {
  const tr = t as Translator;
  const key = `enums.fieldType.${type}`;
  return tr.has(key) ? tr(key) : humanize(type);
}
