import 'server-only';

import { intlLocale, type Locale } from '@/lib/i18n/config';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import type { OrganizationFormValues } from './schemas';

export type Option = { value: string; label: string; description?: string };

export type OrganizationData = {
  values: OrganizationFormValues;
  logoPath: string | null;
  updatedAt: string | null;
};

const hhmm = (v: string | null | undefined, fallback: string) => (v ? v.slice(0, 5) : fallback);

export async function getOrganizationData(supabase: ServerSupabaseClient): Promise<OrganizationData> {
  const [{ data: o, error: oe }, { data: s, error: se }] = await Promise.all([
    supabase
      .from('organizations')
      .select('name_ar, name_en, legal_name_ar, legal_name_en, logo_path, address_ar, address_en, city, country, website, phone, hr_email, commercial_registration, vat_number, updated_at')
      .maybeSingle(),
    supabase
      .from('organization_settings')
      .select('currency, timezone, default_language, fiscal_year_start_month, working_days, weekend_days, work_start, work_end, updated_at')
      .maybeSingle(),
  ]);
  if (oe) throw oe;
  if (se) throw se;
  const updated = [o?.updated_at, s?.updated_at].filter(Boolean).sort().pop() ?? null;
  return {
    values: {
      nameAr: o?.name_ar ?? '',
      nameEn: o?.name_en ?? '',
      legalNameAr: o?.legal_name_ar ?? '',
      legalNameEn: o?.legal_name_en ?? '',
      addressAr: o?.address_ar ?? '',
      addressEn: o?.address_en ?? '',
      city: o?.city ?? '',
      // Only a real ISO code pre-selects the picker; anything else (legacy free text) starts blank.
      country: COUNTRY_CODES.includes((o?.country ?? '').trim().toUpperCase()) ? (o?.country ?? '').trim().toUpperCase() : '',
      website: o?.website ?? '',
      phone: o?.phone ?? '',
      hrEmail: o?.hr_email ?? '',
      commercialRegistration: o?.commercial_registration ?? '',
      vatNumber: o?.vat_number ?? '',
      currency: s?.currency ?? 'SAR',
      timezone: s?.timezone ?? 'Asia/Riyadh',
      defaultLanguage: s?.default_language === 'en' ? 'en' : 'ar',
      fiscalYearStartMonth: s?.fiscal_year_start_month ?? 1,
      workingDays: [...(s?.working_days ?? [0, 1, 2, 3, 4])].sort(),
      weekendDays: [...(s?.weekend_days ?? [5, 6])].sort(),
      workStart: hhmm(s?.work_start, '08:00'),
      workEnd: hhmm(s?.work_end, '17:00'),
    },
    logoPath: o?.logo_path ?? null,
    updatedAt: updated,
  };
}

/* ─── Option lists (built on the server so labels match between SSR and hydration) ─── */

// ISO 3166-1 alpha-2 (officially assigned codes).
const COUNTRY_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');

const PRIORITY_COUNTRIES = ['SA', 'AE', 'KW', 'BH', 'QA', 'OM', 'EG', 'JO'];

const CURRENCIES = ['SAR', 'AED', 'KWD', 'BHD', 'QAR', 'OMR', 'EGP', 'JOD', 'USD', 'EUR', 'GBP', 'INR', 'PKR', 'PHP', 'BDT', 'TRY', 'MAD', 'LBP', 'IQD', 'SDG', 'YER', 'CHF', 'CNY', 'JPY'];

function displayNames(locale: Locale, type: 'region' | 'currency'): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type });
  } catch {
    return null;
  }
}

export function countryOptions(locale: Locale): Option[] {
  const names = displayNames(locale, 'region');
  const all = COUNTRY_CODES.map((code) => ({ value: code, label: names?.of(code) ?? code, description: code }));
  const collator = new Intl.Collator(intlLocale(locale));
  const priority = PRIORITY_COUNTRIES.map((c) => all.find((o) => o.value === c)!).filter(Boolean);
  const rest = all.filter((o) => !PRIORITY_COUNTRIES.includes(o.value)).sort((a, b) => collator.compare(a.label, b.label));
  return [...priority, ...rest];
}

export function currencyOptions(locale: Locale, current?: string): Option[] {
  const names = displayNames(locale, 'currency');
  const codes = current && !CURRENCIES.includes(current) ? [current, ...CURRENCIES] : CURRENCIES;
  return codes.map((code) => ({ value: code, label: `${code} · ${names?.of(code) ?? code}` }));
}

function offsetLabel(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}

export function timezoneOptions(current?: string): Option[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Qatar', 'Asia/Muscat', 'Africa/Cairo', 'Asia/Amman', 'UTC'];
  }
  if (!zones.includes('UTC')) zones = [...zones, 'UTC'];
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones.map((z) => ({ value: z, label: z.replace(/_/g, ' '), description: offsetLabel(z) }));
}

export function isValidTimezone(zone: string): boolean {
  if (zone === 'UTC') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function monthOptions(locale: Locale): Option[] {
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: fmt.format(new Date(Date.UTC(2026, i, 1))) }));
}

/** Weekday names 0=Sunday … 6=Saturday (short + long). */
export function weekdayNames(locale: Locale): { short: string; long: string; compact: string }[] {
  const short = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', timeZone: 'UTC' });
  // 2026-01-04 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 4 + i));
    // `compact`: phone-width label ("أربعاء" rather than "الأربعاء"; English keeps "Wed").
    return { short: short.format(d), long: long.format(d), compact: locale === 'ar' ? long.format(d).replace(/^ال/, '') : short.format(d) };
  });
}
