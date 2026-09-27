import 'server-only';

import QRCode from 'qrcode';
import { formatDate, formatHijri, todayIso } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { getTranslator } from '@/lib/i18n/translator';
import { pdfBaseCss } from '@/lib/pdf/fonts';
import { renderPdf } from '@/lib/pdf/render';
import { siteUrl } from '@/lib/supabase/env';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { BUCKETS } from '@/lib/storage';
import { escapeHtml, isBlankHtml, processTemplateHtml, type TemplateRenderMode } from '../html';
import type { CertificateLanguage } from '../variables';
import { SALARY_VARIABLES, VARIABLE_KEYS } from '../variables';

/**
 * Certificate document builder: organization letterhead + template content (per language) +
 * signature/stamp block + QR verification, rendered to an A4 portrait PDF with headless Chromium.
 */

export type TemplateContent = {
  name_ar: string;
  name_en: string;
  certificate_type: string;
  language: string;
  content_ar: string | null;
  content_en: string | null;
  header_html: string | null;
  footer_html: string | null;
  show_logo: boolean;
  show_stamp: boolean;
  show_signature: boolean;
  show_qr: boolean;
};

export type IssuingEmployee = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  nationality: string | null;
  passport_number: string | null;
  national_id: string | null;
  joining_date: string | null;
  job_title: { name_ar: string | null; name_en: string | null } | null;
  department: { name_ar: string | null; name_en: string | null } | null;
};

export type IssuingCompensation = {
  basic_salary: number | null;
  housing_allowance: number | null;
  transport_allowance: number | null;
  other_allowance: number | null;
  total_salary: number | null;
  currency: string | null;
};

export type IssuingOrganization = {
  name_ar: string | null;
  name_en: string | null;
  legal_name_ar: string | null;
  legal_name_en: string | null;
  address_ar: string | null;
  address_en: string | null;
  city: string | null;
  website: string | null;
  phone: string | null;
  hr_email: string | null;
  commercial_registration: string | null;
  vat_number: string | null;
  currency: string;
  primary_color: string | null;
  secondary_color: string | null;
  signatory_name_ar: string | null;
  signatory_name_en: string | null;
  signatory_title_ar: string | null;
  signatory_title_en: string | null;
};

export type IssuingAssets = { logo: string | null; stamp: string | null; signature: string | null };

export type IssuingContext = {
  employee: IssuingEmployee | null;
  /** null when the caller cannot read compensation (no `bank.view`) or none is recorded. */
  compensation: IssuingCompensation | null;
  organization: IssuingOrganization;
  assets: IssuingAssets;
};

export type CertificateOptions = {
  addressedTo?: string | null;
  purpose?: string | null;
  includeSalary?: boolean;
  includeAllowances?: boolean;
};

/* ─── Loading ─────────────────────────────────────────────────────────────── */

function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function downloadDataUri(supabase: ServerSupabaseClient, bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const clean = bucket === BUCKETS.branding ? path.replace(/^branding\//, '') : path;
  const result = await withTimeout(supabase.storage.from(bucket).download(clean), 6000, { data: null, error: new Error('timeout') } as never);
  const blob = (result as { data: Blob | null }).data;
  if (!blob) return null;
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.length > 3 * 1024 * 1024) return null;
  const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : guessImageType(clean);
  return `data:${type};base64,${buffer.toString('base64')}`;
}

function guessImageType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

