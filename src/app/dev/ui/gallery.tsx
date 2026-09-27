'use client';

import { FlaskConicalIcon, LanguagesIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { setLocale } from '@/lib/i18n/actions';
import { useDevLabel } from './dev-label';
import { ButtonsSection, FeedbackSection, KpiSection } from './sections-basics';
import { BrandSection } from './sections-brand';
import { DisplaySection } from './sections-display';
import { FormsSection } from './sections-forms';
import { OverlaysSection } from './sections-overlays';
import { TableSection } from './sections-table';

export function Gallery() {
  const t = useTranslations('common');
  const L = useDevLabel();
  const locale = useLocale();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();

  const sections = [
    ['kpis', L('المؤشرات', 'KPIs')],
    ['buttons', L('الأزرار والشارات', 'Buttons & badges')],
    ['forms', L('النماذج', 'Forms')],
    ['table', L('جدول البيانات', 'Data table')],
    ['overlays', L('النوافذ والقوائم', 'Overlays & menus')],
    ['display', L('عرض البيانات', 'Data display')],
    ['feedback', L('الحالات والتنبيهات', 'States & feedback')],
    ['brand', L('الهوية', 'Branding')],
  ] as const;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-md md:px-6">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <FlaskConicalIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t('dev.galleryTitle')}</p>
        </div>
        <Badge variant="warning" size="sm" className="hidden sm:inline-flex">
          {t('dev.sampleData')}
        </Badge>
        <nav className="scrollbar-none ms-4 hidden flex-1 items-center gap-1 overflow-x-auto lg:flex">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-md px-2.5 py-1.5 text-meta whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                await setLocale(locale === 'ar' ? 'en' : 'ar');
                router.refresh();
              })
            }
          >
            {!pending ? <LanguagesIcon /> : null}
            {locale === 'ar' ? 'English' : 'العربية'}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('theme')}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {/* CSS-driven icon swap avoids a hydration mismatch (theme is unknown on the server). */}
            <SunIcon className="hidden dark:block" />
            <MoonIcon className="dark:hidden" />
          </Button>
        </div>
      </header>

      <main className="page-padding mx-auto flex w-full max-w-[90rem] flex-col gap-10 pb-24">
        <KpiSection />
        <ButtonsSection />
        <FormsSection />
        <TableSection />
        <OverlaysSection />
        <DisplaySection />
        <FeedbackSection />
        <BrandSection />
      </main>
    </div>
  );
}
