'use client';

import { Loader2Icon, SearchIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type SearchInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onChange'> & {
  /** Current (committed) value, e.g. from the URL `q` param. */
  value?: string;
  /** Called after the user stops typing for `debounce` ms (and immediately on clear/Enter). */
  onSearch: (value: string) => void;
  debounce?: number;
  /** Shows a spinner in place of the search icon. */
  loading?: boolean;
  wrapperClassName?: string;
};

/** Debounced search field with clear button. Keeps local text in sync when `value` changes externally. */
export function SearchInput({
  value = '',
  onSearch,
  debounce = 350,
  loading = false,
  placeholder,
  className,
  wrapperClassName,
  ...props
}: SearchInputProps) {
  const t = useTranslations('common');
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Sync when the committed value changes from outside (back/forward, "Clear filters").
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (next: string) => {
    window.clearTimeout(timer.current);
    const trimmed = next.trim();
    if (trimmed === committed.current.trim()) return;
    committed.current = trimmed;
    onSearch(trimmed);
  };

  return (
    <div className={cn('relative w-full', wrapperClassName)} data-slot="search-input">
      <span className="pointer-events-none absolute start-0 flex h-full items-center ps-3 text-muted-foreground">
        {loading ? <Loader2Icon className="size-4 animate-spin" /> : <SearchIcon className="size-4" />}
      </span>
      <Input
        type="search"
        role="searchbox"
        value={text}
        placeholder={placeholder ?? t('searchPlaceholder')}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => commit(next), debounce);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          }
          if (e.key === 'Escape' && text) {
            e.preventDefault();
            setText('');
            commit('');
          }
        }}
        className={cn('ps-9 pe-8 [&::-webkit-search-cancel-button]:hidden', className)}
        {...props}
      />
      {text ? (
        <button
          type="button"
          aria-label={t('clear')}
          onClick={() => {
            setText('');
            commit('');
          }}
          className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
