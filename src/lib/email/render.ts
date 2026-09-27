/**
 * Email rendering: `{{placeholder}}` substitution (HTML-escaped) and a branded, responsive,
 * RTL-aware layout that works in Gmail/Outlook (table layout, inline styles, no web fonts).
 */
import type { Locale } from '@/lib/i18n/config';

export type TemplateVars = Record<string, string | number | null | undefined>;

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Replaces `{{key}}` with `vars[key]`. With `html: true` (default) values are HTML-escaped so user
 * data can never inject markup; unknown placeholders render as an empty string.
 */
export function renderTemplate(template: string, vars: TemplateVars, options: { html?: boolean } = {}): string {
  const html = options.html ?? true;
  return template.replace(PLACEHOLDER, (_, key: string) => {
    const raw = vars[key];
    if (raw === null || raw === undefined) return '';
    const value = String(raw);
    return html ? escapeHtml(value) : value;
  });
}

/** Placeholder names used in a template (for editors / validation). */
export function extractPlaceholders(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) if (m[1]) out.add(m[1]);
  return Array.from(out);
}

/** Plain-text alternative for multipart emails. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type EmailBranding = {
  portalName: string;
  companyName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type EmailLayoutOptions = {
  locale: Locale;
  subject: string;
  /** Body HTML (already rendered/escaped — e.g. `renderTemplate(template.body_ar, vars)`). */
  bodyHtml: string;
  branding: EmailBranding;
  /** Hidden inbox preview text. */
  preheader?: string;
  /** Optional call-to-action button. */
  action?: { label: string; url: string } | null;
  /** Small print under the card (translated by the caller). */
  footerNote?: string | null;
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Full HTML document for an email. RTL + Arabic font stack for `ar`. */
export function renderEmailLayout(options: EmailLayoutOptions): string {
  const { locale, subject, bodyHtml, branding, preheader, action, footerNote } = options;
  const rtl = locale === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  const primary = branding.primaryColor && HEX.test(branding.primaryColor) ? branding.primaryColor : '#0F5E6B';
  const accent = branding.secondaryColor && HEX.test(branding.secondaryColor) ? branding.secondaryColor : '#B8862F';
  const font = rtl
    ? "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, 'Geeza Pro', Arial, sans-serif"
    : "'IBM Plex Sans Arabic', 'Segoe UI', -apple-system, Roboto, Arial, sans-serif";
  const name = escapeHtml(branding.portalName);
  const company = branding.companyName ? escapeHtml(branding.companyName) : '';
  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${name}" height="36" style="display:block;height:36px;max-width:180px;border:0;outline:none;" />`
    : `<span style="display:inline-block;font-size:18px;font-weight:700;color:#ffffff;">${name}</span>`;
  const button = action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 4px;"><tr><td style="border-radius:8px;background:${primary};">
         <a href="${escapeHtml(action.url)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a>
       </td></tr></table>`
    : '';

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; background:#f5f7f8; }
  a { color:${primary}; }
  @media (max-width: 620px) { .card { border-radius:0 !important; } .pad { padding:24px 20px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:#f5f7f8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader ?? subject)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7f8;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" class="card" width="600" cellspacing="0" cellpadding="0" border="0" dir="${dir}" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e8ea;border-radius:12px;overflow:hidden;">
      <tr><td style="background:${primary};padding:20px 32px;border-bottom:3px solid ${accent};" align="${align}">${logo}</td></tr>
      <tr><td class="pad" dir="${dir}" align="${align}" style="padding:32px;font-family:${font};font-size:15px;line-height:1.7;color:#0f1b1f;text-align:${align};">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;font-weight:700;color:#0f1b1f;">${escapeHtml(subject)}</h1>
        <div style="font-size:15px;line-height:1.75;color:#24343a;">${bodyHtml}</div>
        ${button}
      </td></tr>
      <tr><td dir="${dir}" align="${align}" style="padding:18px 32px;background:#f8fafa;border-top:1px solid #e3e8ea;font-family:${font};font-size:12px;line-height:1.6;color:#5b6b70;text-align:${align};">
        ${footerNote ? `<div style="margin-bottom:6px;">${escapeHtml(footerNote)}</div>` : ''}
        <div>${company ? `${company} · ` : ''}${name}</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