/** Organization letterhead data + stamp/signature/logo images (embedded as data URIs). */
export async function loadOrganizationContext(supabase: ServerSupabaseClient): Promise<{ organization: IssuingOrganization; assets: IssuingAssets }> {
  const [{ data: org }, { data: settings }] = await Promise.all([
    supabase
      .from('organizations')
      .select('name_ar, name_en, legal_name_ar, legal_name_en, address_ar, address_en, city, website, phone, hr_email, commercial_registration, vat_number, logo_path')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('organization_settings')
      .select('currency, primary_color, secondary_color, stamp_path, signature_path, signatory_name_ar, signatory_name_en, signatory_title_ar, signatory_title_en')
      .limit(1)
      .maybeSingle(),
  ]);
  const [logo, stamp, signature] = await Promise.all([
    downloadDataUri(supabase, BUCKETS.branding, org?.logo_path),
    downloadDataUri(supabase, BUCKETS.certificateFiles, settings?.stamp_path),
    downloadDataUri(supabase, BUCKETS.certificateFiles, settings?.signature_path),
  ]);
  return {
    organization: {
      name_ar: org?.name_ar ?? null,
      name_en: org?.name_en ?? null,
      legal_name_ar: org?.legal_name_ar ?? null,
      legal_name_en: org?.legal_name_en ?? null,
      address_ar: org?.address_ar ?? null,
      address_en: org?.address_en ?? null,
      city: org?.city ?? null,
      website: org?.website ?? null,
      phone: org?.phone ?? null,
      hr_email: org?.hr_email ?? null,
      commercial_registration: org?.commercial_registration ?? null,
      vat_number: org?.vat_number ?? null,
      currency: settings?.currency || 'SAR',
      primary_color: settings?.primary_color ?? null,
      secondary_color: settings?.secondary_color ?? null,
      signatory_name_ar: settings?.signatory_name_ar ?? null,
      signatory_name_en: settings?.signatory_name_en ?? null,
      signatory_title_ar: settings?.signatory_title_ar ?? null,
      signatory_title_en: settings?.signatory_title_en ?? null,
    },
    assets: { logo, stamp, signature },
  };
}

/** Employee + compensation (RLS as the caller) for a certificate. */
export async function loadEmployeeContext(
  supabase: ServerSupabaseClient,
  employeeId: string,
): Promise<{ employee: IssuingEmployee | null; compensation: IssuingCompensation | null }> {
  const [{ data: emp }, { data: comp }] = await Promise.all([
    supabase
      .from('employees')
      .select(
        'id, employee_number, name_ar, name_en, nationality, passport_number, national_id, joining_date, job_title:job_titles(name_ar, name_en), department:departments(name_ar, name_en)',
      )
      .eq('id', employeeId)
      .maybeSingle(),
    supabase
      .from('employee_compensation')
      .select('basic_salary, housing_allowance, transport_allowance, other_allowance, total_salary, currency')
      .eq('employee_id', employeeId)
      .maybeSingle(),
  ]);
  return {
    employee: (emp as IssuingEmployee | null) ?? null,
    compensation: (comp as IssuingCompensation | null) ?? null,
  };
}

/* ─── Variables ───────────────────────────────────────────────────────────── */

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function gregorian(value: string | null | undefined, lang: Locale): string {
  if (!value) return '';
  const text = formatDate(value, lang, 'long');
  return text && lang === 'ar' ? `${text}م` : text;
}

function hijri(value: string | null | undefined, lang: Locale): string {
  if (!value) return '';
  const text = formatHijri(value, lang);
  return text && lang === 'ar' ? `${text}هـ` : text ? `${text} AH` : '';
}

/**
 * Resolver for one section language. Salary tokens resolve to empty unless `includeSalary`.
 * Returns null for unknown tokens.
 */
