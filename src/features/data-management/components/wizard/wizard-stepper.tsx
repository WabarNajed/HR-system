'use client';

import { CheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export const WIZARD_STEPS = ['type', 'upload', 'sheet', 'mapping', 'review', 'run'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Horizontal step indicator (desktop) / compact "Step n of 6" bar (mobile). */
export function WizardStepper({ step, onJump, reachable }: { step: WizardStep; onJump?: (step: WizardStep) => void; reachable: (step: WizardStep) => boolean }) {
  const t = useTranslations('dataManagement.wizard');
  const current = WIZARD_STEPS.indexOf(step);
  return (
    <nav aria-label={t('title')} className="rounded-lg border border-border bg-card shadow-card">
      <ol className="hidden items-center gap-1 px-2 py-2 md:flex">
        {WIZARD_STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const canJump = Boolean(onJump) && !active && reachable(s);
          const body = (
            <>
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold numeric ring-1 ring-inset',
                  active && 'bg-primary text-primary-foreground ring-primary',
                  done && 'bg-primary-soft text-primary ring-primary/20',
                  !active && !done && 'bg-muted text-muted-foreground ring-border',
                )}
              >
                {done ? <CheckIcon className="size-3.5" strokeWidth={2.5} aria-hidden /> : i + 1}
              </span>
              <span className={cn('truncate text-sm', active ? 'font-semibold text-foreground' : done ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {t(`steps.${s}`)}
              </span>
            </>
          );
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1" aria-current={active ? 'step' : undefined}>
              {canJump ? (
                <button
                  type="button"
                  onClick={() => onJump?.(s)}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  {body}
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2 px-2 py-1.5">{body}</span>
              )}
              {i < WIZARD_STEPS.length - 1 ? <span aria-hidden className={cn('h-px min-w-3 flex-1', i < current ? 'bg-primary/40' : 'bg-border')} /> : null}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-2 px-4 py-3 md:hidden">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-foreground">{t(`steps.${step}`)}</span>
          <span className="text-meta text-muted-foreground numeric">{t('stepOf', { current: current + 1, total: WIZARD_STEPS.length })}</span>
        </div>
        <Progress value={((current + 1) / WIZARD_STEPS.length) * 100} className="h-1.5" />
      </div>
    </nav>
  );
}
