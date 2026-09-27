import { LockKeyholeIcon, SearchXIcon, ShieldCheckIcon, ShieldXIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/shared/status-badge';
import { BrandMark } from '@/components/shell/brand-mark';
import { LanguageSwitch } from '@/components/shell/language-switch';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { brandingCompanyName, brandingPortalName, getPublicBranding } from '@/lib/branding';
import { formatDate, formatDateTime, formatHijri } from '@/lib/dates';
import { resolveLocale } from '@/lib/i18n/config';
import { pageMetadata } from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { VerifyLookup } from './verify-lookup';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { ...(await pageMetadata('verify.title', 'verify.description')), robots: { index: false, follow: false } };
}

type VerifyRow = { certificate_number: string; employee_name: string | null; certificate_type: string; issue_date: string; status: string };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function lookup(number: string): Promise<VerifyRow | null | 'error'> {
  if (!number || number.length > 40) return null;
  try {
    const supabase = await createClient({ timeoutMs: 6000 });
    const { data, error } = await supabase.rpc('verify_certificate', { p_number: number });
    if (error) {
      console.error('[verify] rpc failed:', error.message);
      return 'error';
    }
    const rows = (data ?? []) as VerifyRow[];
    return rows[0] ?? null;
  } catch (error) {
    console.error('[verify] lookup failed:', error instanceof Error ? error.message : error);
    return 'error';
  }
}

/**
 * PUBLIC certificate verification (no sign-in). Calls `verify_certificate` (anon-granted) and shows
 * ONLY: certificate number, employee name, certificate type, issue date and status.
 */
export default async function VerifyCertificatePage({ params }: { params: Promise<{ certificateNumber: string }> }) {
  const [{ certificateNumber }, t, tCommon, tEnums, branding, rawLocale] = await Promise.all([
    params,
    getTranslations('verify'),
    getTranslations('common'),
    getTranslations('enums'),
    getPublicBranding(),
    getLocale(),
  ]);
  const locale = resolveLocale(rawLocale);
  const number = safeDecode(certificateNumber).trim().toUpperCase().slice(0, 60);
  const result = await lookup(number);
  const portalName = brandingPortalName(branding, locale, tCommon('appName'));
  const company = brandingCompanyName(branding, locale) || portalName || t('theOrganization');
  const row = result && result !== 'error' ? result : null;
  const state: 'valid' | 'revoked' | 'notFound' | 'error' =
    result === 'error' ? 'error' : !row ? 'notFound' : row.status === 'revoked' ? 'revoked' : 'valid';

  const typeKey = row?.certificate_type ?? '';
  const typeLabel = row
    ? (tEnums as unknown as { has: (k: string) => boolean }).has(`certificateType.${typeKey}`)
      ? tEnums(`certificateType.${typeKey}` as 'certificateType.salary')
      : typeKey
    : '';

  const hero = {
    valid: { icon: ShieldCheckIcon, tone: 'bg-success-soft text-success ring-success/20', title: t('validTitle'), description: t('validDescription', { company }) },
    revoked: { icon: ShieldXIcon, tone: 'bg-danger-soft text-danger ring-danger/20', title: t('revokedTitle'), description: t('revokedDescription', { company }) },
    notFound: { icon: SearchXIcon, tone: 'bg-muted text-muted-foreground ring-border', title: t('notFoundTitle'), description: t('notFoundDescription') },
    error: { icon: SearchXIcon, tone: 'bg-warning-soft text-warning ring-warning/20', title: tCommon('states.errorTitle'), description: tCommon('states.errorDescription') },
  }[state];
  const HeroIcon = hero.icon;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark name={portalName} logoUrl={branding.logoUrl} size="sm" />
          <span className="truncate text-sm font-semibold">{portalName}</span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitch variant="label" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-8 sm:py-12">
        <section
          aria-labelledby="verify-title"
          className="overflow-hidden rounded-xl border border-border bg-card shadow-card"
          data-state={state}
        >
          <div
            className={cn(
              'h-1 w-full',
              state === 'valid' ? 'bg-success' : state === 'revoked' ? 'bg-danger' : state === 'error' ? 'bg-warning' : 'bg-border-strong',
            )}
          />
          <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-6 text-center">
            <span className={cn('flex size-14 items-center justify-center rounded-2xl ring-1 ring-inset', hero.tone)}>
              <HeroIcon className="size-7" aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h1 id="verify-title" className="text-page-title">
                {hero.title}
              </h1>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">{hero.description}</p>
            </div>
          </div>

          {row ? (
            <dl className="divide-y divide-border border-t border-border">
              <DetailRow label={t('fields.number')}>
                <bdi dir="ltr" className="numeric font-semibold tracking-wide">
                  {row.certificate_number}
                </bdi>
              </DetailRow>
              <DetailRow label={t('fields.employee')}>
                <span className="font-medium">{row.employee_name || '—'}</span>
              </DetailRow>
              <DetailRow label={t('fields.type')}>{typeLabel}</DetailRow>
              <DetailRow label={t('fields.issueDate')}>
                <span className="numeric">{formatDate(row.issue_date, locale, 'long')}</span>
                <span className="block text-meta text-muted-foreground">{formatHijri(row.issue_date, locale)}</span>
              </DetailRow>
              <DetailRow label={t('fields.status')}>
                <StatusBadge domain="certificate" status={row.status} />
              </DetailRow>
            </dl>
          ) : (
            <div className="border-t border-border px-6 py-4 text-center">
              <bdi dir="ltr" className="numeric text-sm font-medium text-muted-foreground">
                {number || '—'}
              </bdi>
            </div>
          )}

          <div className="flex items-start gap-2 border-t border-border bg-subtle px-6 py-3 text-meta text-muted-foreground">
            <LockKeyholeIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <p>{t('privacyNote')}</p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="mb-3 text-card-title">{t('lookup.title')}</h2>
          <VerifyLookup defaultValue={state === 'notFound' ? number : ''} />
        </section>

        <footer className="mt-auto flex flex-col items-center gap-1 pt-2 text-center text-meta text-faint-foreground">
          <p>{t('checkedAt', { date: formatDateTime(new Date(), locale) })}</p>
          <p>
            {t('poweredBy', { portal: portalName })}
            {' · '}
            <Link href="/login" className="font-medium text-muted-foreground hover:text-primary hover:underline">
              {t('backToPortal')}
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-6 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-meta font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}
