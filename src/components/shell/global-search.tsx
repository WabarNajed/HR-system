'use client';

import {
  AwardIcon,
  CornerDownLeftIcon,
  FilePlus2Icon,
  FileTextIcon,
  Loader2Icon,
  SearchIcon,
  SearchXIcon,
  UserRoundIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { globalSearch, type SearchResult } from '@/features/search/actions';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from './nav-config';

const DEBOUNCE_MS = 250;
const TIMEOUT_MS = 8000;

const KIND_ICONS: Record<string, LucideIcon> = {
  employee: UsersIcon,
  request: FileTextIcon,
  certificate: AwardIcon,
};
const KIND_ORDER = ['employee', 'request', 'certificate'];

type State =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; results: SearchResult[] }
  | { status: 'error'; query: string };

function useIsMac() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    // After mount only (server renders the Ctrl hint) — avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

/** Header search: trigger button (⌘K / Ctrl+K) + command palette backed by RPC `global_search`. */
export function GlobalSearch({ visibleNavIds }: { visibleNavIds: readonly string[] }) {
  const t = useTranslations('search');
  const tNav = useTranslations();
  const router = useRouter();
  const isMac = useIsMac();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const seq = useRef(0);

  // ⌘K / Ctrl+K anywhere; "/" when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const id = ++seq.current;
    setState({ status: 'loading', query: q });
    try {
      const result = await Promise.race([
        globalSearch({ query: q }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
      ]);
      if (id !== seq.current) return; // stale response
      if (!result.ok) {
        setState({ status: 'error', query: q });
        return;
      }
      setState({ status: 'ready', query: q, results: result.data ?? [] });
    } catch {
      if (id === seq.current) setState({ status: 'error', query: q });
    }
  }, []);

  // Debounced search; queries shorter than 2 chars show quick actions instead.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      seq.current++;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: 'idle' });
      return;
    }
    const timer = window.setTimeout(() => void runSearch(q), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      seq.current++;
      setState({ status: 'idle' });
    }
  };

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const grouped = useMemo(() => {
    if (state.status !== 'ready') return [];
    const map = new Map<string, SearchResult[]>();
    for (const r of state.results) {
      const kind = KIND_ORDER.includes(r.kind) ? r.kind : 'other';
      map.set(kind, [...(map.get(kind) ?? []), r]);
    }
    return [...KIND_ORDER, 'other'].filter((k) => map.has(k)).map((k) => ({ kind: k, items: map.get(k)! }));
  }, [state]);

  const visible = new Set(visibleNavIds);
  const pages = NAV_GROUPS.flatMap((g) => g.items).filter((i) => visible.has(i.id));
  const groupLabel = (kind: string) =>
    kind === 'employee' ? t('groups.employee') : kind === 'request' ? t('groups.request') : kind === 'certificate' ? t('groups.certificate') : t('groups.other');

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 justify-start gap-2 px-3 font-normal text-muted-foreground shadow-none md:inline-flex lg:w-72 xl:w-80 dark:bg-input/20"
        aria-label={tNav('nav.header.openSearch')}
      >
        <SearchIcon className="text-muted-foreground" />
        <span className="flex-1 truncate text-start text-meta">{t('placeholder')}</span>
        <Kbd>{isMac ? tNav('nav.header.searchShortcutMac') : tNav('nav.header.searchShortcut')}</Kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground md:hidden"
        aria-label={tNav('nav.header.openSearch')}
      >
        <SearchIcon />
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        shouldFilter={false}
        title={tNav('nav.header.search')}
        className="max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:border-0 sm:max-w-2xl"
      >
        <div className="relative">
          <CommandInput value={query} onValueChange={setQuery} placeholder={t('placeholder')} className="pe-8 max-sm:pe-16" />
          {state.status === 'loading' ? (
            <Loader2Icon
              aria-label={t('loading')}
              className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground max-sm:end-12"
            />
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground sm:hidden"
            onClick={() => onOpenChange(false)}
            aria-label={tNav('common.close')}
          >
            <XIcon />
          </Button>
        </div>
        <CommandList className="max-h-[min(28rem,70dvh)] max-sm:max-h-none max-sm:flex-1">
          {state.status === 'idle' ? (
            <>
              <CommandGroup heading={t('quickActions')}>
                <CommandItem value="action-new-request" onSelect={() => go('/requests/new')}>
                  <FilePlus2Icon />
                  {tNav('nav.items.newRequest')}
                </CommandItem>
                <CommandItem value="action-profile" onSelect={() => go('/profile')}>
                  <UserRoundIcon />
                  {tNav('nav.items.profile')}
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading={t('pages')}>
                {pages.map((p) => {
                  const Icon = p.icon;
                  return (
                    <CommandItem key={p.id} value={`page-${p.id}`} onSelect={() => go(p.href)}>
                      <Icon />
                      {tNav(p.labelKey)}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <p className="px-3 pt-1 pb-3 text-xs text-muted-foreground">{t('minChars')}</p>
            </>
          ) : null}

          {state.status === 'loading' && !grouped.length ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {t('loading')}
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">{t('error')}</p>
              <Button variant="outline" size="sm" onClick={() => void runSearch(state.query)}>
                {tNav('common.tryAgain')}
              </Button>
            </div>
          ) : null}

          {state.status === 'ready' && state.results.length === 0 ? (
            <CommandEmpty className="flex flex-col items-center gap-1 px-6 py-10">
              <SearchXIcon className="mb-2 size-6 text-faint-foreground" strokeWidth={1.75} />
              <span className="font-medium text-foreground">{t('empty', { query: state.query })}</span>
              <span className="text-meta">{t('emptyDescription')}</span>
            </CommandEmpty>
          ) : null}

          {grouped.map((group) => {
            const Icon = KIND_ICONS[group.kind] ?? SearchIcon;
            return (
              <CommandGroup key={group.kind} heading={groupLabel(group.kind)}>
                {group.items.map((r) => (
                  <CommandItem key={`${r.kind}-${r.id}`} value={`${r.kind}-${r.id}`} onSelect={() => go(r.href)} className="py-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.title}</span>
                      {r.subtitle ? <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span> : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
        <div className="hidden items-center gap-4 border-t border-border bg-subtle px-3 py-2 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {t('hintNavigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeftIcon />
            </Kbd>
            {t('hintOpen')}
          </span>
          <span className={cn('flex items-center gap-1.5')}>
            <Kbd>Esc</Kbd> {/* i18n-ignore — keyboard key name */}
            {t('hintClose')}
          </span>
        </div>
      </CommandDialog>
    </>
  );
}
