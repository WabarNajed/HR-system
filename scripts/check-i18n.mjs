#!/usr/bin/env node
/**
 * i18n checks (CI + local): `pnpm check:i18n`
 *
 *  (a) every namespace file exists in both locales and is registered in src/lib/i18n/messages.ts
 *  (b) identical nested key sets ar ⇄ en (missing keys printed per side)
 *  (c) no empty string values
 *  (d) ICU placeholders / rich-text tags match between ar and en for every key
 *  (e) heuristic hard-coded UI string scan over src/**\/*.tsx:
 *      - JSX text containing letters (Arabic or Latin)
 *      - string literals passed to placeholder / title / aria-label / aria-description / label / alt
 *      Opt out per line with a trailing `// i18n-ignore` (or `{/* i18n-ignore *\/}` in JSX).
 *      src/app/dev/** (dev-only gallery) is ignored.
 *
 * Exits 1 when any problem is found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = path.join(ROOT, 'locales');
const LOCALES = ['ar', 'en'];
const MESSAGES_TS = path.join(ROOT, 'src/lib/i18n/messages.ts');
const SRC = path.join(ROOT, 'src');
const IGNORED_DIRS = [path.join(SRC, 'app', 'dev')];
const CHECKED_PROPS = new Set(['placeholder', 'title', 'aria-label', 'aria-description', 'aria-placeholder', 'label', 'alt']);
const LETTERS = /[A-Za-z؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

const problems = { registry: [], parity: [], empty: [], placeholders: [], hardcoded: [] };
const rel = (p) => path.relative(ROOT, p);

/* ─── Locale files ─────────────────────────────────────────────────────────── */

function listNamespaces(locale) {
  const dir = path.join(LOCALES_DIR, locale);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}

