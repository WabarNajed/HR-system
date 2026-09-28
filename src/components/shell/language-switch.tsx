'use client';

import { LanguagesIcon, Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { safeAction } from '@/components/shared/safe-action';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { setLocale } from '@/lib/i18n/actions';
import { localeNames, localeShortNames, otherLocale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';

/** Hook: switches to the other UI language (cookie + profile preference) and re-renders. */
export function useLanguageSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = useTranslations('errors');
  const target = otherLocale(locale);
  const switchLanguage = () =>
    startTransition(async () => {
      const res = await safeAction(() => setLocale(target));
      if (!res.ok) {
        // Transport failures carry an `errors.*` key (offline, network, stale…); a refused locale is generic.
        const key = 'error' in res ? res.error : 'errors.generic';
        toast.error(t(key.slice('errors.'.length) as 'generic'));
        return;
      }
      router.refresh();
    });
  return { locale, target, pending, switchLanguage, targetName: localeNames[target] };
}

export type LanguageSwitchProps = {
  /** `icon`: square icon button · `label`: icon + target language name (auth pages). */
  variant?: 'icon' | 'label';
  className?: string;
};

/** AR ⇄ EN toggle. Shows the language you will switch TO (in its own script). */
export function LanguageSwitch({ variant = 'icon', className }: LanguageSwitchProps) {
  const t = useTranslations('nav.header');
  const { target, pending, switchLanguage, targetName } = useLanguageSwitch();

  if (variant === 'label') {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn('gap-1.5 text-muted-foreground hover:text-foreground', className)}
        onClick={switchLanguage}
        disabled={pending}
        aria-label={t('switchLanguage')}
        data-testid="language-switch"
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <LanguagesIcon />}
        <span lang={target}>{targetName}</span>
      </Button>
    );
  }

  return (
    <SimpleTooltip content={t('switchLanguage')}>
      <Button
        variant="ghost"
        size="icon"
        className={cn('text-muted-foreground hover:text-foreground', className)}
        onClick={switchLanguage}
        disabled={pending}
        aria-label={t('switchLanguage')}
        data-testid="language-switch"
      >
        {pending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <span lang={target} className={cn('leading-none font-semibold', target === 'ar' ? 'text-base' : 'text-[0.8125rem]')}>
            {localeShortNames[target]}
          </span>
        )}
      </Button>
    </SimpleTooltip>
  );
}
