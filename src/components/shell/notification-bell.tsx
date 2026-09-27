'use client';

import { BellIcon, BellOffIcon, CheckCheckIcon, RotateCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { formatRelative } from '@/lib/dates';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  DEFAULT_NOTIFICATION_VISUAL,
  NOTIFICATION_TONE_CLASS,
  NOTIFICATION_VISUALS,
  useNotificationText,
  type NotificationRecord,
} from './notification-text';

const POLL_MS = 60_000;
const TIMEOUT_MS = 8_000;

type ListState = { status: 'idle' | 'loading' | 'ready' | 'error'; items: NotificationRecord[] };

/**
 * Header notification bell: unread badge (polled every 60 s and on window focus), popover with the
 * latest 10 notifications (fetched on open), mark-as-read on click then navigate, mark all read.
 * Reads/writes go through the browser Supabase client (RLS: own rows only) with 8 s timeouts.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number | null }) {
  const t = useTranslations('notifications.bell');
  const tHeader = useTranslations('nav.header');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const render = useNotificationText();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState<number>(initialUnread ?? 0);
  const [list, setList] = useState<ListState>({ status: 'idle', items: [] });
  const [markingAll, startMarkAll] = useTransition();
  const loadSeq = useRef(0);

  const refreshCount = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (!error && typeof count === 'number') setUnread(count);
  }, []);

  const loadList = useCallback(async () => {
    const seq = ++loadSeq.current;
    setList((prev) => ({ status: 'loading', items: prev.items }));
    const supabase = createClient();
    if (!supabase) {
      setList({ status: 'error', items: [] });
      return;
    }
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, params, link, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (seq !== loadSeq.current) return;
    if (error) {
      setList({ status: 'error', items: [] });
      return;
    }
    setList({ status: 'ready', items: (data ?? []) as NotificationRecord[] });
    void refreshCount();
  }, [refreshCount]);

  // Poll unread count + refresh on focus.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshCount();
    }, POLL_MS);
    const onFocus = () => void refreshCount();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshCount]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void loadList();
  };

  const openItem = async (n: NotificationRecord) => {
    setOpen(false);
    if (!n.read_at) {
      setList((prev) => ({ ...prev, items: prev.items.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)) }));
      setUnread((c) => Math.max(0, c - 1));
      const supabase = createClient();
      if (supabase) {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', n.id)
          .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
        if (error) void refreshCount();
      }
    }
    if (n.link) router.push(n.link);
  };

  const markAllRead = () =>
    startMarkAll(async () => {
      const supabase = createClient();
      if (!supabase) return;
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
      if (error) {
        toast.error(tErrors('generic'));
        return;
      }
      setUnread(0);
      setList((prev) => ({ ...prev, items: prev.items.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })) }));
      toast.success(t('markedAllRead'));
    });

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <SimpleTooltip content={tHeader('notifications')}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground"
            aria-label={`${tHeader('notifications')} · ${tHeader('unreadNotifications', { count: unread })}`}
          >
            <BellIcon />
            {unread > 0 ? (
              <span
                aria-hidden
                className="numeric absolute -top-0.5 -end-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] leading-none font-semibold text-danger-foreground ring-2 ring-background"
              >
                {badge}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-card-title">{t('title')}</h2>
            {unread > 0 ? (
              <span className="numeric rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-foreground">
                {t('unreadCount', { count: unread })}
              </span>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={markAllRead} loading={markingAll} disabled={unread === 0 || markingAll} className="h-7 px-2">
            {!markingAll ? <CheckCheckIcon /> : null}
            {t('markAllRead')}
          </Button>
        </div>

        <div className="max-h-[min(26rem,65dvh)] overflow-y-auto" aria-busy={list.status === 'loading'}>
          {list.status === 'loading' && !list.items.length ? (
            <div className="flex flex-col" aria-label={t('loading')}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2 pt-0.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.status === 'error' ? (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t('error')}</p>
              <Button variant="outline" size="sm" onClick={() => void loadList()}>
                <RotateCwIcon />
                {tCommon('tryAgain')}
              </Button>
            </div>
          ) : list.items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <BellOffIcon className="size-5" strokeWidth={1.75} />
              </span>
              <p className="text-sm font-semibold">{t('emptyTitle')}</p>
              <p className="mt-1 max-w-64 text-meta text-muted-foreground">{t('emptyDescription')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {list.items.map((n) => {
                const { title, body } = render(n);
                const visual = NOTIFICATION_VISUALS[n.type] ?? DEFAULT_NOTIFICATION_VISUAL;
                const Icon = visual.icon;
                const unreadItem = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void openItem(n)}
                      className={cn(
                        'relative flex w-full gap-3 px-4 py-3 text-start outline-none transition-colors hover:bg-accent focus-visible:bg-accent',
                        unreadItem && 'bg-primary-soft/40',
                      )}
                    >
                      {unreadItem ? <span aria-hidden className="absolute top-4 start-1.5 size-1.5 rounded-full bg-primary" /> : null}
                      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', NOTIFICATION_TONE_CLASS[visual.tone])}>
                        <Icon className="size-4" strokeWidth={1.9} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[0.8125rem] leading-5', unreadItem ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
                          {title}
                        </span>
                        {body ? <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{body}</span> : null}
                        <span className="mt-1 block text-[0.6875rem] text-faint-foreground">{formatRelative(n.created_at, locale)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center text-primary hover:text-primary">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              {t('viewAll')}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
