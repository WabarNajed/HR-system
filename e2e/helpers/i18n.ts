import fs from 'node:fs';
import path from 'node:path';
import type { Locale } from './auth';

/**
 * Reads UI strings straight from `locales/{ar,en}/<namespace>.json` so flow specs can drive the app in
 * either language without hard-coding translated text: `tr('ar', 'requests.actions.approve')`.
 * Only simple `{name}` placeholders are substituted (no ICU plural handling — avoid plural keys).
 */
const root = path.resolve(__dirname, '..', '..', 'locales');
const cache = new Map<string, Record<string, unknown>>();

function namespace(locale: Locale, ns: string): Record<string, unknown> {
  const key = `${locale}/${ns}`;
  let data = cache.get(key);
  if (!data) {
    data = JSON.parse(fs.readFileSync(path.join(root, locale, `${ns}.json`), 'utf8')) as Record<string, unknown>;
    cache.set(key, data);
  }
  return data;
}

export function tr(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const [ns, ...rest] = key.split('.');
  let node: unknown = namespace(locale, ns!);
  for (const part of rest) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== 'string') throw new Error(`Missing ${locale} translation: ${key}`);
  return node.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/**
 * The literal text of a message before its first `{…}` argument — for labels whose tail is an ICU
 * plural/select (e.g. "Import {count, plural, …}" → "Import").
 */
export function trPrefix(locale: Locale, key: string): string {
  return tr(locale, key).split('{')[0]!.trim();
}

/** Exact-match (anchored) regular expression for a translated label. */
export function exact(text: string): RegExp {
  return new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

/** Escapes a string for use inside a RegExp. */
export function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
