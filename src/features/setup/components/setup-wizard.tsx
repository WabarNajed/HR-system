'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BellRingIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarRangeIcon,
  CheckIcon,
  ClipboardListIcon,
  FlagIcon,
  GitBranchIcon,
  MapPinIcon,
  NetworkIcon,
  PaletteIcon,
  PartyPopperIcon,
  UploadIcon,
  UserCogIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { formatPercent } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import { completeSetup } from '../actions';
import type { SetupData } from '../queries';
import { REQUIRED_STEPS, SETUP_STEPS, STEP_LINKS, type SetupStep } from '../steps';
import { StepPanel, type StepPermissions } from './step-panels';

const STEP_ICONS: Record<SetupStep, LucideIcon> = {
  organization: Building2Icon,
  branding: PaletteIcon,
  departments: NetworkIcon,
  jobTitles: BriefcaseIcon,
  locations: MapPinIcon,
  leaveTypes: CalendarRangeIcon,
  requestTypes: ClipboardListIcon,
  workflows: GitBranchIcon,
  hrAdmin: UserCogIcon,
  email: BellRingIcon,
  employeeImport: UploadIcon,
};

type Props = { step: SetupStep; data: SetupData; perms: StepPermissions };

/** Resumable setup wizard: progress rail · current step (inline form or summary + deep link) · Back / Skip / Next · Finish. */
export function SetupWizard({ step, data, perms }: Props) {
  const t = useTranslations('setup');
  const tc = useTranslations('common');
  const df = useDateFormat();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const resolve = useErrorMessage();
  const [finishing, startFinishing] = useTransition();
  const [confirmFinish, setConfirmFinish] = useState(false);
  const railRef = useRef<HTMLOListElement>(null);

  // Phones show the steps as a horizontal rail: keep the current step in view.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    rail.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [step]);

  const index = SETUP_STEPS.indexOf(step);
  const done = SETUP_STEPS.filter((s) => data.completion[s]).length;
  const prev = index > 0 ? SETUP_STEPS[index - 1] : null;
  const next = index < SETUP_STEPS.length - 1 ? SETUP_STEPS[index + 1] : null;
  const complete = data.completion[step];
  const missingRequired = SETUP_STEPS.filter((s) => REQUIRED_STEPS.has(s) && !data.completion[s]);
  const Icon = STEP_ICONS[step];

  const finish = () =>
    startFinishing(async () => {
      const result = await completeSetup({ confirm: true });
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      router.push('/dashboard');
    });

  const status = (s: SetupStep) => (data.completion[s] ? t('status.done') : REQUIRED_STEPS.has(s) ? t('status.required') : t('status.recommended'));
  const count = data.counts[step];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          data.completedAt ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard">{t('backToDashboard')}</Link>
            </Button>
          ) : (
            <Button onClick={() => (missingRequired.length ? setConfirmFinish(true) : finish())} loading={finishing}>
              <FlagIcon />
              {t('finish')}
            </Button>
          )
        }
      />

      {data.completedAt ? (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft/60 px-4 py-3 text-sm text-success-soft-foreground">
          <PartyPopperIcon className="size-4.5 shrink-0" aria-hidden />
          {t('completedOn', { date: df.date(data.completedAt) })}
        </div>
      ) : null}

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label={t('stepsLabel')} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-card lg:sticky lg:top-4">
          <div className="px-1.5 pt-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{t('progress', { done, total: SETUP_STEPS.length })}</span>
              <span className="numeric text-xs text-muted-foreground">{formatPercent(done / SETUP_STEPS.length, locale, { fractionDigits: 0 })}</span>
            </div>
            <Progress value={(done / SETUP_STEPS.length) * 100} tone="success" className="mt-2 h-1.5" aria-label={t('progress', { done, total: SETUP_STEPS.length })} />
          </div>
          <ol ref={railRef} className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {SETUP_STEPS.map((s, i) => {
              const current = s === step;
              const ok = data.completion[s];
              return (
                <li key={s} className="shrink-0 lg:shrink">
                  <Link
                    href={`/setup?step=${s}`}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      current ? 'bg-primary-soft' : 'hover:bg-accent',
                    )}
                  >
                    <span
                      className={cn(
                        'numeric flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        ok ? 'bg-success text-white' : current ? 'bg-primary text-primary-foreground' : 'border border-border-strong text-muted-foreground',
                      )}
                    >
                      {ok ? <CheckIcon className="size-3.5" aria-hidden /> : i + 1}
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className={cn('block truncate text-[0.8125rem] whitespace-nowrap', current ? 'font-semibold text-primary-soft-foreground' : 'font-medium text-foreground')}>
                        {t(`steps.${s}.title`)}
                      </span>
                      <span className={cn('hidden text-[0.6875rem] lg:block', ok ? 'text-success' : REQUIRED_STEPS.has(s) ? 'text-warning' : 'text-muted-foreground')}>{status(s)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-labelledby="setup-step-title" className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-card">
          <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{t('stepOf', { n: index + 1, total: SETUP_STEPS.length })}</p>
                <h2 id="setup-step-title" className="mt-0.5 flex flex-wrap items-center gap-2 text-section-title font-semibold text-foreground">
                  {t(`steps.${step}.title`)}
                  <Badge variant={complete ? 'success' : REQUIRED_STEPS.has(step) ? 'warning' : 'neutral'} size="sm" dot>
                    {status(step)}
                  </Badge>
                </h2>
                <p className="mt-1 text-meta text-muted-foreground">{t(`steps.${step}.description`)}</p>
                {count !== undefined ? <p className="mt-1 text-xs text-muted-foreground">{t(`counts.${step as 'departments'}`, { count })}</p> : null}
              </div>
            </div>
            <Button variant="outline" size="sm" asChild className="shrink-0 self-start">
              <Link href={STEP_LINKS[step]}>
                {t('openFullPage')}
                <ArrowUpRightIcon className="flip-rtl" />
              </Link>
            </Button>
          </header>

          <div className="p-4 sm:p-5">
            <StepPanel step={step} data={data} perms={perms} />
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-subtle/50 px-4 py-3 sm:px-5">
            {prev ? (
              <Button variant="outline" asChild>
                <Link href={`/setup?step=${prev}`}>
                  <ArrowLeftIcon className="rtl:rotate-180" />
                  {tc('back')}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {next ? (
                <>
                  {!complete ? (
                    <Button variant="ghost" asChild>
                      <Link href={`/setup?step=${next}`}>{t('skip')}</Link>
                    </Button>
                  ) : null}
                  <Button asChild variant={complete ? 'default' : 'outline'}>
                    <Link href={`/setup?step=${next}`}>
                      {tc('next')}
                      <ArrowRightIcon className="rtl:rotate-180" />
                    </Link>
                  </Button>
                </>
              ) : data.completedAt ? (
                <Button asChild>
                  <Link href="/dashboard">{t('backToDashboard')}</Link>
                </Button>
              ) : (
                <Button onClick={() => (missingRequired.length ? setConfirmFinish(true) : finish())} loading={finishing}>
                  <FlagIcon />
                  {t('finish')}
                </Button>
              )}
            </div>
          </footer>
        </section>
      </div>

      <ConfirmDialog
        open={confirmFinish}
        onOpenChange={setConfirmFinish}
        title={t('finishTitle')}
        description={t('finishIncomplete', { steps: missingRequired.map((s) => t(`steps.${s}.title`)).join(locale === 'ar' ? '، ' : ', ') })}
        confirmLabel={t('finishAnyway')}
        onConfirm={() => {
          setConfirmFinish(false);
          finish();
        }}
      />
    </div>
  );
}
