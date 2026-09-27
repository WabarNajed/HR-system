/**
 * Minimal, dependency-free HTML processing for certificate templates (server side):
 *
 *   processTemplateHtml(html, { resolve, flags, mode })
 *     1. parses the (TipTap / seeded) HTML into a small tree — tolerant of unclosed tags,
 *     2. sanitizes it with an allowlist (tags, attributes, safe inline styles) — scripts, event
 *        handlers, iframes, forms, external resources are dropped,
 *     3. applies conditional blocks (`data-if` / `data-if-not`),
 *     4. substitutes `{{tokens}}` in text nodes with HTML-escaped values.
 *
 * Templates are authored by administrators, but the output is rendered by headless Chromium and in
 * preview iframes, so everything is treated as untrusted.
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

type ElementNode = { type: 'element'; tag: string; attrs: Record<string, string>; children: Node[] };
type TextNode = { type: 'text'; text: string };
type Node = ElementNode | TextNode;

const VOID_TAGS = new Set(['br', 'hr', 'img', 'col', 'wbr', 'input', 'meta', 'link', 'source', 'area', 'base', 'embed', 'param', 'track']);
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'template']);

/** Tags kept as-is. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'span', 'div', 'blockquote', 'hr',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
]);
/** Tags removed together with their content. */
const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'svg', 'math', 'form', 'input',
  'button', 'select', 'option', 'textarea', 'noscript', 'template', 'link', 'meta', 'base', 'head', 'title',
  'audio', 'video', 'canvas', 'source', 'track', 'img', 'picture', 'portal', 'dialog',
]);
/** Everything else is unwrapped (children kept). */

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['dir', 'style', 'data-if', 'data-if-not', 'lang']),
  td: new Set(['colspan', 'rowspan', 'colwidth']),
  th: new Set(['colspan', 'rowspan', 'colwidth']),
  col: new Set(['span', 'width']),
  ol: new Set(['start', 'type']),
};

const ALLOWED_STYLE_PROPS = new Set([
  'text-align', 'font-weight', 'font-style', 'text-decoration', 'width', 'min-width', 'max-width',
  'vertical-align', 'white-space',
]);

const FLAG_RE = /^[a-z_][a-z0-9_]*$/;

function sanitizeStyle(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx <= 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop) || !value) continue;
    if (/[<>"'\\]|url\s*\(|expression|javascript:|@import/i.test(value)) continue;
    if (value.length > 60) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    if (name in attrs) continue;
    attrs[name] = decodeAttr(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Tolerant HTML → tree parser (enough for editor/seeded output; not a full HTML5 parser). */
export function parseHtml(html: string): Node[] {
  const root: ElementNode = { type: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  const len = html.length;
  let i = 0;
  const top = () => stack[stack.length - 1];

  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      top().children.push({ type: 'text', text: html.slice(i) });
      break;
    }
    if (lt > i) top().children.push({ type: 'text', text: html.slice(i, lt) });

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? len : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end === -1 ? len : end + 1;
      continue;
    }
    const close = html[lt + 1] === '/';
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(html.slice(lt + (close ? 2 : 1), lt + 40));
    if (!nameMatch) {
      // A lone "<" — keep it as text.
      top().children.push({ type: 'text', text: '&lt;' });
      i = lt + 1;
      continue;
    }
    const tag = nameMatch[0].toLowerCase();
    // Find the end of the tag, honouring quoted attribute values.
    let j = lt + (close ? 2 : 1) + nameMatch[0].length;
    let quote: string | null = null;
    while (j < len) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    const inner = html.slice(lt + (close ? 2 : 1) + nameMatch[0].length, j);
    i = j + 1;

    if (close) {
      // Pop to the matching open element (ignore stray end tags).
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) {
          stack.length = k;
          break;
        }
      }
      continue;
    }

    const node: ElementNode = { type: 'element', tag, attrs: parseAttrs(inner.replace(/\/\s*$/, '')), children: [] };
    top().children.push(node);
    if (RAW_TEXT_TAGS.has(tag)) {
      // Skip raw text content entirely (it is dropped anyway).
      const endIdx = html.toLowerCase().indexOf(`</${tag}`, i);
      if (endIdx === -1) {
        i = len;
      } else {
        const gt = html.indexOf('>', endIdx);
        i = gt === -1 ? len : gt + 1;
      }
      continue;
    }
    if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(inner)) stack.push(node);
  }
  return root.children;
}