export function variableResolver(
  ctx: IssuingContext,
  lang: Locale,
  data: { certificateNumber: string; issueDate: string; options: CertificateOptions },
): (token: string) => string | null {
  const { employee: e, compensation: c, organization: o } = ctx;
  const currency = c?.currency || o.currency || 'SAR';
  const money = (v: number | null | undefined) => (v === null || v === undefined ? '' : formatCurrency(v, lang, currency));
  const includeSalary = Boolean(data.options.includeSalary || data.options.includeAllowances);
  const values: Record<string, string> = {
    employee_name_ar: clean(e?.name_ar) || clean(e?.name_en),
    employee_name_en: clean(e?.name_en) || clean(e?.name_ar),
    employee_id: clean(e?.employee_number),
    job_title_ar: localized(e?.job_title ?? null, 'name', 'ar'),
    job_title_en: localized(e?.job_title ?? null, 'name', 'en'),
    department_ar: localized(e?.department ?? null, 'name', 'ar'),
    department_en: localized(e?.department ?? null, 'name', 'en'),
    joining_date: gregorian(e?.joining_date, lang),
    nationality: clean(e?.nationality),
    passport_number: clean(e?.passport_number),
    national_id: clean(e?.national_id),
    basic_salary: money(c?.basic_salary),
    housing_allowance: money(c?.housing_allowance),
    transport_allowance: money(c?.transport_allowance),
    other_allowance: money(c?.other_allowance),
    total_salary: money(c?.total_salary),
    company_name_ar: clean(o.legal_name_ar) || clean(o.name_ar) || clean(o.legal_name_en) || clean(o.name_en),
    company_name_en: clean(o.legal_name_en) || clean(o.name_en) || clean(o.legal_name_ar) || clean(o.name_ar),
    company_address_ar: clean(o.address_ar) || clean(o.address_en),
    company_address_en: clean(o.address_en) || clean(o.address_ar),
    company_cr: clean(o.commercial_registration),
    company_vat: clean(o.vat_number),
    company_phone: clean(o.phone),
    company_website: clean(o.website),
    certificate_number: data.certificateNumber,
    current_date: lang === 'ar' ? `${gregorian(data.issueDate, 'ar')} الموافق ${hijri(data.issueDate, 'ar')}` : gregorian(data.issueDate, 'en'),
    current_date_hijri: hijri(data.issueDate, lang),
    addressed_to: clean(data.options.addressedTo),
    purpose: clean(data.options.purpose),
  };
  return (token: string) => {
    if (!VARIABLE_KEYS.has(token)) return null;
    if (SALARY_VARIABLES.has(token) && !includeSalary) return '';
    return values[token] ?? '';
  };
}

/* ─── Document ────────────────────────────────────────────────────────────── */

