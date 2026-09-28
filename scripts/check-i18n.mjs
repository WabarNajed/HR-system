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
 *  (f) client message coverage: only some namespaces are serialized to the browser (root layout:
 *      ROOT_CLIENT_NAMESPACES; route layouts add theirs with `<ClientMessages ns={…}>`, see
 *      src/lib/i18n/client-namespaces.ts). Every Client Component reachable from a route (import
 *      graph from page/layout/loading/error/… files, from the first `'use client'` module on) may
 *      only use namespaces its route provides: `useTranslations('ns…')`, and literal keys passed to
 *      a root translator (`t('ns.key')`, `t(`ns.${x}`)`), and `ns.a.b` keys in Server Action modules
 *      the client imports (returned toast/error keys). `node scripts/check-i18n.mjs --client-usage
 *      [--verbose]` prints the namespaces each route group / section uses on the client.
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

const problems = { registry: [], parity: [], empty: [], placeholders: [], hardcoded: [], client: [] };
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

/* ─── Client message coverage ──────────────────────────────────────────────── */

const APP_DIR = path.join(SRC, 'app');
const CLIENT_NS_TS = path.join(SRC, 'lib/i18n/client-namespaces.ts');
const ROUTE_FILES = /^(page|layout|template|loading|error|not-found|forbidden|unauthorized|default)\.tsx?$/;
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];
const sourceCache = new Map();

function parse(file) {
  if (!sourceCache.has(file)) {
    const text = fs.readFileSync(file, 'utf8');
    sourceCache.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  }
  return sourceCache.get(file);
}

function directive(source, name) {
  for (const st of source.statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) return false;
    if (st.expression.text === name) return true;
  }
  return false;
}

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (/\.(json|css)$/.test(base)) return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTS) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

/** Runtime (non type-only) imports, re-exports and dynamic `import()`s of a module. */
function importsOf(file) {
  const source = parse(file);
  const out = [];
  const add = (spec) => {
    const target = resolveImport(file, spec);
    if (target) out.push(target);
  };
  for (const st of source.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const clause = st.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : null;
      if (clause && !clause.name && named && named.length && named.every((e) => e.isTypeOnly)) continue;
      add(st.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && !st.isTypeOnly) {
      add(st.moduleSpecifier.text);
    }
  }
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const unwrap = (node) => {
  while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
};

/** Leading text of a key argument (string / template literal, both branches of `a ? 'x' : 'y'`). */
function keyHeads(node) {
  node = unwrap(node);
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) return [node.head.text];
  if (ts.isConditionalExpression(node)) return [...keyHeads(node.whenTrue), ...keyHeads(node.whenFalse)];
  return [];
}

const namespaceOf = (key) => {
  const ns = key.split('.')[0];
  return allNamespaces.includes(ns) && (key.includes('.') || key === ns) ? ns : null;
};

/** Namespaces a client module reads from the message catalog. */
const clientUsageCache = new Map();
function clientNamespaces(file) {
  if (clientUsageCache.has(file)) return clientUsageCache.get(file);
  const source = parse(file);
  const used = new Set();
  const named = new Set(); // translator variables bound to a namespace
  let hasRoot = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useTranslations') {
      const arg = node.arguments[0];
      const decl = ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : null;
      if (!arg) {
        hasRoot = true;
      } else {
        for (const head of keyHeads(arg)) {
          const ns = namespaceOf(head.includes('.') ? head : `${head}.`) ?? (allNamespaces.includes(head.split('.')[0]) ? head.split('.')[0] : null);
          if (ns) used.add(ns);
        }
        if (decl) named.add(decl);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (hasRoot) {
    // Literal keys passed to translator-like callees (`t(…)`, `tRoot(…)`, `t.has(…)`, `t.rich(…)`).
    const scan = (node) => {
      if (ts.isCallExpression(node) && node.arguments[0]) {
        let callee = node.expression;
        if (ts.isPropertyAccessExpression(callee) && ['has', 'rich', 'markup', 'raw'].includes(callee.name.text)) callee = callee.expression;
        if (ts.isIdentifier(callee) && /^t[A-Z0-9]?\w*$/.test(callee.text) && !named.has(callee.text)) {
          for (const head of keyHeads(node.arguments[0])) {
            const ns = namespaceOf(head);
            if (ns) used.add(ns);
          }
        }
      }
      ts.forEachChild(node, scan);
    };
    scan(source);
  }
  clientUsageCache.set(file, used);
  return used;
}

/**
 * Namespaces of message keys a Server Action module returns to the client: string literals shaped
 * like `ns.segment.segment` (three or more segments, so permission keys like `users.view` don't count).
 */
function actionMessageNamespaces(file) {
  if (clientUsageCache.has(`action:${file}`)) return clientUsageCache.get(`action:${file}`);
  const used = new Set();
  const visit = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^[a-zA-Z]+(\.[a-zA-Z0-9_]+){2,}$/.test(node.text)) {
      const ns = namespaceOf(node.text);
      if (ns) used.add(ns);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  clientUsageCache.set(`action:${file}`, used);
  return used;
}

/** `export const NAME = ['a', ...OTHER] as const` arrays of src/lib/i18n/client-namespaces.ts. */
function namespaceLists() {
  const lists = {};
  if (!fs.existsSync(CLIENT_NS_TS)) return lists;
  const source = parse(CLIENT_NS_TS);
  const elementsOf = (expr) => {
    expr = unwrap(expr);
    if (!expr || !ts.isArrayLiteralExpression(expr)) return null;
    const out = [];
    for (const el of expr.elements) {
      if (ts.isStringLiteral(el)) out.push(el.text);
      else if (ts.isSpreadElement(el) && ts.isIdentifier(el.expression) && lists[el.expression.text]) out.push(...lists[el.expression.text]);
    }
    return out;
  };
  for (const st of source.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const values = ts.isIdentifier(d.name) ? elementsOf(d.initializer) : null;
      if (values) lists[d.name.text] = values;
    }
  }
  return lists;
}