export type TemplateRenderMode =
  /** Final output: unknown tokens are removed. */
  | 'final'
  /** Editor preview without an employee: tokens are shown as highlighted placeholders, all conditional blocks kept. */
  | 'placeholders';

export type ProcessOptions = {
  /** Value for a known token, or null when the token is unknown. Values are escaped by the processor. */
  resolve: (token: string) => string | null;
  /** Condition flags for `data-if` / `data-if-not`. */
  flags?: Record<string, boolean>;
  mode?: TemplateRenderMode;
  /** Label shown in placeholder mode (defaults to the token). */
  placeholderLabel?: (token: string) => string;
};

const TOKEN_IN_TEXT = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function substitute(text: string, options: ProcessOptions): string {
  return text.replace(TOKEN_IN_TEXT, (_m, token: string) => {
    const value = options.resolve(token);
    if (options.mode === 'placeholders') {
      const label = options.placeholderLabel?.(token) ?? token;
      const known = value !== null;
      return `<span class="tpl-var${known ? '' : ' tpl-var-unknown'}">${escapeHtml(label)}</span>`;
    }
    return value === null ? '' : escapeHtml(value);
  });
}

function serialize(nodes: Node[], options: ProcessOptions): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += substitute(node.text, options);
      continue;
    }
    const { tag, attrs } = node;
    if (DROP_TAGS.has(tag)) continue;

    // Conditional blocks.
    if (options.mode !== 'placeholders') {
      const ifFlag = attrs['data-if'];
      if (ifFlag !== undefined && !(FLAG_RE.test(ifFlag) && options.flags?.[ifFlag])) continue;
      const ifNotFlag = attrs['data-if-not'];
      if (ifNotFlag !== undefined && FLAG_RE.test(ifNotFlag) && options.flags?.[ifNotFlag]) continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      out += serialize(node.children, options);
      continue;
    }

    let attrText = '';
    const allowedForTag = ALLOWED_ATTRS[tag];
    for (const [name, rawValue] of Object.entries(attrs)) {
      if (!(ALLOWED_ATTRS['*'].has(name) || allowedForTag?.has(name))) continue;
      let value = rawValue;
      if (name === 'style') {
        value = sanitizeStyle(value);
        if (!value) continue;
      } else if (name === 'dir') {
        if (!['rtl', 'ltr', 'auto'].includes(value)) continue;
      } else if (name === 'data-if' || name === 'data-if-not') {
        if (!FLAG_RE.test(value)) continue;
      } else if (name === 'colspan' || name === 'rowspan' || name === 'span' || name === 'start') {
        if (!/^\d{1,3}$/.test(value)) continue;
      } else if (name === 'colwidth' || name === 'width') {
        if (!/^[\d,.%a-z ]{1,40}$/i.test(value)) continue;
      } else if (name === 'lang') {
        if (!/^[a-z]{2}(-[A-Za-z]{2})?$/.test(value)) continue;
      } else if (name === 'type') {
        if (!/^[1aAiI]$/.test(value)) continue;
      }
      attrText += ` ${name}="${escapeHtml(value)}"`;
    }
    if (VOID_TAGS.has(tag)) {
      out += `<${tag}${attrText}>`;
      continue;
    }
    out += `<${tag}${attrText}>${serialize(node.children, options)}</${tag}>`;
  }
  return out;
}

/** Sanitize + conditionals + token substitution. Returns safe HTML. */
export function processTemplateHtml(html: string | null | undefined, options: ProcessOptions): string {
  if (!html) return '';
  return serialize(parseHtml(html), options);
}

/** Sanitizes stored template HTML without resolving anything (used before saving). */
export function sanitizeTemplateHtml(html: string | null | undefined): string {
  if (!html) return '';
  return serialize(parseHtml(html), {
    resolve: () => null,
    mode: 'placeholders',
    placeholderLabel: (t) => t,
  })
    // Keep tokens literally when sanitizing (placeholder spans → original token text).
    .replace(/<span class="tpl-var(?: tpl-var-unknown)?">([a-zA-Z_][a-zA-Z0-9_]*)<\/span>/g, '{{$1}}');
}

/** True when the HTML has no visible text (e.g. `<p></p>`). */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') === '';
}
