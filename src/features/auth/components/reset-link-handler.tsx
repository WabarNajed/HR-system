'use client';

import { createBrowserClient } from '@supabase/ssr';
import { LinkIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { completeLinkSignIn } from '../actions';
import { AuthHeading } from './auth-heading';

/**
 * /reset-password without a server session. Links that use the implicit flow (e.g. GoTrue's default
 * invitation / recovery e-mails: `…/reset-password#access_token=…&refresh_token=…&type=invite`) carry
 * the session in the URL fragment, which the server never sees: establish it here, clean the URL and
 * re-render. Anything else (no tokens, `#error=…`) shows the "link invalid or expired" state.
 */
export function ResetLinkHandler({ invalid = false }: { invalid?: boolean }) {
  const t = useTranslations('auth.reset');
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'invalid'>(invalid ? 'invalid' : 'checking');

  useEffect(() => {
    if (invalid) return;
    let cancelled = false;
    const run = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const env = getSupabaseEnv();
      if (!accessToken || !refreshToken || !env) {
        if (!cancelled) setState('invalid');
        return;
      }
      try {
        const supabase = createBrowserClient(env.url, env.anonKey, {
          isSingleton: false,
          auth: { detectSessionInUrl: false, autoRefreshToken: false },
        });
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
        const type = hash.get('type');
        const url = new URL(window.location.href);
        url.hash = '';
        if (type === 'invite') url.searchParams.set('type', 'invite');
        window.history.replaceState(null, '', url.pathname + url.search);
        await completeLinkSignIn();
        if (!cancelled) router.refresh();
      } catch {
        if (!cancelled) setState('invalid');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, invalid]);

  if (state === 'checking') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2Icon className="size-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">{t('verifying')}</p>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading icon={LinkIcon} tone="warning" title={t('invalidTitle')} description={t('invalidDescription')} />
      <div className="flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link href="/forgot-password">{t('requestNew')}</Link>
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">{t('backToLogin')}</Link>
        </Button>
      </div>
    </div>
  );
}