/** Namespaces a route file adds with `<ClientMessages ns={…}>` (array literal or a list constant). */
function providedBy(file, lists) {
  const source = parse(file);
  const out = new Set();
  const read = (expr) => {
    expr = unwrap(expr);
    if (!expr) return;
    if (ts.isIdentifier(expr) && lists[expr.text]) lists[expr.text].forEach((n) => out.add(n));
    else if (ts.isArrayLiteralExpression(expr)) {
      for (const el of expr.elements) {
        if (ts.isStringLiteral(el)) out.add(el.text);
        else if (ts.isSpreadElement(el)) read(el.expression);
      }
    } else problems.client.push(`${rel(file)}: <ClientMessages ns> must be an array literal or a list from client-namespaces.ts`);
  };
  const visit = (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'ClientMessages') {
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name.getText(source) === 'ns' && attr.initializer && ts.isJsxExpression(attr.initializer)) read(attr.initializer.expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function routeFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, out);
    else if (ROUTE_FILES.test(entry.name)) out.push(full);
  }
  return out;
}

const clientUsageReport = new Map(); // group → Map<ns, Set<file>>
function checkClientMessages() {
  const lists = namespaceLists();
  const root = lists.ROOT_CLIENT_NAMESPACES;
  if (!root) {
    problems.client.push(`${rel(CLIENT_NS_TS)}: \`export const ROOT_CLIENT_NAMESPACES = [...] as const\` not found`);
    return;
  }
  for (const [name, values] of Object.entries(lists)) {
    for (const ns of values) if (!allNamespaces.includes(ns)) problems.client.push(`${rel(CLIENT_NS_TS)}: ${name} lists unknown namespace "${ns}"`);
  }
  const layoutProvides = new Map();
  const provides = (file) => {
    if (!layoutProvides.has(file)) layoutProvides.set(file, providedBy(file, lists));
    return layoutProvides.get(file);
  };
  const reported = new Set();

  for (const entry of routeFiles(APP_DIR)) {
    if (entry.startsWith(path.join(APP_DIR, 'dev') + path.sep)) continue;
    // Root provider + every `<ClientMessages>` of the layouts above (and in) this route file.
    const allowed = new Set(root);
    let dir = path.dirname(entry);
    const chain = [];
    for (;;) {
      chain.push(dir);
      if (dir === APP_DIR) break;
      dir = path.dirname(dir);
    }
    for (const d of chain) {
      const layout = ['layout.tsx', 'layout.ts'].map((f) => path.join(d, f)).find((f) => fs.existsSync(f));
      if (layout) provides(layout).forEach((n) => allowed.add(n));
    }
    provides(entry).forEach((n) => allowed.add(n));

    // Report key: route group + top-level section, e.g. "(app)/settings", "(auth)", "(root)".
    const parts = path.relative(APP_DIR, entry).split(path.sep);
    const group = parts[0].startsWith('(') ? (parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0]) : '(root)';
    if (!clientUsageReport.has(group)) clientUsageReport.set(group, new Map());
    const usage = clientUsageReport.get(group);

    const seen = new Set();
    const stack = [[entry, false]];
    while (stack.length) {
      const [file, inherited] = stack.pop();
      const source = parse(file);
      const isClient = inherited || directive(source, 'use client');
      const key = `${file}|${isClient}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Server Actions run on the server, but the message keys they return (`ok(…, 'ns.toast.saved')`)
      // are translated by the calling Client Component.
      const isAction = isClient && directive(source, 'use server');
      if (isClient) {
        for (const ns of isAction ? actionMessageNamespaces(file) : clientNamespaces(file)) {
          if (!usage.has(ns)) usage.set(ns, new Set());
          usage.get(ns).add(rel(file));
          if (allowed.has(ns)) continue;
          const id = `${file}|${ns}|${[...allowed].sort().join(',')}`;
          if (reported.has(id)) continue;
          reported.add(id);
          problems.client.push(`${rel(file)} uses "${ns}" on the client, not provided for ${rel(entry)} — add it to a <ClientMessages ns> of that route`);
        }
      }
      if (isAction) continue;
      for (const next of importsOf(file)) stack.push([next, isClient]);
    }
  }
}

checkClientMessages();
if (process.argv.includes('--client-usage')) {
  for (const [group, usage] of [...clientUsageReport].sort()) {
    console.log(`\n${group}: ${[...usage.keys()].sort().join(', ')}`);
    if (process.argv.includes('--verbose')) {
      for (const [ns, files] of [...usage].sort()) console.log(`  ${ns.padEnd(16)} ${files.size} file(s)  e.g. ${[...files][0]}`);
    }
  }
}

/* ─── Report ───────────────────────────────────────────────────────────────── */

const sections = [
  ['Namespace files / registry', problems.registry],
  ['Key parity (ar ⇄ en)', problems.parity],
  ['Empty values', problems.empty],
  ['Placeholder / tag mismatches', problems.placeholders],
  ['Hard-coded UI strings (use next-intl, or add // i18n-ignore)', problems.hardcoded],
  ['Client messages (namespaces not sent to the browser for a route)', problems.client],
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
