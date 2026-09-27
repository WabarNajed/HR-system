'use client';

import { AlertTriangleIcon, InfoIcon, XCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { ImportType, Issue } from '../lib/types';
import { useIssueText } from './use-dm';

const ICONS = { error: XCircleIcon, warning: AlertTriangleIcon, info: InfoIcon } as const;
const TONES = { error: 'text-danger', warning: 'text-warning', info: 'text-info' } as const;

export function orderedIssues(errors: Issue[], warnings: Issue[]): Issue[] {
  const rank = { error: 0, warning: 1, info: 2 } as const;
  return [...errors, ...warnings].sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Row messages: errors first, then warnings and notes. `max` collapses the rest into "+N more". */
export function IssueList({
  type,
  errors,
  warnings,
  max,
  className,
  emptyLabel,
}: {
  type: ImportType;
  errors: Issue[];
  warnings: Issue[];
  max?: number;
  className?: string;
  emptyLabel?: string;
}) {
  const t = useTranslations('dataManagement.wizard.review');
  const text = useIssueText(type);
  const all = orderedIssues(errors, warnings);
  if (!all.length) return emptyLabel ? <span className="text-meta text-faint-foreground">{emptyLabel}</span> : null;
  const shown = max ? all.slice(0, max) : all;
  const rest = all.length - shown.length;
  return (
    <ul className={cn('flex min-w-0 flex-col gap-1', className)}>
      {shown.map((issue, i) => {
        const Icon = ICONS[issue.level];
        return (
          <li key={i} className="flex min-w-0 items-start gap-1.5 text-meta leading-5">
            <Icon className={cn('mt-0.5 size-3.5 shrink-0', TONES[issue.level])} aria-hidden />
            <span className={cn('min-w-0', max ? 'line-clamp-2' : '', issue.level === 'info' ? 'text-muted-foreground' : 'text-foreground')}>{text(issue)}</span>
          </li>
        );
      })}
      {rest > 0 ? <li className="ps-5 text-xs font-medium text-muted-foreground">{t('moreMessages', { count: rest })}</li> : null}
    </ul>
  );
}
