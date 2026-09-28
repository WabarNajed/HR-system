'use client';

import { BanknoteIcon, Building2Icon, FileBadgeIcon, InfoIcon, PlusIcon, UserRoundIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { SearchInput } from '@/components/shared/search-input';
import { cn } from '@/lib/utils';
import { TEMPLATE_VARIABLES, VARIABLE_GROUPS, type VariableGroup } from '../../variables';

const GROUP_ICON: Record<VariableGroup, typeof UserRoundIcon> = {
  employee: UserRoundIcon,
  salary: BanknoteIcon,
  company: Building2Icon,
  certificate: FileBadgeIcon,
};

/** Right pane: every template variable with description; click inserts `{{token}}` at the cursor. */
export function VariablesPanel({ onInsert, targetLabel, disabled }: { onInsert: (token: string) => void; targetLabel: string; disabled?: boolean }) {
  const t = useTranslations('templates.variables');
  const [query, setQuery] = useState('');
  const tt = t as unknown as (key: string) => string;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VARIABLE_GROUPS.map((group) => ({
      group,
      items: TEMPLATE_VARIABLES.filter((v) => v.group === group).filter((v) => {
        if (!q) return true;
        return [v.key, tt(`${v.key}.label`), tt(`${v.key}.description`)].some((s) => s.toLowerCase().includes(q));
      }),
    })).filter((g) => g.items.length);
  }, [query, tt]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border px-4 pt-4 pb-3">
        <div>
          <h2 className="text-card-title">{t('title')}</h2>
          <p className="mt-0.5 text-meta text-muted-foreground">{t('description')}</p>
        </div>
        <SearchInput value={query} onSearch={setQuery} debounce={120} placeholder={t("search")} className="h-8" />
        <p className="truncate text-2xs font-medium text-faint-foreground">{t('insertInto', { target: targetLabel })}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.length ? (
          groups.map(({ group, items }) => {
            const Icon = GROUP_ICON[group];
            return (
              <section key={group} className="mb-2">
                <h3 className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-2xs font-semibold tracking-wide text-faint-foreground uppercase">
                  <Icon className="size-3.5" aria-hidden />
                  {t(`groups.${group}`)}
                </h3>
                {group === 'salary' ? (
                  <p className="mx-2 mb-1.5 flex items-start gap-1.5 rounded-md bg-info-soft px-2 py-1.5 text-2xs leading-4 text-info-soft-foreground">
                    <InfoIcon className="mt-px size-3 shrink-0" aria-hidden />
                    {t('salaryNote')}
                  </p>
                ) : null}
                <ul className="flex flex-col">
                  {items.map((v) => (
                    <li key={v.key}>
                      <button
                        type="button"
                        disabled={disabled}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onInsert(v.key)}
                        className={cn(
                          'group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start transition-colors',
                          'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{tt(`${v.key}.label`)}</span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            <code dir="ltr" className="shrink-0 rounded bg-secondary-soft px-1 font-mono text-2xs text-secondary-soft-foreground">
                              {`{{${v.key}}}`}
                            </code>
                          </span>
                          <span className="mt-0.5 block truncate text-2xs text-muted-foreground">{tt(`${v.key}.description`)}</span>
                        </span>
                        <PlusIcon className="mt-0.5 size-4 shrink-0 text-faint-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        ) : (
          <p className="px-2 py-6 text-center text-meta text-muted-foreground">{t('noMatch')}</p>
        )}
      </div>
    </div>
  );
}
