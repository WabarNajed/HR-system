'use client';

import {
  ArrowRightIcon,
  AwardIcon,
  CalendarPlusIcon,
  ClockIcon,
  CornerDownLeftIcon,
  FileBadgeIcon,
  FilePlus2Icon,
  FileTextIcon,
  Loader2Icon,
  SearchIcon,
  SearchXIcon,
  Trash2Icon,
  UserPlusIcon,
  UserRoundIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePermissions } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { globalSearch, type SearchResult, type SearchResultKind } from '@/features/search/actions';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from './nav-config';

const DEBOUNCE_MS = 250;
const TIMEOUT_MS = 8000;
const RECENT_MAX = 6;

const KIND_VISUALS: Record<SearchResultKind, { icon: LucideIcon; className: string }> = {
  employee: { icon: UsersIcon, className: 'bg-primary-soft text-primary' },
  request: { icon: FileTextIcon, className: 'bg-info-soft text-info' },
  certificate: { icon: AwardIcon, className: 'bg-secondary-soft text-secondary-soft-foreground' },
  other: { icon: SearchIcon, className: 'bg-muted text-muted-foreground' },
};
const KIND_ORDER: SearchResultKind[] = ['employee', 'request', 'certificate', 'other'];

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

/* ─── Recent results (per user, localStorage; every access guarded) ─────── */

function recentKey(userId: string | null) {
  return userId ? `hr:search:recent:${userId}` : null;
}

function readRecent(key: string | null): SearchResult[] {
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is SearchResult =>
          !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.title === 'string' && typeof r.href === 'string' && r.href.startsWith('/') && !r.href.startsWith('//'),
      )
      .map((r) => ({ ...r, kind: KIND_ORDER.includes(r.kind) ? r.kind : 'other' }))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function writeRecent(key: string | null, items: SearchResult[]) {
  if (!key) return;
  try {
    if (items.length) window.localStorage.setItem(key, JSON.stringify(items.slice(0, RECENT_MAX)));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode / blocked) — recent results are a convenience only.
  }
}

