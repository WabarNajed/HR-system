import { PlugZapIcon, ServerCrashIcon } from 'lucide-react';
import { getTranslator } from '@/lib/i18n/translator';
import { RetryButton } from './retry-button';

const REQUIRED_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

/**
 * Full-page bilingual screen shown when Supabase is not configured (`reason="not_configured"`) or
 * unreachable (`reason="backend"`). Rendered by the (app)/(auth) layouts instead of crashing.
 * Both languages are shown at once because the admin's language preference can't be loaded.
 */
export function ConfigurationRequired({ reason = 'not_configured' }: { reason?: 'not_configured' | 'backend' }) {
  const ar = getTranslator('ar');
  const en = getTranslator('en');
  const Icon = reason === 'backend' ? ServerCrashIcon : PlugZapIcon;
  const block = (t: typeof ar, lang: 'ar' | 'en') => (
    <section lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className="text-start">
      <h2 className="text-base font-semibold text-foreground">{t(reason === 'backend' ? 'auth.unavailable.title' : 'auth.config.title')}</h2>
      <p className="mt-1.5 text-meta leading-relaxed text-muted-foreground">
        {t(reason === 'backend' ? 'auth.unavailable.description' : 'auth.config.description')}
      </p>
    </section>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-raised sm:p-8" data-slot="configuration-required">
        <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-warning-soft text-warning ring-1 ring-inset ring-current/10">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="flex flex-col gap-5">
          {block(ar, 'ar')}
          <div className="h-px bg-border" />
          {block(en, 'en')}
        </div>
        {reason === 'not_configured' ? (
          <div className="mt-6 rounded-lg border border-border bg-subtle p-3" dir="ltr">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {en('auth.config.variables')} · <span lang="ar">{ar('auth.config.variables')}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {REQUIRED_VARS.map((v) => (
                <li key={v}>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{v}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-6 flex justify-center">
            <RetryButton labels={[ar('common.tryAgain'), en('common.tryAgain')]} />
          </div>
        )}
      </div>
    </main>
  );
}
