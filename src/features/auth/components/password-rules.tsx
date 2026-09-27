'use client';

import { CheckIcon, CircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { PASSWORD_CHECKS, type PasswordCheck } from '../schemas';

const ORDER: PasswordCheck[] = ['length', 'upper', 'lower', 'digit'];

/** Live password-policy checklist (≥ 8 characters, uppercase, lowercase, digit). */
export function PasswordRules({ value, className, id }: { value: string; className?: string; id?: string }) {
  const t = useTranslations('auth.password');
  const passed = ORDER.filter((k) => PASSWORD_CHECKS[k](value)).length;
  return (
    <div id={id} className={cn('flex flex-col gap-2', className)}>
      <div className="flex gap-1" aria-hidden>
        {ORDER.map((k, i) => (
          <span
            key={k}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < passed ? (passed === ORDER.length ? 'bg-success' : passed >= 2 ? 'bg-warning' : 'bg-danger') : 'bg-muted',
            )}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1" aria-label={t('rulesTitle')}>
        {ORDER.map((k) => {
          const ok = PASSWORD_CHECKS[k](value);
          return (
            <li key={k} className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-success' : 'text-muted-foreground')}>
              {ok ? <CheckIcon className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden /> : <CircleIcon className="size-3 shrink-0" aria-hidden />}
              <span>{t(`rules.${k}`)}</span>
              <span className="sr-only">{ok ? t('met') : t('notMet')}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
