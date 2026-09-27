'use client';

import {
  BellIcon,
  CalendarDaysIcon,
  CheckCheckIcon,
  InboxIcon,
  LayoutDashboardIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersIcon,
  WorkflowIcon,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/config';

/** Labels for the preview in one language (built on the server for both languages). */
export type PreviewStrings = {
  dashboard: string;
  employees: string;
  requests: string;
  approvals: string;
  leave: string;
  search: string;
  newRequest: string;
  approve: string;
  return: string;
  approved: string;
  pending: string;
  viewAll: string;
  recent: string;
  signInTitle: string;
  signInSubtitle: string;
  email: string;
  password: string;
  signIn: string;
  forgot: string;
  defaultLoginTitle: string;
  defaultLoginSubtitle: string;
  secure: string;
  highlightRequests: string;
  highlightLeave: string;
  letterSubject: string;
  letterDate: string;
  letterRef: string;
  signatory: string;
  signature: string;
  stamp: string;
  cr: string;
  vat: string;
};

export type PreviewData = {
  locale: Locale;
  strings: PreviewStrings;
  portalName: string;
  companyName: string | null;
  companyOtherName: string | null;
  logoUrl: string | null;
  loginImageUrl: string | null;
  loginTitle: string | null;
  loginSubtitle: string | null;
  stampUrl: string | null;
  signatureUrl: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  commercialRegistration: string | null;
  vatNumber: string | null;
  address: string | null;
  contactLine: string | null;
};

function Mark({ name, logoUrl, onDark = false, className }: { name: string; logoUrl: string | null; onDark?: boolean; className?: string }) {
  if (logoUrl) {
    return (
      <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md p-0.5', onDark ? 'bg-white/95' : 'bg-card ring-1 ring-border', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- branding preview */}
        <img src={logoUrl} alt="" className="size-full object-contain" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md text-[0.625rem] font-bold',
        onDark ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      {getInitials(name, 1) || '•'}
    </span>
  );
}

const bar = 'rounded-full bg-muted';

/** Mini application shell (sidebar, header, KPI tiles, buttons, badges) in the edited colours. */
export function ShellPreview({ data }: { data: PreviewData }) {
  const s = data.strings;
  const nav = [
    { icon: LayoutDashboardIcon, label: s.dashboard, active: true },
    { icon: UsersIcon, label: s.employees },
    { icon: InboxIcon, label: s.requests },
    { icon: CheckCheckIcon, label: s.approvals },
    { icon: CalendarDaysIcon, label: s.leave },
  ];
  return (
    <div className="flex h-[21rem] overflow-hidden rounded-lg border border-border bg-background text-[0.6875rem] shadow-xs">
      <aside className="flex w-[7.5rem] shrink-0 flex-col gap-3 bg-sidebar px-2 py-3 text-sidebar-foreground">
        <div className="flex min-w-0 items-center gap-1.5 px-1">
          <Mark name={data.portalName} logoUrl={data.logoUrl} onDark className="size-5" />
          <span className="truncate text-[0.6875rem] font-semibold text-white">{data.portalName}</span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {nav.map(({ icon: Icon, label, active }) => (
            <li
              key={label}
              className={cn(
                'relative flex items-center gap-1.5 rounded px-1.5 py-1',
                active ? 'bg-sidebar-primary font-medium text-white' : 'text-sidebar-foreground/85',
              )}
            >
              {active ? <span aria-hidden className="absolute inset-y-1 start-0 w-0.5 rounded-e-full bg-sidebar-indicator" /> : null}
              <Icon className={cn('size-3 shrink-0', active ? 'text-sidebar-indicator' : '')} aria-hidden />
              <span className="truncate">{label}</span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2.5">
          <div className="flex h-5 min-w-0 flex-1 items-center gap-1 rounded border border-input px-1.5 text-muted-foreground">
            <SearchIcon className="size-2.5 shrink-0" aria-hidden />
            <span className="truncate">{s.search}</span>
          </div>
          <span className="rounded bg-primary px-1.5 py-0.5 font-medium whitespace-nowrap text-primary-foreground">{s.newRequest}</span>
          <BellIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
          <div className="text-xs font-semibold text-foreground">{s.dashboard}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { icon: UsersIcon, label: s.employees, tone: 'bg-primary-soft text-primary' },
              { icon: InboxIcon, label: s.requests, tone: 'bg-secondary-soft text-secondary-soft-foreground' },
            ].map(({ icon: Icon, label, tone }) => (
              <div key={label} className="relative flex items-center justify-between gap-1 overflow-hidden rounded-md border border-border bg-card p-2">
                <span aria-hidden className="absolute inset-y-2 start-0 w-0.5 rounded-e-full bg-primary" />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-muted-foreground">{label}</span>
                  <span className={cn(bar, 'h-2.5 w-8 bg-border-strong')} />
                </div>
                <span className={cn('flex size-5 items-center justify-center rounded', tone)}>
                  <Icon className="size-3" aria-hidden />
                </span>
              </div>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
              <span className="font-semibold text-foreground">{s.recent}</span>
              <span className="font-medium text-primary">{s.viewAll}</span>
            </div>
            {[s.approved, s.pending].map((status, i) => (
              <div key={status} className={cn('flex items-center gap-2 px-2 py-1.5', i === 0 && 'bg-primary-soft/60')}>
                <span className="size-4 shrink-0 rounded-full bg-muted" />
                <span className={cn(bar, 'h-1.5 flex-1')} />
                <span
                  className={cn(
                    'rounded px-1 py-px text-[0.5625rem] font-medium',
                    i === 0 ? 'bg-success-soft text-success-soft-foreground' : 'bg-secondary-soft text-secondary-soft-foreground',
                  )}
                >
                  {status}
                </span>
              </div>
            ))}
            <div className="mt-auto flex items-center justify-end gap-1.5 border-t border-border px-2 py-1.5">
              <span className="rounded border border-input bg-card px-1.5 py-0.5 text-foreground">{s.return}</span>
              <span className="rounded bg-primary px-1.5 py-0.5 font-medium text-primary-foreground">{s.approve}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mini sign-in page: form panel + brand panel with the sign-in image, title and subtitle. */
export function LoginPreview({ data }: { data: PreviewData }) {
  const s = data.strings;
  return (
    <div className="grid h-[21rem] grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] overflow-hidden rounded-lg border border-border bg-background text-[0.6875rem] shadow-xs">
      <div className="flex flex-col justify-center gap-2 px-3">
        <div className="text-xs font-semibold text-foreground">{s.signInTitle}</div>
        <div className="text-[0.625rem] leading-snug text-muted-foreground">{s.signInSubtitle}</div>
        {[s.email, s.password].map((label) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-[0.625rem] font-medium text-foreground">{label}</span>
            <span className="h-5 rounded border border-input bg-card" />
          </div>
        ))}
        <span className="text-[0.625rem] font-medium text-primary">{s.forgot}</span>
        <span className="rounded bg-primary py-1 text-center font-medium text-primary-foreground">{s.signIn}</span>
      </div>
      <div className="relative isolate flex flex-col overflow-hidden bg-sidebar p-3 text-sidebar-foreground">
        {data.loginImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- branding preview */}
            <img src={data.loginImageUrl} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-sidebar/80 via-sidebar/85 to-sidebar/95" />
          </>
        ) : null}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(55% 45% at 100% 0%, color-mix(in oklab, var(--secondary) 30%, transparent), transparent 70%), radial-gradient(60% 55% at 0% 100%, color-mix(in oklab, var(--primary) 55%, transparent), transparent 72%)',
          }}
        />
        <div className="flex min-w-0 items-center gap-1.5">
          <Mark name={data.portalName} logoUrl={data.logoUrl} onDark className="size-6" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-white">{data.portalName}</div>
            {data.companyName && data.companyName !== data.portalName ? (
              <div className="truncate text-[0.5625rem] text-sidebar-muted-foreground">{data.companyName}</div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <span aria-hidden className="mb-2 h-0.5 w-6 rounded-full bg-secondary" />
          <div className="line-clamp-3 text-[0.8125rem] leading-snug font-semibold text-white">{data.loginTitle || s.defaultLoginTitle}</div>
          <div className="mt-1.5 line-clamp-3 text-[0.625rem] leading-snug text-sidebar-foreground/90">{data.loginSubtitle || s.defaultLoginSubtitle}</div>
          <ul className="mt-2.5 flex flex-col gap-1">
            {[
              { icon: WorkflowIcon, text: s.highlightRequests },
              { icon: CalendarDaysIcon, text: s.highlightLeave },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-1.5 py-1">
                <Icon className="size-2.5 shrink-0 text-secondary" aria-hidden />
                <span className="truncate text-[0.5625rem]">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-1 border-t border-white/10 pt-1.5 text-[0.5625rem] text-sidebar-muted-foreground">
          <ShieldCheckIcon className="size-2.5 text-secondary" aria-hidden />
          <span className="truncate">{s.secure}</span>
        </div>
      </div>
    </div>
  );
}

/** Certificate / letter letterhead: logo, company names, registration line, signature and stamp. */
export function LetterPreview({ data }: { data: PreviewData }) {
  const s = data.strings;
  const legal = [data.commercialRegistration ? `${s.cr} ${data.commercialRegistration}` : null, data.vatNumber ? `${s.vat} ${data.vatNumber}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex justify-center rounded-lg border border-border bg-muted/60 p-3">
      <div
        data-paper
        className="relative flex aspect-[1/1.3] w-full max-w-[19rem] flex-col bg-white px-4 py-3.5 text-[0.5625rem] text-[#0f1b1f] shadow-raised"
        style={{ colorScheme: 'light' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[0.6875rem] font-bold" style={{ color: 'var(--primary)' }}>
              {data.companyName || data.portalName}
            </div>
            {data.companyOtherName ? <div className="truncate text-[0.5625rem] text-[#5b6b70]">{data.companyOtherName}</div> : null}
            {legal ? (
              <div dir="ltr" className="mt-0.5 truncate text-[0.5rem] text-[#7d8c91]">
                {legal}
              </div>
            ) : null}
          </div>
          <Mark name={data.companyName || data.portalName} logoUrl={data.logoUrl} className="size-8" />
        </div>
        <div className="mt-2 h-px w-full" style={{ backgroundColor: 'var(--primary)' }} />
        <div className="mt-px h-0.5 w-10" style={{ backgroundColor: 'var(--secondary)' }} />

        <div className="mt-2.5 flex items-center justify-between text-[0.5rem] text-[#5b6b70]">
          <span>{s.letterDate}: ————</span>
          <span>{s.letterRef}: ————</span>
        </div>
        <div className="mt-2.5 text-center text-[0.6875rem] font-semibold">{s.letterSubject}</div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-2/3'].map((w, i) => (
            <span key={i} className={cn('h-1 rounded-full bg-[#e3e8ea]', w)} />
          ))}
        </div>

        <div className="relative mt-auto flex items-end justify-between gap-2 pb-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[0.5rem] text-[#7d8c91]">{s.signatory}</span>
            <div className="flex h-8 w-20 items-center">
              {data.signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- branding preview
                <img src={data.signatureUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="w-full border-b border-dashed border-[#cfd8db] pb-0.5 text-center text-[0.5rem] text-[#9aa7ab]">{s.signature}</span>
              )}
            </div>
            <span className="truncate font-semibold">{data.signatoryName || '—'}</span>
            {data.signatoryTitle ? <span className="truncate text-[#5b6b70]">{data.signatoryTitle}</span> : null}
          </div>
          <div className="flex size-14 shrink-0 items-center justify-center">
            {data.stampUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- branding preview
              <img src={data.stampUrl} alt="" className="max-h-full max-w-full rotate-[-8deg] object-contain opacity-90" />
            ) : (
              <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-[#cfd8db] text-center text-[0.5rem] text-[#9aa7ab]">
                {s.stamp}
              </span>
            )}
          </div>
        </div>
        <div className="border-t pt-1 text-center text-[0.5rem] text-[#7d8c91]" style={{ borderColor: 'var(--primary)' }}>
          <span className="line-clamp-2">{[data.address, data.contactLine].filter(Boolean).join(' · ') || data.companyName || data.portalName}</span>
        </div>
      </div>
    </div>
  );
}
