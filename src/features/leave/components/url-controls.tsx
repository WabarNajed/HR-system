'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mergeSearchParams } from '@/lib/list-params';
import { cn } from '@/lib/utils';

/** Writes one search param (default value → removed) with router.replace inside a transition. */
function useParamSetter(param: string, defaultValue: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const current = searchParams.get(param) ?? defaultValue;
  const set = (value: string) => {
    const next = mergeSearchParams(searchParams, { [param]: value === defaultValue ? null : value });
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { current, set, isPending };
}

/** URL-driven segmented switch (e.g. `?scope=team`, `?view=list`). Hidden when there is one option. */
export function UrlSegmented({
  param,
  options,
  defaultValue,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: {
  param: string;
  options: { value: string; label: ReactNode; icon?: ReactNode }[];
  defaultValue: string;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}) {
  const { current, set, isPending } = useParamSetter(param, defaultValue);
  if (options.length < 2) return null;
  const value = options.some((o) => o.value === current) ? current : defaultValue;
  return (
    <SegmentedTabs
      items={options}
      value={value}
      onValueChange={set}
      size={size}
      aria-label={ariaLabel}
      className={cn(isPending && 'opacity-70 transition-opacity', className)}
    />
  );
}

/** URL-driven compact select (e.g. `?year=2025`). */
export function UrlSelect({
  param,
  options,
  defaultValue,
  label,
  className,
  icon,
}: {
  param: string;
  options: { value: string; label: string }[];
  defaultValue: string;
  label: string;
  className?: string;
  icon?: ReactNode;
}) {
  const { current, set, isPending } = useParamSetter(param, defaultValue);
  return (
    <Select value={current} onValueChange={set}>
      <SelectTrigger size="sm" aria-label={label} className={cn('w-auto min-w-28 gap-2', isPending && 'opacity-70', className)}>
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
