'use client';

import { FlagIcon, SendIcon, ShieldCheckIcon, UserCheckIcon, UsersIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import type { ApprovalPathStep } from '../types';

const STEP_ICON = { manager: UserCheckIcon, hr: ShieldCheckIcon, role: UsersIcon, user: UserCheckIcon } as const;

/** Approval path preview: Submission → workflow steps → Completion (wizard summary). */
export function ApprovalPath({ steps, managerName }: { steps: ApprovalPathStep[]; managerName?: string | null }) {
  const t = useTranslations('requests.path');
  const ts = useTranslations('enums.stepType');
  const locale = useLocale() as Locale;
  const nodes = [
    { key: 'submit', icon: SendIcon, title: t('submission'), hint: t('submissionHint'), tone: 'primary' as const },
    ...steps.map((s) => ({
      key: `s${s.order}`,
      icon: STEP_ICON[s.type as keyof typeof STEP_ICON] ?? UsersIcon,
      title: localized({ name_ar: s.name_ar, name_en: s.name_en }, 'name', locale),
      hint: s.type === 'manager' ? (managerName ? managerName : t('noManager')) : ts.has(s.type as never) ? ts(s.type as never) : s.type,
      tone: 'neutral' as const,
    })),
    { key: 'done', icon: FlagIcon, title: t('completion'), hint: t('completionHint'), tone: 'success' as const },
  ];
  return (
    <ol className="flex flex-col">
      {nodes.map((n, i) => {
        const Icon = n.icon;
        const last = i === nodes.length - 1;
        return (
          <li key={n.key} className={cn('relative flex gap-2.5', !last && 'pb-3')}>
            {!last ? <span aria-hidden className="absolute start-[0.8125rem] top-7 bottom-0 w-px bg-border" /> : null}
            <span
              className={cn(
                'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
                n.tone === 'primary' && 'bg-primary-soft text-primary',
                n.tone === 'success' && 'bg-success-soft text-success',
                n.tone === 'neutral' && 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="truncate text-meta font-medium text-foreground">{n.title}</p>
              <p className="truncate text-xs text-muted-foreground">{n.hint}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
