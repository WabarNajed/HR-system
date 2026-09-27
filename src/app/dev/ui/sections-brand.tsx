'use client';

import { CalendarDaysIcon, ClipboardListIcon, LayoutDashboardIcon, SettingsIcon, UsersIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ColorPicker } from '@/components/shared/color-picker';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { brandCssVariables, cn } from '@/lib/utils';
import { GallerySection, useDevLabel } from './dev-label';

/** Runtime branding preview: writes the same CSS variables the root layout injects. */
export function BrandSection() {
  const t = useTranslations();
  const L = useDevLabel();
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);

  const apply = (p: string | null, s: string | null) => {
    const root = document.documentElement;
    for (const key of Object.keys(brandCssVariables({ primary: '#000000', secondary: '#000000' }))) root.style.removeProperty(key);
    for (const [k, v] of Object.entries(brandCssVariables({ primary: p, secondary: s }))) root.style.setProperty(k, v);
  };

  const items = [
    { icon: LayoutDashboardIcon, label: t('nav.items.dashboard'), active: true },
    { icon: UsersIcon, label: t('nav.items.employees') },
    { icon: ClipboardListIcon, label: t('nav.items.requests'), count: 12 },
    { icon: CalendarDaysIcon, label: t('nav.items.leave') },
    { icon: SettingsIcon, label: t('nav.items.settings') },
  ];

  return (
    <GallerySection id="brand" title={L('الهوية والقائمة الجانبية', 'Branding & sidebar tokens')}>
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav className="flex flex-col gap-0.5 rounded-lg bg-sidebar p-3 text-sidebar-foreground shadow-card">
          <p className="px-2.5 pt-1 pb-2 text-[0.6875rem] font-semibold tracking-wide text-sidebar-muted-foreground uppercase">
            {t('nav.groups.operations')}
          </p>
          {items.map(({ icon: Icon, label, active, count }) => (
            <a
              key={label}
              href="#brand"
              className={cn(
                'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                active && 'bg-sidebar-primary font-medium text-sidebar-primary-foreground',
              )}
            >
              {active ? <span className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-sidebar-indicator" /> : null}
              <Icon className="size-4 opacity-90" />
              <span className="flex-1 truncate">{label}</span>
              {count ? <span className="rounded-full bg-sidebar-accent px-1.5 text-[0.6875rem] font-semibold numeric">{count}</span> : null}
            </a>
          ))}
        </nav>
        <SectionCard title={L('ألوان العلامة (وقت التشغيل)', 'Runtime brand colors')} description={t('nav.settings.descriptions.branding')}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{L('اللون الأساسي', 'Primary color')}</Label>
              <ColorPicker
                value={primary}
                onChange={(v) => {
                  setPrimary(v);
                  apply(v, secondary);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{L('اللون الثانوي', 'Secondary color')}</Label>
              <ColorPicker
                value={secondary}
                onChange={(v) => {
                  setSecondary(v);
                  apply(primary, v);
                }}
              />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button>{t('common.save')}</Button>
            <Button variant="soft">{t('common.preview')}</Button>
            <Badge>{t('common.new')}</Badge>
            <Badge variant="secondary">{t('statuses.request.returned')}</Badge>
            <Button
              variant="ghost"
              onClick={() => {
                setPrimary(null);
                setSecondary(null);
                apply(null, null);
              }}
            >
              {t('common.reset')}
            </Button>
          </div>
        </SectionCard>
      </div>
    </GallerySection>
  );
}