/** Emphasizes the first case-insensitive occurrence of the query in a title. */
function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (q.length < 2) return text;
  const i = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-primary-soft px-0.5 font-semibold text-primary-soft-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function ResultIcon({ kind }: { kind: SearchResultKind }) {
  const v = KIND_VISUALS[kind];
  const Icon = v.icon;
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', v.className)}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

/**
 * Header search: trigger (⌘K / Ctrl+K, "/") + command palette backed by RPC `global_search`
 * (RLS-scoped). Idle state offers recent results, permission-aware quick actions and pages;
 * results are grouped by kind with keyboard navigation (cmdk), plus "search all" shortcuts.
 */
export function GlobalSearch({ visibleNavIds }: { visibleNavIds: readonly string[] }) {
  const t = useTranslations('search');
  const tNav = useTranslations();
  const router = useRouter();
  const isMac = useIsMac();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [recent, setRecent] = useState<SearchResult[]>([]);
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

  // Recent results are stored per user: resolve the user id from the local session (no network).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createClient();
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const key = recentKey(data.session?.user.id ?? null);
        setStorageKey(key);
        setRecent(readRecent(key));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

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

  // Debounced search; queries shorter than 2 chars show the idle palette instead.
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

  const openResult = (r: SearchResult) => {
    const next = [r, ...recent.filter((x) => !(x.kind === r.kind && x.id === r.id))].slice(0, RECENT_MAX);
    setRecent(next);
    writeRecent(storageKey, next);
    go(r.href);
  };

  const clearRecent = () => {
    setRecent([]);
    writeRecent(storageKey, []);
  };

  const grouped = useMemo(() => {
    if (state.status !== 'ready') return [];
    const map = new Map<SearchResultKind, SearchResult[]>();
    for (const r of state.results) map.set(r.kind, [...(map.get(r.kind) ?? []), r]);
    return KIND_ORDER.filter((k) => map.has(k)).map((k) => ({ kind: k, items: map.get(k)! }));
  }, [state]);

  const visible = new Set(visibleNavIds);
  const pages = NAV_GROUPS.flatMap((g) => g.items).filter((i) => visible.has(i.id));
  const canRequest = can('requests.create');
  const quickActions: { id: string; label: string; href: string; icon: LucideIcon }[] = [
    ...(canRequest
      ? [
          { id: 'new-request', label: t('actions.newRequest'), href: '/requests/new', icon: FilePlus2Icon },
          { id: 'request-leave', label: t('actions.requestLeave'), href: '/requests/new?type=leave', icon: CalendarPlusIcon },
          { id: 'request-certificate', label: t('actions.requestCertificate'), href: '/requests/new?type=certificate', icon: FileBadgeIcon },
        ]
      : []),
    ...(can('employees.create') ? [{ id: 'add-employee', label: t('actions.addEmployee'), href: '/employees/new', icon: UserPlusIcon }] : []),
    { id: 'profile', label: t('actions.profile'), href: '/profile', icon: UserRoundIcon },
  ];
  const groupLabel = (kind: SearchResultKind) => t(`groups.${kind}`);
  const q = state.status === 'idle' ? '' : state.query;
  const searchAll = [
    ...(visible.has('employees') ? [{ id: 'employees', label: t('searchAll.employees', { query: q }), href: `/employees?q=${encodeURIComponent(q)}` }] : []),
    { id: 'requests', label: t('searchAll.requests', { query: q }), href: `/requests?q=${encodeURIComponent(q)}` },
  ];

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 justify-start gap-2 px-3 font-normal text-muted-foreground shadow-none md:inline-flex lg:w-72 xl:w-80 dark:bg-input/20"
        aria-label={tNav('nav.header.openSearch')}
        aria-keyshortcuts="Control+K Meta+K"
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
        className="max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-w-2xl"
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
        <CommandList className="max-h-[min(30rem,70dvh)] max-sm:max-h-none max-sm:flex-1">
          {state.status === 'idle' ? (
            <>
              {recent.length ? (
                <>
                  <CommandGroup heading={t('recent')}>
                    {recent.map((r) => (
                      <CommandItem key={`recent-${r.kind}-${r.id}`} value={`recent-${r.kind}-${r.id}`} onSelect={() => openResult(r)} className="py-1.5">
                        <ClockIcon className="text-faint-foreground" />
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                        {r.subtitle ? <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:inline">{r.subtitle}</span> : null}
                      </CommandItem>
                    ))}
                    <CommandItem value="recent-clear" onSelect={clearRecent} className="py-1.5 text-muted-foreground">
                      <Trash2Icon />
                      {t('clearRecent')}
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              ) : null}
              <CommandGroup heading={t('quickActions')}>
                {quickActions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <CommandItem key={a.id} value={`action-${a.id}`} onSelect={() => go(a.href)}>
                      <Icon />
                      {a.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={t('pages')}>
                {pages.map((p) => {
                  const Icon = p.icon;
                  return (
                    <CommandItem key={p.id} value={`page-${p.id}`} onSelect={() => go(p.href)} className="group">
                      <Icon />
                      <span className="flex-1">{tNav(p.labelKey)}</span>
                      <ArrowRightIcon className="size-3.5 text-faint-foreground opacity-0 group-data-[selected=true]:opacity-100 rtl:rotate-180" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <p className="px-3 pt-1 pb-3 text-xs text-muted-foreground">{t('minChars')}</p>
            </>
          ) : null}

          {state.status === 'loading' && !grouped.length ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
              <Loader2Icon className="size-4 animate-spin" />
              {t('loading')}
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
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

          {grouped.map((group, gi) => (
            <Fragment key={group.kind}>
              {gi > 0 ? <CommandSeparator /> : null}
              <CommandGroup heading={`${groupLabel(group.kind)} · ${group.items.length}`}>
                {group.items.map((r) => (
                  <CommandItem key={`${r.kind}-${r.id}`} value={`${r.kind}-${r.id}`} onSelect={() => openResult(r)} className="gap-3 py-2">
                    <ResultIcon kind={r.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{highlight(r.title, q)}</span>
                      {r.subtitle ? <span className="block truncate text-xs text-muted-foreground">{highlight(r.subtitle, q)}</span> : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </Fragment>
          ))}

          {state.status === 'ready' || (state.status === 'loading' && grouped.length) ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={t('searchAll.heading')}>
                {searchAll.map((s) => (
                  <CommandItem key={s.id} value={`all-${s.id}`} onSelect={() => go(s.href)} className="text-muted-foreground">
                    <SearchIcon />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <ArrowRightIcon className="size-3.5 rtl:rotate-180" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
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
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> {/* i18n-ignore — keyboard key name */}
            {t('hintClose')}
          </span>
          <span className="ms-auto hidden items-center gap-1.5 md:flex">{t('scopeHint')}</span>
        </div>
      </CommandDialog>
    </>
  );
}