export type BuildDocumentInput = {
  template: TemplateContent;
  language: CertificateLanguage;
  ctx: IssuingContext;
  certificateNumber: string;
  issueDate?: string;
  options: CertificateOptions;
  /** `placeholders`: editor preview without an employee (tokens shown as chips). */
  mode?: TemplateRenderMode;
  /** Adds a diagonal "Preview" watermark. */
  watermark?: boolean;
  /** Screen styles for iframe previews (paper on a grey canvas). */
  screen?: boolean;
  /** Label for placeholder chips (translated variable names). */
  placeholderLabel?: (token: string) => string;
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

function contactLine(o: IssuingOrganization, lang: Locale): string {
  const t = getTranslator(lang);
  const parts: string[] = [];
  if (clean(o.commercial_registration)) parts.push(`${t('certificates.pdf.cr')} <span class="num">${escapeHtml(clean(o.commercial_registration))}</span>`);
  if (clean(o.vat_number)) parts.push(`${t('certificates.pdf.vat')} <span class="num">${escapeHtml(clean(o.vat_number))}</span>`);
  if (clean(o.phone)) parts.push(`${t('certificates.pdf.phone')} <span class="num">${escapeHtml(clean(o.phone))}</span>`);
  if (clean(o.hr_email)) parts.push(`<span class="num">${escapeHtml(clean(o.hr_email))}</span>`);
  if (clean(o.website)) parts.push(`<span class="num">${escapeHtml(clean(o.website))}</span>`);
  return parts.join('<span class="sep">•</span>');
}

async function qrDataUri(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0f1b1fff', light: '#ffffffff' } });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function verificationUrl(certificateNumber: string): string {
  return `${siteUrl()}/verify/${encodeURIComponent(certificateNumber)}`;
}

function signatoryBlock(ctx: IssuingContext, template: TemplateContent, languages: Locale[]): string {
  const o = ctx.organization;
  const names = languages
    .map((lang) => {
      const t = getTranslator(lang);
      const name = lang === 'ar' ? clean(o.signatory_name_ar) : clean(o.signatory_name_en);
      const title = lang === 'ar' ? clean(o.signatory_title_ar) : clean(o.signatory_title_en);
      return `<div class="sig-lines" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
        <div class="sig-title">${escapeHtml(title || t('certificates.pdf.authorizedSignatory'))}</div>
        ${name ? `<div class="sig-name">${escapeHtml(name)}</div>` : ''}
      </div>`;
    })
    .join('');
  const signature = template.show_signature
    ? ctx.assets.signature
      ? `<img class="sig-img" src="${ctx.assets.signature}" alt="">`
      : '<div class="sig-rule"></div>'
    : '';
  const stamp = template.show_stamp && ctx.assets.stamp ? `<img class="stamp-img" src="${ctx.assets.stamp}" alt="">` : '';
  if (!template.show_signature && !stamp) return '<div class="sig"></div>';
  return `<div class="sig">
    <div class="sig-names">${names}</div>
    <div class="sig-marks">${signature}${stamp}</div>
  </div>`;
}

/** Complete, self-contained HTML document (fonts + images embedded). */
export async function buildCertificateDocument(input: BuildDocumentInput): Promise<string> {
  const { template, language, ctx, options } = input;
  const issueDate = input.issueDate ?? todayIso();
  const mode = input.mode ?? 'final';
  const rootLang: Locale = language === 'en' ? 'en' : 'ar';
  const sections: Locale[] = language === 'bilingual' ? ['ar', 'en'] : [rootLang];
  const flags = {
    include_salary: Boolean(options.includeSalary),
    include_allowances: Boolean(options.includeAllowances),
    addressed_to: Boolean(clean(options.addressedTo)),
  };
  const data = { certificateNumber: input.certificateNumber, issueDate, options };
  const process = (html: string | null | undefined, lang: Locale) =>
    processTemplateHtml(html, { resolve: variableResolver(ctx, lang, data), flags, mode, placeholderLabel: input.placeholderLabel });

  const primary = HEX_RE.test(ctx.organization.primary_color ?? '') ? ctx.organization.primary_color! : '#0F5E6B';
  const secondary = HEX_RE.test(ctx.organization.secondary_color ?? '') ? ctx.organization.secondary_color! : '#B8862F';

  const bodyHtml = sections
    .map((lang) => {
      const content = lang === 'ar' ? template.content_ar : template.content_en;
      return `<section class="content" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">${process(content, lang)}</section>`;
    })
    .join(language === 'bilingual' ? '<div class="divider" aria-hidden="true"></div>' : '');

  const headerInner = isBlankHtml(template.header_html) ? '' : process(template.header_html, rootLang);
  const footerInner = isBlankHtml(template.footer_html) ? '' : process(template.footer_html, rootLang);
  const logo = template.show_logo && ctx.assets.logo ? `<img class="logo" src="${ctx.assets.logo}" alt="">` : '';

  let qr = '';
  if (template.show_qr) {
    const url = verificationUrl(input.certificateNumber);
    const captions = sections.map((lang) => escapeHtml(getTranslator(lang)('certificates.pdf.verifyCaption'))).join('<br>');
    qr = `<div class="qr">
      <img src="${await qrDataUri(url)}" alt="">
      <div class="qr-caption">${captions}<div class="qr-number num">${escapeHtml(input.certificateNumber)}</div></div>
    </div>`;
  }

  const contact = contactLine(ctx.organization, rootLang);
  const watermark = input.watermark
    ? `<div class="watermark">${escapeHtml(getTranslator('ar')('certificates.pdf.watermark'))} · ${escapeHtml(getTranslator('en')('certificates.pdf.watermark'))}</div>`
    : '';

  const css = `
@page { size: A4 portrait; margin: 0; }
${pdfBaseCss()}
:root { --brand: ${primary}; --gold: ${secondary}; --ink: #0f1b1f; --muted: #52636a; --line: #dfe5e8; }
html, body { background: #fff; }
body { font-size: ${language === 'bilingual' ? '9.6pt' : '10.8pt'}; line-height: 1.75; color: var(--ink); }
.num { direction: ltr; unicode-bidi: isolate; }
.letterhead { position: fixed; top: 0; left: 0; right: 0; height: 40mm; padding: 11mm 18mm 0; }
.lh-inner { position: relative; min-height: 20mm; display: flex; align-items: center; }
.lh-content { flex: 1; font-size: 10pt; line-height: 1.5; }
.lh-content table { width: 100%; border-collapse: collapse; }
.lh-content td, .lh-content th { vertical-align: middle; font-weight: 700; color: var(--brand); padding: 0; border: 0; }
.lh-content td[dir=ltr] { font-size: 9.5pt; letter-spacing: .01em; }
.lh-content p { margin: 0; }
.logo { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); max-height: 21mm; max-width: 46mm; object-fit: contain; }
.lh-only-logo .logo { position: static; transform: none; margin: 0 auto; display: block; }
.lh-rule { margin-top: 4mm; height: 0; border-top: 1.6pt solid var(--brand); position: relative; }
.lh-rule::after { content: ''; position: absolute; left: 0; right: 0; top: 1.2pt; border-top: .6pt solid var(--gold); }
.page-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 27mm; padding: 0 18mm 9mm; display: flex; flex-direction: column; justify-content: flex-end; }
.pf-rule { border-top: .6pt solid var(--line); margin-bottom: 2.5mm; }
.pf-content { font-size: 8pt; line-height: 1.55; color: var(--muted); }
.pf-content table { width: 100%; border-collapse: collapse; }
.pf-content td, .pf-content th { padding: 0; border: 0; vertical-align: top; font-weight: 400; }
.pf-content p { margin: 0; }
.pf-contact { margin-top: 1.5mm; font-size: 7.6pt; color: var(--muted); text-align: center; }
.pf-contact .sep { color: var(--gold); margin: 0 2.2mm; }
table.sheet { width: 100%; border-collapse: collapse; }
table.sheet > thead > tr > td { height: 46mm; padding: 0; }
table.sheet > tfoot > tr > td { height: 31mm; padding: 0; }
table.sheet > tbody > tr > td { padding: 0 20mm; vertical-align: top; }
.body { ${language === 'bilingual' ? 'display: grid; grid-template-columns: 1fr 1px 1fr; column-gap: 7mm;' : ''} }
.divider { background: linear-gradient(to bottom, transparent, var(--line) 8%, var(--line) 92%, transparent); }
.content { min-width: 0; }
.content p { margin: 0 0 2.6mm; }
.content h1, .content h2, .content h3, .content h4 { color: var(--brand); margin: 3mm 0 4mm; line-height: 1.35; font-weight: 700; }
.content h1 { font-size: 1.75em; } .content h2 { font-size: 1.45em; } .content h3 { font-size: 1.2em; } .content h4 { font-size: 1.05em; }
.content ul, .content ol { margin: 0 0 2.6mm; padding-inline-start: 6mm; }
.content li p { margin: 0; }
.content table { width: 100%; border-collapse: collapse; margin: 1mm 0 3.5mm; font-size: .95em; }
.content th, .content td { border: .6pt solid var(--line); padding: 1.4mm 2.6mm; text-align: start; vertical-align: top; }
.content th { background: #f3f6f7; font-weight: 600; width: 45%; }
.content td p, .content th p { margin: 0; }
.content strong { font-weight: 700; }
.content blockquote { margin: 0 0 2.6mm; padding-inline-start: 4mm; border-inline-start: 2pt solid var(--gold); color: var(--muted); }
.content hr { border: 0; border-top: .6pt solid var(--line); margin: 4mm 0; }
.closing { display: flex; align-items: flex-end; justify-content: space-between; gap: 10mm; margin-top: 7mm; break-inside: avoid; page-break-inside: avoid; }
.sig { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1.5mm; }
.sig-names { display: flex; gap: 8mm; }
.sig-lines { min-width: 0; }
.sig-title { font-size: 9pt; color: var(--muted); }
.sig-name { font-weight: 700; font-size: 10pt; }
.sig-marks { position: relative; height: 26mm; display: flex; align-items: center; gap: 4mm; }
.sig-img { max-height: 20mm; max-width: 52mm; object-fit: contain; }
.stamp-img { max-height: 26mm; max-width: 30mm; object-fit: contain; opacity: .92; }
.sig-rule { width: 50mm; border-bottom: .8pt solid var(--ink); height: 16mm; }
.qr { flex: none; display: flex; align-items: center; gap: 3mm; padding: 2.4mm; border: .6pt solid var(--line); border-radius: 2mm; }
.qr img { width: 23mm; height: 23mm; display: block; }
.qr-caption { font-size: 7.4pt; line-height: 1.5; color: var(--muted); max-width: 34mm; }
.qr-number { margin-top: 1mm; font-weight: 700; color: var(--ink); font-size: 7.8pt; }
.tpl-var { background: #fff4dc; color: #7a5210; border: .5pt dashed #d8a64a; border-radius: 1mm; padding: 0 1mm; font-size: .92em; white-space: nowrap; }
.tpl-var-unknown { background: #fde8e7; color: #a4221c; border-color: #e0827d; }
.watermark { position: fixed; top: 46%; left: 0; right: 0; text-align: center; transform: rotate(-28deg); font-size: 46pt; font-weight: 700; color: rgba(15, 94, 107, .07); letter-spacing: .04em; pointer-events: none; z-index: 5; }
${
  input.screen
    ? `@media screen {
  html { background: #e8edef; }
  body { width: 210mm; min-height: 297mm; margin: 8mm auto; position: relative; box-shadow: 0 1px 3px rgba(15,27,31,.12), 0 8px 24px rgba(15,27,31,.08); }
  .letterhead, .page-footer, .watermark { position: absolute; }
  table.sheet > tfoot { display: none; }
  table.sheet > tbody > tr > td { padding-bottom: 36mm; }
}`
    : ''
}`;

  const lhClass = headerInner ? 'lh-inner' : 'lh-inner lh-only-logo';
  const header = headerInner || logo ? `<div class="${lhClass}">${logo}<div class="lh-content">${headerInner}</div></div><div class="lh-rule"></div>` : '';
  const footer = `<div class="pf-rule"></div>${footerInner ? `<div class="pf-content">${footerInner}</div>` : ''}${contact ? `<div class="pf-contact">${contact}</div>` : ''}`;
  const title = escapeHtml(`${input.certificateNumber} — ${language === 'en' ? template.name_en : template.name_ar}`);

  return `<!doctype html>
<html lang="${rootLang}" dir="${rootLang === 'ar' ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head>
<body>
${watermark}
<div class="letterhead">${header}</div>
<div class="page-footer">${footer}</div>
<table class="sheet" role="presentation">
  <thead><tr><td></td></tr></thead>
  <tfoot><tr><td></td></tr></tfoot>
  <tbody><tr><td>
    <div class="body">${bodyHtml}</div>
    <div class="closing" dir="${rootLang === 'ar' ? 'rtl' : 'ltr'}">${signatoryBlock(ctx, template, sections)}${qr}</div>
  </td></tr></tbody>
</table>
</body>
</html>`;
}

/** A4 portrait PDF of a certificate document (margins are handled by the document itself). */
export async function renderCertificatePdf(html: string): Promise<Buffer> {
  return renderPdf({ html, margins: { top: '0', right: '0', bottom: '0', left: '0' }, timeoutMs: 45_000 });
}

/** Placeholder number for previews, e.g. `CERT-2026-XXXXXX`. */
export function previewCertificateNumber(): string {
  return `CERT-${todayIso().slice(0, 4)}-XXXXXX`;
}
