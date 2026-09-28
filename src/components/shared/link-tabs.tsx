'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type LinkTabItem = {
  /** Tab key (`?tab=<value>`), or a unique id when `href` is set. */
  value: string;
  label: ReactNode;
  /** Explicit destination (path-based tabs). Defaults to current path + `?<param>=<value>`. */
  href?: string;
  /** Count bubble (e.g. pending items). */
  count?: number | null;
  icon?: ReactNode;
  disabled?: boolean;
};

export type LinkTabsProps = {
  items: LinkTabItem[];
  /** Query param name (default `tab`). The first item is the default when the param is absent. */
  param?: string;
  /** Force the active value (otherwise derived from URL). */
  value?: string;
  /** `line` = page-level underline tabs (default); `segmented` = pill switcher. */
  variant?: 'line' | 'segmented';
  /** Keep other search params when switching (default false: tab switch resets filters/pagination). */
  preserveParams?: boolean;
  className?: string;
  'aria-label'?: string;
};

/**
 * URL-driven tabs rendered as links (shareable, back-button friendly, no scroll jump).
 * Use for page tabs like `/employees/[id]?tab=documents` or status tabs on lists.
 */
export function LinkTabs({ items, param = 'tab', value, variant = 'line', preserveParams = false, className, ...aria }: LinkTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = value ?? searchParams.get(param) ?? items.find((i) => i.href === pathname)?.value ?? items[0]?.value;

  const hrefFor = (item: LinkTabItem, index: number) => {
    if (item.href) return item.href;
    const next = new URLSearchParams(preserveParams ? searchParams.toString() : '');
    next.delete('page');
    if (index === 0) next.delete(param);
    else next.set(param, item.value);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <nav
      aria-label={aria['aria-label']}
      className={cn(
        variant === 'line' && 'scrollbar-none -mb-px flex items-stretch gap-1 overflow-x-auto border-b border-border',
        variant === 'segmented' && 'scrollbar-none inline-flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-muted p-[3px]',
        className,
      )}
      data-slot="link-tabs"
    >
      {items.map((item, index) => {
        const active = item.value === current;
        const content = (
          <>
            {item.icon ? <span className="[&_svg]:size-4">{item.icon}</span> : null}
            <span>{item.label}</span>
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-2xs leading-5 font-semibold numeric',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  variant === 'segmented' && !active && 'bg-card',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </>
        );
        const cls = cn(
          'inline-flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
          variant === 'line' &&
            cn(
              'h-10 border-b-2 px-2.5',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
            ),
          variant === 'segmented' &&
            cn(
              'h-full rounded-[6px] px-3',
              active ? 'bg-card text-foreground shadow-xs dark:bg-accent' : 'text-muted-foreground hover:text-foreground',
            ),
          item.disabled && 'pointer-events-none opacity-50',
        );
        return item.disabled ? (
          <span key={item.value} className={cls} aria-disabled>
            {content}
          </span>
        ) : (
          <Link key={item.value} href={hrefFor(item, index)} scroll={false} replace={!item.href} aria-current={active ? 'page' : undefined} className={cls}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

export type SegmentedTabsProps = {
  items: { value: string; label: ReactNode; icon?: ReactNode; count?: number | null; disabled?: boolean }[];
  value: string;
  onValueChange: (value: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
};

/** Controlled segmented switcher (non-URL state), e.g. chart period or view mode. */
export function SegmentedTabs({ items, value, onValueChange, size = 'md', className, ...aria }: SegmentedTabsProps) {
  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cn(
        'scrollbar-none inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-muted p-[3px]',
        size === 'md' ? 'h-9' : 'h-8',
        className,
      )}
      data-slot="segmented-tabs"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'inline-flex h-full shrink-0 items-center gap-1.5 rounded-[6px] px-3 font-medium whitespace-nowrap transition-[color,background-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50',
              size === 'md' ? 'text-sm' : 'text-meta',
              active ? 'bg-card text-foreground shadow-xs dark:bg-accent' : 'text-muted-foreground hover:text-foreground',
              '[&_svg]:size-4',
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="rounded-full bg-background px-1.5 text-2xs leading-4 font-semibold numeric">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
