'use client';

import { CheckIcon, LanguagesIcon, MonitorIcon, MoonIcon, PaletteIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/features/users/components/use-action-feedback';
import { localeShortNames } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { savePreferencesAction } from '../actions';

type Language = 'ar' | 'en';
type Theme = 'light' | 'dark' | 'system';

function OptionCard({
  selected,
  onSelect,
  icon,
  title,
  hint,
  disabled,
  lang,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  hint?: string;
  disabled?: boolean;
  lang?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'relative flex items-center gap-3 rounded-lg border px-3.5 py-3 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60',
        selected ? 'border-primary bg-primary-soft/50 ring-1 ring-primary' : 'border-border bg-card hover:border-border-strong hover:bg-subtle',
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span lang={lang} className="block text-sm font-medium text-foreground">
          {title}
        </span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {selected ? <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden /> : null}
    </button>
  );
}

/** Language + theme, saved to the profile (and the language cookie / local theme). */
export function PreferencesForm({ language, theme }: { language: Language; theme: Theme }) {
  const t = useTranslations('profile.preferences');
  const tc = useTranslations('common');
  const tn = useTranslations('nav.header');
  const { setTheme } = useTheme();
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [lang, setLang] = useState<Language>(language);
  const [mode, setMode] = useState<Theme>(theme);
  const dirty = lang !== language || mode !== theme;

  const save = () =>
    startTransition(async () => {
      const result = await run(savePreferencesAction({ language: lang, theme: mode }));
      if (result.ok) setTheme(mode);
    });

  return (
    <SectionCard
      title={t('title')}
      description={t('description')}
      icon={<PaletteIcon />}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || pending}
            onClick={() => {
              setLang(language);
              setMode(theme);
            }}
          >
            {tc('cancel')}
          </Button>
          <Button size="sm" onClick={save} loading={pending} disabled={!dirty} className="min-w-24">
            {pending ? tc('saving') : tc('saveChanges')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <fieldset>
          <legend className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
            <LanguagesIcon className="size-4 text-muted-foreground" aria-hidden />
            {t('language')}
          </legend>
          <p className="mb-3 text-meta text-muted-foreground">{t('languageHint')}</p>
          <div role="radiogroup" aria-label={t('language')} className="grid gap-2.5 sm:grid-cols-2">
            <OptionCard
              selected={lang === 'ar'}
              onSelect={() => setLang('ar')}
              icon={<span className="text-sm font-semibold">{localeShortNames.ar}</span>}
              title={tn('switchToArabic')}
              hint={tc('arabic')}
              lang="ar"
              disabled={pending}
            />
            <OptionCard
              selected={lang === 'en'}
              onSelect={() => setLang('en')}
              icon={<span className="text-sm font-semibold">{localeShortNames.en}</span>}
              title={tn('switchToEnglish')}
              hint={tc('english')}
              lang="en"
              disabled={pending}
            />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
            <SunIcon className="size-4 text-muted-foreground" aria-hidden />
            {t('theme')}
          </legend>
          <p className="mb-3 text-meta text-muted-foreground">{t('themeHint')}</p>
          <div role="radiogroup" aria-label={t('theme')} className="grid gap-2.5 sm:grid-cols-3">
            <OptionCard selected={mode === 'light'} onSelect={() => setMode('light')} icon={<SunIcon className="size-4" />} title={t('themes.light')} disabled={pending} />
            <OptionCard selected={mode === 'dark'} onSelect={() => setMode('dark')} icon={<MoonIcon className="size-4" />} title={t('themes.dark')} disabled={pending} />
            <OptionCard
              selected={mode === 'system'}
              onSelect={() => setMode('system')}
              icon={<MonitorIcon className="size-4" />}
              title={t('themes.system')}
              hint={t('themes.systemHint')}
              disabled={pending}
            />
          </div>
        </fieldset>
      </div>
    </SectionCard>
  );
}