function loadJson(locale, ns) {
  const file = path.join(LOCALES_DIR, locale, `${ns}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problems.registry.push(`${rel(file)}: invalid JSON (${error.message})`);
    return null;
  }
}

/** Flattens to Map<dotted.key, string> (non-string leaves are reported). */
function flatten(obj, prefix, out, file) {
  for (const [key, value] of Object.entries(obj ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out, file);
    else if (typeof value === 'string') out.set(full, value);
    else problems.registry.push(`${file}: "${full}" must be a string or an object`);
  }
  return out;
}

/**
 * ICU argument names + rich-text tag names used by a message. A small ICU MessageFormat walker:
 * only real argument positions count (`{name}`, `{n, number}`, `{count, plural, =0 {Today} …}`),
 * so text inside plural/select branches (`{Today}`) is not mistaken for an argument, and branch
 * contents are scanned recursively. Apostrophe-quoted literals (`'{'`) are skipped.
 */
function messageTokens(message) {
  const tokens = new Set();
  let i = 0;
  const ws = () => {
    while (i < message.length && /\s/.test(message[i])) i++;
  };
  const word = () => {
    const start = i;
    while (i < message.length && !/[\s{},]/.test(message[i])) i++;
    return message.slice(start, i);
  };
  const skipBalanced = () => {
    // positioned after an opening brace: skip to its matching close brace
    let depth = 1;
    while (i < message.length && depth > 0) {
      if (message[i] === '{') depth++;
      else if (message[i] === '}') depth--;
      i++;
    }
  };
  function text(nested) {
    while (i < message.length) {
      const c = message[i];
      if (c === "'" && message[i + 1] === "'") i += 2;
      else if (c === "'" && /[{}<#|]/.test(message[i + 1] ?? '')) {
        const end = message.indexOf("'", i + 1);
        i = end === -1 ? message.length : end + 1;
      } else if (c === '{') {
        i++;
        argument();
      } else if (c === '}') {
        if (nested) {
          i++;
          return;
        }
        i++;
      } else if (c === '<') {
        const m = /^<\/?([A-Za-z][A-Za-z0-9_-]*)>/.exec(message.slice(i));
        if (m) {
          tokens.add(`<${m[1]}>`);
          i += m[0].length;
        } else i++;
      } else i++;
    }
  }
  function argument() {
    ws();
    const name = word();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) tokens.add(`{${name}}`);
    ws();
    if (message[i] === '}') {
      i++;
      return;
    }
    if (message[i] !== ',') return skipBalanced();
    i++;
    ws();
    const type = word();
    ws();
    if (message[i] === '}') {
      i++;
      return;
    }
    if (message[i] !== ',') return skipBalanced();
    i++;
    if (!['plural', 'select', 'selectordinal'].includes(type)) return skipBalanced();
    // options: selector {message} …
    for (;;) {
      ws();
      if (i >= message.length) return;
      if (message[i] === '}') {
        i++;
        return;
      }
      word();
      ws();
      if (message[i] !== '{') return skipBalanced();
      i++;
      text(true);
    }
  }
  text(false);
  return [...tokens].sort();
}

const nsByLocale = Object.fromEntries(LOCALES.map((l) => [l, listNamespaces(l)]));
const allNamespaces = [...new Set(LOCALES.flatMap((l) => nsByLocale[l]))].sort();

// (a) presence in both locales + registry
const registrySource = fs.existsSync(MESSAGES_TS) ? fs.readFileSync(MESSAGES_TS, 'utf8') : '';
if (!registrySource) problems.registry.push(`${rel(MESSAGES_TS)} not found`);
const arrayMatch = /export const namespaces = \[([\s\S]*?)\] as const/.exec(registrySource);
const registered = new Set(arrayMatch ? [...arrayMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);
if (!arrayMatch) problems.registry.push(`${rel(MESSAGES_TS)}: could not find \`export const namespaces = [...] as const\``);

for (const ns of allNamespaces) {
  for (const locale of LOCALES) {
    if (!nsByLocale[locale].includes(ns)) problems.registry.push(`locales/${locale}/${ns}.json is missing`);
    const importRe = new RegExp(`from '\\.\\./\\.\\./\\.\\./locales/${locale}/${ns}\\.json'`);
    if (registrySource && !importRe.test(registrySource)) {
      problems.registry.push(`${rel(MESSAGES_TS)}: locales/${locale}/${ns}.json is not imported`);
    }
  }
  if (arrayMatch && !registered.has(ns)) problems.registry.push(`${rel(MESSAGES_TS)}: namespace "${ns}" is not listed in \`namespaces\``);
}
for (const ns of registered) {
  if (!allNamespaces.includes(ns)) problems.registry.push(`${rel(MESSAGES_TS)}: namespace "${ns}" has no locale files`);
}

// (b) parity, (c) empty values, (d) placeholders
for (const ns of allNamespaces) {
  const maps = {};
  for (const locale of LOCALES) {
    if (!nsByLocale[locale].includes(ns)) continue;
    const json = loadJson(locale, ns);
    maps[locale] = json ? flatten(json, '', new Map(), `locales/${locale}/${ns}.json`) : new Map();
    for (const [key, value] of maps[locale]) {
      if (!value.trim()) problems.empty.push(`locales/${locale}/${ns}.json: "${key}" is empty`);
    }
  }
  if (!maps.ar || !maps.en) continue;
  for (const [a, b] of [
    ['ar', 'en'],
    ['en', 'ar'],
  ]) {
    for (const key of maps[a].keys()) {
      if (!maps[b].has(key)) problems.parity.push(`${ns}.${key}: present in ${a}, missing in ${b}`);
    }
  }
  for (const [key, arValue] of maps.ar) {
    const enValue = maps.en.get(key);
    if (enValue === undefined) continue;
    const ta = messageTokens(arValue).join(' ');
    const te = messageTokens(enValue).join(' ');
    if (ta !== te) problems.placeholders.push(`${ns}.${key}: ar [${ta || '—'}] ≠ en [${te || '—'}]`);
  }
}

/* ─── Hard-coded string scan ───────────────────────────────────────────────── */

function walkFiles(dir, out = []) {
  if (IGNORED_DIRS.some((d) => dir === d || dir.startsWith(d + path.sep))) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walkFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function scanFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ignored = (line) => /i18n-ignore/.test(lines[line] ?? '');
  const report = (node, what, value) => {
    const start = node.getStart(source);
    const { line } = source.getLineAndCharacterOfPosition(start);
    const endLine = source.getLineAndCharacterOfPosition(node.getEnd()).line;
    for (let l = line; l <= endLine; l++) if (ignored(l)) return;
    const snippet = value.replace(/\s+/g, ' ').trim().slice(0, 60);
    problems.hardcoded.push(`${rel(file)}:${line + 1}  ${what}: "${snippet}"`);
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const value = node.getText(source);
      if (!node.containsOnlyTriviaWhiteSpaces && LETTERS.test(value)) report(node, 'JSX text', value);
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (CHECKED_PROPS.has(name) && node.initializer) {
        let literal = null;
        if (ts.isStringLiteral(node.initializer)) literal = node.initializer;
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          const expr = node.initializer.expression;
          if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) literal = expr;
        }
        if (literal && LETTERS.test(literal.text)) report(node, `${name}=`, literal.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

for (const file of walkFiles(SRC)) scanFile(file);

/* ─── Report ───────────────────────────────────────────────────────────────── */

const sections = [
  ['Namespace files / registry', problems.registry],
  ['Key parity (ar ⇄ en)', problems.parity],
  ['Empty values', problems.empty],
  ['Placeholder / tag mismatches', problems.placeholders],
  ['Hard-coded UI strings (use next-intl, or add // i18n-ignore)', problems.hardcoded],
];
let total = 0;
for (const [title, list] of sections) {
  if (!list.length) continue;
  total += list.length;
  console.error(`\n✖ ${title} — ${list.length}`);
  for (const item of list) console.error(`  ${item}`);
}

const keyCount = allNamespaces.length;
if (total) {
  console.error(`\ncheck:i18n failed with ${total} problem(s).`);
  process.exit(1);
}
console.log(`✓ check:i18n passed — ${keyCount} namespaces × ${LOCALES.length} locales, key parity, placeholders and no hard-coded UI strings.`);
