'use client';

import { TimerIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { signOutForInactivity } from '../actions';

const STORAGE_KEY = 'hr:last-activity';
const WARNING_SECONDS = 60;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function readLast(): number {
  try {
    const v = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  } catch {
    return Date.now();
  }
}

function writeLast(ts: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    // storage unavailable (private mode) — the in-memory timestamp still works for this tab
  }
}

/**
 * Idle-session timeout (Settings › Security › `session_timeout_minutes`). Mount once in the
 * authenticated shell: `<SessionTimeoutGuard timeoutMinutes={settings.session_timeout_minutes} />`.
 * Activity in any tab (shared through localStorage) keeps the session alive; one minute before the
 * limit a dialog offers to stay signed in; at the limit the user is signed out (`auth.logout`
 * audited) and lands on /login with the "session ended" notice.
 */
export function SessionTimeoutGuard({ timeoutMinutes }: { timeoutMinutes: number }) {
  const t = useTranslations('security.timeout');
  const limitMs = Math.max(5, timeoutMinutes) * 60_000;
  const lastRef = useRef<number>(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const signingOut = useRef(false);

  const touch = useCallback(() => {
    const now = Date.now();
    // Throttle writes to once every 15 s.
    if (now - lastRef.current < 15_000) return;
    lastRef.current = now;
    writeLast(now);
  }, []);

  const stay = useCallback(() => {
    lastRef.current = 0;
    touch();
    setRemaining(null);
  }, [touch]);

  useEffect(() => {
    lastRef.current = 0;
    touch();
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true });
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRemaining(null);
    };
    window.addEventListener('storage', onStorage);

    const timer = window.setInterval(() => {
      const idle = Date.now() - readLast();
      const left = Math.ceil((limitMs - idle) / 1000);
      if (left <= 0) {
        if (!signingOut.current) {
          signingOut.current = true;
          void signOutForInactivity();
        }
        return;
      }
      setRemaining(left <= WARNING_SECONDS ? left : null);
    }, 1000);

    return () => {
      for (const e of EVENTS) window.removeEventListener(e, touch);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, [limitMs, touch]);

  return (
    <AlertDialog open={remaining !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <TimerIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1 pt-0.5">
            <AlertDialogTitle>{t('title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('description', { seconds: remaining ?? WARNING_SECONDS })}</AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              signingOut.current = true;
              void signOutForInactivity();
            }}
          >
            {t('signOut')}
          </Button>
          <Button onClick={stay} autoFocus>
            {t('stay')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
