'use client';

import { SearchIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { InputGroup } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { RequestTypeIcon } from './type-visual';

export type RailType = {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  icon: string;
  color: string | null;
  is_active: boolean;
  /** Small trailing text (e.g. field count). */
  meta?: ReactNode;
  /** Optional badge under the name. */
  badge?: ReactNode;
};

type Props = {
  types: RailType[];
  selectedKey: string | null;
  /** Called instead of navigating directly (lets the builder confirm unsaved changes). */
  onSelect: (key: string) => void;
  className?: string;
};

/** Left rail of the builders: searchable list of request types. */
export function TypeRail({ types, selectedKey, onSelect, className }: Props) {
  const t = useTranslations('requestConfig');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return types;
    return types.filter((ty) => [ty.name_ar, ty.name_en, ty.key].some((v) => v.toLowerCase().includes(q)));
  }, [types, query]);

  return (
    <nav aria-label={t('rail.label')} className={cn('flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-card', className)}>
      <div className="border-b border-border p-2.5">
        <p className="mb-2 px-1 text-meta font-semibold text-muted-foreground">{t('rail.title', { count: types.length })}</p>
        <InputGroup
          start={<SearchIcon className="size-3.5" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tc('search')}
          className="h-8 text-sm"
          aria-label={t('rail.search')}
        />
      </div>
      <ul className="flex max-h-[calc(100dvh-16rem)] min-h-0 flex-col gap-0.5 overflow-y-auto p-1.5">
        {filtered.map((ty) => {
          const selected = ty.key === selectedKey;
          return (
            <li key={ty.id}>
              <button
                type="button"
                onClick={() => onSelect(ty.key)}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  selected ? 'bg-primary-soft text-primary-soft-foreground' : 'hover:bg-accent',
                  !ty.is_active && !selected && 'opacity-70',
                )}
              >
                <RequestTypeIcon icon={ty.icon} color={ty.color} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className={cn('truncate text-[0.8125rem]', selected ? 'font-semibold' : 'font-medium text-foreground')}>{localized(ty, 'name', locale)}</span>
                  {ty.badge || !ty.is_active ? (
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[0.6875rem] text-muted-foreground">
                      {!ty.is_active ? <span>{tc('inactive')}</span> : null}
                      {ty.badge}
                    </span>
                  ) : null}
                </span>
                {ty.meta !== undefined ? <span className="numeric shrink-0 text-xs text-muted-foreground">{ty.meta}</span> : null}
              </button>
            </li>
          );
        })}
        {!filtered.length ? <li className="px-2 py-6 text-center text-meta text-muted-foreground">{tc('noResults')}</li> : null}
      </ul>
    </nav>
  );
}

/** Compact type switcher used when the rail doesn't fit (narrow containers, phones). */
export function TypeSwitcher({ types, selectedKey, onSelect, className }: Props) {
  const t = useTranslations('requestConfig');
  const locale = useLocale() as Locale;
  return (
    <Select value={selectedKey ?? undefined} onValueChange={onSelect}>
      <SelectTrigger className={cn('w-full', className)} aria-label={t('rail.label')}>
        <SelectValue placeholder={t('rail.choose')} />
      </SelectTrigger>
      <SelectContent>
        {types.map((ty) => (
          <SelectItem key={ty.id} value={ty.key}>
            <span className="flex items-center gap-2">
              <RequestTypeIcon icon={ty.icon} color={ty.color} size="sm" className="size-5" />
              {localized(ty, 'name', locale)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
