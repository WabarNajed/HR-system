'use client';

import { CheckCircle2Icon, DownloadIcon, LockIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ImportType } from '../../lib/types';
import { templateHref, TYPE_GROUPS, TYPE_ICONS } from '../type-meta';

export function StepType({
  allowed,
  selected,
  focusGroup,
  onSelect,
}: {
  allowed: readonly ImportType[];
  selected: ImportType | null;
  focusGroup?: 'master' | null;
  onSelect: (type: ImportType) => void;
}) {
  const t = useTranslations('dataManagement');
  const groups = focusGroup === 'master' ? [...TYPE_GROUPS].sort((a) => (a.key === 'masterData' ? -1 : 0)) : TYPE_GROUPS;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-section-title text-foreground">{t('wizard.type.title')}</h2>
        <p className="mt-1 text-meta text-muted-foreground">{t('wizard.type.description')}</p>
      </div>
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`groups.${group.key}`)}</h3>
          <div className={cn('grid grid-cols-1 gap-2.5 sm:grid-cols-2', group.types.length > 2 && 'xl:grid-cols-3')}>
            {group.types.map((type) => {
              const Icon = TYPE_ICONS[type];
              const can = allowed.includes(type);
              const active = selected === type;
              const card = (
                <div
                  className={cn(
                    'group relative flex h-full min-w-0 items-start gap-3 rounded-lg border bg-card p-3.5 pe-11 text-start shadow-xs transition-[border-color,box-shadow,background-color]',
                    active ? 'border-primary bg-primary-soft/40 ring-1 ring-primary' : 'border-border',
                    can ? 'hover:border-border-strong hover:shadow-raised' : 'opacity-60',
                  )}
                >
                  <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-primary-soft text-primary')}>
                    <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">{t(`types.${type}.title`)}</span>
                      {active ? <CheckCircle2Icon className="size-4 shrink-0 text-primary" aria-label={t('wizard.type.selected')} /> : null}
                      {!can ? <LockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-meta text-muted-foreground">{t(`types.${type}.description`)}</span>
                  </span>
                </div>
              );
              return (
                <div key={type} className="relative" data-import-type={type}>
                  {can ? (
                    <button type="button" onClick={() => onSelect(type)} className="block h-full w-full rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-pressed={active}>
                      {card}
                    </button>
                  ) : (
                    <SimpleTooltip content={t('wizard.type.noPermission')}>
                      <div tabIndex={0} className="h-full cursor-not-allowed rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-disabled>
                        {card}
                      </div>
                    </SimpleTooltip>
                  )}
                  <SimpleTooltip content={t('wizard.upload.downloadTemplate', { type: t(`types.${type}.title`) })}>
                    <a
                      href={templateHref(type)}
                      download
                      className="absolute end-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                      aria-label={t('wizard.upload.downloadTemplate', { type: t(`types.${type}.title`) })}
                    >
                      <DownloadIcon className="size-4" />
                    </a>
                  </SimpleTooltip>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
