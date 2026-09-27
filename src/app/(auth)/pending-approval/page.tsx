import { CheckIcon, HourglassIcon, MessageCircleQuestionIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthHeading } from '@/features/auth/components/auth-heading';
import { RegistrationDetailsForm } from '@/features/auth/components/registration-details-form';
import { RefreshStatusButton, SignOutButton } from '@/features/auth/components/status-actions';
import { requireUser } from '@/lib/auth/guards';
import { getPublicBranding } from '@/lib/branding';
import { formatDate } from '@/lib/dates';
import { pageMetadata } from '@/lib/metadata';
import { cn } from '@/lib/utils';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('auth.pending.title');

/** Account awaiting HR approval (status `pending` / `info_requested`). */
export default async function PendingApprovalPage() {
  const ctx = await requireUser();
  const { status } = ctx.profile;
  if (status === 'active') redirect('/dashboard');
  if (status === 'disabled' || status === 'rejected') redirect('/account-disabled');

  const [t, branding] = await Promise.all([getTranslations('auth.pending'), getPublicBranding()]);
  const infoRequested = status === 'info_requested';
  const steps = [
    { key: 'registered', label: t('steps.registered'), state: 'done' as const, meta: ctx.profile.createdAt ? formatDate(ctx.profile.createdAt, ctx.locale) : null },
    { key: 'review', label: t('steps.review'), state: 'current' as const, meta: null },
    { key: 'access', label: t('steps.access'), state: 'upcoming' as const, meta: null },
  ];

  return (
    <div>
      <AuthHeading
        icon={infoRequested ? MessageCircleQuestionIcon : HourglassIcon}
        tone="warning"
        title={infoRequested ? t('infoRequestedTitle') : t('title')}
        description={infoRequested ? t('infoRequestedDescription') : t('description')}
      />

      {infoRequested ? (
        <Alert variant="warning" className="mb-5">
          <MessageCircleQuestionIcon />
          <AlertTitle>{t('hrNote')}</AlertTitle>
          <AlertDescription>
            <p className="whitespace-pre-line">{ctx.profile.reviewNote || t('noNote')}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0 truncate text-meta text-muted-foreground">{t('signedInAs', { email: ctx.user.email ?? '' })}</div>
          <StatusBadge domain="profile" status={status} />
        </div>
        <ol className="mt-4 flex flex-col gap-0">
          {steps.map((step, i) => (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 ? (
                <span aria-hidden className={cn('absolute top-7 bottom-0 start-[0.8125rem] w-px', step.state === 'done' ? 'bg-success/40' : 'bg-border')} />
              ) : null}
              <span
                className={cn(
                  'relative flex size-[1.625rem] shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  step.state === 'done' && 'bg-success text-success-foreground',
                  step.state === 'current' && 'bg-warning-soft text-warning ring-2 ring-warning/30',
                  step.state === 'upcoming' && 'bg-muted text-muted-foreground',
                )}
              >
                {step.state === 'done' ? <CheckIcon className="size-3.5" strokeWidth={3} /> : <span className="numeric">{i + 1}</span>}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className={cn('text-sm font-medium', step.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>{step.label}</div>
                {step.meta ? <div className="numeric text-xs text-muted-foreground">{step.meta}</div> : null}
              </div>
            </li>
          ))}
        </ol>
        {ctx.profile.registrationEmployeeNumber ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-subtle px-3 py-2 text-meta">
            <span className="text-muted-foreground">{t('employeeNumber')}</span>
            <bdi className="numeric font-medium">{ctx.profile.registrationEmployeeNumber}</bdi>
          </div>
        ) : null}
      </div>

      <RegistrationDetailsForm
        infoRequested={infoRequested}
        defaults={{
          fullName: ctx.profile.fullName ?? '',
          employeeNumber: ctx.profile.registrationEmployeeNumber ?? '',
          mobile: ctx.profile.mobile ?? '',
          note: ctx.profile.registrationNote ?? '',
        }}
      />

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <RefreshStatusButton className="flex-1" />
        <SignOutButton className="flex-1" />
      </div>

      {branding.hrEmail ? (
        <p className="mt-5 text-center text-meta text-muted-foreground">
          {t.rich('contactHr', {
            email: branding.hrEmail,
            link: (chunks) => (
              <a href={`mailto:${branding.hrEmail}`} className="font-medium text-primary hover:underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      ) : null}
    </div>
  );
}
