import { CalendarCheck2Icon, FileCheck2Icon, ShieldCheckIcon, WorkflowIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BrandMark } from '@/components/shell/brand-mark';
import { cn } from '@/lib/utils';

/** Islamic-geometry-inspired 8-point star lattice (used as a CSS mask so it takes the brand tint). */
const PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Cg fill='none' stroke='%23000' stroke-width='1'%3E%3Crect x='18' y='18' width='28' height='28'/%3E%3Crect x='18' y='18' width='28' height='28' transform='rotate(45 32 32)'/%3E%3Cpath d='M0 32h6M58 32h6M32 0v6M32 58v6'/%3E%3C/g%3E%3C/svg%3E\")";

export type BrandPanelProps = {
  portalName: string;
  companyName: string | null;
  logoUrl: string | null;
  loginImageUrl: string | null;
  title: string | null;
  subtitle: string | null;
  year: number;
  className?: string;
};

/** Sign-in brand panel: org identity, login title/subtitle from Branding, patterned brand surface. */
export function BrandPanel({ portalName, companyName, logoUrl, loginImageUrl, title, subtitle, year, className }: BrandPanelProps) {
  const t = useTranslations('auth.brand');
  const highlights = [
    { icon: WorkflowIcon, text: t('highlights.requests') },
    { icon: CalendarCheck2Icon, text: t('highlights.leave') },
    { icon: FileCheck2Icon, text: t('highlights.documents') },
  ];

  return (
    <aside className={cn('relative isolate flex flex-col overflow-hidden bg-sidebar text-sidebar-foreground', className)}>
      {loginImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- public branding asset */}
          <img src={loginImageUrl} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-sidebar/80 via-sidebar/85 to-sidebar/95" />
        </>
      ) : null}
      {/* Brand glows + geometric lattice */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(55% 45% at 100% 0%, color-mix(in oklab, var(--secondary) 30%, transparent), transparent 70%), radial-gradient(60% 55% at 0% 100%, color-mix(in oklab, var(--primary) 55%, transparent), transparent 72%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-white/[0.07]"
        style={{ maskImage: PATTERN, WebkitMaskImage: PATTERN, maskSize: '64px 64px', WebkitMaskSize: '64px 64px' }}
      />
      <div aria-hidden className="absolute inset-y-0 end-0 -z-10 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

      <div className="flex items-center gap-3 px-10 pt-10 xl:px-14 xl:pt-12">
        <BrandMark name={portalName} logoUrl={logoUrl} size="lg" tone="onDark" />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-white">{portalName}</div>
          {companyName && companyName !== portalName ? <div className="truncate text-meta text-sidebar-muted-foreground">{companyName}</div> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-10 py-12 xl:px-14">
        <div className="mb-5 h-1 w-12 rounded-full bg-secondary" aria-hidden />
        <h2 className="max-w-md text-[1.875rem] leading-[1.3] font-semibold text-white xl:text-[2.125rem]">{title ?? t('defaultTitle')}</h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-sidebar-foreground/90">{subtitle ?? t('defaultSubtitle')}</p>

        <ul className="mt-10 flex max-w-md flex-col gap-3">
          {highlights.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 backdrop-blur-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary/15 text-secondary ring-1 ring-inset ring-secondary/25">
                <Icon className="size-[1.125rem]" strokeWidth={1.8} aria-hidden />
              </span>
              <span className="text-sm leading-6 text-sidebar-foreground">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] px-10 py-5 text-xs text-sidebar-muted-foreground xl:px-14">
        <span className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4 text-secondary" aria-hidden />
          {t('secure')}
        </span>
        <span className="numeric">{t('copyright', { year, name: companyName ?? portalName })}</span>
      </div>
    </aside>
  );
}
